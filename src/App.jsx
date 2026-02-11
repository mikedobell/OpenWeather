import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Flex,
  Heading,
  Text,
  IconButton,
  useColorMode,
  useColorModeValue,
  Spinner,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Badge,
  HStack,
  VStack,
  Divider,
  Link,
} from '@chakra-ui/react';
import { MoonIcon, SunIcon } from '@chakra-ui/icons';
import ForecastChart from './ForecastChart';
import MarineForecast from './MarineForecast';
import { VARIABLES } from './constants';
import useForecastData from './useForecastData';

function Header() {
  const { colorMode, toggleColorMode } = useColorMode();
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  return (
    <Box bg={bg} borderBottom="1px" borderColor={borderColor} position="sticky" top={0} zIndex={10}>
      <Container maxW="container.xl" py={3}>
        <Flex justify="space-between" align="center">
          <Box>
            <Heading size={{ base: 'sm', md: 'md' }} color="blue.400">
              Howe Sound Forecast Gradients
            </Heading>
            <Text fontSize={{ base: 'xs', md: 'sm' }} color="gray.500">
              Katabatic &amp; Anabatic Flow Indicators
            </Text>
          </Box>
          <IconButton
            aria-label="Toggle color mode"
            icon={colorMode === 'dark' ? <SunIcon /> : <MoonIcon />}
            onClick={toggleColorMode}
            variant="ghost"
            size="md"
          />
        </Flex>
      </Container>
    </Box>
  );
}

function ModelInfo({ lastUpdated, modelRun, error }) {
  const infoBg = useColorModeValue('blue.50', 'blue.900');
  const infoBorder = useColorModeValue('blue.200', 'blue.700');

  const formatTime = (iso) => {
    if (!iso) return 'Unknown';
    try {
      return new Date(iso).toLocaleString('en-CA', {
        timeZone: 'America/Vancouver',
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return iso;
    }
  };

  return (
    <Box>
      {error && (
        <Alert status="warning" borderRadius="md" mb={4}>
          <AlertIcon />
          <Box>
            <AlertTitle fontSize="sm">Using Demo Data</AlertTitle>
            <AlertDescription fontSize="xs">
              Live forecast data is unavailable ({error}). Showing simulated data for demonstration.
            </AlertDescription>
          </Box>
        </Alert>
      )}

      <Flex
        bg={infoBg}
        border="1px"
        borderColor={infoBorder}
        borderRadius="md"
        p={3}
        justify="space-between"
        align="center"
        flexWrap="wrap"
        gap={2}
      >
        <HStack spacing={3} flexWrap="wrap">
          <Badge colorScheme="blue" fontSize="xs">HRDPS</Badge>
          {modelRun && modelRun !== 'demo' && (
            <Text fontSize="xs" color="gray.500">
              Model Run: {modelRun}Z
            </Text>
          )}
          {modelRun === 'demo' && (
            <Badge colorScheme="yellow" fontSize="xs">DEMO</Badge>
          )}
        </HStack>
        <Text fontSize="xs" color="gray.500">
          Last updated: {formatTime(lastUpdated)}
        </Text>
      </Flex>
    </Box>
  );
}

function Footer() {
  const bg = useColorModeValue('gray.100', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  return (
    <Box bg={bg} borderTop="1px" borderColor={borderColor} mt={8}>
      <Container maxW="container.xl" py={6}>
        <VStack spacing={2} textAlign="center">
          <Text fontSize="xs" color="gray.500">
            Data source:{' '}
            <Link href="https://eccc-msc.github.io/open-data/msc-data/nwp_hrdps/readme_hrdps_en/" isExternal color="blue.400">
              ECCC HRDPS
            </Link>
            {' '}via{' '}
            <Link href="https://geo.weather.gc.ca/geomet" isExternal color="blue.400">
              MSC GeoMet
            </Link>
          </Text>
          <Text fontSize="xs" color="gray.500" fontStyle="italic">
            A homemade project for Howe Sound wingfoilers, which may be broken from time to time.
          </Text>
          <Text fontSize="xs" color="gray.500">
            Charts show daytime hours (7 AM – 9 PM Pacific). Use arrows to page between forecast days.
          </Text>
        </VStack>
      </Container>
    </Box>
  );
}

export default function App() {
  const { data, loading, error, lastUpdated, modelRun, dates, refetch } = useForecastData();
  const [selectedDate, setSelectedDate] = useState(null);

  // Default to first date when dates become available
  useEffect(() => {
    if (dates.length > 0 && !selectedDate) {
      setSelectedDate(dates[0]);
    }
  }, [dates, selectedDate]);

  return (
    <Box minH="100vh">
      <Header />

      <Container maxW="container.xl" py={6}>
        {/* Intro text */}
        <Box mb={6}>
          <Text fontSize="sm" color="gray.500" mb={4}>
            HRDPS forecast data for four locations along the Howe Sound corridor — from the coast
            (Pam Rocks) through the valley (Squamish) into the mountains (Whistler) and interior
            (Lillooet). Compare pressure, temperature, and cloud cover to anticipate thermal wind
            patterns.
          </Text>
          <ModelInfo lastUpdated={lastUpdated} modelRun={modelRun} error={error} />
        </Box>

        <Divider mb={6} />

        {/* Charts */}
        {loading ? (
          <Flex justify="center" align="center" minH="400px">
            <VStack spacing={4}>
              <Spinner size="xl" color="blue.400" thickness="3px" />
              <Text color="gray.500">Loading HRDPS forecast data...</Text>
            </VStack>
          </Flex>
        ) : (
          <Box>
            {VARIABLES.map((variable) => (
              <ForecastChart
                key={variable.id}
                variable={variable}
                data={data}
                dates={dates}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
              />
            ))}

            <MarineForecast />
          </Box>
        )}
      </Container>

      <Footer />
    </Box>
  );
}
