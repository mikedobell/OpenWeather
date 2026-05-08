import React, { useState, useEffect } from 'react';
import { Flex, Heading, Text } from '@chakra-ui/react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { toKt, degToCardinal, currentTideMeters } from './wind';

export default function SpitSummary() {
  const [latest, setLatest] = useState(null);
  const [tide, setTide] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [spitSnap, tideSnap] = await Promise.all([
          getDoc(doc(db, 'cache', 'spit')),
          getDoc(doc(db, 'cache', 'tide')),
        ]);
        if (cancelled) return;
        if (spitSnap.exists()) {
          const obs = spitSnap.data().obs_recent || [];
          if (obs.length > 0) {
            const sorted = [...obs].sort((a, b) => (a.time < b.time ? 1 : -1));
            setLatest(sorted[0]);
          }
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

  if (!latest) return null;

  const avg = Math.round(toKt(latest.avg ?? 0));
  const gust = Math.round(toKt(latest.gust ?? 0));
  const dir = degToCardinal(latest.dir);

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
        Squamish Spit:{' '}
        <Text as="span" color="accent">
          {avg} (g{gust}){dir ? ` ${dir}` : ''}
        </Text>
        {tide != null && (
          <Text as="span" fontSize="sm" fontWeight="normal" ml={2}>
            Tide {tide.toFixed(1)}m
          </Text>
        )}
      </Heading>
    </Flex>
  );
}
