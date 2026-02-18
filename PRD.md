# Sea to Sky Wind Forecast Web App — PRD

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
| Lillooet | 50.6868 | -121.9422 | ~250 m | Interior, dry/hot, pressure source |

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

## Technical Architecture

### Frontend (Static Build)

- **Framework**: React 18 + Vite (builds to static HTML/JS/CSS)
- **UI Library**: Chakra UI v2 (layout, theming, dark/light mode)
- **Charts**: Recharts (AreaChart with tooltips, legends, series toggling)
- **Lazy Loading**: ForecastChart, TideChart, MarineForecast loaded via React.lazy() to reduce initial bundle
- **Base Path**: Vite `base: '/'` — served from Firebase CDN root
- **Code Splitting**: Separate chunks for vendor (React), chakra, and charts (deferred)
- **Fallback**: Client-side demo data generated if HRDPS API returns an error
- **Multi-day Pagination**: Shared `selectedDate` state synchronizes all charts with `< 11 Feb >` navigation
- **Mobile Optimized**: Reduced chart margins and hidden Y-axis labels on small screens

### Backend (Firebase Cloud Functions)

- **Runtime**: Node.js 20 on Firebase Cloud Functions
- **HTTP Endpoints** (rewrites from `/api/*`):
  - `forecast` — serves pre-fetched HRDPS data from Firestore cache
  - `marine` — serves pre-fetched EC marine forecast from Firestore cache
  - `tide` — reads bundled CSV, returns JSON (no cache needed)
- **Scheduled Functions** (Cloud Scheduler):
  - `scheduledForecastFetch` — runs 4×/day (UTC 4,10,16,22), batches ~180 parallel WMS requests to GeoMet, stores in Firestore
  - `scheduledMarineFetch` — runs every 3 hours, fetches EC RSS, parses XML, stores in Firestore
- **Cache**: Firestore `cache/forecast` and `cache/marine` documents
- **CORS**: Functions set `Access-Control-Allow-Origin: *` headers

### Hosting: Firebase

- **CDN**: Firebase Hosting serves static `dist/` directory globally
- **Rewrites**: `/api/forecast`, `/api/marine`, `/api/tide` → Cloud Functions
- **SPA Fallback**: All other routes → `index.html`
- **Deploy**: `firebase deploy` or GitHub Actions auto-deploy on push to main

## Functional Requirements

### On Page Load

1. Frontend requests `/api/forecast` for HRDPS data (served from Firestore cache)
2. Frontend requests `/api/tide` for tide predictions (served from bundled CSV)
3. Frontend requests `/api/marine` for marine forecast text (served from Firestore cache)
4. Cloud Functions read pre-cached data from Firestore — instant response
5. Fallback: if Firestore cache empty, functions fetch live data and populate cache
6. Frontend renders all charts and marine forecast sections

### HRDPS Charts

- **Three stacked area charts**: one each for pressure (hPa), temperature (°C), cloud cover (%)
- **Multi-day pagination**: `< prev | 11 Feb | next >` navigation on each chart, synchronized
- **X-axis**: Time from 07:00 to 21:00 Pacific Time, labeled hourly
- **Y-axis**: Appropriate scale per variable with units (hidden on mobile)
- **Series**: Each location is a separate series with distinct color
- **Colors**: Gradient from light to dark representing coast → interior:
  - Pam Rocks: Light blue (`#63B3ED`)
  - Squamish: Medium blue (`#3182CE`)
  - Whistler: Dark blue (`#2C5282`)
  - Lillooet: Navy (`#1A365D`)
- **Tooltips**: Show exact values on hover
- **Legend**: Clickable tags to toggle series visibility

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
| `src/App.jsx` | Main layout: header, charts, tide, marine forecast, footer |
| `src/ForecastChart.jsx` | Reusable HRDPS area chart with series toggling and date nav |
| `src/TideChart.jsx` | Tide prediction area chart with date nav |
| `src/MarineForecast.jsx` | EC marine forecast text display |
| `src/useForecastData.js` | HRDPS data fetching hook with demo fallback |
| `src/constants.js` | Locations, variables, API endpoint config |
| `src/theme.js` | Chakra UI theme (dark mode default) |
| `functions/index.js` | Cloud Functions: HTTP endpoints + scheduled pre-fetch |
| `functions/package.json` | Cloud Functions dependencies |
| `functions/07811_data.csv` | CHS tide data bundled with Cloud Function |
| `firebase.json` | Firebase project config: hosting, rewrites, functions |
| `.firebaserc` | Firebase project ID reference |
| `vite.config.js` | Build config with `/` base path and code splitting |
| `api/forecast.php` | Legacy PHP proxy (retained for reference) |
| `api/marine.php` | Legacy PHP proxy (retained for reference) |
| `api/tide.php` | Legacy PHP endpoint (retained for reference) |

## Out of Scope

- Wind speed/direction display
- Interactive maps
- User accounts or personalization
- Push notifications
- Additional forecast models beyond HRDPS
- Historical data storage or trends
