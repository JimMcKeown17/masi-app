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

  test('rejects when was_timed is true but last_attempted_position is null, regardless of stop reason', () => {
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
