import { getLetterMasteryRanking } from '../src/utils/dashboardStats';
import { pickLatestLetterResult } from '../src/utils/letterMastery';

const child = { id: 'child-1', class_id: 'class-1' };
const xhosaClass = { id: 'class-1', home_language: ' isiXhosa ' };
const item = (prompt, isCorrect, reached = true) => ({
  prompt,
  is_correct: isCorrect,
  metadata: { reached },
});
const result = (overrides = {}) => ({
  id: 'assessment-1',
  child_id: child.id,
  user_id: 'another-ea',
  question_code: 'letter_sounds',
  language: 'xh',
  stopped_reason: 'completed',
  assessment_date: '2026-10-20',
  created_at: '2026-10-20T09:00:00.000Z',
  items: [item('a', true)],
  ...overrides,
});

describe('getLetterMasteryRanking — stored question items', () => {
  test('unions another EA’s battery evidence with confirmations stored under the language code', () => {
    const assessment = result({
      battery_run_id: 'run-1',
      items: [
        item('A', true),
        item('a', true),
        item('b', false),
        item('c', true),
        item('d', true, false),
        item('!', true),
      ],
    });
    const confirmations = [
      { child_id: child.id, language: 'xh', letter: 'a', confirmed: true },
      { child_id: child.id, language: 'xh', letter: 'b', confirmed: true },
      { child_id: child.id, language: 'en', letter: 'f', confirmed: true },
      { child_id: child.id, language: 'en', letter: 'd', confirmed: true },
      { child_id: child.id, language: 'xh', letter: 'e', confirmed: false },
    ];

    expect(getLetterMasteryRanking([child], [assessment], confirmations, [xhosaClass]))
      .toEqual([{ child, masteredCount: 3, total: 26, percent: 12 }]);
  });

  test('an unconfirmed record does not count', () => {
    const confirmations = [
      { child_id: child.id, language: 'xh', letter: 'a', confirmed: false },
      { child_id: child.id, language: 'xh', letter: 'b', confirmed: true },
    ];
    expect(getLetterMasteryRanking([child], [], confirmations, [xhosaClass]))
      .toEqual([{ child, masteredCount: 1, total: 26, percent: 4 }]);
  });

  test('each letter takes the newest eligible result that reached it, by assessment date then created time', () => {
    const assessments = [
      result({ id: 'older-date', assessment_date: '2026-10-19', created_at: '2026-10-21T09:00:00Z' }),
      result({ id: 'older-time', created_at: '2026-10-20T08:00:00Z' }),
      result({ id: 'latest', items: [item('b', true), item('c', true)] }),
      result({ id: 'word', question_code: 'word_reading', assessment_date: '2026-10-21' }),
      result({ id: 'english', language: 'en', assessment_date: '2026-10-21' }),
      result({ id: 'another-child', child_id: 'child-2', assessment_date: '2026-10-21' }),
      result({ id: 'skipped', stopped_reason: 'skipped_tired', assessment_date: '2026-10-21' }),
      result({ id: 'unreached', items: [item('a', true, false)], assessment_date: '2026-10-21' }),
      result({ id: 'empty', items: [], assessment_date: '2026-10-21' }),
    ];

    expect(pickLatestLetterResult(assessments, { childId: child.id, languageCode: 'xh' }).id).toBe('latest');
    // b and c from the latest; a from the older results, because the latest did not ask it.
    expect(getLetterMasteryRanking([child], assessments, [], [xhosaClass]))
      .toEqual([{ child, masteredCount: 3, total: 26, percent: 12 }]);
  });

  test('the shared picker returns null without eligible evidence and leaves input order intact', () => {
    const results = [result({ id: 'older', assessment_date: '2026-10-19' }), result({ id: 'latest' })];
    expect(pickLatestLetterResult(results, { childId: child.id, languageCode: 'xh' }).id).toBe('latest');
    expect(results.map(row => row.id)).toEqual(['older', 'latest']);
    expect(pickLatestLetterResult(results, { childId: child.id, languageCode: 'en' })).toBeNull();
    expect(pickLatestLetterResult([], { childId: child.id, languageCode: 'xh' })).toBeNull();
  });

  test('ignores the old summary format and does not infer a letter result without a question code', () => {
    const legacyAssessment = {
      child_id: child.id,
      assessment_type: 'letter_egra',
      letter_language: 'isiXhosa',
      date_assessed: '2026-10-21',
      last_letter_attempted: { index: 59 },
      correct_letters: Array.from({ length: 60 }, (_, index) => ({ index })),
    };
    const untypedResult = result({ question_code: undefined });

    expect(getLetterMasteryRanking([child], [legacyAssessment, untypedResult], [], [xhosaClass]))
      .toEqual([{ child, masteredCount: 0, total: 26, percent: 0 }]);
  });

  test('an Afrikaans child counts Afrikaans results and confirmations only, out of 26', () => {
    const afClass = { id: child.class_id, home_language: 'Afrikaans' };
    const afResult = result({ language: 'af', items: [item('L', true), item('a', true), item('m', false)] });
    const newerEnglish = result({ id: 'assessment-2', language: 'en', assessment_date: '2026-10-21', items: [item('z', true)] });
    const confirmations = [{ child_id: child.id, language: 'af', letter: 'k', confirmed: true }, { child_id: child.id, language: 'en', letter: 's', confirmed: true }];
    expect(getLetterMasteryRanking([child], [afResult, newerEnglish], confirmations, [afClass]))
      .toEqual([{ child, masteredCount: 3, total: 26, percent: 12 }]);
  });

  test.each([null, undefined, '', 'isiZulu'])(
    'keeps the 26-letter scale but no mastery when the class language has no order: %s',
    (homeLanguage) => {
      const englishAssessment = result({ language: 'en' });
      const englishConfirmation = { child_id: child.id, language: 'en', letter: 'b', confirmed: true };

      expect(getLetterMasteryRanking(
        [child],
        [englishAssessment],
        [englishConfirmation],
        [{ id: child.class_id, home_language: homeLanguage }],
      )).toEqual([{ child, masteredCount: 0, total: 26, percent: 0 }]);
    },
  );

  test('a missing class gives no evidence instead of choosing English', () => {
    expect(getLetterMasteryRanking([child], [result({ language: 'en' })], [], []))
      .toEqual([{ child, masteredCount: 0, total: 26, percent: 0 }]);
  });

  test('a wrong reached occurrence prevents mastery regardless of row order', () => {
    const assessment = result({
      items: [item('A', true), item('a', false), item('B', true), item('b', false, false)],
    });
    const expected = [{ child, masteredCount: 1, total: 26, percent: 4 }];

    expect(getLetterMasteryRanking([child], [assessment], [], [xhosaClass])).toEqual(expected);
    expect(getLetterMasteryRanking(
      [child],
      [{ ...assessment, items: [...assessment.items].reverse() }],
      [],
      [xhosaClass],
    )).toEqual(expected);
  });

  test('ranks children by the union of stored item evidence and confirmations', () => {
    const anotherChild = { id: 'child-2', class_id: child.class_id };
    const assessments = [
      result({ child_id: child.id, items: [item('a', true)] }),
      result({ child_id: anotherChild.id, items: [item('b', true), item('c', true)] }),
    ];

    expect(getLetterMasteryRanking([child, anotherChild], assessments, [], [xhosaClass]))
      .toEqual([
        { child: anotherChild, masteredCount: 2, total: 26, percent: 8 },
        { child, masteredCount: 1, total: 26, percent: 4 },
      ]);
  });
});
