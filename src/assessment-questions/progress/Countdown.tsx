import React, { useEffect, useState } from 'react';
import { TimerBar } from '../ui';

type CountdownProps = {
  getRemainingMs: () => number;
  durationMs: number;
};

/** A self-ticking display leaf so clock updates never re-render the capture grid. */
export const Countdown = React.memo(function Countdown({ getRemainingMs, durationMs }: CountdownProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((tick) => tick + 1), 250);
    return () => clearInterval(interval);
  }, []);

  return <TimerBar remainingMs={getRemainingMs()} durationMs={durationMs} />;
});
