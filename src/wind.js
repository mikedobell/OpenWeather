export const KMH_TO_KT = 0.539957;

export const toKt = (v) => (v == null ? null : v * KMH_TO_KT);

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function degToCardinal(deg) {
  if (deg == null || isNaN(deg)) return '';
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return CARDINALS[idx];
}

export function getCurrentPtHourFraction() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date()).reduce((a, p) => (a[p.type] = p.value, a), {});
  return parseInt(parts.hour, 10) + parseInt(parts.minute, 10) / 60;
}

export function getCurrentPtDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).reduce((a, p) => (a[p.type] = p.value, a), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Read cache/tide and find the prediction closest to "now" PT.
export function currentTideMeters(tideDoc) {
  if (!tideDoc?.data) return null;
  const today = getCurrentPtDate();
  const nowH = getCurrentPtHourFraction();
  const todays = tideDoc.data.filter((d) => d.date === today);
  if (todays.length === 0) return null;
  let best = null;
  let bestDist = Infinity;
  for (const p of todays) {
    const d = Math.abs(p.hour - nowH);
    if (d < bestDist) { best = p; bestDist = d; }
  }
  return best ? best.value : null;
}
