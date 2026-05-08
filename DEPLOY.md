# OpenWeather.ca — Deployment Guide

## Architecture

```
Firebase Hosting (CDN)          Cloud Functions (Node.js 22, Gen 2)
├── index.html                  ├── scheduledForecastFetch  — 4×/day, HRDPS + tide CSV
└── assets/*.js, *.css          ├── scheduledObsFetch       — hourly :05, SWOB obs (512 MiB)
                                ├── scheduledSpitFetch      — hourly :10, paraglidingwx mirror
                                └── scheduledMarineFetch    — every 3 h :30, EC RSS
                                        │
                                        │ each writes to:
                                        ▼
                                   Firestore (cache)            ◄─── React frontend
                                   ├── cache/forecast               reads directly
                                   ├── cache/observations           via Firebase JS SDK
                                   ├── cache/spit
                                   ├── cache/tide
                                   └── cache/marine
                                        │
                                        │ + per-fetch JSON snapshot:
                                        ▼
                                   gs://openweather-826fc-archive
                                   └── archive/<dataset>/<date>/<ts>.json
                                       (Standard → Coldline @ 30d → Archive @ 90d)
```

## Prerequisites

1. A Firebase project on the **Blaze** plan (pay-as-you-go, but free-tier usage is sufficient)
2. Node.js 18+ and npm installed locally
3. Firebase CLI installed: `npm install -g firebase-tools`

## Initial Firebase Project Setup

### 1. Create a Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **Add project** → name it (e.g., `OpenWeather`)
3. Disable Google Analytics (not needed) → **Create project**

### 2. Enable required services

In the Firebase Console for your project:

1. **Firestore Database**: Click Build → Firestore Database → Create database → Start in **production mode** → Choose `us-central1` (or nearest region)
2. **Cloud Functions**: Automatically available on Blaze plan
3. **Hosting**: Click Build → Hosting → Get started (follow prompts)

### 3. Configure the project locally

```bash
# Login to Firebase
firebase login
```

The `.firebaserc` file is already configured with the project ID for this deployment:
```json
{
  "projects": {
    "default": "openweather-826fc"
  }
}
```

If you are deploying your own fork to a different Firebase project, replace `openweather-826fc` with your own project's ID (found in Firebase Console → Project Settings → Project ID).

### 4. Set Firestore security rules

The rules are defined in `firestore.rules` at the project root and deployed automatically by `firebase deploy`. No manual step needed.

The rules allow public reads (the React frontend reads `cache/*` directly via the Firebase JS SDK) and block writes (Cloud Functions use the Admin SDK which bypasses rules entirely).

## Deploy

Deploys run manually from a local machine. CI-based deploy was attempted but abandoned — the Workspace org policy blocks service-account key creation (`iam.disableServiceAccountKeyCreation`), WIF's `external_account` credentials aren't supported by firebase-tools, and the OAuth scopes granted to `firebase login:ci` refresh tokens are restricted by Workspace policy and can't call basic GCP APIs. Manual deploy is the pragmatic path.

### Everyday deploy

After pulling or making changes:

```bash
cd ~/Coding/OpenWeather
npm run build      # only if frontend (src/) changed
firebase deploy
```

That's it. The deploy pushes hosting, functions, and firestore rules in one shot. Total time: ~1–2 minutes.

### First-time setup (or after package.json changes)

Run `npm install` in both the root and `functions/` before the first deploy:

```bash
cd ~/Coding/OpenWeather
npm install
cd functions && npm install && cd ..
npm run build
firebase deploy
```

### What gets deployed

- **Hosting**: `dist/` directory → Firebase CDN
- **Functions**: `functions/` directory → Cloud Functions (Node.js 22)
- **Firestore rules**: `firestore.rules` → Firestore security rules
- **Scheduled functions**: Automatically creates/updates Cloud Scheduler jobs

### Deploy a subset

```bash
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore
```

### Common pitfalls

| Error | Cause | Fix |
|-------|-------|-----|
| `Couldn't find firebase-functions package` | Missed `npm install` in `functions/` | `cd functions && npm install` |
| `Directory 'dist' for Hosting does not exist` | Didn't build before deploy | `npm run build` |
| `Failed to authenticate, have you run firebase login?` | CLI not logged in | `firebase login` |

