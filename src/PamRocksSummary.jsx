import React, { useState, useEffect } from 'react';
import { Flex, Heading, Text } from '@chakra-ui/react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { toKt, degToCardinal, currentTideMeters, getCurrentPtDate } from './wind';

// Pick the most recent obs entry for today. Series are arrays of {hour, value, date}.
function latestForToday(series) {
  if (!Array.isArray(series)) return null;
  const today = getCurrentPtDate();
  let best = null;
  for (const p of series) {
    if (p.date !== today) continue;
    if (!best || p.hour > best.hour) best = p;
  }
  return best;
}

export default function PamRocksSummary() {
  const [obs, setObs] = useState(null);
  const [tide, setTide] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [obsSnap, tideSnap] = await Promise.all([
          getDoc(doc(db, 'cache', 'observations')),
          getDoc(doc(db, 'cache', 'tide')),
        ]);
        if (cancelled) return;
        if (obsSnap.exists()) {
          setObs(obsSnap.data().observations?.pamrocks || null);
        }
        if (tideSnap.exists()) {
          setTide(currentTideMeters(tideSnap.data()));
        }
      } catch {
        // silent
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!obs) return null;

  const speed = latestForToday(obs.wind_speed);
  const gust = latestForToday(obs.wind_gust);
  const dir = latestForToday(obs.wind_dir);
  if (!speed) return null;

  const avgKt = Math.round(toKt(speed.value));
  const gustKt = gust ? Math.round(toKt(gust.value)) : null;
  const cardinal = dir ? degToCardinal(dir.value) : '';
  const tideStr = tide != null ? ` Tide ${tide.toFixed(1)}m` : '';

  return (
    <Flex
      bg="bg-info"
      border="1px"
      borderColor="border-info"
      borderRadius="md"
      p={3}
      align="center"
      flexWrap="wrap"
      gap={2}
      mb={4}
    >
      <Heading size="md" m={0}>
        Pam Rocks:{' '}
        <Text as="span" color="accent">
          {avgKt}{gustKt != null ? `(g${gustKt})` : ''}{cardinal ? ` ${cardinal}` : ''}
        </Text>
        {tideStr}
      </Heading>
    </Flex>
  );
}
