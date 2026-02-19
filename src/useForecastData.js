import { useState, useEffect, useCallback } from 'react';
import { API_ENDPOINT } from './constants';

export default function useForecastData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [modelRun, setModelRun] = useState(null);
  const [dates, setDates] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_ENDPOINT);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const json = await response.json();

      if (json.error) {
        throw new Error(json.error);
      }

      setData(json.forecast);
      setDates(json.dates || []);
      setLastUpdated(json.generated_at || new Date().toISOString());
      setModelRun(json.model_run || null);
    } catch (err) {
      console.error('Failed to fetch forecast data:', err);
      setError(err.message);
      // Fall back to demo data if API unavailable
      const demo = generateDemoData();
      setData(demo.forecast);
      setDates(demo.dates);
      setLastUpdated(new Date().toISOString());
      setModelRun('demo');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, lastUpdated, modelRun, dates, refetch: fetchData };
}

/**
 * Generate realistic demo data for development/fallback.
 * Simulates a typical summer afternoon pattern in Howe Sound across 2 days:
 * - Inland temperatures rise through the day, coast stays moderate
 * - Pressure gradient builds (higher inland in morning, reverses in afternoon)
 * - Cloud cover increases inland through the day
 */
function generateDemoData() {
  const hours = [];
  for (let h = 7; h <= 21; h++) {
    hours.push(h);
  }

  // Generate 2 days of dates in PT
  const now = new Date();
  const dates = [];
  for (let d = 0; d < 2; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() + d);
    // Format as YYYY-MM-DD in local time (approximation for demo)
    const yyyy = day.getFullYear();
    const mm = String(day.getMonth() + 1).padStart(2, '0');
    const dd = String(day.getDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
  }

  const forecast = {};

  // Pressure base values (hPa) - slight coastal/inland gradient
  const pressureBase = { pamrocks: 1015.2, squamish: 1014.8, whistler: 1014.0, lillooet: 1013.5 };
  // Temperature patterns (°C)
  const tempMorning = { pamrocks: 12, squamish: 10, whistler: 8, lillooet: 14 };
  const tempPeak = { pamrocks: 18, squamish: 24, whistler: 22, lillooet: 34 };
  // Cloud cover (%)
  const cloudBase = { pamrocks: 30, squamish: 20, whistler: 15, lillooet: 5 };

  for (const locId of ['pamrocks', 'squamish', 'whistler', 'lillooet']) {
    forecast[locId] = {
      pressure: [],
      temperature: [],
      cloud: [],
    };

    for (const date of dates) {
      for (const h of hours) {
        const t = (h - 7) / 14; // 0 to 1 across the day
        const peakT = Math.sin(t * Math.PI); // peaks at midday

        // Pressure: slight diurnal variation, inland drops more in afternoon
        const pBase = pressureBase[locId];
        const pDiurnal = locId === 'lillooet' ? -2.5 * peakT : locId === 'whistler' ? -1.5 * peakT : -0.5 * peakT;
        const pressure = Math.round((pBase + pDiurnal + (Math.random() - 0.5) * 0.3) * 10) / 10;

        // Temperature: rises to peak in early afternoon, drops in evening
        const tMorn = tempMorning[locId];
        const tPeak = tempPeak[locId];
        const tempCurve = Math.sin(Math.max(0, t - 0.05) * Math.PI * 0.85);
        const temperature = Math.round((tMorn + (tPeak - tMorn) * tempCurve + (Math.random() - 0.5) * 0.5) * 10) / 10;

        // Cloud: builds through afternoon, especially inland
        const cBase = cloudBase[locId];
        const cloudBuild = locId === 'lillooet' ? 25 * Math.max(0, t - 0.3) : locId === 'whistler' ? 35 * Math.max(0, t - 0.2) : 15 * Math.max(0, t - 0.4);
        const cloud = Math.min(100, Math.max(0, Math.round(cBase + cloudBuild + (Math.random() - 0.5) * 5)));

        forecast[locId].pressure.push({ hour: h, value: pressure, date });
        forecast[locId].temperature.push({ hour: h, value: temperature, date });
        forecast[locId].cloud.push({ hour: h, value: cloud, date });
      }
    }
  }

  return { forecast, dates };
}
