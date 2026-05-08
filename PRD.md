# OpenWeather.ca — PRD

## Overview

A static web app for local windsports enthusiasts on the Sea to Sky corridor that displays high-resolution weather forecasts focused on katabatic (downslope) and anabatic (upslope) flow conditions. The site fetches Environment and Climate Change Canada's **HRDPS** model data for four fixed locations along the coast-to-interior transect (Pam Rocks → Squamish → Whistler → Lillooet) and plots key weather variables as area charts. The primary variables are **surface pressure**, **surface temperature**, and **cloud cover**, which help users infer pressure gradients and wind behavior. Additional features include a **tide forecast** chart for Squamish Inner and the **Environment Canada marine forecast** for Howe Sound.

Forecast data come from the HRDPS (~2.5 km resolution, 48 h ahead, updated 4×/day). Only daytime hours (07:00–21:00 Pacific Time) are displayed. Multi-day pagination allows viewing today and tomorrow's forecasts. The interface uses Chakra UI for styling and Recharts for charting.

**Live site**: Firebase Hosting (previously at https://www.dobell.ca/wind/)

## Goals

- **Accurate Local Forecast**: Provide windsports enthusiasts with HRDPS pressure, temperature, and cloud cover data at Sea to Sky locations to predict katabatic/anabatic winds.
- **Automatic Updates**: Pre-fetch data on schedule via Cloud Scheduler when new HRDPS runs are published (~4×/day). Cached in Firestore for instant user access.
- **Clear Visualization**: Interactive area charts (Recharts) with hover tooltips, series toggling, and multi-day pagination.
- **Tide Information**: Display predicted tide levels for Squamish Inner from CHS data.
- **Marine Forecast**: Show the latest EC marine forecast text for Howe Sound (winds, weather, extended).
- **Local Focus**: Four fixed sites only; no user accounts required.
- **Performance**: Static HTML/JS frontend served from Firebase CDN; Cloud Functions serve pre-cached data from Firestore for instant response.

## Fixed Locations (Coast → Interior Transect)

| Location | Lat | Lon | Elevation | Notes |
|----------|-----|-----|-----------|-------|
| Pam Rocks | 49.4883 | -123.2983 | Sea level | Howe Sound mouth, marine reference |
| Squamish | 49.7016 | -123.1558 | ~60 m | Valley floor, convergence zone |
| Whistler | 50.1163 | -122.9574 | ~670 m | Mountain base, alpine influence |
| Pemberton | 50.3192 | -122.8035 | ~210 m | Inland valley, dominant interior reference |
| Lillooet | 50.6868 | -121.9422 | ~250 m | Far interior, dry/hot, pressure source |

## Data Sources

### 1. HRDPS via MSC GeoMet WMS

- **Model**: HRDPS Continental (~2.5 km resolution, 48 h forecast, 4 runs/day at 00Z/06Z/12Z/18Z)
- **API**: MSC GeoMet WMS at `https://geo.weather.gc.ca/geomet`
- **Method**: WMS 1.1.1 `GetFeatureInfo` requests for point values at each location
- **Format**: GeoJSON response (`application/json`)

#### WMS Layer Names (Confirmed Working)

| Variable | Layer ID | Response Property | Raw Units | Display Units |
|----------|----------|-------------------|-----------|---------------|
| Surface Temperature (2 m) | `HRDPS.CONTINENTAL_TT` | `features[0].properties.value` | °C | °C |
| Mean Sea-Level Pressure | `HRDPS.CONTINENTAL_PN` | `features[0].properties.pixel` | Pa | hPa (÷100) |
| Total Cloud Cover | `HRDPS.CONTINENTAL_NT` | `features[0].properties.value` | fraction (0–1) | % (×100) |

**Note**: The `PN` layer is a contour/isoline layer (not a raster like TT/NT), so it returns the pressure value in the `pixel` property with an `ID` field for contour index. The `HRDPS.CONTINENTAL_PRMSL` layer does **not** exist on GeoMet.

#### WMS Query Pattern

```
GET https://geo.weather.gc.ca/geomet?
  SERVICE=WMS
  &VERSION=1.1.1
  &REQUEST=GetFeatureInfo
  &LAYERS={LAYER_ID}
  &QUERY_LAYERS={LAYER_ID}
  &INFO_FORMAT=application/json
  &SRS=EPSG:4326
  &BBOX={lon-0.015},{lat-0.015},{lon+0.015},{lat+0.015}
  &WIDTH=3&HEIGHT=3
  &X=1&Y=1
  &TIME={ISO8601_datetime}
```

**Important**: Uses WMS **1.1.1** (not 1.3.0) to avoid the EPSG:4326 axis-order ambiguity. In WMS 1.1.1, BBOX is always `minlon,minlat,maxlon,maxlat` and uses `SRS`/`X`/`Y` parameters (not `CRS`/`I`/`J`).

### 2. Tide Predictions (CHS)

- **Source**: Canadian Hydrographic Service (CHS) predicted water levels
- **Station**: Squamish Inner (07811), lat 49.695, lon -123.155
- **Data**: Static CSV file (`07811_data.csv`) with predicted water levels (wlp) at 15-minute intervals
- **Time Range**: 2026/01/01 – 2029/02/28 in Pacific Time
- **Format**: CSV with 7 header rows, then `YYYY/MM/DD HH:MM,value` data rows (metres)
- **Display**: Daytime hours only (7:00–21:00 PT), today + tomorrow

### 3. Marine Forecast (Environment Canada RSS)

- **Source**: EC Atom RSS feed for Howe Sound marine area 06400
- **URL**: `https://weather.gc.ca/rss/marine/06400_e.xml`
- **Sections**: Warnings, Forecast (near-term winds), Weather & Visibility, Extended Forecast
- **Caching**: Pre-fetched every 3 hours via Cloud Scheduler, stored in Firestore

### 4. Surface Observations (ECCC SWOB-realtime + scrape)

- **Sources**: SWOB-realtime via MSC GeoMet OGC API (`api.weather.gc.ca/collections/swob-realtime`) for Pam Rocks, Squamish Airport, Whistler-Nesters, Lillooet; HTML scrape of `weather.gc.ca/past_conditions/?station=wgp` for Pemberton (no SWOB pressure source exists for Pemberton)
- **Variables**: MSL pressure (hPa) and air temperature (°C). Squamish/Whistler report station pressure only — reduced to MSL via observed temperature + station elevation
- **Cadence**: Hourly, aggregated to one observation per hour closest to top-of-hour
- **Caching**: Pre-fetched every hour via Cloud Scheduler; stored in Firestore as `cache/observations` with shape `{ <locId>: { pressure: [...], temperature: [...] } }`
- **Display**: Solid line (no fill) overlaid on the forecast gradient on the same chart, with a vertical "Forecast →" reference line at the current PT hour
- **Cloud cover obs**: not implemented — coverage is uneven across stations and Pemberton has only text "Conditions" with no clean machine-readable mapping

### 5. Squamish Spit ML Forecast (paraglidingwx.com mirror)

- **Source**: `https://www.paraglidingwx.com/api/spit-forecast` — Trevor Wood's "SpitBiGRU" ML wind forecast for Squamish Spit, plus 24 h of 5-minute WeatherFlow station observations
- **Variables**: Avg / Gust / Lull (km/h, converted to knots for display) + ML mean with 68 % confidence interval
- **Caching**: Hourly mirror to Firestore `cache/spit`. Browser reads from Firestore — never hits the upstream
- **Attribution**: Source link to paraglidingwx.com is shown beneath the chart

## Technical Architecture

### Frontend (Static Build)

- **Framework**: React 18 + Vite (builds to static HTML/JS/CSS)
- **UI Library**: Chakra UI v2 with semantic design tokens defined in `src/theme.js` (`bg-card`, `text-heading`, `accent`, etc.) — fonts and colours managed via the pencil.dev MCP design pipeline
- **Charts**: Recharts (AreaChart for HRDPS/tide, ComposedChart for Spit)
- **Lazy Loading**: ForecastChart, TideChart, SpitForecast, SpitSummary, MarineForecast all loaded via `React.lazy()` to keep initial bundle small
- **Base Path**: Vite `base: '/'` — served from Firebase CDN root
- **Code Splitting**: Separate chunks for vendor (React), chakra, and charts (deferred)
- **Fallback**: Client-side demo data generated if Firestore forecast cache is unavailable
- **Multi-day Pagination**: Shared `selectedDate` state synchronizes the HRDPS, tide, and Spit charts; today + tomorrow only
- **Mobile Optimized**: Reduced chart margins and hidden Y-axis labels on small screens

### Backend (Firebase Cloud Functions)

- **Runtime**: Node.js 22 on Firebase Cloud Functions Gen 2
- **Frontend reads Firestore directly** via the Firebase JS SDK — there are no live HTTP endpoints anymore (the legacy `/api/*` rewrites are unused; PHP files retained for reference only)
- **Scheduled Functions** (Cloud Scheduler):
  - `scheduledForecastFetch` — runs 4×/day at 04/10/16/22 PT; batches ~450 parallel WMS requests to GeoMet (5 locations × 3 vars × 30 hours); writes `cache/forecast` and `cache/tide`
  - `scheduledObsFetch` — hourly at `:05` PT; pulls SWOB-realtime + Pemberton scrape, computes MSL pressure + temperature; writes `cache/observations` (memory: 512 MiB)
  - `scheduledSpitFetch` — hourly at `:10` PT; mirrors paraglidingwx.com Spit forecast; writes `cache/spit`
  - `scheduledMarineFetch` — every 3 hours at `:30` PT; fetches EC RSS, parses XML, writes `cache/marine`
- **Cache**: Firestore documents under `cache/{forecast,observations,spit,tide,marine}` — each is a rolling window overwritten on every cron tick
- **Archive**: Per-fetch JSON snapshots written to `gs://openweather-826fc-archive/archive/<dataset>/<date>/<ts>.json` for `forecast`, `observations`, `spit`. Lifecycle: Standard → Coldline @ 30 d → Archive @ 90 d. Intended for ML training; not website-accessible

### Hosting: Firebase

- **CDN**: Firebase Hosting serves static `dist/` directory globally
- **Rewrites**: `/api/forecast`, `/api/marine`, `/api/tide` → Cloud Functions
- **SPA Fallback**: All other routes → `index.html`
- **Deploy**: `firebase deploy` run manually from local machine

## Functional Requirements

### On Page Load

1. Frontend reads `cache/forecast`, `cache/observations`, `cache/tide`, `cache/spit`, and `cache/marine` directly from Firestore via the Firebase JS SDK
2. Components are lazy-loaded; charts render as soon as their respective cache document is read
3. Fallback: if `cache/forecast` is missing or empty, the frontend generates synthetic demo data so the chart is still navigable
4. Pemberton's `cache/observations` series may be briefly empty after a Pemberton-side scrape failure — the chart renders forecast-only for that location until the next hourly cron succeeds

### HRDPS Charts

- **Three stacked area charts**: one each for pressure (hPa), temperature (°C), cloud cover (%)
- **Multi-day pagination**: `< prev | 11 Feb | next >` navigation, synchronized via shared `selectedDate` across all charts
- **X-axis**: 07:00–21:00 Pacific Time, labeled hourly
- **Y-axis**: Appropriate scale per variable with units (hidden on mobile)
- **Series**: One per location, gradient blue palette light→dark representing coast → interior (Pam Rocks → Squamish → Whistler → Pemberton → Lillooet). Whistler and Lillooet are hidden by default to reduce visual noise — clickable legend tags toggle visibility
- **Visual language**: Forecast = solid line + gradient fill below. Observations (pressure + temperature only) = solid line, no fill, overlaid on the forecast for past hours. A vertical "Forecast →" reference line marks the current PT hour on charts that have observations
- **Tooltips**: Card-styled hover with exact values, pinned to `text-heading` colour for legibility on the light card background

### Squamish Spit Forecast

- **ComposedChart** showing 24 h spanning today (or tomorrow) with mirrored data from paraglidingwx.com
- **Past obs** (~5-min resolution): Avg solid line + gradient fill, Gust + Lull as 1,2-dashed thin lines
- **Forecast**: Avg solid line with shaded 68 % confidence band
- **"Forecast →" vertical line** at the model's `t_cut_local_hour`
- **Units**: Knots (km/h converted on the client)
- **Date pagination**: shares `selectedDate` with HRDPS/tide charts

### Squamish Spit Live Summary

- **Top-of-page info box** (similar style to the HRDPS model-info box) showing the latest Spit observation as `Squamish Spit (knots): <avg>, <gust>` with the numbers in the accent red token
- **Source**: latest entry in `cache/spit.obs_recent` (refreshed hourly with the rest of the Spit chart)

### Tide Chart

- **Single area chart** for Squamish Inner predicted water level (metres)
- **15-minute resolution** for smooth tide curve
- **Same date pagination** as HRDPS charts (synchronized)
- **X-axis**: 7:00–21:00 PT with hourly ticks
- **Y-axis**: Water level in metres (hidden on mobile)
- **Color**: Blue (`#3182CE` light / `#63B3ED` dark)

### Marine Forecast

- **Text display** of EC marine forecast for Howe Sound (area 06400)
- **Sections** displayed in order: Warnings, Forecast, Winds, Weather & Visibility, Extended Forecast
- **Formatting**: Day names bolded, wind sentences split to individual lines, warning notices highlighted
- **Link**: "View full forecast" link to weather.gc.ca marine page

### UI Layout

- **Header**: App title, subtitle explaining katabatic/anabatic focus, dark/light toggle
- **Model Info**: HRDPS badge, model run time, last updated timestamp, demo data warning
- **HRDPS Charts**: Three charts stacked vertically, each with title, legend, and date nav
- **Tide Chart**: Below HRDPS charts, same card styling
- **Marine Forecast**: Below tide chart, card with sectioned text forecast
- **Dark/Light Mode**: Toggle switch using Chakra's `useColorMode` (defaults to dark)
- **Responsive**: Charts stack on mobile with reduced margins and hidden Y-axis
- **Footer**: Data attribution (ECCC/MSC), disclaimer, usage notes

### Data Refresh

- **HRDPS**: Pre-fetched 4×/day by Cloud Scheduler (UTC 4,10,16,22), stored in Firestore
- **Marine forecast**: Pre-fetched every 3 hours by Cloud Scheduler
- **Tide data**: Static CSV bundled with Cloud Function, no refresh needed
- Frontend shows "Last updated: {timestamp}" from cached data
- Error state: "Using Demo Data" warning with simulated values

## Key Files

| File | Purpose |
|------|---------|
| `src/App.jsx` | Main layout: header, summary box, charts, marine forecast, footer |
| `src/ForecastChart.jsx` | HRDPS area chart with obs overlay, "Forecast →" reference line, series toggling, date nav |
| `src/TideChart.jsx` | Tide prediction area chart with date nav |
| `src/SpitForecast.jsx` | Squamish Spit ComposedChart (knots) — obs + ML forecast + 68 % CI band |
| `src/SpitSummary.jsx` | Top-of-page live readings box (avg + gust in knots) |
| `src/MarineForecast.jsx` | EC marine forecast text display |
| `src/useForecastData.js` | Forecast + observations Firestore reader with demo fallback |
| `src/constants.js` | Locations + variables config |
| `src/theme.js` | Chakra theme: design tokens, fonts, global Heading colour |
| `functions/index.js` | Cloud Functions: scheduled pre-fetchers + GCS archive helper |
| `functions/package.json` | Cloud Functions dependencies (incl. `@google-cloud/storage`) |
| `functions/07811_data.csv` | CHS tide data bundled with Cloud Function |
| `firebase.json` | Firebase project config: hosting, rewrites, functions |
| `firestore.rules` | Public reads on `cache/{document}`, no writes (admin SDK bypasses) |
| `.firebaserc` | Firebase project ID reference |
| `vite.config.js` | Build config with `/` base path and code splitting |
| `api/*.php` | Legacy PHP proxies, retained for reference, no longer used |

## Out of Scope

- Interactive maps
- User accounts or personalization
- Push notifications
- Additional forecast models beyond HRDPS and the mirrored Spit ML forecast
- Long-term historical data on the website (the GCS archive is for offline ML training only)
