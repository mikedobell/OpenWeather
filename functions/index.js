const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const { XMLParser } = require("fast-xml-parser");
const fs = require("fs");
const path = require("path");

admin.initializeApp();
const db = admin.firestore();

// ============================================================
// Configuration
// ============================================================

const GEOMET_URL = "https://geo.weather.gc.ca/geomet";
const MARINE_RSS_URL = "https://weather.gc.ca/rss/marine/06400_e.xml";
const FORECAST_DAYS = 2;
const REQUEST_TIMEOUT = 15000;

const LOCATIONS = {
  pamrocks: { name: "Pam Rocks", lat: 49.4883, lon: -123.2983 },
  squamish: { name: "Squamish", lat: 49.7016, lon: -123.1558 },
  whistler: { name: "Whistler", lat: 50.1163, lon: -122.9574 },
  lillooet: { name: "Lillooet", lat: 50.6868, lon: -121.9422 },
};

const VARIABLES = {
  pressure: "HRDPS.CONTINENTAL_PN",
  temperature: "HRDPS.CONTINENTAL_TT",
  cloud: "HRDPS.CONTINENTAL_NT",
};

// ============================================================
// Helper: HTTP fetch with timeout
// ============================================================

async function httpGet(url, accept = "application/json") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: accept, "User-Agent": "S2SForecast/1.0" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// HRDPS Forecast Logic
// ============================================================

function detectLatestModelRun() {
  const utcHour = new Date().getUTCHours();
  if (utcHour >= 23) return "18";
  if (utcHour >= 17) return "12";
  if (utcHour >= 11) return "06";
  if (utcHour >= 5) return "00";
  return "18";
}

