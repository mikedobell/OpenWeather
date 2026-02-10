<?php
/**
 * HRDPS Forecast Data Proxy
 *
 * Fetches HRDPS forecast data from MSC GeoMet WMS (GetFeatureInfo)
 * for four fixed Howe Sound locations and caches results as JSON.
 *
 * Endpoint: GET /api/forecast.php
 * Returns: JSON with forecast data for pressure, temperature, cloud cover
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: public, max-age=1800'); // 30 min browser cache

// --- Configuration ---

define('CACHE_DIR', __DIR__ . '/cache');
define('CACHE_TTL', 10800); // 3 hours in seconds
define('GEOMET_URL', 'https://geo.weather.gc.ca/geomet');
define('REQUEST_TIMEOUT', 15); // seconds per HTTP request

// Locations: coast-to-interior transect
$locations = [
    'pamrocks' => ['name' => 'Pam Rocks', 'lat' => 49.4883, 'lon' => -123.2983],
    'squamish' => ['name' => 'Squamish', 'lat' => 49.7016, 'lon' => -123.1558],
    'whistler' => ['name' => 'Whistler', 'lat' => 50.1163, 'lon' => -122.9574],
    'lillooet' => ['name' => 'Lillooet', 'lat' => 50.6868, 'lon' => -121.9422],
];

// WMS layer names for each variable
$variables = [
    'pressure'    => 'HRDPS.CONTINENTAL_PRMSL',
    'temperature' => 'HRDPS.CONTINENTAL_TT',
    'cloud'       => 'HRDPS.CONTINENTAL_NT',
];

// --- Main ---

// Ensure cache directory exists
if (!is_dir(CACHE_DIR)) {
    mkdir(CACHE_DIR, 0755, true);
}

// Check for valid cached data
$cacheFile = CACHE_DIR . '/forecast_latest.json';
if (file_exists($cacheFile)) {
    $cacheAge = time() - filemtime($cacheFile);
    if ($cacheAge < CACHE_TTL) {
        readfile($cacheFile);
        exit;
    }
}

// Determine which model run to use and which hours to fetch
$modelRun = detectLatestModelRun();
$forecastHours = getDaytimeUTCHours($modelRun);

// Fetch all data
$forecast = [];
$errors = [];

foreach ($locations as $locId => $loc) {
    $forecast[$locId] = [
        'pressure' => [],
        'temperature' => [],
        'cloud' => [],
    ];

    foreach ($variables as $varId => $layerName) {
        foreach ($forecastHours as $fh) {
            $utcTime = $fh['utc'];
            $ptHour = $fh['pt_hour'];

            $value = fetchPointValue($layerName, $loc['lat'], $loc['lon'], $utcTime);

            if ($value !== null) {
                // Convert pressure from Pa to hPa if needed
                if ($varId === 'pressure' && $value > 10000) {
                    $value = round($value / 100, 1);
                } elseif ($varId === 'pressure') {
                    $value = round($value, 1);
                } elseif ($varId === 'temperature') {
                    // Temperature may come in Kelvin from some endpoints
                    if ($value > 100) {
                        $value = round($value - 273.15, 1);
                    } else {
                        $value = round($value, 1);
                    }
                } else {
                    $value = round($value, 0);
                }
            }

            $forecast[$locId][$varId][] = [
                'hour' => $ptHour,
                'value' => $value,
            ];
        }
    }
}

// Build response
$response = [
    'forecast' => $forecast,
    'model_run' => $modelRun,
    'generated_at' => gmdate('c'),
    'locations' => $locations,
    'errors' => $errors ?: null,
];

$json = json_encode($response, JSON_PRETTY_PRINT);

// Cache the result
file_put_contents($cacheFile, $json);

echo $json;
exit;

// --- Helper Functions ---

/**
 * Detect the latest available HRDPS model run.
 * HRDPS runs at 00, 06, 12, 18 UTC. Data is typically available ~4-5h after run time.
 * We pick the most recent run that should be available.
 */
