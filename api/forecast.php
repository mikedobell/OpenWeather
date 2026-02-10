<?php
/**
 * HRDPS Forecast Data Proxy
 *
 * Fetches HRDPS forecast data from MSC GeoMet WMS (GetFeatureInfo)
 * for four fixed Howe Sound locations and caches results as JSON.
 *
 * Endpoint: GET /api/forecast.php
 *   ?debug=1  — show raw GeoMet responses for troubleshooting
 * Returns: JSON with forecast data for pressure, temperature, cloud cover
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: public, max-age=1800');

// --- Configuration ---

define('CACHE_DIR', __DIR__ . '/cache');
define('CACHE_TTL', 10800); // 3 hours
define('GEOMET_URL', 'https://geo.weather.gc.ca/geomet');
define('REQUEST_TIMEOUT', 15);

$locations = [
    'pamrocks' => ['name' => 'Pam Rocks', 'lat' => 49.4883, 'lon' => -123.2983],
    'squamish' => ['name' => 'Squamish', 'lat' => 49.7016, 'lon' => -123.1558],
    'whistler' => ['name' => 'Whistler', 'lat' => 50.1163, 'lon' => -122.9574],
    'lillooet' => ['name' => 'Lillooet', 'lat' => 50.6868, 'lon' => -121.9422],
];

$variables = [
    'pressure'    => 'HRDPS.CONTINENTAL_PRMSL',
    'temperature' => 'HRDPS.CONTINENTAL_TT',
    'cloud'       => 'HRDPS.CONTINENTAL_NT',
];

// --- Debug mode ---

$debug = isset($_GET['debug']);
$debugLog = [];

if ($debug) {
    // In debug mode, skip cache and test one request per variable
    $testLoc = $locations['squamish'];
    $modelRun = detectLatestModelRun();
    $forecastHours = getDaytimeUTCHours($modelRun);
    $testHour = $forecastHours[7] ?? $forecastHours[0]; // ~2pm PT

    $debugLog['model_run'] = $modelRun;
    $debugLog['test_time_utc'] = $testHour['utc'];
    $debugLog['test_time_pt'] = $testHour['pt_hour'] . ':00 PT';
    $debugLog['test_location'] = 'Squamish (' . $testLoc['lat'] . ', ' . $testLoc['lon'] . ')';
    $debugLog['php_version'] = PHP_VERSION;
    $debugLog['allow_url_fopen'] = ini_get('allow_url_fopen');
    $debugLog['curl_available'] = function_exists('curl_init');

    foreach ($variables as $varId => $layerName) {
        $url = buildWmsUrl($layerName, $testLoc['lat'], $testLoc['lon'], $testHour['utc']);
        $debugLog['requests'][$varId] = [
            'url' => $url,
            'layer' => $layerName,
        ];

        $raw = httpGet($url);
        $debugLog['requests'][$varId]['raw_response'] = $raw !== false ? $raw : 'REQUEST FAILED';
        $debugLog['requests'][$varId]['raw_length'] = $raw !== false ? strlen($raw) : 0;

        if ($raw !== false) {
            $value = parseGeoMetResponse($raw);
            $debugLog['requests'][$varId]['parsed_value'] = $value;
        }
    }

    echo json_encode($debugLog, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

// --- Main ---

if (!is_dir(CACHE_DIR)) {
    @mkdir(CACHE_DIR, 0755, true);
}

// Check cache
$cacheFile = CACHE_DIR . '/forecast_latest.json';
if (file_exists($cacheFile)) {
    $cacheAge = time() - filemtime($cacheFile);
    if ($cacheAge < CACHE_TTL) {
        readfile($cacheFile);
        exit;
    }
}

$modelRun = detectLatestModelRun();
$forecastHours = getDaytimeUTCHours($modelRun);

$forecast = [];
$fetchErrors = 0;
$fetchTotal = 0;

foreach ($locations as $locId => $loc) {
    $forecast[$locId] = [
        'pressure' => [],
        'temperature' => [],
        'cloud' => [],
    ];

    foreach ($variables as $varId => $layerName) {
        foreach ($forecastHours as $fh) {
            $fetchTotal++;
            $url = buildWmsUrl($layerName, $loc['lat'], $loc['lon'], $fh['utc']);
            $raw = httpGet($url);
            $value = ($raw !== false) ? parseGeoMetResponse($raw) : null;

            if ($value === null) {
                $fetchErrors++;
            }

            if ($value !== null) {
                // Convert pressure from Pa to hPa if needed
                if ($varId === 'pressure' && $value > 10000) {
                    $value = round($value / 100, 1);
                } elseif ($varId === 'pressure') {
                    $value = round($value, 1);
                } elseif ($varId === 'temperature') {
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
                'hour' => $fh['pt_hour'],
                'value' => $value,
            ];
        }
    }
}

$response = [
    'forecast' => $forecast,
    'model_run' => $modelRun,
    'generated_at' => gmdate('c'),
    'locations' => $locations,
    'fetch_stats' => [
        'total' => $fetchTotal,
        'errors' => $fetchErrors,
    ],
];

$json = json_encode($response, JSON_PRETTY_PRINT);
@file_put_contents($cacheFile, $json);

echo $json;
exit;

// --- Helper Functions ---

function detectLatestModelRun() {
    $utcHour = (int) gmdate('G');
    if ($utcHour >= 23) return '18';
    if ($utcHour >= 17) return '12';
    if ($utcHour >= 11) return '06';
    if ($utcHour >= 5)  return '00';
    return '18';
}

function getDaytimeUTCHours($modelRun) {
    $vancouver = new DateTimeZone('America/Vancouver');
    $now = new DateTime('now', $vancouver);
    $isDST = (bool) $now->format('I');
    $utcOffset = $isDST ? 7 : 8;
    $today = $now->format('Y-m-d');

    $hours = [];
    for ($ptHour = 7; $ptHour <= 21; $ptHour++) {
        $utcHour = $ptHour + $utcOffset;
        $utcDate = $today;

        if ($utcHour >= 24) {
            $utcHour -= 24;
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
 * Build the WMS GetFeatureInfo URL.
 *
 * Uses WMS 1.1.1 with SRS=EPSG:4326 (lon/lat axis order) to avoid
 * the axis-order ambiguity in WMS 1.3.0.
 * Uses X/Y instead of I/J (1.1.1 convention).
 */