> **Note:** Do not run the repo from `~/Documents/` or any iCloud-synced path. iCloud creates duplicate ref files (e.g. `main 2`) and corrupts git pack files (`pack-objects died of signal 10`). Use `~/Coding/` or another local, non-synced location.

## How It Works

### Pre-fetched Data (the key optimization)

Instead of fetching upstream data during user page loads:

1. **`scheduledForecastFetch`** runs 4×/day at 04/10/16/22 PT
   - ~450 parallel WMS requests to GeoMet (5 locations × 3 vars × 30 hours, batched 20 at a time)
   - Writes Firestore `cache/forecast` and `cache/tide` (parsed from bundled `07811_data.csv`)
2. **`scheduledObsFetch`** runs hourly at `:05` PT
   - Pulls 18 h of SWOB-realtime per station (datetime range, not raw `limit` — see memory notes for the cadence gotcha)
   - Reduces stn_pres → MSL for Squamish/Whistler using observed temp + station elevation
   - Scrapes `weather.gc.ca/past_conditions/?station=wgp` for Pemberton (no SWOB pressure source exists there)
   - Writes Firestore `cache/observations` with shape `{ <locId>: { pressure, temperature } }`
   - **Function memory is 512 MiB (not the default 256)** — at 256 MiB the `@google-cloud/storage` SDK starves the parallel fetches and silently times them out
3. **`scheduledSpitFetch`** runs hourly at `:10` PT
   - Mirrors `https://www.paraglidingwx.com/api/spit-forecast` into `cache/spit`
   - Browsers read from Firestore — they never hit paraglidingwx directly
4. **`scheduledMarineFetch`** runs every 3 hours at `:30` PT
   - Fetches EC RSS, parses XML, writes `cache/marine`
5. When a user visits, the React app reads all five cache documents directly from Firestore via the Firebase JS SDK — **instant response, no Cloud Function invocation at page load**

### ML training data archive

In addition to the Firestore cache, every `forecast`, `observations`, and `spit` fetch also writes an immutable JSON snapshot to `gs://openweather-826fc-archive/archive/<dataset>/<YYYY-MM-DD>/<ISO-ts>.json`. Tide and marine are not archived (tide is deterministic from a static CSV; marine is text with low ML signal).

