import * as registry from '../src/utils/assessmentRegistry';
import { CURRENT_ITEM_SETS } from '../src/assessment-questions';

describe('assessment language and standalone test registry', () => {
  test.each([
    ['English', 'en'], [' english ', 'en'], ['ENGLISH', 'en'],
    ['isiXhosa', 'xh'], [' XHOSA ', 'xh'], ['ISIXHOSA', 'xh'],
    ['isiZulu', 'zu'], [' ZULU ', 'zu'], ['ISIZULU', 'zu'],
    ['Afrikaans', null], ['', null], ['   ', null], [null, null], [undefined, null],
    ['English and isiXhosa', null], ['not-xhosa', null], ['en', null], [42, null],
  ])('maps home language %p to %p without guessing', (text, expected) => {
    expect(registry.languageCodeForHomeLanguage(text)).toBe(expected);
  });

  test('keeps the exact public registry contract without copying package item sets', () => {
    expect(Object.keys(registry).sort()).toEqual([
      'LANGUAGE_LABELS', 'LETTER_EVIDENCE_CODES', 'PEDAGOGICAL_ORDERS',
      'STANDALONE_TESTS', 'languageCodeForHomeLanguage',
    ].sort());
    expect(registry.LANGUAGE_LABELS).toEqual({ en: 'English', xh: 'isiXhosa', zu: 'isiZulu' });
    expect(registry.LETTER_EVIDENCE_CODES).toEqual(['letter_sounds']);
    expect(registry.STANDALONE_TESTS).toEqual([
      { code: 'letter_sounds', title: 'Letter Sounds', durationSec: 60, component: 'LetterSoundsQuestion' },
      { code: 'word_reading', title: 'Word Reading', durationSec: 60, component: 'ReadWordsQuestion' },
    ]);
    for (const test of registry.STANDALONE_TESTS) {
      for (const language of ['en', 'xh']) {
        expect(CURRENT_ITEM_SETS[test.code][language]).toMatchObject({
          question_code: test.code, language,
          item_set_id: `${test.code}@2026.1.${language}`,
        });
      }
      expect(CURRENT_ITEM_SETS[test.code].zu).toBeUndefined();
    }
  });

  test('preserves the exact teaching orders under codes, with no unsupported-language substitution', () => {
    expect(registry.PEDAGOGICAL_ORDERS).toEqual({
      en: ['a','m','s','t','n','i','p','c','f','d','h','o','r','b','l','k','e','g','w','v','u','j','y','z','q','x'],
      xh: ['a','e','i','o','u','b','l','m','k','p','s','h','z','n','d','y','f','w','v','x','g','t','q','r','c','j'],
    });
    expect(registry.PEDAGOGICAL_ORDERS.zu).toBeUndefined();
    expect(registry.PEDAGOGICAL_ORDERS[null]).toBeUndefined();
  });
});
