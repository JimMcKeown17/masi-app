import { isMathsQuestionCode, validateMathsResult } from '../validateMathsResult';
import { ADD_CHOICES, TAKE_AWAY_CHOICES, ITEM_STRATEGY_KEYS, OBSERVATION_OPTIONS,
  COUNTERS_QUESTION_CODES, CORE_ARITHMETIC_CODES, MATHS_BANDS } from '../strategies';
import { validateResult, type ValidationVerdict } from '../../contractTest/validateResult';
import type { Result } from '../../types/Result';

function result(code = 'maths_add_counters'): Result {
  return {
    question_code: code, question_version: 'draft', item_set_id: `${code}@draft.en`, language: 'en',
    stopped_reason: 'completed', duration_ms: 30000,
    items: [{ position: 0, prompt: '2 + 1', is_correct: true,
      metadata: { skill: 'add_objects', band: 5, reached: true, ...(COUNTERS_QUESTION_CODES.includes(code as never) ? { strategy: 'known' } : {}) } }],
    derived: { total_correct: 1, total_attempted: 1, percent: 100, last_attempted_position: 0,
      ...(CORE_ARITHMETIC_CODES.includes(code as never) ? { strategies: ['head'] } : {}) },
  };
}
function invalid(value: unknown, path: string) {
  const verdict: ValidationVerdict = validateMathsResult(value);
  expect(verdict.valid).toBe(false);
  expect(verdict.errors.some(error => error.includes(path))).toBe(true);
}

test('strategy constants match the agreed keys, labels and Question groups', () => {
  expect(ADD_CHOICES).toEqual([{ key: 'count_all', label: 'Counted from 1' }, { key: 'count_on', label: 'Started from the first number' }, { key: 'known', label: 'Just knew' }]);
  expect(TAKE_AWAY_CHOICES).toEqual([{ key: 'count_all', label: 'Counted what was left' }, { key: 'count_on', label: 'Counted back' }, { key: 'known', label: 'Just knew' }]);
  expect(ITEM_STRATEGY_KEYS).toEqual(['count_all', 'count_on', 'known']);
  expect(OBSERVATION_OPTIONS).toEqual([{ key: 'head', label: 'In their head' }, { key: 'fingers', label: 'Fingers' },
    { key: 'counters', label: 'Counters' }, { key: 'paper', label: 'Paper' }, { key: 'not_seen', label: "Couldn't tell", exclusive: true }]);
  expect(COUNTERS_QUESTION_CODES).toEqual(['maths_add_counters', 'maths_take_away_counters']);
  expect(CORE_ARITHMETIC_CODES).toEqual(['egma_addition_l1', 'egma_addition_l2', 'egma_subtraction_l1', 'egma_subtraction_l2', 'egma_word_problems']);
  expect(MATHS_BANDS).toEqual([5,10,20,50,100,1000]);
});

test.each(['maths_read_numbers', 'egma_number_id', 'maths_future', 'egma_future'])('recognises the maths prefixes (%s)', code => {
  expect(isMathsQuestionCode(code)).toBe(true);
});

test.each(['letter_sounds', 'wela_plus_read_words', 'egra_number_id', 'MATHS_x', 'xmaths_x', ''])('a non-maths code is valid (%s)', code => {
  expect(isMathsQuestionCode(code)).toBe(false);
  expect(validateMathsResult({ question_code: code })).toEqual({ valid: true, errors: [] });
});

test.each(['maths_add_counters', 'egma_addition_l1', 'egma_number_id'])('a skipped maths result with items [] is valid (%s)', code => {
  const base = result(code); base.stopped_reason = 'skipped_prerequisite_unmet'; base.items = [];
  base.derived = { total_correct: 0, total_attempted: 0, percent: 0, last_attempted_position: null };
  expect(validateMathsResult(base)).toEqual({ valid: true, errors: [] });
});

test.each(MATHS_BANDS)('accepts valid maths tags including unreached items (band %s)', band => {
  const base = result('maths_read_numbers'); base.items[0].metadata!.band = band;
  base.items.push({ position: 1, prompt: '9', is_correct: false, metadata: { skill: 'read_numbers', band, reached: false } });
  expect(validateMathsResult(base)).toEqual({ valid: true, errors: [] });
});

test.each([undefined, null, 5, {}, []].map(skill => ({ skill })))('every maths item needs a string skill ($skill)', ({ skill }) => {
  const base = result(); base.items[0].metadata!.skill = skill;
  invalid(base, 'items[0].metadata.skill');
});

test.each([undefined, null, '5', 0, 6, 999, NaN, Infinity])('every maths item needs an allowed band (%p)', band => {
  const base = result(); base.items[0].metadata!.band = band;
  invalid(base, 'items[0].metadata.band');
});

