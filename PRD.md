# Howe Sound Wingfoil Wind Forecast Web App — PRD

## Overview

A static web app for local wingfoilers in Howe Sound that displays high-resolution wind forecasts focused on katabatic (downslope) and anabatic (upslope) flow conditions. The site fetches Environment and Climate Change Canada's **HRDPS** model data for four fixed locations along the coast-to-interior transect (Pam Rocks → Squamish → Whistler → Lillooet) and plots key weather variables as area charts. The primary variables are **surface pressure**, **surface temperature**, and **cloud cover**, which help users infer pressure gradients and wind behavior. Forecast data come from the HRDPS (~2.5 km resolution, 48 h ahead, updated 4×/day). Only daytime hours (07:00–21:00 Pacific Time) are displayed. The interface uses Chakra UI for styling and Recharts for charting.

**Live site**: https://www.dobell.ca/wind/

## Goals

- **Accurate Local Forecast**: Provide wingfoilers with HRDPS pressure, temperature, and cloud cover data at Howe Sound locations to predict katabatic/anabatic winds.
- **Automatic Updates**: Refresh data when new HRDPS runs are published (~4×/day). PHP proxy caches results server-side.
- **Clear Visualization**: Interactive area charts (Recharts) with hover tooltips and series toggling.
- **Local Focus**: Four fixed sites only; no user accounts required.
- **Performance**: Static HTML/JS frontend loads quickly; PHP proxy handles data fetching and caching.

## Fixed Locations (Coast → Interior Transect)

| Location | Lat | Lon | Elevation | Notes |
|----------|-----|-----|-----------|-------|
| Pam Rocks | 49.4883 | -123.2983 | Sea level | Howe Sound mouth, marine reference |
| Squamish | 49.7016 | -123.1558 | ~60 m | Valley floor, convergence zone |
| Whistler | 50.1163 | -122.9574 | ~670 m | Mountain base, alpine influence |
| Lillooet | 50.6868 | -121.9422 | ~250 m | Interior, dry/hot, pressure source |

## Data Source & Retrieval

### Source: HRDPS via MSC GeoMet WMS

- **Model**: HRDPS Continental (~2.5 km resolution, 48 h forecast, 4 runs/day at 00Z/06Z/12Z/18Z)
- **API**: MSC GeoMet WMS at `https://geo.weather.gc.ca/geomet`
- **Method**: WMS 1.1.1 `GetFeatureInfo` requests for point values at each location
- **Format**: GeoJSON response (`application/json`)

### WMS Layer Names (Confirmed Working)

| Variable | Layer ID | Response Property | Raw Units | Display Units |
|----------|----------|-------------------|-----------|---------------|
| Surface Temperature (2 m) | `HRDPS.CONTINENTAL_TT` | `features[0].properties.value` | °C | °C |
| Mean Sea-Level Pressure | `HRDPS.CONTINENTAL_PN` | `features[0].properties.pixel` | Pa | hPa (÷100) |
| Total Cloud Cover | `HRDPS.CONTINENTAL_NT` | `features[0].properties.value` | fraction (0–1) | % (×100) |

**Note**: The `PN` layer is a contour/isoline layer (not a raster like TT/NT), so it returns the pressure value in the `pixel` property with an `ID` field for contour index. The `HRDPS.CONTINENTAL_PRMSL` layer does **not** exist on GeoMet.

### WMS Query Pattern

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

### Example GeoMet Responses

**Temperature (TT) — raster layer:**
```json
{
  "type": "FeatureCollection",
  "layer": "HRDPS.CONTINENTAL_TT",
  "features": [{
    "type": "Feature",
    "properties": {
      "value": 9.2276554,
      "class": "5 10",
      "title_en": "HRDPS.CONTINENTAL - Air temperature at 2m above ground [°C]",
      "time": "2026-02-10T22:00:00Z",
      "dim_reference_time": "2026-02-10T18:00:00Z"
    }
  }]
}
```

**Pressure (PN) — contour layer:**
```json
{
  "type": "FeatureCollection",
  "name": "HRDPS.CONTINENTAL_PN",
  "features": [{
    "type": "Feature",
    "properties": { "ID": 3, "pixel": 101740.0 },
    "geometry": { "type": "LineString", "coordinates": [...] }
  }]
}
```

### PHP Proxy Architecture

Since the frontend can't parse GRIB2 and CORS may block direct GeoMet requests, a PHP proxy handles all data fetching:

1. **Endpoint**: `api/forecast.php` — returns cached JSON forecast data
2. **Caching**: Results cached as `api/cache/forecast_latest.json` (3-hour TTL)
3. **Batch Fetch**: On cache miss, fetches all variables × locations × forecast hours in one batch
4. **Model Run Detection**: Selects latest available run based on UTC hour and data availability delay (~4–5 h)
5. **Unit Conversion**: Pa→hPa (pressure), fraction→% (cloud), K→°C (temperature, if needed)
6. **HTTP**: Uses cURL when available, falls back to `file_get_contents`
7. **Debug Endpoints**:
   - `?debug=1` — test one request per variable, show raw GeoMet responses
   - `?debug=layers` — probe candidate pressure layer names to find the correct one