function detectLatestModelRun() {
    $utcHour = (int) gmdate('G');
    // Data availability delay: ~4-5 hours after model run start
    // 00Z available ~05Z, 06Z available ~11Z, 12Z available ~17Z, 18Z available ~23Z
    if ($utcHour >= 23) return '18';
    if ($utcHour >= 17) return '12';
    if ($utcHour >= 11) return '06';
    if ($utcHour >= 5)  return '00';
    // Before 05Z, use previous day's 18Z run
    return '18';
}

/**
 * Get UTC timestamps for daytime hours (7-21 PT) based on the model run.
 * Returns array of ['utc' => ISO datetime, 'pt_hour' => int hour in PT].
 */
function getDaytimeUTCHours($modelRun) {
    // Determine if we're in PDT or PST
    $vancouver = new DateTimeZone('America/Vancouver');
    $now = new DateTime('now', $vancouver);
    $isDST = (bool) $now->format('I');
    $utcOffset = $isDST ? 7 : 8; // PT is UTC-7 (PDT) or UTC-8 (PST)

    // Today's date in Vancouver
    $today = $now->format('Y-m-d');

    $hours = [];
    for ($ptHour = 7; $ptHour <= 21; $ptHour++) {
        $utcHour = $ptHour + $utcOffset;
        $utcDate = $today;

        if ($utcHour >= 24) {
            $utcHour -= 24;
            // Next day in UTC
            $tomorrow = (new DateTime($today, $vancouver))->modify('+1 day');
            $utcDate = $tomorrow->format('Y-m-d');
        }

        $utcTime = sprintf('%sT%02d:00:00Z', $utcDate, $utcHour);

        $hours[] = [
            'utc' => $utcTime,
            'pt_hour' => $ptHour,
        ];
    }

    return $hours;
}

/**
 * Fetch a single point value from MSC GeoMet WMS GetFeatureInfo.
 *
 * Uses a tiny bounding box around the point and queries the center pixel.
 * Returns the numeric value or null on failure.
 */
function fetchPointValue($layer, $lat, $lon, $utcTime) {
    // Small bbox around the point (~2.5km, matching HRDPS grid)
    $delta = 0.015;
    $bbox = implode(',', [
        $lat - $delta, // miny
        $lon - $delta, // minx
        $lat + $delta, // maxy
        $lon + $delta, // maxx
    ]);

    $params = [
        'SERVICE' => 'WMS',
        'VERSION' => '1.3.0',
        'REQUEST' => 'GetFeatureInfo',
        'LAYERS' => $layer,
        'QUERY_LAYERS' => $layer,
        'INFO_FORMAT' => 'application/json',
        'CRS' => 'EPSG:4326',
        'BBOX' => $bbox,
        'WIDTH' => '3',
        'HEIGHT' => '3',
        'I' => '1',
        'J' => '1',
        'TIME' => $utcTime,
    ];

    $url = GEOMET_URL . '?' . http_build_query($params);

    $context = stream_context_create([
        'http' => [
            'timeout' => REQUEST_TIMEOUT,
            'header' => "Accept: application/json\r\n",
        ],
    ]);

    $response = @file_get_contents($url, false, $context);
    if ($response === false) {
        return null;
    }

    $data = json_decode($response, true);
    if (!$data) {
        return null;
    }

    // GeoMet WMS GetFeatureInfo returns GeoJSON features
    // The value is typically in features[0].properties.{layer_name} or a "value" key
    if (isset($data['features']) && count($data['features']) > 0) {
        $props = $data['features'][0]['properties'] ?? [];

        // Try common property keys
        foreach ($props as $key => $val) {
            if (is_numeric($val)) {
                return (float) $val;
            }
        }
    }

    // Some responses use a different structure
    if (isset($data['value'])) {
        return (float) $data['value'];
    }

    return null;
}
