import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Heading,
  Text,
  HStack,
  IconButton,
  Spinner,
  Flex,
  useColorModeValue,
  useBreakpointValue,
} from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

function formatHour(val) {
  const h = Math.floor(val);
  if (h === 12) return '12 PM';
  if (h === 0 || h === 24) return '12 AM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function formatDateLabel(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]}`;
}

function CustomTooltip({ active, payload, label }) {
  const bg = useColorModeValue('white', 'gray.800');
  const border = useColorModeValue('gray.200', 'gray.600');

  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0];
  const h = Math.floor(label);
  const m = Math.round((label - h) * 60);
  const timeStr = `${h > 12 ? h - 12 : h || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;

  return (
    <Box bg={bg} border="1px" borderColor={border} borderRadius="md" p={3} shadow="lg">
      <Text fontWeight="bold" mb={1}>{timeStr}</Text>
      <HStack spacing={2}>
        <Box w={3} h={3} borderRadius="sm" bg={point.color} />
        <Text fontSize="sm">
          Tide: <strong>{point.value !== null ? `${point.value} m` : 'N/A'}</strong>
        </Text>
      </HStack>
    </Box>
  );
}

export default function TideChart({ selectedDate, onDateChange, dates: externalDates }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tideDates, setTideDates] = useState([]);

  const cardBg = useColorModeValue('white', 'gray.800');
  const isDark = useColorModeValue(false, true);
  const gridColor = useColorModeValue('#E2E8F0', '#2D3748');
  const textColor = useColorModeValue('#4A5568', '#A0AEC0');
  const dateLabelColor = useColorModeValue('gray.700', 'gray.200');
  const isMobile = useBreakpointValue({ base: true, md: false });
  const chartMargin = isMobile
    ? { top: 2, right: 4, left: -2, bottom: 2 }
    : { top: 5, right: 20, left: 10, bottom: 5 };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDoc(doc(db, 'cache', 'tide'));
      if (!snap.exists()) throw new Error('Tide cache not yet populated');
      const json = snap.data();
      if (json.error) throw new Error(json.error);
      setData(json.data);
      setTideDates(json.dates || []);
    } catch (err) {
      console.error('Failed to fetch tide data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Use the shared selectedDate from the parent, falling back to first tide date
  const dates = externalDates && externalDates.length > 0 ? externalDates : tideDates;
  const activeDate = selectedDate || dates[0];

  if (loading) {
    return (
      <Box bg={cardBg} borderRadius="xl" p={{ base: 4, md: 6 }} shadow="md" mb={6}>
        <Flex justify="center" align="center" minH="100px">
          <Spinner size="md" color="blue.400" thickness="3px" mr={3} />
          <Text color="gray.500">Loading tide data...</Text>
        </Flex>
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box bg={cardBg} borderRadius="xl" p={{ base: 4, md: 6 }} shadow="md" mb={6}>
        <Heading size="md" mb={2}>Tide Forecast (m)</Heading>
        <Text fontSize="sm" color="gray.500">Tide data is currently unavailable.</Text>
      </Box>
    );
  }

  // Filter data for selected date
  const chartData = data
    .filter((d) => d.date === activeDate)
    .map((d) => ({ hour: d.hour, value: d.value }));

  if (chartData.length === 0) {
    return (
      <Box bg={cardBg} borderRadius="xl" p={{ base: 4, md: 6 }} shadow="md" mb={6}>
        <Heading size="md" mb={2}>Tide Forecast (m)</Heading>
        <Text fontSize="sm" color="gray.500">No tide data available for {formatDateLabel(activeDate)}.</Text>
      </Box>
    );
  }

  // Y-axis domain
  const values = chartData.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const padding = (maxVal - minVal) * 0.1 || 0.5;
  const yDomain = [
    Math.floor((minVal - padding) * 10) / 10,
    Math.ceil((maxVal + padding) * 10) / 10,
  ];

  const tideColor = isDark ? '#63B3ED' : '#3182CE';

  const currentIdx = dates.indexOf(activeDate);
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < dates.length - 1;

  return (
    <Box bg={cardBg} borderRadius="xl" p={{ base: 4, md: 6 }} shadow="md" mb={6}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1} flexWrap="wrap" gap={2}>
        <Box>
          <Heading size="md" mb={1}>Tide Forecast (m)</Heading>
          <Text fontSize="sm" color="gray.500">Squamish Inner — Predicted water level</Text>
        </Box>
        {dates.length > 1 && (
          <HStack spacing={1}>
            <IconButton
              aria-label="Previous day"
              icon={<ChevronLeftIcon boxSize={5} />}
              size="sm"
              variant="ghost"
              isDisabled={!hasPrev}
              onClick={() => hasPrev && onDateChange(dates[currentIdx - 1])}
            />
            <Text fontSize="sm" fontWeight="semibold" color={dateLabelColor} minW="60px" textAlign="center">
              {formatDateLabel(activeDate)}
            </Text>
            <IconButton
              aria-label="Next day"
              icon={<ChevronRightIcon boxSize={5} />}
              size="sm"
              variant="ghost"
              isDisabled={!hasNext}
              onClick={() => hasNext && onDateChange(dates[currentIdx + 1])}
            />
          </HStack>
        )}
      </Box>

      <Box h={{ base: '250px', md: '300px' }} mt={3}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={chartMargin}>
            <defs>
              <linearGradient id="gradient-tide" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={tideColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={tideColor} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="hour"
              tickFormatter={formatHour}
              stroke={textColor}
              fontSize={12}
              tick={{ fill: textColor }}
              type="number"
              domain={[7, 21]}
              ticks={[7, 9, 11, 13, 15, 17, 19, 21]}
            />
            <YAxis
              domain={yDomain}
              stroke={textColor}
              fontSize={12}
              tick={{ fill: textColor }}
              tickFormatter={(val) => val.toFixed(1)}
              hide={isMobile}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              name="Tide"
              stroke={tideColor}
              strokeWidth={2}
              fill="url(#gradient-tide)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}