describe.each(COUNTERS_QUESTION_CODES)('%s item strategies', code => {
  test.each(ITEM_STRATEGY_KEYS)('accepts reached correct with %s', strategy => {
    const base = result(code); base.items[0].metadata!.strategy = strategy;
    expect(validateResult(base).valid).toBe(true);
    expect(validateMathsResult(base)).toEqual({ valid: true, errors: [] });
  });
  test.each([undefined, null, 'head', '', 42])('a reached correct item needs a valid strategy (%p)', strategy => {
    const base = result(code); base.items[0].metadata!.strategy = strategy;
    invalid(base, 'items[0].metadata.strategy');
  });
  test.each([true, false])('a strategy on a wrong item is invalid (reached %s)', reached => {
    const base = result(code); base.items[0].is_correct = false; base.items[0].metadata!.reached = reached;
    invalid(base, 'items[0].metadata.strategy');
    delete base.items[0].metadata!.strategy;
    expect(validateMathsResult(base)).toEqual({ valid: true, errors: [] });
  });
  test('a strategy on an unreached item is invalid even if marked correct', () => {
    const base = result(code); base.items[0].metadata!.reached = false;
    invalid(base, 'items[0].metadata.strategy');
  });
});

describe.each(CORE_ARITHMETIC_CODES)('%s observation strategies', code => {
  test.each([['head'], ['not_seen'], ['head', 'fingers', 'counters', 'paper']].map(strategies => ({ strategies })))('accepts a positive-score observation $strategies', ({ strategies }) => {
    const base = result(code); base.derived.strategies = strategies;
    expect(validateMathsResult(base)).toEqual({ valid: true, errors: [] });
  });
  test.each([undefined, null, [], 'head', ['head', 'head'], ['not_seen', 'head'], ['known'], [1]].map(strategies => ({ strategies })))('rejects a missing or invalid positive-score observation $strategies', ({ strategies }) => {
    const base = result(code); base.derived.strategies = strategies;
    invalid(base, 'derived.strategies');
  });
  test('zero correct requires exactly an empty observation', () => {
    const base = result(code); base.items[0].is_correct = false; base.derived.total_correct = 0;
    base.derived.strategies = [];
    expect(validateMathsResult(base)).toEqual({ valid: true, errors: [] });
    base.derived.strategies = ['not_seen']; invalid(base, 'derived.strategies');
    base.derived.strategies = ['head']; invalid(base, 'derived.strategies');
    delete base.derived.strategies; invalid(base, 'derived.strategies');
  });
});

test.each(['maths_read_numbers', 'maths_add_counters', 'egma_number_id', 'egma_missing_number'])('task strategy keys on other maths Questions are invalid (%s)', code => {
  const base = result(code); base.derived.strategies = ['head']; invalid(base, 'derived.strategies');
});

test.each(['maths_read_numbers', 'egma_number_id', 'egma_addition_l1', 'egma_word_problems'])('item strategy keys on other maths Questions are invalid (%s)', code => {
  const base = result(code); base.items[0].metadata!.strategy = 'known'; invalid(base, 'items[0].metadata.strategy');
});

test('skipped results cannot carry observation strategies', () => {
  const base = result('egma_addition_l1'); base.stopped_reason = 'skipped_tired'; base.items = [];
  base.derived.strategies = []; invalid(base, 'derived.strategies');
});

test.each([null, undefined, 1, 'maths', [], {}, { question_code: null }, { question_code: 'maths_x', items: null, derived: null },
  { question_code: 'egma_addition_l1', items: [null, 1, {}, { metadata: null }, { metadata: [] }], derived: [] },
].map(value => ({ value })))('malformed inputs return a verdict without throwing ($value)', ({ value }) => {
  expect(() => validateMathsResult(value)).not.toThrow();
  const verdict = validateMathsResult(value);
  expect(verdict.valid).toBe(false); expect(verdict.errors.length).toBeGreaterThan(0);
});

test('returns every tag and strategy error across items without mutating input', () => {
  const base = result('egma_addition_l1');
  base.items = [0,1].map(position => ({ position, prompt: 'x', is_correct: true, metadata: { strategy: 'known' } }));
  base.derived.strategies = ['head', 'head'];
  base.items.forEach(item => { Object.freeze(item.metadata); Object.freeze(item); });
  Object.freeze(base.items); Object.freeze(base.derived); Object.freeze(base);
  const verdict = validateMathsResult(base);
  expect(verdict.valid).toBe(false);
  for (const position of [0,1]) for (const field of ['skill', 'band', 'strategy']) {
    expect(verdict.errors.some(error => error.includes(`items[${position}].metadata.${field}`))).toBe(true);
  }
  expect(verdict.errors.some(error => error.includes('derived.strategies'))).toBe(true);
});


test.each([undefined, null, -1, NaN, Infinity, '1'])('Core arithmetic needs a valid total_correct for observation rules (%p)', total_correct => {
  const base = result('egma_addition_l1');
  invalid({ ...base, derived: { ...base.derived, total_correct } }, 'derived.total_correct');
});

test('uninspectable input returns an invalid verdict without throwing', () => {
  const value = Object.defineProperty({}, 'question_code', { get() { throw new Error('unreadable'); } });
  expect(() => validateMathsResult(value)).not.toThrow();
  expect(validateMathsResult(value).valid).toBe(false);
});
