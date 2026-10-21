import * as registry from '../src/utils/assessmentRegistry';
import { CURRENT_ITEM_SETS } from '../src/assessment-questions';
import { HOME_LANGUAGES } from '../src/constants/options';

describe('assessment language and standalone test registry', () => {
  test.each([
    ['English', 'en'], [' english ', 'en'], ['ENGLISH', 'en'],
    ['isiXhosa', 'xh'], [' XHOSA ', 'xh'], ['ISIXHOSA', 'xh'],
    ['isiZulu', 'zu'], [' ZULU ', 'zu'], ['ISIZULU', 'zu'],
    ['Afrikaans', 'af'], [' afrikaans ', 'af'], ['AFRIKAANS', 'af'],
    ['Afrikaans and English', null], ['af', null],
    ['', null], ['   ', null], [null, null], [undefined, null],
    ['English and isiXhosa', null], ['not-xhosa', null], ['en', null], [42, null],
  ])('maps home language %p to %p without guessing', (text, expected) => {
    expect(registry.languageCodeForHomeLanguage(text)).toBe(expected);
  });

  test('keeps the exact public registry contract without copying package item sets', () => {
    expect(Object.keys(registry).sort()).toEqual([
      'LANGUAGE_LABELS', 'LETTER_EVIDENCE_CODES', 'PEDAGOGICAL_ORDERS',
      'STANDALONE_TESTS', 'languageCodeForHomeLanguage',
    ].sort());
    expect(registry.LANGUAGE_LABELS).toEqual({ en: 'English', xh: 'isiXhosa', zu: 'isiZulu', af: 'Afrikaans' });
    expect(registry.LETTER_EVIDENCE_CODES).toEqual(['letter_sounds']);
    expect(registry.STANDALONE_TESTS).toEqual([
      {
        code: 'letter_sounds', title: 'Letter Sounds', durationSec: 60, component: 'LetterSoundsQuestion',
        instructions: '1. Tap Start to begin the 60-second timer.\n'
          + '2. The highlighted letter is the one the child is reading.\n'
          + '3. Tap Correct or Incorrect. The next letter is highlighted automatically.\n'
          + '4. Tap Back to fix a mistake.\n'
          + '5. After 10 wrong in a row, the test stops.',
      },
      {
        code: 'word_reading', title: 'Word Reading', durationSec: 60, component: 'ReadWordsQuestion',
        instructions: '1. Tap Start to begin the 60-second timer.\n'
          + '2. The highlighted word is the one the child is reading.\n'
          + '3. Tap Correct or Incorrect. The next word is highlighted automatically.\n'
          + '4. Tap Back to fix a mistake.',
      },
    ]);
    for (const test of registry.STANDALONE_TESTS) {
      for (const language of ['en', 'xh']) {
        expect(CURRENT_ITEM_SETS[test.code][language]).toMatchObject({
          question_code: test.code, language,
          item_set_id: `${test.code}@${CURRENT_ITEM_SETS[test.code][language].question_version}.${language}`,
        });
      }
      expect(CURRENT_ITEM_SETS[test.code].zu).toBeUndefined();
    }
  });

  test('preserves the exact teaching orders under codes, with no unsupported-language substitution', () => {
    expect(registry.PEDAGOGICAL_ORDERS).toEqual({
      en: ['a','m','s','t','n','i','p','c','f','d','h','o','r','b','l','k','e','g','w','v','u','j','y','z','q','x'],
      xh: ['a','e','i','o','u','b','l','m','k','p','s','h','z','n','d','y','f','w','v','x','g','t','q','r','c','j'],
      af: ['a','s','m','e','k','i','r','o','n','t','d','l','p','u','b','g','h','v','w','y','f','j','c','z','x','q'],
    });
    expect(registry.PEDAGOGICAL_ORDERS.zu).toBeUndefined();
    expect(registry.PEDAGOGICAL_ORDERS[null]).toBeUndefined();
  });

  test('every tracker order is a–z once, has a stored label, and the Afrikaans order is frozen', () => {
    for (const [code, order] of Object.entries(registry.PEDAGOGICAL_ORDERS)) {
      expect([...order].sort().join('')).toBe('abcdefghijklmnopqrstuvwxyz');
      expect(typeof registry.LANGUAGE_LABELS[code]).toBe('string');
    }
    expect(Object.isFrozen(registry.PEDAGOGICAL_ORDERS.af)).toBe(true);
  });

  test('every class language an EA can choose has a tracker language', () => {
    const codes = HOME_LANGUAGES.map(registry.languageCodeForHomeLanguage);
    expect(codes).toEqual(['xh', 'en', 'af']);
    for (const code of codes) expect(registry.PEDAGOGICAL_ORDERS[code]).toHaveLength(26);
  });
});
