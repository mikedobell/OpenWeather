<?php
/**
 * HRDPS Forecast Data Proxy
 *
 * Fetches HRDPS forecast data from MSC GeoMet WMS (GetFeatureInfo)
 * for four fixed Howe Sound locations and caches results as JSON.
 *
 * Endpoint: GET /api/forecast.php
 *   ?debug=1       — test one request per variable, show raw responses
 *   ?debug=layers  — probe for the correct pressure layer name
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

// WMS layer names — all confirmed available on GeoMet
$variables = [
    'pressure'    => 'HRDPS.CONTINENTAL_PN',
    'temperature' => 'HRDPS.CONTINENTAL_TT',
    'cloud'       => 'HRDPS.CONTINENTAL_NT',
];

// --- Debug: probe pressure layer names ---

if (isset($_GET['debug']) && $_GET['debug'] === 'layers') {
    $testLoc = $locations['squamish'];
    $modelRun = detectLatestModelRun();
    $forecastHours = getDaytimeUTCHours($modelRun);
    $testHour = $forecastHours[7] ?? $forecastHours[0];

    // Candidate pressure layer names to try
    $candidates = [
        'HRDPS.CONTINENTAL_PRMSL',
        'HRDPS.CONTINENTAL_PN',
        'HRDPS.CONTINENTAL_PRES',
        'HRDPS.CONTINENTAL_PRES-SFC',
        'HRDPS.CONTINENTAL_PRES_SFC',
        'HRDPS.CONTINENTAL.PRES_MSL',
        'HRDPS.CONTINENTAL_MSL',
        'HRDPS.CONTINENTAL_MSLP',
        'HRDPS.CONTINENTAL_PN-SL',
        'HRDPS.CONTINENTAL_PRES_ISBL_1015',
    ];

    $results = [];
    foreach ($candidates as $layer) {
        $url = buildWmsUrl($layer, $testLoc['lat'], $testLoc['lon'], $testHour['utc']);
        $raw = httpGet($url);
        $isError = ($raw === false) || (strpos($raw, 'ServiceException') !== false);
        $value = (!$isError && $raw !== false) ? parseGeoMetResponse($raw) : null;
        $results[$layer] = [
            'works' => !$isError && $value !== null,
            'parsed_value' => $value,
            'response_snippet' => $raw !== false ? substr($raw, 0, 600) : 'REQUEST FAILED',
        ];
    }

    echo json_encode([
        'test_time' => $testHour['utc'],
        'test_location' => 'Squamish',
        'candidates' => $results,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

// --- Debug: standard test ---

if (isset($_GET['debug'])) {
    $testLoc = $locations['squamish'];
    $modelRun = detectLatestModelRun();
    $forecastHours = getDaytimeUTCHours($modelRun);
    $testHour = $forecastHours[7] ?? $forecastHours[0];

    $debugLog = [
        'model_run' => $modelRun,
        'test_time_utc' => $testHour['utc'],
        'test_time_pt' => $testHour['pt_hour'] . ':00 PT',
        'test_location' => 'Squamish (' . $testLoc['lat'] . ', ' . $testLoc['lon'] . ')',
        'php_version' => PHP_VERSION,
        'curl_available' => function_exists('curl_init'),
    ];

    foreach ($variables as $varId => $layerName) {
        $url = buildWmsUrl($layerName, $testLoc['lat'], $testLoc['lon'], $testHour['utc']);
        $raw = httpGet($url);
        $debugLog['requests'][$varId] = [
            'url' => $url,
            'layer' => $layerName,
            'raw_response' => $raw !== false ? $raw : 'REQUEST FAILED',
            'raw_length' => $raw !== false ? strlen($raw) : 0,
            'parsed_value' => ($raw !== false) ? parseGeoMetResponse($raw) : null,
        ];
    }

    echo json_encode($debugLog, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

// --- Main ---

if (!is_dir(CACHE_DIR)) {
    @mkdir(CACHE_DIR, 0755, true);
}

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
                if ($varId === 'pressure') {
                    // GeoMet returns Pa — convert to hPa
                    if ($value > 10000) {
                        $value = round($value / 100, 1);
                    } else {
                        $value = round($value, 1);
                    }
                } elseif ($varId === 'temperature') {
                    // Should already be °C, but handle Kelvin just in case
                    if ($value > 100) {
                        $value = round($value - 273.15, 1);
                    } else {
                        $value = round($value, 1);
                    }
                } elseif ($varId === 'cloud') {
                    // GeoMet returns fraction 0-1 — convert to percentage
                    if ($value <= 1.0) {
                        $value = round($value * 100, 0);
                    } else {
                        $value = round($value, 0);
                    }
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
 * Build WMS 1.1.1 GetFeatureInfo URL.
 * Uses lon,lat BBOX order (WMS 1.1.1 standard for EPSG:4326).
 */
function buildWmsUrl($layer, $lat, $lon, $utcTime) {
    $delta = 0.015;
    $bbox = implode(',', [
        $lon - $delta,
        $lat - $delta,
        $lon + $delta,
        $lat + $delta,
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

    $context = stream_context_create([
        'http' => [
            'timeout' => REQUEST_TIMEOUT,
            'header'  => "Accept: application/json, text/plain\r\n",
        ],
    ]);
    return @file_get_contents($url, false, $context);
}

/**
 * Parse GeoMet WMS GetFeatureInfo response.
 * TT/NT layers return: features[0].properties.value
 * PN layer may return a different property key.
 * Falls back to first numeric property if 'value' key is missing.
 */
function parseGeoMetResponse($raw) {
    if (empty($raw)) return null;

    // Check for XML error responses
    if (strpos($raw, 'ServiceException') !== false) {
        return null;
    }

    $data = json_decode($raw, true);
    if ($data === null) {
        // Not JSON — try plain text
        if (preg_match('/[Vv]alue[:\s=]+([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)/', $raw, $m)) {
            return (float) $m[1];
        }
        return null;
    }

    // GeoJSON FeatureCollection
    if (isset($data['features'][0]['properties'])) {
        $props = $data['features'][0]['properties'];

        // Try 'value' key first (TT, NT layers)
        if (isset($props['value']) && is_numeric($props['value'])) {
            return (float) $props['value'];
        }

        // Fall back: find first numeric property (PN layer may use different key)
        foreach ($props as $key => $val) {
            if (is_numeric($val)) {
                return (float) $val;
            }
        }
    }

    return null;
}
