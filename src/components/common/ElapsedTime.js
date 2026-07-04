import React, { useEffect, useState } from 'react';
import { Text } from 'react-native-paper';

export function formatElapsedTime(milliseconds) {
  const hours = Math.floor(milliseconds / (1000 * 60 * 60));
  const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

/**
 * Self-ticking elapsed-time text. Isolates the 1Hz re-render to this leaf so
 * the time-tracking context and every screen consuming it stays still while
 * the EA is clocked in all day.
 */
export default function ElapsedTime({ signInTime, style, variant }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!signInTime) return undefined;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [signInTime]);

  if (!signInTime) return null;

  const elapsed = Math.max(0, now - new Date(signInTime).getTime());
  return <Text variant={variant} style={style}>{formatElapsedTime(elapsed)}</Text>;
}
