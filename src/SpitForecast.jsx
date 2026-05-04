import React, { useState, useEffect } from 'react';
import {
  Box,
  Heading,
  Text,
  HStack,
  IconButton,
  Link,
  useColorModeValue,
  useBreakpointValue,
} from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

function formatHour(hour) {
  const h = Math.floor(hour);
  if (h === 0 || h === 24) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function formatDateLabel(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[m - 1]}`;
}

// Parse "2026-05-04T08:05:04-07:00" → { date, hourFrac } in local (PT) terms.
function parseLocalIso(iso) {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return {
    date: `${m[1]}-${m[2]}-${m[3]}`,
    hourFrac: parseInt(m[4], 10) + parseInt(m[5], 10) / 60,
  };
}

function CustomTooltip({ active, payload, label }) {
  const bg = useColorModeValue('white', 'gray.800');
  const border = useColorModeValue('gray.200', 'gray.600');
  if (!active || !payload || payload.length === 0) return null;
  const seen = new Set();
  return (
    <Box bg={bg} border="1px" borderColor={border} borderRadius="md" p={3} shadow="lg">
      <Text fontWeight="bold" mb={1}>{formatHour(label)}</Text>
      {payload.map((entry) => {
        if (entry.value == null || seen.has(entry.name)) return null;
        seen.add(entry.name);
        return (
          <HStack key={entry.dataKey} spacing={2}>
            <Box w={3} h={3} borderRadius="sm" bg={entry.color} />
            <Text fontSize="sm">
              {entry.name}: <strong>{Math.round(entry.value)} km/h</strong>
            </Text>
          </HStack>
        );
      })}
    </Box>
  );
}

export default function SpitForecast({ dates, selectedDate, onDateChange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const cardBg = useColorModeValue('white', 'gray.800');
  const gridColor = useColorModeValue('#E2E8F0', '#2D3748');
  const textColor = useColorModeValue('#4A5568', '#A0AEC0');
  const lineColor = useColorModeValue('#2B6CB0', '#63B3ED');
  const bandColor = useColorModeValue('#90CDF4', '#2C5282');
  const isMobile = useBreakpointValue({ base: true, md: false });
  const chartMargin = isMobile
    ? { top: 5, right: 4, left: -2, bottom: 2 }
    : { top: 10, right: 20, left: 10, bottom: 5 };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'cache', 'spit'));
        if (cancelled) return;
        if (!snap.exists()) {
          setError('Spit forecast cache not yet populated');
          return;
        }
        setData(snap.data());
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error || !data) return null;

  const tCut = data.t_cut_local_hour;
  const obs = Array.isArray(data.obs_recent) ? data.obs_recent : [];
  const fcst = Array.isArray(data.forecast_hours) ? data.forecast_hours : [];

  // Build chart rows. Past obs are at ~5-min resolution; forecast is hourly.
  // Combine into a single series keyed by fractional hour in PT for the selected date.
  const rows = [];

  for (const o of obs) {
    const p = parseLocalIso(o.time);
    if (!p || p.date !== selectedDate) continue;
    rows.push({
      x: p.hourFrac,
      avg_obs: o.avg ?? null,
      gust_obs: o.gust ?? null,
      lull_obs: o.lull ?? null,
    });
  }
  for (const f of fcst) {
    const p = parseLocalIso(f.local_iso);
    if (!p || p.date !== selectedDate) continue;
    rows.push({
      x: p.hourFrac,
      avg_fcst: f.avg_p50 ?? null,
      ci: [f.avg_ci68_lo ?? null, f.avg_ci68_hi ?? null],
    });
  }
  rows.sort((a, b) => a.x - b.x);

  if (rows.length === 0) return null;

  const showCutLine = rows.some((r) => r.x >= tCut) && rows.some((r) => r.x < tCut);

  return (
    <Box bg={cardBg} borderRadius="xl" p={{ base: 4, md: 6 }} shadow="md" mb={6}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3} flexWrap="wrap" gap={2}>
        <Box>
          <Heading size="md" mb={1}>Squamish Spit · Live + Forecast (km/h)</Heading>
        </Box>
        {dates && dates.length > 1 && (
          <HStack spacing={1}>
            <IconButton
              aria-label="Previous day"
              icon={<ChevronLeftIcon boxSize={5} />}
              size="sm"
              variant="ghost"
              isDisabled={dates.indexOf(selectedDate) <= 0}
              onClick={() => {
                const i = dates.indexOf(selectedDate);
                if (i > 0) onDateChange(dates[i - 1]);
              }}
            />
            <Text fontSize="sm" fontWeight="semibold" minW="60px" textAlign="center">
              {formatDateLabel(selectedDate)}
            </Text>
            <IconButton
              aria-label="Next day"
              icon={<ChevronRightIcon boxSize={5} />}
              size="sm"
              variant="ghost"
              isDisabled={dates.indexOf(selectedDate) >= dates.length - 1}
              onClick={() => {
                const i = dates.indexOf(selectedDate);
                if (i < dates.length - 1) onDateChange(dates[i + 1]);
              }}
            />
          </HStack>
        )}
      </Box>

      <Box h={{ base: '260px', md: '320px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={chartMargin}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="x"
              type="number"
              domain={[0, 24]}
              ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]}
              tickFormatter={formatHour}
              stroke={textColor}
              fontSize={12}
              tick={{ fill: textColor }}
            />
            <YAxis
              stroke={textColor}
              fontSize={12}
              tick={{ fill: textColor }}
              hide={isMobile}
              label={isMobile ? null : { value: 'km/h', angle: -90, position: 'insideLeft', fill: textColor, fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip />} />
            {showCutLine && (
              <ReferenceLine
                x={tCut}
                stroke={textColor}
                strokeDasharray="3 3"
                label={{ value: 'Forecast →', fill: textColor, fontSize: 11, position: 'insideBottomLeft' }}
              />
            )}
            <Area
              type="monotone"
              dataKey="ci"
              name="Forecast 68%"
              stroke="none"
              fill={bandColor}
              fillOpacity={0.35}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="lull_obs"
              name="Lull"
              stroke={lineColor}
              strokeWidth={1}
              strokeDasharray="2 3"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="gust_obs"
              name="Gust"
              stroke={lineColor}
              strokeWidth={1}
              strokeDasharray="5 3"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="avg_obs"
              name="Avg (obs)"
              stroke={lineColor}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="avg_fcst"
              name="Avg (forecast)"
              stroke={lineColor}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Box>

      <Text fontSize="xs" color="gray.500" mt={3}>
        Source:{' '}
        <Link href="https://www.paraglidingwx.com/spit-forecast-about.html" isExternal color="blue.400">
          paraglidingwx.com
        </Link>
        {' '}— SpitBiGRU ML model.
      </Text>
    </Box>
  );
}
