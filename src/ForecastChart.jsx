import React, { useState } from 'react';
import {
  Box,
  Heading,
  Text,
  HStack,
  Tag,
  TagLabel,
  TagCloseButton,
  useColorModeValue,
} from '@chakra-ui/react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { LOCATIONS } from './constants';

function formatHour(hour) {
  if (hour === 12) return '12 PM';
  if (hour === 0 || hour === 24) return '12 AM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
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

export default function ForecastChart({ variable, data }) {
  const [hiddenSeries, setHiddenSeries] = useState(new Set());
  const isDark = useColorModeValue(false, true);
  const cardBg = useColorModeValue('white', 'gray.800');
  const gridColor = useColorModeValue('#E2E8F0', '#2D3748');
  const textColor = useColorModeValue('#4A5568', '#A0AEC0');

  if (!data) return null;

  // Transform data: merge all locations into rows keyed by hour
  const chartData = [];
  const hours = data[LOCATIONS[0].id]?.[variable.id] || [];

  for (const point of hours) {
    const row = { hour: point.hour };
    for (const loc of LOCATIONS) {
      const locData = data[loc.id]?.[variable.id];
      const match = locData?.find((d) => d.hour === point.hour);
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
    allValues = allValues.concat(locData.map((d) => d.value).filter((v) => v !== null));
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
      <Heading size="md" mb={1}>{variable.label} ({variable.unit})</Heading>
      <Text fontSize="sm" color="gray.500" mb={4}>{variable.description}</Text>

      {/* Legend as clickable tags */}
      <HStack spacing={2} mb={4} flexWrap="wrap">
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
          <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
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
