import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { tokens } from '../theme/tokens';

type CountdownProps = {
  getRemainingMs: () => number;
};

function formatRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/** A self-ticking display leaf so clock updates never re-render the capture grid. */
export const Countdown = React.memo(function Countdown({ getRemainingMs }: CountdownProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((tick) => tick + 1), 250);
    return () => clearInterval(interval);
  }, []);

  const seconds = Math.ceil(Math.max(0, getRemainingMs()) / 1000);
  return (
    <Text
      accessibilityLabel={`Time left, ${seconds} seconds`}
      style={[styles.time, seconds <= 10 && styles.urgent]}
    >
      {formatRemaining(seconds)}
    </Text>
  );
});

const styles = StyleSheet.create({
  time: {
    color: tokens.color.ink,
    fontSize: tokens.font.heading,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  urgent: { color: tokens.color.error },
});