### Time Handling

- HRDPS model runs at 00Z, 06Z, 12Z, 18Z
- Daytime display: 07:00–21:00 Pacific Time
- PST (Nov–Mar): PT = UTC−8, so 07–21 PT = 15–05Z (next day)
- PDT (Mar–Nov): PT = UTC−7, so 07–21 PT = 14–04Z (next day)
- Frontend displays hour labels in Pacific Time

## Technical Architecture

### Frontend (Static Build)

- **Framework**: React 18 + Vite (builds to static HTML/JS/CSS)
- **UI Library**: Chakra UI v2 (layout, theming, dark/light mode)
- **Charts**: Recharts (AreaChart with tooltips, legends, series toggling)
- **Base Path**: Vite `base: '/wind/'` — all asset URLs prefixed for subdirectory deployment
- **API Path**: Uses `import.meta.env.BASE_URL + 'api/forecast.php'` → `/wind/api/forecast.php`
- **Code Splitting**: Separate chunks for vendor (React), chakra, and charts (~244 KB gzipped total)
- **Fallback**: Client-side demo data generated if API returns an error

### Backend (PHP Proxy)

- **Runtime**: PHP 7.4 on Netfirms (Debian)
- **Purpose**: Fetch, cache, and serve HRDPS forecast data as JSON
- **Storage**: File-based JSON cache (no MySQL required)
- **CORS**: Proxy eliminates CORS issues with GeoMet

### Hosting: Netfirms

- Debian, PHP 7.4.33, MySQL 5.7 (MySQL reserved for future use)
- Deployed to `/wind/` subdirectory at `www.dobell.ca`
- `.htaccess` with `RewriteBase /wind/` for SPA routing
- No Node.js on server; build locally, deploy `dist/` output

## Functional Requirements

### On Page Load

1. Frontend requests `/wind/api/forecast.php`
2. PHP proxy checks cache; if fresh (<3h), returns cached data
3. If stale, proxy fetches latest HRDPS data from GeoMet WMS, caches, returns
4. Frontend renders three area charts (pressure, temperature, cloud cover)

### Charts

- **Three stacked area charts**: one each for pressure (hPa), temperature (°C), cloud cover (%)
- **X-axis**: Time from 07:00 to 21:00 Pacific Time, labeled hourly
- **Y-axis**: Appropriate scale per variable with units
- **Series**: Each location is a separate series with distinct color
- **Colors**: Gradient from light to dark representing coast → interior:
  - Pam Rocks: Light blue (`#63B3ED`)
  - Squamish: Medium blue (`#3182CE`)
  - Whistler: Dark blue (`#2C5282`)
  - Lillooet: Navy (`#1A365D`)
- **Tooltips**: Show exact values on hover
- **Legend**: Clickable tags to toggle series visibility

### UI Layout

- **Header**: App title, subtitle explaining katabatic/anabatic focus, last update time, disclaimer
- **Charts**: Three charts stacked vertically, each with title and legend
- **Dark/Light Mode**: Toggle switch using Chakra's `useColorMode` (defaults to dark)
- **Responsive**: Charts stack on mobile, appropriate sizing on desktop
- **Footer**: Data attribution (ECCC/MSC), disclaimer

### Data Refresh

- Cache TTL: 3 hours (aligns with ~4 model runs/day)
- Frontend shows "Last updated: {timestamp}" from cached data
- Error state: "Using Demo Data" warning with simulated values

## Color & Design

- Use Chakra UI default theme with blue color scheme
- Semi-transparent area fills (opacity ~0.3) with solid stroke lines
- Clean, minimal dashboard layout
- Readable fonts, good contrast for outdoor/mobile viewing

## Non-Functional Requirements

- **Performance**: Page loads in <2 seconds; charts render ~15 data points each
- **Accessibility**: Chakra accessible components, sufficient color contrast
- **Maintainability**: Modular React components, documented PHP proxy with debug endpoints
- **Security**: No sensitive data; proxy validates inputs; no SQL injection surface

## Key Files

| File | Purpose |
|------|---------|
| `src/App.jsx` | Main layout: header, charts, footer, dark/light toggle |
| `src/ForecastChart.jsx` | Reusable area chart component with series toggling |
| `src/useForecastData.js` | Data fetching hook with demo fallback |
| `src/constants.js` | Locations, variables, API endpoint config |
| `src/theme.js` | Chakra UI theme (dark mode default) |
| `api/forecast.php` | PHP proxy: WMS queries, caching, unit conversion, debug |
| `vite.config.js` | Build config with `/wind/` base path and code splitting |

## Out of Scope

- Wind speed/direction display
- Interactive maps
- User accounts or personalization
- Push notifications
- Additional forecast models beyond HRDPS
- Historical data storage or trends
