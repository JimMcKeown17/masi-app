// Elapsed assessment time must be immune to wall-clock corrections.
// Resolve performance inside every call: Jest fake timers replace globalThis.performance,
// so capturing it at module evaluation would keep reading the real clock in timer tests.
// Keep sub-millisecond precision here; round elapsed time when producing duration_ms.
export function monotonicNow(): number {
  const perf = globalThis.performance;
  return (perf && typeof perf.now === 'function') ? perf.now() : Date.now();
}
