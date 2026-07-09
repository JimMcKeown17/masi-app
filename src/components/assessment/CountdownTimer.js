import React, { useEffect, useState } from 'react';
import AssessmentTimer from './AssessmentTimer';
import { ASSESSMENT_DURATION } from '../../constants/egraConstants';

/**
 * Self-ticking countdown leaf. Isolates the 1 Hz re-render to this component so the
 * capture screen and its tile grid stay still while the assessment runs. Mirrors the
 * time-tracker's ElapsedTime isolation.
 */
export default function CountdownTimer({ getElapsedMs, durationSeconds = ASSESSMENT_DURATION }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, durationSeconds - Math.floor(getElapsedMs() / 1000));
  return <AssessmentTimer timeRemaining={remaining} />;
}