function getDaytimeUTCHours() {
  const now = new Date();
  // Get PT offset: check if DST by creating a date string in PT
  const ptStr = now.toLocaleString("en-US", { timeZone: "America/Vancouver" });
  const ptDate = new Date(ptStr);
  const utcDate = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetHours = Math.round((utcDate - ptDate) / 3600000);

  const hours = [];
  for (let day = 0; day < FORECAST_DAYS; day++) {
    const d = new Date(now);
    d.setDate(d.getDate() + day);
    // Format PT date
    const ptDateStr = new Date(
      d.toLocaleString("en-US", { timeZone: "America/Vancouver" })
    );
    const yyyy = ptDateStr.getFullYear();
    const mm = String(ptDateStr.getMonth() + 1).padStart(2, "0");
    const dd = String(ptDateStr.getDate()).padStart(2, "0");
    const ptDateIso = `${yyyy}-${mm}-${dd}`;

    for (let ptHour = 7; ptHour <= 21; ptHour++) {
      let utcHour = ptHour + offsetHours;
      let utcDateStr = ptDateIso;
      if (utcHour >= 24) {
        utcHour -= 24;
        const nextDay = new Date(yyyy, ptDateStr.getMonth(), parseInt(dd) + 1);
        utcDateStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, "0")}-${String(nextDay.getDate()).padStart(2, "0")}`;
      }
      hours.push({
        utc: `${utcDateStr}T${String(utcHour).padStart(2, "0")}:00:00Z`,
        pt_hour: ptHour,
        date: ptDateIso,
      });
    }
  }
  return hours;
}

function buildWmsUrl(layer, lat, lon, utcTime) {
  const delta = 0.015;
  const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetFeatureInfo",
    LAYERS: layer,
    QUERY_LAYERS: layer,
    INFO_FORMAT: "application/json",
    SRS: "EPSG:4326",
    BBOX: bbox,
    WIDTH: "3",
    HEIGHT: "3",
    X: "1",
    Y: "1",
    TIME: utcTime,
  });
  return `${GEOMET_URL}?${params.toString()}`;
}

function parseGeoMetResponse(raw) {
  if (!raw || raw.includes("ServiceException")) return null;
  try {
    const data = JSON.parse(raw);
    const props = data?.features?.[0]?.properties;
    if (!props) return null;
    if (props.value != null && !isNaN(props.value)) return parseFloat(props.value);
    if (props.pixel != null && !isNaN(props.pixel)) return parseFloat(props.pixel);
    return null;
  } catch {
    const match = raw.match(/[Vv]alue[:\s=]+([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)/);
    return match ? parseFloat(match[1]) : null;
  }
}

function convertValue(varId, value) {
  if (value === null) return null;
  if (varId === "pressure") {
    return value > 10000 ? Math.round((value / 100) * 10) / 10 : Math.round(value * 10) / 10;
  } else if (varId === "temperature") {
    return value > 100 ? Math.round((value - 273.15) * 10) / 10 : Math.round(value * 10) / 10;
  } else if (varId === "cloud") {
    return value <= 1.0 ? Math.round(value * 100) : Math.round(value);
  }
  return value;
}

async function fetchAllForecastData() {
  const modelRun = detectLatestModelRun();
  const forecastHours = getDaytimeUTCHours();
  const dates = [...new Set(forecastHours.map((fh) => fh.date))];

  const forecast = {};
  let fetchErrors = 0;
  let fetchTotal = 0;

  // Build all fetch promises upfront for parallel execution
  const tasks = [];
  for (const [locId, loc] of Object.entries(LOCATIONS)) {
    forecast[locId] = { pressure: [], temperature: [], cloud: [] };
    for (const [varId, layerName] of Object.entries(VARIABLES)) {
      for (const fh of forecastHours) {
        tasks.push({ locId, varId, fh, url: buildWmsUrl(layerName, loc.lat, loc.lon, fh.utc) });
      }
    }
  }

  fetchTotal = tasks.length;

  // Fetch in batches of 20 to avoid overwhelming GeoMet
  const BATCH_SIZE = 20;
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (task) => {
        const raw = await httpGet(task.url);
        let value = parseGeoMetResponse(raw);
        value = convertValue(task.varId, value);
        return { ...task, value };
      })
    );
    for (const r of results) {
      if (r.value === null) fetchErrors++;
      forecast[r.locId][r.varId].push({
        hour: r.fh.pt_hour,
        value: r.value,
        date: r.fh.date,
      });
    }
  }

  return {
    forecast,
    dates,
    model_run: modelRun,
    generated_at: new Date().toISOString(),
    locations: LOCATIONS,
    fetch_stats: { total: fetchTotal, errors: fetchErrors },
  };
}

// ============================================================
// Marine Forecast Logic
// ============================================================

function cleanHtml(html) {
  let text = html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>\s*<p[^>]*>/gi, "\n\n");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/[^\S\n]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text
    .split("\n")
    .map((l) => l.trim())
    .join("\n");
  text = text.replace(/\bStay connected\b.*/si, "");
  return text.trim();
}

async function fetchMarineForecast() {
  const raw = await httpGet(MARINE_RSS_URL, "application/xml, text/xml, */*");
  if (!raw) return { error: "Failed to fetch marine forecast feed" };

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  let feed;
  try {
    feed = parser.parse(raw);
  } catch {
    return { error: "Failed to parse XML feed" };
  }

  // Navigate Atom structure
  const atomFeed = feed?.feed;
  if (!atomFeed) return { error: "Invalid feed structure" };

  const entries = Array.isArray(atomFeed.entry) ? atomFeed.entry : atomFeed.entry ? [atomFeed.entry] : [];

  const sections = {};
  const allEntryTitles = [];

  for (const entry of entries) {
    const title = (entry.title || "").toLowerCase();
    const summary = entry.summary?.["#text"] || entry.summary || "";
    const updated = entry.updated || "";

    allEntryTitles.push(entry.title || "");

    let sectionKey = null;
    if (title.includes("warning") || title.includes("watch")) {
      sectionKey = "warnings";
    } else if (title.includes("extended")) {
      sectionKey = "extended";
    } else if (title.includes("wind")) {
      sectionKey = "winds";
    } else if (title.includes("weather") || title.includes("visibility")) {
      sectionKey = "weather";
    } else if (title.includes("forecast") || title.includes("synopsis")) {
      sectionKey = "forecast";
    }

    if (sectionKey) {
      sections[sectionKey] = {
        title: entry.title || "",
        updated,
        content: cleanHtml(typeof summary === "string" ? summary : ""),
      };
    }
  }

  return {
    title: atomFeed.title || "",
    updated: atomFeed.updated || "",
    sections,
    entry_titles: allEntryTitles,
    generated_at: new Date().toISOString(),
  };
}

// ============================================================
// Tide Logic
// ============================================================

function parseTideData(days = 2) {
  const csvPath = path.join(__dirname, "07811_data.csv");
  if (!fs.existsSync(csvPath)) {
    return { error: "Tide data file not found" };
  }

  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.split("\n");

  // Get current PT dates
  const now = new Date();
  const targetDates = [];
  for (let d = 0; d < days; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    const ptStr = date.toLocaleString("en-CA", {
      timeZone: "America/Vancouver",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    // en-CA gives YYYY-MM-DD, convert to YYYY/MM/DD for CSV matching
    targetDates.push(ptStr.replace(/-/g, "/"));
  }

  const tideData = [];
  const matchedDates = [];
  const HEADER_ROWS = 7;

  for (let i = HEADER_ROWS; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const commaIdx = line.indexOf(",");
    if (commaIdx === -1) continue;

    const datetime = line.substring(0, commaIdx).trim();
    const value = line.substring(commaIdx + 1).trim();

    const rowDate = datetime.substring(0, 10);
    if (!targetDates.includes(rowDate)) continue;

    const hour = parseInt(datetime.substring(11, 13), 10);
    const minute = parseInt(datetime.substring(14, 16), 10);

    if (hour < 7 || hour > 21) continue;
    if (hour === 21 && minute > 0) continue;

    const isoDate = rowDate.replace(/\//g, "-");
    if (!matchedDates.includes(isoDate)) matchedDates.push(isoDate);

    tideData.push({
      time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      hour: hour + minute / 60,
      value: Math.round(parseFloat(value) * 100) / 100,
      date: isoDate,
    });
  }

  return {
    station: "Squamish Inner (07811)",
    unit: "m",
    dates: matchedDates,
    data: tideData,
    generated_at: new Date().toISOString(),
  };
}

// ============================================================
// Helper: read/write Firestore cache (tolerates missing DB)
// ============================================================

async function readCache(key) {
  try {
    const doc = await db.collection("cache").doc(key).get();
    return doc.exists ? doc.data() : null;
  } catch (err) {
    console.warn(`Firestore read failed for "${key}":`, err.message);
    return null;
  }
}

async function writeCache(key, data) {
  try {
    await db.collection("cache").doc(key).set(data);
  } catch (err) {
    console.warn(`Firestore write failed for "${key}":`, err.message);
  }
}

// ============================================================
// Cloud Functions: HTTP Endpoints
// ============================================================

// Forecast endpoint — serves cached data, falls back to live GeoMet fetch
exports.forecast = functions
  .runWith({ timeoutSeconds: 300, memory: "512MB" })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", "public, max-age=1800");

    try {
      // Try Firestore cache first (non-fatal if unavailable)
      const cached = await readCache("forecast");
      if (cached) {
        return res.json(cached);
      }

      // Cache miss or Firestore unavailable — fetch live from GeoMet
      const data = await fetchAllForecastData();
      await writeCache("forecast", data);
      return res.json(data);
    } catch (err) {
      console.error("Forecast error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

// Marine forecast endpoint — serves cached data, falls back to live fetch
exports.marine = functions
  .runWith({ timeoutSeconds: 120, memory: "256MB" })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", "public, max-age=1800");

    try {
      const cached = await readCache("marine");
      if (cached) {
        return res.json(cached);
      }

      const data = await fetchMarineForecast();
      await writeCache("marine", data);
      return res.json(data);
    } catch (err) {
      console.error("Marine error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

// Tide endpoint — reads local CSV (bundled with function)
exports.tide = functions
  .runWith({ timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", "public, max-age=3600");

  try {
    const days = Math.max(1, Math.min(7, parseInt(req.query.days) || 2));
    const data = parseTideData(days);
    return res.json(data);
  } catch (err) {
    console.error("Tide error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Cloud Functions: Scheduled Pre-fetch
// ============================================================

// Runs every 6 hours (PT) to pre-fetch HRDPS data
exports.scheduledForecastFetch = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .pubsub.schedule("0 4,10,16,22 * * *") // 4am, 10am, 4pm, 10pm PT
  .timeZone("America/Vancouver")
  .onRun(async () => {
    console.log("Scheduled forecast fetch starting...");
    try {
      const data = await fetchAllForecastData();
      await writeCache("forecast", data);
      console.log(`Forecast fetched: ${data.fetch_stats.total} requests, ${data.fetch_stats.errors} errors`);
    } catch (err) {
      console.error("Scheduled forecast fetch failed:", err);
    }
    return null;
  });

// Runs every 3 hours to update marine forecast
exports.scheduledMarineFetch = functions
  .runWith({ timeoutSeconds: 120 })
  .pubsub.schedule("30 */3 * * *") // every 3 hours at :30
  .timeZone("America/Vancouver")
  .onRun(async () => {
    console.log("Scheduled marine forecast fetch starting...");
    try {
      const data = await fetchMarineForecast();
      await writeCache("marine", data);
      console.log("Marine forecast updated");
    } catch (err) {
      console.error("Scheduled marine fetch failed:", err);
    }
    return null;
  });
