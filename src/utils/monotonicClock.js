// Monotonic time source for the assessment timer. performance.now() is immune to wall-clock
// (Date) changes - NTP corrections, manual clock changes - which matters for a standardized
// 60-second timed assessment whose elapsed feeds completion_time. Falls back to Date.now()
// only if performance.now is unavailable.
//
// IMPORTANT (R12): resolve globalThis.performance INSIDE now() on every call. Do NOT capture
// `performance` at module-eval time: jest.useFakeTimers() replaces global.performance with a
// fake, and a captured reference would keep reading the real clock (verified: captured-delta=0
// vs resolved-delta=60000 under advanceTimersByTime(60000)), silently breaking the existing
// completion_time===60 expiry test.
export function now() {
  const perf = globalThis.performance;
  return (perf && typeof perf.now === 'function') ? perf.now() : Date.now();
}