function buildWmsUrl($layer, $lat, $lon, $utcTime) {
    // Small bbox around the point — use lon,lat order for EPSG:4326 in WMS 1.1.1
    $delta = 0.015;
    $bbox = implode(',', [
        $lon - $delta,  // minx (lon)
        $lat - $delta,  // miny (lat)
        $lon + $delta,  // maxx (lon)
        $lat + $delta,  // maxy (lat)
    ]);

    $params = [
        'SERVICE'      => 'WMS',
        'VERSION'      => '1.1.1',
        'REQUEST'      => 'GetFeatureInfo',
        'LAYERS'       => $layer,
        'QUERY_LAYERS' => $layer,
        'INFO_FORMAT'  => 'application/json',
        'SRS'          => 'EPSG:4326',
        'BBOX'         => $bbox,
        'WIDTH'        => '3',
        'HEIGHT'       => '3',
        'X'            => '1',
        'Y'            => '1',
        'TIME'         => $utcTime,
    ];

    return GEOMET_URL . '?' . http_build_query($params);
}

/**
 * Make an HTTP GET request. Uses cURL if available, falls back to file_get_contents.
 */
function httpGet($url) {
    if (function_exists('curl_init')) {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => REQUEST_TIMEOUT,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HTTPHEADER     => ['Accept: application/json, text/plain'],
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false || $httpCode >= 400) {
            return false;
        }
        return $response;
    }

    // Fallback to file_get_contents
    $context = stream_context_create([
        'http' => [
            'timeout' => REQUEST_TIMEOUT,
            'header'  => "Accept: application/json, text/plain\r\n",
        ],
    ]);
    $response = @file_get_contents($url, false, $context);
    return $response;
}

/**
 * Parse the GeoMet WMS GetFeatureInfo response.
 * Handles both JSON (GeoJSON FeatureCollection) and plain text formats.
 */
function parseGeoMetResponse($raw) {
    if (empty($raw)) return null;

    // Try JSON first
    $data = json_decode($raw, true);
    if ($data !== null) {
        // GeoJSON FeatureCollection: features[0].properties.{key}
        if (isset($data['features']) && is_array($data['features']) && count($data['features']) > 0) {
            $props = $data['features'][0]['properties'] ?? [];
            foreach ($props as $key => $val) {
                if (is_numeric($val)) {
                    return (float) $val;
                }
                // Sometimes value is a string like "15.3"
                if (is_string($val) && is_numeric(trim($val))) {
                    return (float) trim($val);
                }
            }
        }
        // Direct value
        if (isset($data['value']) && is_numeric($data['value'])) {
            return (float) $data['value'];
        }
        // Array of values
        if (isset($data['results']) && is_array($data['results'])) {
            foreach ($data['results'] as $r) {
                if (isset($r['value']) && is_numeric($r['value'])) {
                    return (float) $r['value'];
                }
            }
        }
        return null;
    }

    // Try parsing as plain text (common GeoMet format):
    // "Band 1:"
    // "  Value: 1013.25"
    // or just "value = 1013.25"
    if (preg_match('/[Vv]alue[:\s=]+([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)/', $raw, $m)) {
        return (float) $m[1];
    }

    // Try to find any standalone number in the response
    $lines = explode("\n", trim($raw));
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line !== '' && is_numeric($line)) {
            return (float) $line;
        }
    }

    return null;
}
