import { computeLetterMastery } from '../src/utils/letterMastery';
import { PEDAGOGICAL_ORDERS } from '../src/utils/assessmentRegistry';

// One result on its own: every reached occurrence decides its letter.
const computeAssessmentMastery = (result, order) => computeLetterMastery([result], order);

const item = (prompt, is_correct, reached = true) => ({ prompt, is_correct, metadata: { reached } });

describe('mastery from the recorded prompts and reached occurrences', () => {
  test('A correct and a correct master lowercase a, case-folding the order too', () => {
    expect(computeAssessmentMastery({ items: [item('A', true), item('a', true)] }, ['A', 'B']))
      .toEqual(new Set(['a']));
  });

  test('mixed-case E and e contribute to one lowercase letter on the 26-letter tracker', () => {
    expect(PEDAGOGICAL_ORDERS.en).toHaveLength(26);
    expect(new Set(PEDAGOGICAL_ORDERS.en.map(letter => letter.toLowerCase())).size).toBe(26);
    expect(computeAssessmentMastery(
      { items: [item('E', true), item('e', true)] },
      PEDAGOGICAL_ORDERS.en,
    )).toEqual(new Set(['e']));
  });

  test('one wrong reached occurrence prevents mastery, regardless of case', () => {
    expect(computeAssessmentMastery({ items: [item('A', true), item('a', false)] }, ['A']))
      .toEqual(new Set());
  });

  test('unreached occurrences neither master a letter nor invalidate its reached evidence', () => {
    expect(computeAssessmentMastery({ items: [
      item('A', true), item('a', false, false), item('b', true, false),
    ] }, ['a', 'B'])).toEqual(new Set(['a']));
  });

  test('letters outside the pedagogical order and prompt-less items do not count', () => {
    expect(computeAssessmentMastery({ items: [
      item('a', true), item('z', true), item('ch', true), item(null, true),
    ] }, ['A', 'b'])).toEqual(new Set(['a']));
  });

  test('reordering rows gives the same answer without reading positions or legacy summary fields', () => {
    const items = [item('A', true), item('a', true), item('B', false), item('b', true)];
    for (const stored of items) Object.defineProperty(stored, 'position', {
      get: () => { throw new Error('positions cannot identify historical letters'); },
    });
    const result = { items };
    for (const key of ['last_letter_attempted', 'correct_letters', 'assessment_type']) {
      Object.defineProperty(result, key, { get: () => { throw new Error('legacy summary read'); } });
    }
    expect(computeAssessmentMastery(result, ['A', 'b'])).toEqual(new Set(['a']));
    expect(computeAssessmentMastery({ items: [...items].reverse() }, ['b', 'a'])).toEqual(new Set(['a']));
  });

  test('missing reached metadata means reached; only boolean correct is correct', () => {
    expect(computeAssessmentMastery({ items: [
      { prompt: 'A', is_correct: true }, item('b', 1),
    ] }, ['a', 'b'])).toEqual(new Set(['a']));
  });

  test.each([null, {}, { items: [] }])('no stored item evidence returns an empty set: %p', result => {
    expect(computeAssessmentMastery(result, ['a'])).toEqual(new Set());
  });
});
