import React, { useState } from 'react';
import {
  Box,
  Heading,
  Text,
  HStack,
  Tag,
  TagLabel,
  IconButton,
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
import { LOCATIONS } from './constants';

function formatHour(hour) {
  if (hour === 12) return '12 PM';
  if (hour === 0 || hour === 24) return '12 AM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

/**
 * Format a YYYY-MM-DD date string as "11 Feb" style.
 */
function formatDateLabel(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]}`;
}

function CustomTooltip({ active, payload, label, unit }) {
  const bg = useColorModeValue('white', 'gray.800');
  const border = useColorModeValue('gray.200', 'gray.600');

  if (!active || !payload || payload.length === 0) return null;

  return (
    <Box bg={bg} border="1px" borderColor={border} borderRadius="md" p={3} shadow="lg">
      <Text fontWeight="bold" mb={1}>{formatHour(label)}</Text>
      {payload.map((entry) => (
        <HStack key={entry.dataKey} spacing={2}>
          <Box w={3} h={3} borderRadius="sm" bg={entry.color} />
          <Text fontSize="sm">
            {entry.name}: <strong>{entry.value !== null ? `${entry.value} ${unit}` : 'N/A'}</strong>
          </Text>
        </HStack>
      ))}
    </Box>
  );
}

function DateNav({ dates, selectedDate, onDateChange }) {
  const currentIdx = dates.indexOf(selectedDate);
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < dates.length - 1;
  const dateLabelColor = useColorModeValue('gray.700', 'gray.200');

  return (
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
        {formatDateLabel(selectedDate)}
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
  );
}

export default function ForecastChart({ variable, data, dates, selectedDate, onDateChange }) {
  const [hiddenSeries, setHiddenSeries] = useState(new Set());
  const isDark = useColorModeValue(false, true);
  const cardBg = useColorModeValue('white', 'gray.800');
  const gridColor = useColorModeValue('#E2E8F0', '#2D3748');
  const textColor = useColorModeValue('#4A5568', '#A0AEC0');
  const isMobile = useBreakpointValue({ base: true, md: false });
  const chartMargin = isMobile
    ? { top: 2, right: 4, left: -2, bottom: 2 }
    : { top: 5, right: 20, left: 10, bottom: 5 };

  if (!data) return null;

  // Filter data by selected date
  const chartData = [];
  const firstLoc = LOCATIONS[0].id;
  const allPoints = data[firstLoc]?.[variable.id] || [];
  const filteredPoints = selectedDate
    ? allPoints.filter((d) => d.date === selectedDate)
    : allPoints.filter((d) => !d.date); // fallback for old data without date field

  // If no points match (old API without date field), show all points
  const pointsToUse = filteredPoints.length > 0 ? filteredPoints : allPoints;

  for (const point of pointsToUse) {
    const row = { hour: point.hour };
    for (const loc of LOCATIONS) {
      const locData = data[loc.id]?.[variable.id] || [];
      const match = selectedDate
        ? locData.find((d) => d.hour === point.hour && d.date === selectedDate)
        : locData.find((d) => d.hour === point.hour);
      row[loc.id] = match ? match.value : null;
    }
    chartData.push(row);
  }

  const toggleSeries = (locId) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(locId)) {
        next.delete(locId);
      } else {
        // Don't allow hiding all series
        if (next.size < LOCATIONS.length - 1) {
          next.add(locId);
        }
      }
      return next;
    });
  };

  // Calculate Y-axis domain with padding
  let allValues = [];
  for (const loc of LOCATIONS) {
    if (hiddenSeries.has(loc.id)) continue;
    const locData = data[loc.id]?.[variable.id] || [];
    const filtered = selectedDate
      ? locData.filter((d) => d.date === selectedDate)
      : locData;
    const points = filtered.length > 0 ? filtered : locData;
    allValues = allValues.concat(points.map((d) => d.value).filter((v) => v !== null));
  }
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const padding = (maxVal - minVal) * 0.1 || 1;
  const yDomain = [
    Math.floor((minVal - padding) * 10) / 10,
    Math.ceil((maxVal + padding) * 10) / 10,
  ];

  return (
    <Box bg={cardBg} borderRadius="xl" p={{ base: 4, md: 6 }} shadow="md" mb={6}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1} flexWrap="wrap" gap={2}>
        <Box>
          <Heading size="md" mb={1}>{variable.label} ({variable.unit})</Heading>
          <Text fontSize="sm" color="gray.500">{variable.description}</Text>
        </Box>
        {dates && dates.length > 1 && (
          <DateNav dates={dates} selectedDate={selectedDate} onDateChange={onDateChange} />
        )}
      </Box>

      {/* Legend as clickable tags */}
      <HStack spacing={2} mb={4} mt={3} flexWrap="wrap">
        {LOCATIONS.map((loc) => {
          const isHidden = hiddenSeries.has(loc.id);
          const color = isDark ? loc.colorDark : loc.color;
          return (
            <Tag
              key={loc.id}
              size="md"
              variant={isHidden ? 'outline' : 'solid'}
              bg={isHidden ? 'transparent' : color}
              color={isHidden ? textColor : 'white'}
              borderColor={color}
              borderWidth={isHidden ? '1px' : '0'}
              cursor="pointer"
              onClick={() => toggleSeries(loc.id)}
              opacity={isHidden ? 0.5 : 1}
              _hover={{ opacity: 0.8 }}
              transition="all 0.2s"
            >
              <TagLabel>{loc.name}</TagLabel>
            </Tag>
          );
        })}
      </HStack>

      <Box h={{ base: '250px', md: '300px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={chartMargin}>
            <defs>
              {LOCATIONS.map((loc) => {
                const color = isDark ? loc.colorDark : loc.color;
                return (
                  <linearGradient key={loc.id} id={`gradient-${variable.id}-${loc.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.05} />
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="hour"
              tickFormatter={formatHour}
              stroke={textColor}
              fontSize={12}
              tick={{ fill: textColor }}
            />
            <YAxis
              domain={yDomain}
              stroke={textColor}
              fontSize={12}
              tick={{ fill: textColor }}
              tickFormatter={(val) => variable.id === 'pressure' ? val.toFixed(1) : Math.round(val)}
              hide={isMobile}
            />
            <Tooltip content={<CustomTooltip unit={variable.unit} />} />
            {LOCATIONS.map((loc) => {
              const color = isDark ? loc.colorDark : loc.color;
              return (
                <Area
                  key={loc.id}
                  type="monotone"
                  dataKey={loc.id}
                  name={loc.name}
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#gradient-${variable.id}-${loc.id})`}
                  hide={hiddenSeries.has(loc.id)}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2 }}
                  connectNulls
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}
