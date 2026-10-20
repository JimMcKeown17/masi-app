import { validateResult } from '../contractTest/validateResult';
import type { Result } from '../types/Result';

const minimalValid: Result = {
  question_code: 'test_q',
  question_version: '1.0',
  item_set_id: 'test_q@1.0.en',
  language: 'en',
  duration_ms: 5000,
  stopped_reason: 'completed',
  items: [
    { position: 1, item_key: 'a', prompt: 'A', is_correct: true },
  ],
  derived: {
    total_correct: 1,
    total_attempted: 1,
    percent: 100,
    last_attempted_position: null,
  },
};

describe('validateResult', () => {
  test('accepts a minimal fully-populated Result', () => {
    const verdict = validateResult(minimalValid);
    expect(verdict.valid).toBe(true);
  });

  test('rejects an empty object', () => {
    const verdict = validateResult({});
    expect(verdict.valid).toBe(false);
    expect(verdict.errors.length).toBeGreaterThan(0);
  });

  test('rejects an invalid stopped_reason value', () => {
    const bad = { ...minimalValid, stopped_reason: 'not_a_real_reason' };
    const verdict = validateResult(bad);
    expect(verdict.valid).toBe(false);
    expect(verdict.errors.some((e) => e.includes('stopped_reason'))).toBe(true);
  });

  test('rejects when stopped_reason is timer but last_attempted_position is null', () => {
    const bad: Result = {
      ...minimalValid,
      stopped_reason: 'timer',
      derived: { ...minimalValid.derived, last_attempted_position: null },
    };
    const verdict = validateResult(bad);
    expect(verdict.valid).toBe(false);
    expect(
      verdict.errors.some((e) => e.includes('last_attempted_position'))
    ).toBe(true);
  });

  test('rejects when items is not an array', () => {
    const bad = { ...minimalValid, items: 'not an array' };
    const verdict = validateResult(bad);
    expect(verdict.valid).toBe(false);
    expect(verdict.errors.some((e) => e.includes('items'))).toBe(true);
  });

  test('returns a verdict (does not throw) when timer is set but derived is null', () => {
    const bad = { ...minimalValid, stopped_reason: 'timer', derived: null };
    expect(() => validateResult(bad)).not.toThrow();
    const verdict = validateResult(bad);
    expect(verdict.valid).toBe(false);
    expect(verdict.errors.some((e) => e.includes('derived'))).toBe(true);
  });

  test('rejects when was_timed is true but last_attempted_position is null on a non-skipped result', () => {
    const bad: Result = {
      ...minimalValid,
      stopped_reason: 'completed',
      derived: {
        ...minimalValid.derived,
        was_timed: true,
        last_attempted_position: null,
      },
    };
    const verdict = validateResult(bad);
    expect(verdict.valid).toBe(false);
    expect(
      verdict.errors.some((e) => e.includes('last_attempted_position'))
    ).toBe(true);
  });

  test('accepts a timed Question that completed early with last_attempted_position populated', () => {
    const good: Result = {
      ...minimalValid,
      stopped_reason: 'completed',
      derived: {
        ...minimalValid.derived,
        was_timed: true,
        last_attempted_position: 12,
      },
    };
    expect(validateResult(good).valid).toBe(true);
  });

  test('rejects when duration_ms is not a number', () => {
    const bad = { ...minimalValid, duration_ms: '5000' };
    const verdict = validateResult(bad);
    expect(verdict.valid).toBe(false);
    expect(verdict.errors.some((e) => e.includes('duration_ms'))).toBe(true);
  });

  test.each([-1, 0.5, NaN, Infinity, -Infinity])('rejects duration_ms=%p outside non-negative integers', (duration_ms) => {
    const verdict = validateResult({ ...minimalValid, duration_ms });
    expect(verdict.valid).toBe(false);
    expect(verdict.errors).toContain('duration_ms: must be a non-negative integer');
  });

  test.each([0, 1, 60000])('accepts non-negative integer duration_ms=%i', (duration_ms) => {
    expect(validateResult({ ...minimalValid, duration_ms })).toEqual({ valid: true, errors: [] });
  });

  test('rejects when an items entry is missing required fields', () => {
    const bad = {
      ...minimalValid,
      items: [{ position: 1 }],
    };
    const verdict = validateResult(bad);
    expect(verdict.valid).toBe(false);
    expect(verdict.errors.some((e) => e.includes('items[0]'))).toBe(true);
  });

  test('rejects when derived is an empty object', () => {
    const bad = { ...minimalValid, derived: {} };
    const verdict = validateResult(bad);
    expect(verdict.valid).toBe(false);
    expect(verdict.errors.some((e) => e.includes('derived'))).toBe(true);
  });

  test('rejects when question_code is not a string', () => {
    const bad = { ...minimalValid, question_code: 42 };
    const verdict = validateResult(bad);
    expect(verdict.valid).toBe(false);
    expect(verdict.errors.some((e) => e.includes('question_code'))).toBe(true);
  });

  test('rejects when question_version is not a string', () => {
    const bad = { ...minimalValid, question_version: 1 };
    const verdict = validateResult(bad);
    expect(verdict.valid).toBe(false);
    expect(verdict.errors.some((e) => e.includes('question_version'))).toBe(true);
  });

  test('rejects when item_set_id is not a string', () => {
    const bad = { ...minimalValid, item_set_id: ['array', 'id'] };
    const verdict = validateResult(bad);
    expect(verdict.valid).toBe(false);
    expect(verdict.errors.some((e) => e.includes('item_set_id'))).toBe(true);
  });

  test('rejects when language is not a string', () => {
    const bad = { ...minimalValid, language: { en: true } };
    const verdict = validateResult(bad);
    expect(verdict.valid).toBe(false);
    expect(verdict.errors.some((e) => e.includes('language'))).toBe(true);
  });

  test('accepts derived.capture_mode and derived.correction_count (reserved for 0.2.0 sequential mode)', () => {
    const good: Result = {
      ...minimalValid,
      derived: {
        ...minimalValid.derived,
        capture_mode: 'sequential',
        correction_count: 3,
      },
    };
    expect(validateResult(good).valid).toBe(true);
  });
});

