# Deployment Guide — Sea to Sky Wind Forecast

**Live site**: https://www.dobell.ca/wind/

## Quick Deploy to Netfirms

### 1. Build locally

```bash
npm install
npm run build
```

This produces a `dist/` folder with all asset URLs prefixed with `/wind/`.

### 2. Upload to Netfirms

Upload to the `/wind/` subdirectory on your Netfirms hosting:

```
www.dobell.ca/
└── wind/
    ├── index.html          ← from dist/index.html
    ├── assets/             ← from dist/assets/ (JS/CSS chunks)
    ├── 07811_data.csv      ← tide prediction data (project root)
    ├── api/
    │   ├── forecast.php    ← HRDPS proxy (from repo api/)
    │   ├── marine.php      ← marine forecast proxy (from repo api/)
    │   ├── tide.php        ← tide data endpoint (from repo api/)
    │   ├── .htaccess       ← protect cache dir (from repo api/)
    │   └── cache/          ← writable dir for cached JSON
    │       └── .gitkeep
    └── .htaccess           ← SPA routing (from repo root)
```

**Important**: `07811_data.csv` must be in the project root (one level above `api/`), since `tide.php` reads `__DIR__ . '/../07811_data.csv'`.

### 3. Set cache directory permissions

```bash
chmod 755 wind/api/cache
```

### 4. Verify

1. Visit https://www.dobell.ca/wind/ — you should see the full dashboard
2. Check https://www.dobell.ca/wind/api/forecast.php — HRDPS JSON data
3. Check https://www.dobell.ca/wind/api/tide.php — tide prediction JSON
4. Check https://www.dobell.ca/wind/api/marine.php — marine forecast JSON
5. If HRDPS data isn't available, demo data will be shown automatically with a yellow "DEMO" badge

## How It Works

### HRDPS Forecast Charts
1. **Frontend** (React + Chakra UI + Recharts) loads as static HTML/JS from `/wind/`
2. **On load**, it fetches `/wind/api/forecast.php`
3. **PHP proxy** checks for cached data (`api/cache/forecast_latest.json`, < 3 hours old)
4. If cache is stale, it queries **MSC GeoMet WMS 1.1.1** for HRDPS point forecasts
5. Makes `GetFeatureInfo` requests for each variable × location × forecast hour (today + tomorrow)
6. Converts units (Pa→hPa, fraction→%, K→°C) and caches as JSON
7. **Charts** render pressure, temperature, and cloud cover for 4 locations with date pagination

### Tide Chart
1. Frontend fetches `/wind/api/tide.php`
2. PHP reads `07811_data.csv` (CHS predicted water levels for Squamish Inner)
3. Filters to daytime hours (7:00–21:00 PT) for today + tomorrow
4. Returns JSON array of `{time, hour, value, date}` points
5. Chart renders as area chart synchronized with HRDPS date pagination

### Marine Forecast
1. Frontend fetches `/wind/api/marine.php`
2. PHP fetches EC Atom RSS feed for Howe Sound (area 06400)
3. Parses XML entries, matches sections by title keywords
4. Caches as JSON (`api/cache/marine_latest.json`, < 1 hour old)
5. Displays sectioned text: Warnings, Forecast, Winds, Weather & Visibility, Extended Forecast

## Debug Endpoints

These skip the cache and return diagnostic information:

- **`/wind/api/forecast.php?debug=1`** — Test one request per variable for Squamish at ~2 PM PT. Shows raw GeoMet responses, parsed values, PHP version, and cURL availability.

- **`/wind/api/forecast.php?debug=layers`** — Probe multiple candidate pressure layer names against GeoMet. Used to discover the correct `HRDPS.CONTINENTAL_PN` layer.

- **`/wind/api/marine.php?debug=1`** — Show raw RSS feed parsing details, entry titles, and matched sections.

- **`/wind/api/tide.php?debug=1`** — Show CSV file path, existence check, requested dates, and total data points.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Charts show "Demo Data" | PHP proxy can't reach `geo.weather.gc.ca`. Check outbound HTTPS from hosting. Run `?debug=1` to see raw responses. |
| Blank page | Ensure `.htaccess` mod_rewrite is active. Check `RewriteBase /wind/` is set. |
| Stale HRDPS data | Delete `api/cache/forecast_latest.json` to force a fresh fetch. |
| Stale marine forecast | Delete `api/cache/marine_latest.json` to force a fresh fetch. |
| Pressure shows null | Run `?debug=layers` to check which pressure layer names work. Currently uses `HRDPS.CONTINENTAL_PN`. |
| Cloud cover shows tiny numbers | The `NT` layer returns 0–1 fractions. The proxy multiplies by 100 to get percentage. If you see values like 0.18, the cache has old data — delete it. |
| All HRDPS values null | Check `?debug=1` — look at `raw_response` for each variable. May be XML error (wrong layer), empty (no data for that time), or `REQUEST FAILED` (network issue). |
| Tide chart empty | Ensure `07811_data.csv` is in the project root (parent of `api/`). Check `/wind/api/tide.php?debug=1` for file path details. |
| Marine forecast missing sections | Check `/wind/api/marine.php?debug=1` to see `entry_titles` — the RSS feed entry titles may not match expected keywords. |
| Marine forecast shows only extended | The near-term forecast entry title may not contain "wind" or "weather". The `forecast` catch-all should match generic "Forecast" titles. Check `entry_titles` in debug output. |

## Data Sources

- **HRDPS Model**: [ECCC HRDPS Documentation](https://eccc-msc.github.io/open-data/msc-data/nwp_hrdps/readme_hrdps_en/)
- **GeoMet WMS**: [MSC GeoMet](https://eccc-msc.github.io/open-data/msc-geomet/readme_en/)
- **WMS Layers**: `HRDPS.CONTINENTAL_TT` (temp), `HRDPS.CONTINENTAL_PN` (pressure), `HRDPS.CONTINENTAL_NT` (cloud)
- **Tide Data**: [CHS Tides & Water Levels](https://www.tides.gc.ca/) — Station 07811 (Squamish Inner)
- **Marine Forecast**: [EC Marine Forecast — Howe Sound](https://weather.gc.ca/marine/forecast_e.html?mapID=02&siteID=06400)
