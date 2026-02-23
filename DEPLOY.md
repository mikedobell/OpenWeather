# OpenWeather.ca — Deployment Guide

## Architecture

```
Firebase Hosting (CDN)          Cloud Functions (Node.js 20)
├── index.html                  ├── forecast — serves HRDPS JSON from Firestore cache
├── assets/*.js, *.css          ├── marine   — serves EC marine forecast from Firestore cache
└── /api/* → rewrites to ──────>├── tide     — reads bundled CSV, returns JSON
    Cloud Functions             ├── scheduledForecastFetch — cron: pre-fetches HRDPS 4×/day
                                └── scheduledMarineFetch   — cron: pre-fetches marine 4×/day
                                        │
                                        ▼
                                   Firestore (cache)
                                   ├── cache/forecast
                                   └── cache/marine
```

## Prerequisites

1. A Firebase project on the **Blaze** plan (pay-as-you-go, but free-tier usage is sufficient)
2. Node.js 18+ and npm installed locally
3. Firebase CLI installed: `npm install -g firebase-tools`
4. GitHub repo connected for auto-deploy (optional)

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

(Cloud Functions use the Admin SDK, which bypasses security rules. The rules deny all direct client access to the `cache` collection.)

## Deploy

### Manual deploy

```bash
# From project root:

# 1. Install dependencies
npm install
cd functions && npm install && cd ..

# 2. Build frontend
npm run build

# 3. Deploy everything
firebase deploy
```

This deploys:
- **Hosting**: `dist/` directory → Firebase CDN
- **Functions**: `functions/` directory → Cloud Functions
- **Firestore rules**: `firestore.rules` → Firestore security rules
- **Scheduled functions**: Automatically creates Cloud Scheduler jobs

### Deploy from GitHub (recommended)

1. In Firebase Console → Hosting → click **"Set up GitHub Action"** (or "Get started with GitHub")
2. Authorize Firebase to your GitHub repo
3. Firebase will create a `.github/workflows/firebase-hosting-merge.yml` and PR preview workflow
4. On every push to your main branch, Firebase auto-builds and deploys

**Or manually create the workflow:**

Create `.github/workflows/firebase-deploy.yml`:

```yaml
name: Deploy to Firebase
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - run: cd functions && npm ci
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          channelId: live
```

To set up the secret:
1. Firebase Console → Project Settings → Service Accounts
2. Click **Generate new private key** → download JSON
3. In GitHub repo → Settings → Secrets → Actions → **New repository secret**
4. Name: `FIREBASE_SERVICE_ACCOUNT`, Value: paste the entire JSON content

## How It Works

### Pre-fetched Data (the key optimization)

Instead of fetching HRDPS data during user page loads:

1. **`scheduledForecastFetch`** runs 4×/day via Cloud Scheduler (UTC 4, 10, 16, 22)
   - Makes ~180 parallel WMS requests to GeoMet (batched 20 at a time)
   - Stores the complete forecast JSON in Firestore `cache/forecast`
2. **`scheduledMarineFetch`** runs every 3 hours
   - Fetches EC RSS feed, parses XML, stores in Firestore `cache/marine`
3. When a user visits, the `forecast` and `marine` functions just read from Firestore — **instant response**

### Request Flow

```
User browser
  → Firebase CDN (static HTML/JS/CSS — ~140 KB gzip)
  → /api/forecast → Cloud Function → reads Firestore cache → JSON
  → /api/marine   → Cloud Function → reads Firestore cache → JSON
  → /api/tide     → Cloud Function → reads bundled CSV → JSON
```

### Tide Data

The `07811_data.csv` file is bundled directly into the Cloud Function deployment (in `functions/07811_data.csv`). It's read from disk at function invocation time — no external fetch needed.

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
| Functions return 500 | Check `firebase functions:log` for errors |
| Forecast data empty | Check Firestore `cache/forecast` document exists. Manually trigger `scheduledForecastFetch` via Cloud Scheduler |
| Firestore gRPC errors in logs | Firestore database not created yet — go to Firebase Console → Build → Firestore Database → Create database → choose `us-central1` |
| Marine forecast missing | Check Firestore `cache/marine`. weather.gc.ca may be temporarily down |
| Tide data not found | Ensure `07811_data.csv` is in `functions/` directory |
| Deploy fails | Run `firebase login` and confirm `.firebaserc` project ID matches your Firebase project |
| Scheduler not running | Check Cloud Scheduler in Google Cloud Console → verify jobs are enabled |
| CORS errors | The functions set `Access-Control-Allow-Origin: *` headers |

## Cost Estimate (Blaze Plan)

For a low-traffic site (~100 visits/day):

| Service | Usage | Cost |
|---------|-------|------|
| Hosting | <360 MB/day | Free |
| Functions | ~500 invocations/day | Free (2M/month included) |
| Firestore | ~500 reads/day, 8 writes/day | Free (50K reads, 20K writes/day) |
| Cloud Scheduler | 6 jobs | Free (3 free, ~$0.10/month for extra) |
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
