<?php
/**
 * Environment Canada Marine Forecast Proxy
 *
 * Fetches and parses the Atom RSS feed for Howe Sound (area 06400)
 * from weather.gc.ca and returns structured JSON.
 *
 * Endpoint: GET /api/marine.php
 *   ?debug=1  — show raw feed parsing details
 * Returns: JSON with winds, weather/visibility, and extended forecast sections
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: public, max-age=1800');

// --- Configuration ---

define('CACHE_DIR', __DIR__ . '/cache');
define('MARINE_CACHE_TTL', 3600); // 1 hour
define('MARINE_RSS_URL', 'https://weather.gc.ca/rss/marine/06400_e.xml');
define('REQUEST_TIMEOUT', 15);

// --- Main ---

if (!is_dir(CACHE_DIR)) {
    @mkdir(CACHE_DIR, 0755, true);
}

$cacheFile = CACHE_DIR . '/marine_latest.json';
if (!isset($_GET['debug']) && file_exists($cacheFile)) {
    $cacheAge = time() - filemtime($cacheFile);
    if ($cacheAge < MARINE_CACHE_TTL) {
        readfile($cacheFile);
        exit;
    }
}

// Fetch the RSS feed
$raw = httpGet(MARINE_RSS_URL);

if ($raw === false) {
    // If fetch fails, try to serve stale cache
    if (file_exists($cacheFile)) {
        readfile($cacheFile);
        exit;
    }
    echo json_encode(['error' => 'Failed to fetch marine forecast feed']);
    exit;
}

// Parse the Atom XML
$result = parseMarineFeed($raw);

if (isset($_GET['debug'])) {
    $result['debug'] = [
        'feed_length' => strlen($raw),
        'feed_snippet' => substr($raw, 0, 2000),
    ];
    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

$json = json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
@file_put_contents($cacheFile, $json);

echo $json;
exit;

// --- Helper Functions ---

function httpGet($url) {
    if (function_exists('curl_init')) {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => REQUEST_TIMEOUT,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HTTPHEADER     => ['Accept: application/xml, text/xml, */*'],
            CURLOPT_USERAGENT      => 'HoweSoundForecast/1.0',
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
            'header'  => "Accept: application/xml, text/xml, */*\r\nUser-Agent: HoweSoundForecast/1.0\r\n",
        ],
    ]);
    return @file_get_contents($url, false, $context);
}

/**
 * Parse the Atom feed XML and extract marine forecast sections.
 */
function parseMarineFeed($xml) {
    // Suppress XML warnings
    $prev = libxml_use_internal_errors(true);

    $feed = simplexml_load_string($xml);
    if ($feed === false) {
        libxml_use_internal_errors($prev);
        return ['error' => 'Failed to parse XML feed'];
    }

    // Register Atom namespace
    $feed->registerXPathNamespace('atom', 'http://www.w3.org/2005/Atom');

    $sections = [];
    $feedTitle = '';
    $feedUpdated = '';

    // Get feed-level info
    if (isset($feed->title)) {
        $feedTitle = (string) $feed->title;
    }
    if (isset($feed->updated)) {
        $feedUpdated = (string) $feed->updated;
    }

    // Process each entry
    foreach ($feed->entry as $entry) {
        $title = strtolower((string) $entry->title);
        $summary = (string) $entry->summary;
        $updated = (string) $entry->updated;

        // Determine which section this entry belongs to
        $sectionKey = null;
        if (strpos($title, 'wind') !== false && strpos($title, 'warning') === false) {
            $sectionKey = 'winds';
        } elseif (strpos($title, 'weather') !== false || strpos($title, 'visibility') !== false) {
            $sectionKey = 'weather';
        } elseif (strpos($title, 'extended') !== false) {
            $sectionKey = 'extended';
        } elseif (strpos($title, 'warning') !== false || strpos($title, 'watch') !== false) {
            $sectionKey = 'warnings';
        }

        if ($sectionKey !== null) {
            $sections[$sectionKey] = [
                'title' => (string) $entry->title,
                'updated' => $updated,
                'content' => cleanHtml($summary),
            ];
        }
    }

    libxml_use_internal_errors($prev);

    return [
        'title' => $feedTitle,
        'updated' => $feedUpdated,
        'sections' => $sections,
        'generated_at' => gmdate('c'),
    ];
}

/**
 * Convert HTML summary content to structured text.
 * Preserves paragraph breaks, strips tags, cleans up whitespace.
 */
function cleanHtml($html) {
    // Decode HTML entities
    $text = html_entity_decode($html, ENT_QUOTES | ENT_HTML5, 'UTF-8');

    // Replace <br>, <br/>, <br /> with newlines
    $text = preg_replace('/<br\s*\/?>/i', "\n", $text);

    // Replace </p><p> boundaries with double newline
    $text = preg_replace('/<\/p>\s*<p[^>]*>/i', "\n\n", $text);

    // Strip remaining HTML tags
    $text = strip_tags($text);

    // Normalize whitespace: collapse multiple spaces (not newlines) to single space
    $text = preg_replace('/[^\S\n]+/', ' ', $text);

    // Collapse 3+ newlines to 2
    $text = preg_replace('/\n{3,}/', "\n\n", $text);

    // Trim each line
    $lines = array_map('trim', explode("\n", $text));
    $text = implode("\n", $lines);

    // Remove "Stay connected" footer and anything after
    $text = preg_replace('/\bStay connected\b.*/si', '', $text);

    return trim($text);
}
