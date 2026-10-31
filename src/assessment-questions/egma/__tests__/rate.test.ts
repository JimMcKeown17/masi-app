import { withRate } from '../rate';
import type { Result } from '../../types/Result';

function result(overrides: Partial<Result> = {}): Result {
  return {
    question_code: 'egma_addition_l1', question_version: 'draft', item_set_id: 'rate@draft.en', language: 'en',
    stopped_reason: 'completed', duration_ms: 30000, items: [],
    derived: { total_correct: 15, total_attempted: 20, percent: 75, last_attempted_position: 19, strategies: ['head'] },
    ...overrides,
  };
}

test('completed early scales the rate', () => {
  const base = result(); Object.freeze(base.derived); Object.freeze(base);
  const enriched = withRate(base, 60);
  expect(enriched).toEqual({ ...base, derived: { ...base.derived, correct_per_minute: 30, seconds_remaining: 30 } });
  expect(enriched).not.toBe(base); expect(enriched.derived).not.toBe(base.derived);
  expect(base.derived).not.toHaveProperty('correct_per_minute');
});

test.each(['timer', 'stop_rule', 'ea_ended'] as const)('%s uses the raw count', stopped_reason => {
  const enriched = withRate(result({ stopped_reason }), 60);
  expect(enriched.derived).toMatchObject({ total_correct: 15, correct_per_minute: 15, seconds_remaining: 0 });
});

test.each(['skipped_tired', 'skipped_prerequisite_unmet'] as const)('a skipped result is unchanged (%s)', stopped_reason => {
  const base = result({ stopped_reason, items: [] });
  expect(withRate(base, 60)).toBe(base);
});

test('a completed result with duration 0 uses the raw count', () => {
  expect(withRate(result({ duration_ms: 0 }), 60).derived).toMatchObject({ correct_per_minute: 15, seconds_remaining: 60 });
});

test('rate is rounded to 1 decimal place and seconds remaining to an integer', () => {
  const base = result({ duration_ms: 18123 });
  base.derived.total_correct = 7;
  expect(withRate(base, 60).derived).toMatchObject({ correct_per_minute: 23.2, seconds_remaining: 42 });
});

test('a completed result at the deadline has no time remaining', () => {
  expect(withRate(result({ duration_ms: 60000 }), 60).derived).toMatchObject({ correct_per_minute: 15, seconds_remaining: 0 });
});
