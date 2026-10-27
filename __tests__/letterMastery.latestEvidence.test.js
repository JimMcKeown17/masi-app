import { computeLetterMastery, eligibleLetterResults } from '../src/utils/letterMastery';
import { TRACKER_LETTERS } from '../src/utils/assessmentRegistry';
import { getEgraAssessment } from '../content/egra';

const item = (prompt, isCorrect, reached = true) => ({ prompt, is_correct: isCorrect, metadata: { reached } });
const result = (date, items) => ({
  id: date, child_id: 'child-1', language: 'en', question_code: 'letter_sounds',
  stopped_reason: 'completed', assessment_date: date, created_at: `${date}T09:00:00.000Z`, items,
});
const mastered = results => computeLetterMastery(
  eligibleLetterResults(results, { childId: 'child-1', languageCode: 'en' }), TRACKER_LETTERS.en,
);
const chart = id => getEgraAssessment(id).letters.items.map(letter => letter.text);
const allLettersCorrect = date => result(date, TRACKER_LETTERS.en.map(letter => item(letter, true)));

describe('each letter keeps its most recent evidence', () => {
  test('a child with all 26 letters, then assessed on English HL 3 (no q, v, x or z), still has 26', () => {
    const hl3 = chart('dbe-egra-en-hl-3-v1');
    expect(hl3.filter(letter => /[qvxz]/i.test(letter))).toEqual([]);

    const letters = mastered([
      allLettersCorrect('2026-03-01'),
      result('2026-10-20', hl3.map(letter => item(letter, true))),
    ]);
    expect(letters.size).toBe(26);
  });

  test('letters the child did not reach in 60 seconds keep their earlier status (FAL 3, 25 letters read)', () => {
    const fal3 = chart('dbe-egra-en-fal-3-v1');
    const letters = mastered([
      allLettersCorrect('2026-03-01'),
      result('2026-10-20', fal3.map((letter, position) => item(letter, true, position < 25))),
    ]);
    expect(fal3.slice(0, 25).some(letter => /[xz]/i.test(letter))).toBe(false);
    expect(letters.size).toBe(26);
    expect(letters.has('x') && letters.has('z')).toBe(true);
  });

  test('a newer wrong answer un-masters a letter, and a newer right answer masters one', () => {
    const letters = mastered([
      result('2026-03-01', [item('a', true), item('b', false), item('c', true)]),
      result('2026-10-20', [item('a', false), item('b', true)]),
    ]);
    expect(letters).toEqual(new Set(['b', 'c']));
  });

  test('the newest result decides by assessment date and creation time, not by input order', () => {
    const later = { ...result('2026-10-20', [item('a', false)]), created_at: '2026-10-20T10:00:00.000Z' };
    const earlier = { ...result('2026-10-20', [item('a', true)]), id: 'earlier' };
    expect(mastered([later, earlier, result('2026-03-01', [item('a', true)])])).toEqual(new Set());
  });

  test('skipped, other-language and other-child results give no evidence', () => {
    const letters = mastered([
      { ...result('2026-10-20', [item('a', true)]), stopped_reason: 'skipped_tired' },
      { ...result('2026-10-20', [item('b', true)]), language: 'xh' },
      { ...result('2026-10-20', [item('c', true)]), child_id: 'child-2' },
    ]);
    expect(letters).toEqual(new Set());
  });

  test('no results give no letters', () => {
    expect(computeLetterMastery([], TRACKER_LETTERS.en)).toEqual(new Set());
  });
});
