# Howe Sound Wingfoil Wind Forecast Web App — PRD

## Overview

A static web app for local wingfoilers in Howe Sound that displays high-resolution wind forecasts focused on katabatic (downslope) and anabatic (upslope) flow conditions. The site fetches Environment and Climate Change Canada's **HRDPS** model data for four fixed locations along the coast-to-interior transect (Pam Rocks → Squamish → Whistler → Lillooet) and plots key weather variables as area charts. The primary variables are **surface pressure**, **surface temperature**, and **cloud cover**, which help users infer pressure gradients and wind behavior. Forecast data come from the HRDPS (~2.5 km resolution, 48 h ahead, updated 4×/day). Only daytime hours (07:00–21:00 Pacific Time) are displayed. The interface uses Chakra UI for styling and Recharts for charting.

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

### Source: HRDPS via MSC GeoMet

- **Model**: HRDPS Continental (~2.5 km resolution, 48 h forecast, 4 runs/day at 00Z/06Z/12Z/18Z)
- **API**: MSC GeoMet WMS at `geo.weather.gc.ca/geomet`
- **Method**: WMS `GetFeatureInfo` requests for point values at each location
- **Format**: JSON response with pixel values at queried lat/lon

### WMS Layer Names

| Variable | Layer ID | Units |
|----------|----------|-------|
| Surface Temperature (2 m) | `HRDPS.CONTINENTAL_TT` | °C |
| Mean Sea-Level Pressure | `HRDPS.CONTINENTAL_PRMSL` | Pa (convert to hPa) |
| Total Cloud Cover | `HRDPS.CONTINENTAL_NT` | % (0–100) |

### Query Pattern

```
GET https://geo.weather.gc.ca/geomet?
  SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo
  &QUERY_LAYERS={LAYER_ID}
  &LAYERS={LAYER_ID}
  &INFO_FORMAT=application/json
  &CRS=EPSG:4326
  &BBOX={lat-0.01},{lon-0.01},{lat+0.01},{lon+0.01}
  &WIDTH=3&HEIGHT=3&I=1&J=1
  &TIME={ISO8601_datetime}
```

### Fallback: OGC API Coverages

If WMS GetFeatureInfo is insufficient, the OGC API at `api.weather.gc.ca` provides coverage queries:
```
GET https://api.weather.gc.ca/collections/{collection-id}/coverage?
  f=json&bbox={lon},{lat},{lon},{lat}&datetime={time}
```

### PHP Proxy Architecture

Since the frontend can't parse GRIB2 and CORS may block direct GeoMet requests, a PHP proxy handles all data fetching:

1. **Endpoint**: `api/forecast.php` — returns cached JSON forecast data
2. **Caching**: Results cached as JSON files (`cache/hrdps_{run}_{date}.json`) for 3 hours
3. **Batch Fetch**: On cache miss, fetches all variables × locations × forecast hours in one batch
4. **Model Run Detection**: Queries the latest available model run via WMS GetCapabilities

### Time Handling

- HRDPS model runs at 00Z, 06Z, 12Z, 18Z
- Daytime display: 07:00–21:00 Pacific Time
- PST (Nov–Mar): PT = UTC−8, so 07–21 PT = 15–05Z (next day)
- PDT (Mar–Nov): PT = UTC−7, so 07–21 PT = 14–04Z (next day)
- Frontend converts UTC timestamps to Pacific Time for display

## Technical Architecture

### Frontend (Static Build)

- **Framework**: React 18 + Vite (builds to static HTML/JS/CSS)
- **UI Library**: Chakra UI v2 (layout, theming, dark/light mode)
- **Charts**: Recharts (AreaChart with tooltips, legends, series toggling)
- **Deploy**: Static files served from Netfirms Apache

### Backend (PHP Proxy)

- **Runtime**: PHP 7.4 on Netfirms (Debian)
- **Purpose**: Fetch, cache, and serve HRDPS forecast data as JSON
- **Storage**: File-based JSON cache (no MySQL required for MVP)
- **CORS**: Proxy eliminates CORS issues with GeoMet

### Hosting: Netfirms

- Debian, PHP 7.4, MySQL 5.7 (MySQL reserved for future use)
- Static frontend deployed to document root
- PHP proxy in `api/` subdirectory
- No Node.js on server; build locally, deploy built files

## Functional Requirements

### On Page Load

1. Frontend requests `/api/forecast.php`
2. PHP proxy checks cache; if fresh (<3h), returns cached data
3. If stale, proxy fetches latest HRDPS data from GeoMet, caches, returns
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
- **Legend**: Clickable to toggle series visibility

### UI Layout

- **Header**: App title, subtitle explaining katabatic/anabatic focus, last update time, disclaimer
- **Charts**: Three charts stacked vertically, each with title and legend
- **Dark/Light Mode**: Toggle switch using Chakra's `useColorMode`
- **Responsive**: Charts stack on mobile, appropriate sizing on desktop
- **Footer**: Data attribution (ECCC/MSC), disclaimer

### Data Refresh

- Cache TTL: 3 hours (aligns with ~4 model runs/day)
- Frontend shows "Last updated: {timestamp}" from cached data
- Error state: "Forecast data currently unavailable" message

## Color & Design

- Use Chakra UI default theme with blue color scheme
- Semi-transparent area fills (opacity ~0.3) with solid stroke lines
- Clean, minimal dashboard layout
- Readable fonts, good contrast for outdoor/mobile viewing

## Non-Functional Requirements

- **Performance**: Page loads in <2 seconds; charts render ~15 data points each
- **Accessibility**: Chakra accessible components, sufficient color contrast
- **Maintainability**: Modular React components, documented PHP proxy
- **Security**: No sensitive data; proxy validates inputs; no SQL injection surface

## Out of Scope

- Wind speed/direction display
- Interactive maps
- User accounts or personalization
- Push notifications
- Additional forecast models beyond HRDPS
- Historical data storage or trends
