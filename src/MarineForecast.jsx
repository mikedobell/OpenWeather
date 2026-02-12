import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Heading,
  Text,
  Badge,
  Spinner,
  VStack,
  Flex,
  useColorModeValue,
} from '@chakra-ui/react';
import { MARINE_API_ENDPOINT } from './constants';

const SECTION_CONFIG = {
  warnings: { label: 'Warnings', colorScheme: 'red' },
  winds: { label: 'Winds', colorScheme: 'blue' },
  weather: { label: 'Weather & Visibility', colorScheme: 'green' },
  extended: { label: 'Extended Forecast', colorScheme: 'purple' },
};

const SECTION_ORDER = ['warnings', 'winds', 'weather', 'extended'];

function ForecastSection({ sectionKey, section }) {
  const config = SECTION_CONFIG[sectionKey];
  const sectionBg = useColorModeValue('gray.50', 'gray.700');
  const textColor = useColorModeValue('gray.700', 'gray.200');

  if (!section || !config) return null;

  // Parse the content into lines, bolding day names
  const rawLines = section.content.split('\n').filter((l) => l.trim() !== '');

  // Extract the "Issued..." line if present
  let issuedLine = null;
  let contentLines = [];
  for (const line of rawLines) {
    if (/^Issued\b/i.test(line.trim())) {
      issuedLine = line.trim();
    } else {
      contentLines.push(line.trim());
    }
  }

  // For winds section: split dense paragraphs at sentence boundaries
  // so each "Wind ..." sentence gets its own line
  if (sectionKey === 'winds') {
    const expanded = [];
    for (const line of contentLines) {
      // Split on ". Wind " to separate wind period sentences
      const parts = line.split(/\.\s+(?=Wind\s)/i);
      for (let j = 0; j < parts.length; j++) {
        let part = parts[j].trim();
        if (!part) continue;
        // Re-add trailing period if it was removed by the split
        if (j < parts.length - 1 && !part.endsWith('.')) {
          part += '.';
        }
        expanded.push(part);
      }
    }
    contentLines = expanded;
  }

  return (
    <Box bg={sectionBg} borderRadius="md" p={4}>
      <Flex align="center" gap={2} mb={2} flexWrap="wrap">
        <Badge colorScheme={config.colorScheme} fontSize="xs">
          {config.label}
        </Badge>
        {issuedLine && (
          <Text fontSize="xs" color="gray.500">
            {issuedLine}
          </Text>
        )}
      </Flex>
      <Box>
        {contentLines.map((line, i) => {
          // Bold day names at the start of lines (e.g., "Friday", "Saturday", "Today Tonight and Thursday.")
          const dayMatch = line.match(
            /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Today|Tonight|Today Tonight[^.]*\.)/i
          );

          if (dayMatch) {
            const rest = line.slice(dayMatch[0].length).trim();
            return (
              <Text key={i} fontSize="sm" color={textColor} mb={1}>
                <Text as="span" fontWeight="bold">
                  {dayMatch[0]}
                </Text>
                {rest ? ' ' + rest : ''}
              </Text>
            );
          }

          // Check for "Strong wind warning" or similar notices
          if (/warning|advisory/i.test(line)) {
            return (
              <Text key={i} fontSize="sm" color="orange.500" fontStyle="italic" mb={1}>
                {line}
              </Text>
            );
          }

          return (
            <Text key={i} fontSize="sm" color={textColor} mb={1}>
              {line}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}

export default function MarineForecast() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cardBg = useColorModeValue('white', 'gray.800');
  const linkColor = useColorModeValue('blue.500', 'blue.300');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(MARINE_API_ENDPOINT);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = await response.json();
      if (json.error) {
        throw new Error(json.error);
      }
      setData(json);
    } catch (err) {
      console.error('Failed to fetch marine forecast:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <Box bg={cardBg} borderRadius="xl" p={{ base: 4, md: 6 }} shadow="md" mb={6}>
        <Flex justify="center" align="center" minH="100px">
          <Spinner size="md" color="blue.400" thickness="3px" mr={3} />
          <Text color="gray.500">Loading marine forecast...</Text>
        </Flex>
      </Box>
    );
  }

  if (error || !data || !data.sections) {
    return (
      <Box bg={cardBg} borderRadius="xl" p={{ base: 4, md: 6 }} shadow="md" mb={6}>
        <Heading size="md" mb={2}>
          Howe Sound Marine Forecast
        </Heading>
        <Text fontSize="sm" color="gray.500">
          Marine forecast is currently unavailable.{' '}
          <Text
            as="a"
            href="https://weather.gc.ca/marine/forecast_e.html?mapID=02&siteID=06400"
            target="_blank"
            rel="noopener noreferrer"
            color={linkColor}
          >
            View on weather.gc.ca
          </Text>
        </Text>
      </Box>
    );
  }

  const hasSections = SECTION_ORDER.some((key) => data.sections[key]);

  return (
    <Box bg={cardBg} borderRadius="xl" p={{ base: 4, md: 6 }} shadow="md" mb={6}>
      <Flex justify="space-between" align="flex-start" mb={4} flexWrap="wrap" gap={2}>
        <Box>
          <Heading size="md" mb={1}>
            Howe Sound Marine Forecast
          </Heading>
          <Text fontSize="sm" color="gray.500">
            Environment Canada — Area 06400
          </Text>
        </Box>
        <Text
          as="a"
          href="https://weather.gc.ca/marine/forecast_e.html?mapID=02&siteID=06400"
          target="_blank"
          rel="noopener noreferrer"
          fontSize="xs"
          color={linkColor}
        >
          View full forecast
        </Text>
      </Flex>

      {hasSections ? (
        <VStack spacing={3} align="stretch">
          {SECTION_ORDER.map((key) =>
            data.sections[key] ? (
              <ForecastSection key={key} sectionKey={key} section={data.sections[key]} />
            ) : null
          )}
        </VStack>
      ) : (
        <Text fontSize="sm" color="gray.500">
          No forecast sections available at this time.
        </Text>
      )}
    </Box>
  );
}
