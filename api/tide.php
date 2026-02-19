<?php
/**
 * Tide Prediction Data Endpoint
 *
 * Reads CHS tide prediction CSV for Squamish Inner (07811) and returns
 * daytime data (7:00–21:00 PT) for today + tomorrow as JSON.
 *
 * Endpoint: GET /api/tide.php
 *   ?days=2      — number of days (default 2)
 *   ?debug=1     — show parsing details
 * Returns: JSON with tide data points and date list
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: public, max-age=3600');

define('CSV_FILE', __DIR__ . '/../07811_data.csv');
define('HEADER_ROWS', 7); // rows before actual data starts
define('FORECAST_DAYS', 2);

// --- Main ---

$vancouver = new DateTimeZone('America/Vancouver');
$now = new DateTime('now', $vancouver);

$days = isset($_GET['days']) ? max(1, min(7, (int)$_GET['days'])) : FORECAST_DAYS;

// Build list of dates we need
$dates = [];
for ($d = 0; $d < $days; $d++) {
    $dateObj = (clone $now)->modify("+{$d} day");
    $dates[] = $dateObj->format('Y/m/d');
}

if (!file_exists(CSV_FILE)) {
    echo json_encode(['error' => 'Tide data file not found']);
    exit;
}

$handle = fopen(CSV_FILE, 'r');
if (!$handle) {
    echo json_encode(['error' => 'Could not open tide data file']);
    exit;
}

// Skip header rows
for ($i = 0; $i < HEADER_ROWS; $i++) {
    fgets($handle);
}

$tideData = [];
$matchedDates = [];

while (($line = fgets($handle)) !== false) {
    $line = trim($line);
    if (empty($line)) continue;

    $parts = str_getcsv($line);
    if (count($parts) < 2) continue;

    $datetime = trim($parts[0]);
    $value = trim($parts[1]);

    // Check if this row's date matches any of our target dates
    $rowDate = substr($datetime, 0, 10); // "YYYY/MM/DD"
    if (!in_array($rowDate, $dates)) continue;

    // Parse time
    $timePart = substr($datetime, 11, 5); // "HH:MM"
    $hour = (int)substr($timePart, 0, 2);
    $minute = (int)substr($timePart, 3, 2);

    // Filter to daytime hours 7:00–21:00
    if ($hour < 7 || $hour > 21) continue;
    if ($hour === 21 && $minute > 0) continue;

    // Format date as YYYY-MM-DD for consistency with forecast data
    $isoDate = str_replace('/', '-', $rowDate);

    if (!in_array($isoDate, $matchedDates)) {
        $matchedDates[] = $isoDate;
    }

    $tideData[] = [
        'time' => sprintf('%02d:%02d', $hour, $minute),
        'hour' => $hour + ($minute / 60),
        'value' => round((float)$value, 2),
        'date' => $isoDate,
    ];
}

fclose($handle);

$response = [
    'station' => 'Squamish Inner (07811)',
    'unit' => 'm',
    'dates' => $matchedDates,
    'data' => $tideData,
    'generated_at' => gmdate('c'),
];

if (isset($_GET['debug'])) {
    $response['debug'] = [
        'csv_file' => CSV_FILE,
        'file_exists' => file_exists(CSV_FILE),
        'requested_dates' => $dates,
        'total_points' => count($tideData),
    ];
}

echo json_encode($response, JSON_PRETTY_PRINT);
