# Deployment Guide — Howe Sound Forecast

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
    ├── api/
    │   ├── forecast.php    ← PHP proxy (from repo api/)
    │   ├── .htaccess       ← protect cache dir (from repo api/)
    │   └── cache/          ← writable dir for cached JSON
    │       └── .gitkeep
    └── .htaccess           ← SPA routing (from repo root)
```

### 3. Set cache directory permissions

```bash
chmod 755 wind/api/cache
```

### 4. Verify

1. Visit https://www.dobell.ca/wind/ — you should see the dashboard
2. Check https://www.dobell.ca/wind/api/forecast.php — should return JSON with forecast data
3. If live data isn't available, demo data will be shown automatically with a yellow "DEMO" badge

## How It Works

1. **Frontend** (React + Chakra UI + Recharts) loads as static HTML/JS from `/wind/`
2. **On load**, it fetches `/wind/api/forecast.php`
3. **PHP proxy** checks for cached data (`api/cache/forecast_latest.json`, < 3 hours old)
4. If cache is stale, it queries **MSC GeoMet WMS 1.1.1** for HRDPS point forecasts
5. Makes `GetFeatureInfo` requests for each variable × location × forecast hour
6. Converts units (Pa→hPa, fraction→%, K→°C) and caches as JSON
7. **Charts** render pressure, temperature, and cloud cover for 4 locations

## Debug Endpoints

These skip the cache and return diagnostic information:

- **`/wind/api/forecast.php?debug=1`** — Test one request per variable for Squamish at ~2 PM PT. Shows raw GeoMet responses, parsed values, PHP version, and cURL availability.

- **`/wind/api/forecast.php?debug=layers`** — Probe multiple candidate pressure layer names against GeoMet. Used to discover the correct `HRDPS.CONTINENTAL_PN` layer.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Charts show "Demo Data" | PHP proxy can't reach `geo.weather.gc.ca`. Check outbound HTTPS from hosting. Run `?debug=1` to see raw responses. |
| Blank page | Ensure `.htaccess` mod_rewrite is active. Check `RewriteBase /wind/` is set. |
| Stale data | Delete `api/cache/forecast_latest.json` to force a fresh fetch. |
| Pressure shows null | Run `?debug=layers` to check which pressure layer names work. Currently uses `HRDPS.CONTINENTAL_PN`. |
| Cloud cover shows tiny numbers | The `NT` layer returns 0–1 fractions. The proxy multiplies by 100 to get percentage. If you see values like 0.18, the cache has old data — delete it. |
| All values null | Check `?debug=1` — look at `raw_response` for each variable. May be XML error (wrong layer), empty (no data for that time), or `REQUEST FAILED` (network issue). |

## Data Sources

- **HRDPS Model**: [ECCC HRDPS Documentation](https://eccc-msc.github.io/open-data/msc-data/nwp_hrdps/readme_hrdps_en/)
- **GeoMet WMS**: [MSC GeoMet](https://eccc-msc.github.io/open-data/msc-geomet/readme_en/)
- **WMS Layers**: `HRDPS.CONTINENTAL_TT` (temp), `HRDPS.CONTINENTAL_PN` (pressure), `HRDPS.CONTINENTAL_NT` (cloud)
