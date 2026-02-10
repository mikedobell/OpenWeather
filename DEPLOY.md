# Deployment Guide — Howe Sound Forecast

## Quick Deploy to Netfirms

### 1. Build locally

```bash
npm install
npm run build
```

### 2. Upload to Netfirms

Upload these files/folders to your Netfirms document root:

```
your-site-root/
├── index.html          ← from dist/index.html
├── assets/             ← from dist/assets/ (JS/CSS bundles)
├── api/
│   ├── forecast.php    ← PHP proxy
│   ├── .htaccess       ← protect cache dir
│   └── cache/          ← writable dir for cached JSON
│       └── .gitkeep
└── .htaccess           ← SPA routing + caching rules
```

### 3. Set cache directory permissions

```bash
chmod 755 api/cache
```

### 4. Verify

- Visit your site — you should see the dashboard with charts
- Check `your-site/api/forecast.php` returns JSON data
- If live data isn't available, demo data will be shown automatically

## How It Works

1. **Frontend** (React + Chakra UI + Recharts) loads as static HTML/JS
2. **On load**, it fetches `/api/forecast.php`
3. **PHP proxy** checks for cached data (< 3 hours old)
4. If cache is stale, it queries **MSC GeoMet WMS** for HRDPS point forecasts
5. Results are cached as JSON and returned to the frontend
6. **Charts** render pressure, temperature, and cloud cover for 4 locations

## Troubleshooting

- **Charts show "Demo Data"**: The PHP proxy can't reach `geo.weather.gc.ca`. Check that your hosting allows outbound HTTP requests (most do).
- **Blank page**: Ensure `.htaccess` rewrite rules are active. Netfirms uses Apache with mod_rewrite.
- **Stale data**: Delete `api/cache/forecast_latest.json` to force a refresh.
