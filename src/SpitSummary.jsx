import React, { useState, useEffect } from 'react';
import { Flex, Heading, Text } from '@chakra-ui/react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

const KMH_TO_KT = 0.539957;

export default function SpitSummary() {
  const [latest, setLatest] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'cache', 'spit'));
        if (cancelled || !snap.exists()) return;
        const data = snap.data();
        const obs = Array.isArray(data.obs_recent) ? data.obs_recent : [];
        if (obs.length === 0) return;
        const sorted = [...obs].sort((a, b) => (a.time < b.time ? 1 : -1));
        setLatest(sorted[0]);
      } catch {
        // silent — just don't render the box
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!latest) return null;

  const avgKt = Math.round((latest.avg ?? 0) * KMH_TO_KT);
  const gustKt = Math.round((latest.gust ?? 0) * KMH_TO_KT);

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
        Squamish Spit (knots):{' '}
        <Text as="span" color="accent">{avgKt}</Text>
        {', '}
        <Text as="span" color="accent">{gustKt}</Text>
      </Heading>
    </Flex>
  );
}
