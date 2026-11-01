import type { Result } from '../types/Result';

/** Only a completed capture earns an early-finish rate; other stops use the full minute. */
export function withRate(base: Result, durationSec: number): Result {
  if (base.stopped_reason.startsWith('skipped_')) return base;
  const completed = base.stopped_reason === 'completed';
  const secondsUsed = base.duration_ms / 1000;
  return {
    ...base,
    derived: {
      ...base.derived,
      correct_per_minute: completed && secondsUsed > 0
        ? Math.round(base.derived.total_correct * 60 / secondsUsed * 10) / 10
        : base.derived.total_correct,
      seconds_remaining: completed ? Math.max(0, Math.round(durationSec - secondsUsed)) : 0,
    },
  };
}