describe('tracks_progress rule', () => {
  const base = {
    question_code: 'x', question_version: '1', item_set_id: 'x@1.en', language: 'en',
    duration_ms: 1, stopped_reason: 'ea_ended' as const,
    items: [{ position: 0, item_key: 'a', prompt: 'a', is_correct: true }],
  };
  test('null position with tracks_progress is invalid', () => {
    const v = validateResult({ ...base, derived: { total_correct: 1, total_attempted: 1, percent: 100, last_attempted_position: null, tracks_progress: true } });
    expect(v.valid).toBe(false);
  });
  test('-1 with tracks_progress is valid', () => {
    const v = validateResult({ ...base, derived: { total_correct: 0, total_attempted: 0, percent: 0, last_attempted_position: -1, tracks_progress: true } });
    expect(v.valid).toBe(true);
  });
  test('a timed skipped result may disable progress and report null', () => {
    const v = validateResult({
      ...base,
      stopped_reason: 'skipped_child_refused',
      items: [],
      derived: {
        total_correct: 0,
        total_attempted: 0,
        percent: 0,
        last_attempted_position: null,
        was_timed: true,
        tracks_progress: false,
      },
    });
    expect(v.valid).toBe(true);
  });
  test('a timed non-skipped result cannot opt out by setting tracks_progress false', () => {
    const v = validateResult({
      ...base,
      stopped_reason: 'ea_ended',
      derived: {
        total_correct: 1,
        total_attempted: 1,
        percent: 100,
        last_attempted_position: null,
        was_timed: true,
        tracks_progress: false,
      },
    });
    expect(v.valid).toBe(false);
  });
  test('position beyond items is invalid', () => {
    const v = validateResult({ ...base, derived: { total_correct: 1, total_attempted: 6, percent: 17, last_attempted_position: 5, tracks_progress: true } });
    expect(v.valid).toBe(false);
  });
});

describe('stop_rule evidence', () => {
  function stopped(): Result {
    return {
      ...minimalValid, stopped_reason: 'stop_rule',
      items: Array.from({ length: 60 }, (_, position) => ({
        position, item_key: 'a', prompt: 'a', is_correct: position < 5,
        metadata: { reached: position < 15 },
      })),
      derived: { total_correct: 5, total_attempted: 15, percent: 33, last_attempted_position: 14 },
    };
  }

  test('rejects a stop whose last ten reached items include a correct decision', () => {
    const result = stopped();
    result.items[8].is_correct = true;
    const verdict = validateResult(result, { stopAt: 10 });
    expect(verdict.valid).toBe(false);
    expect(verdict.errors.join(' ')).toMatch(/stop_rule.*10.*wrong/);
  });

  test('accepts the final ten wrong reached items by position even when array order differs', () => {
    const result = stopped();
    result.items.reverse();
    expect(validateResult(result, { stopAt: 10 })).toEqual({ valid: true, errors: [] });
  });

  test('unreached false items cannot supply missing stop evidence', () => {
    const result = stopped();
    result.items[5].metadata = { reached: false };
    expect(validateResult(result, { stopAt: 10 }).valid).toBe(false);
  });

  test('the wrong run must end at last_attempted_position', () => {
    const result = stopped();
    result.derived.last_attempted_position = 15;
    expect(validateResult(result, { stopAt: 10 }).valid).toBe(false);
  });

  test('rejects fewer than stopAt reached decisions', () => {
    const result = stopped();
    result.items = result.items.slice(5, 14);
    result.derived.last_attempted_position = 13;
    expect(validateResult(result, { stopAt: 10 }).valid).toBe(false);
  });

  test('metadata.reached absent still counts as reached', () => {
    const result = stopped();
    result.items.slice(5, 15).forEach((item) => { delete item.metadata; });
    expect(validateResult(result, { stopAt: 10 }).valid).toBe(true);
  });

  test('preserves the one-argument API and does not apply the rule to other reasons', () => {
    const result = stopped();
    result.items[8].is_correct = true;
    expect(validateResult(result).valid).toBe(true);
    result.stopped_reason = 'ea_ended';
    expect(validateResult(result, { stopAt: 10 }).valid).toBe(true);
  });

  test('malformed stop evidence returns errors without throwing', () => {
    expect(validateResult({ ...stopped(), items: [null], derived: null }, { stopAt: 10 }).valid).toBe(false);
  });
});
