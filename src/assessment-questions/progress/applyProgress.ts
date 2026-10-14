export const NO_ATTEMPT = -1;

export function applyProgress<
  T extends { position: number; is_correct: boolean; metadata?: Record<string, unknown> },
>(items: T[], lastAttempted: number): { items: T[]; totalAttempted: number } {
  const out = items.map((it) =>
    it.position > lastAttempted
      ? { ...it, is_correct: false, metadata: { ...(it.metadata ?? {}), reached: false } }
      : it,
  );
  return { items: out, totalAttempted: Math.max(0, lastAttempted + 1) };
}
