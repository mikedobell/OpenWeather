import React, { useState, useEffect, lazy, Suspense } from 'react';
import {
  Box,
  Container,
  Flex,
  Heading,
  Text,
  IconButton,
  useColorMode,
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
import { VARIABLES } from './constants';
import useForecastData from './useForecastData';

// Lazy-load chart components so Recharts (382 KB) downloads in parallel with API data
const ForecastChart = lazy(() => import('./ForecastChart'));
const TideChart = lazy(() => import('./TideChart'));
const SpitForecast = lazy(() => import('./SpitForecast'));
const MarineForecast = lazy(() => import('./MarineForecast'));

function Header() {
  const { colorMode, toggleColorMode } = useColorMode();

  return (
    <Box bg="bg-card" borderBottom="1px" borderColor="border-ui" position="sticky" top={0} zIndex={10}>
      <Container maxW="container.xl" py={3}>
        <Flex justify="space-between" align="center">
          <Box>
            <Heading size={{ base: 'sm', md: 'md' }} color="accent">
              OpenWeather.ca
            </Heading>
            <Text fontSize={{ base: 'xs', md: 'sm' }} color="text-muted">
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
        bg="bg-info"
        border="1px"
        borderColor="border-info"
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
            <Text fontSize="xs" color="text-muted">
              Model Run: {modelRun}Z
            </Text>
          )}
          {modelRun === 'demo' && (
            <Badge colorScheme="yellow" fontSize="xs">DEMO</Badge>
          )}
        </HStack>
        <Text fontSize="xs" color="text-muted">
          Last updated: {formatTime(lastUpdated)}
        </Text>
      </Flex>
    </Box>
  );
}

function Footer() {
  return (
    <Box bg="bg-footer" borderTop="1px" borderColor="border-ui" mt={8}>
      <Container maxW="container.xl" py={6}>
        <VStack spacing={2} textAlign="center">
          <Text fontSize="xs" color="text-muted">
            Data source:{' '}
            <Link href="https://eccc-msc.github.io/open-data/msc-data/nwp_hrdps/readme_hrdps_en/" isExternal color="accent">
              ECCC HRDPS
            </Link>
            {' '}via{' '}
            <Link href="https://geo.weather.gc.ca/geomet" isExternal color="accent">
              MSC GeoMet
            </Link>
          </Text>
          <Text fontSize="xs" color="text-muted" fontStyle="italic">
            A homemade project for Sea to Sky windsports, which may be broken from time to time. Please forgive any jank.
          </Text>
          <Text fontSize="xs" color="text-muted">
            Charts show daytime hours (7 AM – 9 PM Pacific). Use arrows to page between forecast days.
          </Text>
        </VStack>
      </Container>
    </Box>
  );
}

export default function App() {
  const { data, observations, loading, error, lastUpdated, modelRun, dates, refetch } = useForecastData();
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
          <Text fontSize="sm" color="text-muted" mb={4}>
            HRDPS forecast data for four locations along the Sea to Sky corridor — from the coast to the interior. Compare pressure, temperature, and cloud cover to anticipate thermal wind patterns.
          </Text>
          <ModelInfo lastUpdated={lastUpdated} modelRun={modelRun} error={error} />
        </Box>

        <Divider mb={6} />

        {/* Charts */}
        {loading ? (
          <Flex justify="center" align="center" minH="400px">
            <VStack spacing={4}>
              <Spinner size="xl" color="accent" thickness="3px" />
              <Text color="text-muted">Loading HRDPS forecast data...</Text>
            </VStack>
          </Flex>
        ) : (
          <Suspense fallback={<Spinner size="lg" color="accent" />}>
            <Box>
              {VARIABLES.map((variable) => (
                <ForecastChart
                  key={variable.id}
                  variable={variable}
                  data={data}
                  observations={variable.id === 'pressure' ? observations : null}
                  dates={dates}
                  selectedDate={selectedDate}
                  onDateChange={setSelectedDate}
                />
              ))}

              <TideChart
                  dates={dates}
                  selectedDate={selectedDate}
                  onDateChange={setSelectedDate}
                />

              <SpitForecast
                dates={dates}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
              />

              <MarineForecast />
            </Box>
          </Suspense>
        )}
      </Container>

      <Footer />
    </Box>
  );
}