- **Schema**: `{ schema_version: <int>, archived_at, dataset, payload: <same shape as the Firestore cache doc> }`. Bump `ARCHIVE_SCHEMA_VERSION` in `functions/index.js` when changing payload shape.
  - `1` — initial: pressure/temperature/cloud forecasts, pressure/temperature obs, verbatim Spit mirror.
  - `2` (2026-05-08+) — adds `wind_speed` (m/s) and `wind_dir` (deg) to HRDPS forecast at all 5 locations; adds `wind_speed` (km/h native) and `wind_dir` (deg) to SWOB obs **only at Pam Rocks and Squamish** (other stations omit the keys entirely — Whistler/Lillooet SWOB don't populate the wind fields and Pemberton wind was scoped out).
- **Wind units intentionally vary by source**: HRDPS forecast = m/s, SWOB obs = km/h native, Spit (obs + forecast) = km/h native. Keeping native units in the archive avoids conversion bugs; convert at training time as needed.
- **Lifecycle**: Standard → Coldline @ 30 days → Archive @ 90 days (set via `gcloud storage buckets update --lifecycle-file`).
- **IAM**: function service account has `roles/storage.objectAdmin` *scoped to the archive bucket only*. The project-wide grant is still `storage.objectViewer`.
- **Annual cost**: rounds to <$0.01 (storage tiny + lifecycle cheap; Class A ops within free tier).
- **Retrieval**: `gsutil -m cp -r gs://openweather-826fc-archive/archive/ ./local/` pulls everything in one shot when training begins.

### Common pitfalls (additions)

| Error | Cause | Fix |
|---|---|---|
| `scheduledObsFetch` logs `Observations fetch returned no data — skipping cache write` repeatedly | Function under-memoried (256 MiB) with `@google-cloud/storage` loaded | Keep `memory: "512MiB"` on that function in `functions/index.js` |
| `Archive write failed for "<dataset>"` in function logs | IAM regression on the archive bucket, or lifecycle rule deleting the bucket | `gcloud storage buckets get-iam-policy gs://openweather-826fc-archive` and re-grant `roles/storage.objectAdmin` to the function SA |
| Index.html serving stale references after deploy | Default 1 h cache on `index.html` (only `*.js`/`*.css` are immutable) | Hard-refresh, or add an explicit `cache-control: no-cache` header for `index.html` in `firebase.json` |

### Request Flow

```
User browser
  → Firebase CDN (static HTML/JS/CSS — ~140 KB gzip)
  → Firebase JS SDK → Firestore cache/forecast → forecast JSON
  → Firebase JS SDK → Firestore cache/marine   → marine JSON
  → Firebase JS SDK → Firestore cache/tide     → tide JSON
```

### Tide Data

The `07811_data.csv` file is bundled directly into the Cloud Function deployment (in `functions/07811_data.csv`). `scheduledForecastFetch` reads and parses it on each run, then caches the result in Firestore `cache/tide` — no external fetch needed.

## Debug & Monitoring

### Check function logs

```bash
firebase functions:log
```

### Manually trigger a pre-fetch

```bash
# From Google Cloud Console → Cloud Scheduler → force run the job
# Or use gcloud CLI (note: job name includes the region suffix):
gcloud scheduler jobs run firebase-schedule-scheduledForecastFetch-us-central1 \
  --location=us-central1 --project=<your-project-id>
```

### Check cached data

```bash
# In Firebase Console → Firestore → cache collection → forecast / marine documents
```

### Local development

```bash
# Run frontend dev server
npm run dev

# In another terminal, run Cloud Functions emulator
cd functions && firebase emulators:start --only functions,firestore
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Forecast/tide/marine data empty | Check Firestore `cache/forecast`, `cache/tide`, `cache/marine` documents exist. Manually trigger `scheduledForecastFetch` or `scheduledMarineFetch` via Cloud Scheduler |
| Firestore permission denied in browser | Check `firestore.rules` — `cache/{document}` must allow public reads |
| Firestore gRPC errors in function logs | Firestore database not created yet — go to Firebase Console → Build → Firestore Database → Create database → choose `us-central1` |
| Marine forecast missing | Check Firestore `cache/marine`. weather.gc.ca may be temporarily down |
| Tide data not found | Ensure `07811_data.csv` is in `functions/` directory |
| Deploy fails | Run `firebase login` and confirm `.firebaserc` project ID matches your Firebase project |
| Scheduler not running | Check Cloud Scheduler in Google Cloud Console → verify jobs are enabled |

## Cost Estimate (Blaze Plan)

For a low-traffic site (~100 visits/day):

| Service | Usage | Cost |
|---------|-------|------|
| Hosting | <360 MB/day | Free |
| Functions | ~12 invocations/day (cron only) | Free (2M/month included) |
| Firestore | ~300 reads/day, 12 writes/day | Free (50K reads, 20K writes/day) |
| Cloud Scheduler | 2 jobs | Free (3 free jobs included) |
| **Total** | | **~$0/month** |

## Data Sources

- **HRDPS Model**: [ECCC HRDPS Documentation](https://eccc-msc.github.io/open-data/msc-data/nwp_hrdps/readme_hrdps_en/)
- **GeoMet WMS**: [MSC GeoMet](https://eccc-msc.github.io/open-data/msc-geomet/readme_en/)
- **Tide Data**: [CHS Tides & Water Levels](https://www.tides.gc.ca/) — Station 07811 (Squamish Inner)
- **Marine Forecast**: [EC Marine Forecast — Howe Sound](https://weather.gc.ca/marine/forecast_e.html?mapID=02&siteID=06400)

## Migration from Netfirms

The old Netfirms deployment used PHP endpoints at `/wind/api/*.php`. The Firebase version:
- Serves from root `/` instead of `/wind/`
- Uses Cloud Functions (Node.js) instead of PHP
- Pre-fetches HRDPS data on schedule instead of on-demand
- Caches in Firestore instead of filesystem JSON
- Old PHP files in `api/` are retained for reference but no longer used
