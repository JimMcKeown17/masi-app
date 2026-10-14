import { applyProgress, NO_ATTEMPT } from '../applyProgress';

const items = (correct: boolean[]) =>
  correct.map((c, i) => ({
    position: i,
    is_correct: c,
    metadata: { k: i } as Record<string, unknown>,
  }));

describe('applyProgress', () => {
  test('nothing attempted: every item not reached, total 0', () => {
    const r = applyProgress(items([true, true, false]), NO_ATTEMPT);
    expect(r.totalAttempted).toBe(0);
    expect(r.items.every((i) => i.is_correct === false && i.metadata?.reached === false)).toBe(true);
  });
  test('first item only', () => {
    const r = applyProgress(items([true, true, false]), 0);
    expect(r.totalAttempted).toBe(1);
    expect(r.items.map((i) => i.is_correct)).toEqual([true, false, false]);
    expect(r.items[0].metadata).toEqual({ k: 0 });
    expect(r.items[1].metadata).toEqual({ k: 1, reached: false });
  });
  test('row boundary (last item of a 12-wide first row)', () => {
    const r = applyProgress(items(Array(24).fill(true)), 11);
    expect(r.totalAttempted).toBe(12);
    expect(r.items.filter((i) => i.is_correct)).toHaveLength(12);
  });
  test('final item: nothing marked not-reached', () => {
    const r = applyProgress(items([true, false, true]), 2);
    expect(r.totalAttempted).toBe(3);
    expect(r.items.some((i) => i.metadata?.reached === false)).toBe(false);
  });
});
