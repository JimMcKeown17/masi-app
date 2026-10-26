import * as registry from '../src/utils/assessmentRegistry';
import { CURRENT_ITEM_SETS, sharedInstructionsFor } from '../src/assessment-questions';
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
      'STANDALONE_TESTS', 'languageCodeForHomeLanguage', 'languageList',
    ].sort());
    expect(registry.LANGUAGE_LABELS).toEqual({ en: 'English', xh: 'isiXhosa', zu: 'isiZulu', af: 'Afrikaans' });
    expect(registry.LETTER_EVIDENCE_CODES).toEqual(['letter_sounds']);
    expect(registry.STANDALONE_TESTS).toEqual([
      {
        code: 'letter_sounds', title: 'Letter Sounds', durationSec: 60, component: 'LetterSoundsQuestion',
        instructions: Object.fromEntries(['xh', 'en', 'af', 'zu'].map(language =>
          [language, sharedInstructionsFor('letter_sounds', language)])),
      },
      {
        code: 'word_reading', title: 'Word Reading', durationSec: 60, component: 'ReadWordsQuestion',
        instructions: Object.fromEntries(['xh', 'en', 'af', 'zu'].map(language =>
          [language, sharedInstructionsFor('word_reading', language)])),
      },
    ]);
    for (const test of registry.STANDALONE_TESTS) {
      for (const language of ['xh', 'en', 'af', 'zu']) {
        expect(CURRENT_ITEM_SETS[test.code][language]).toMatchObject({
          question_code: test.code, language, question_version: '2026.3',
          item_set_id: `${test.code}@${CURRENT_ITEM_SETS[test.code][language].question_version}.${language}`,
        });
      }
      for (const text of Object.values(test.instructions)) {
        expect(typeof text).toBe('string');
        expect(text).not.toMatch(/1\. Tap Start|10 wrong in a row/);
      }
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
    for (const code of codes) {
      expect(registry.PEDAGOGICAL_ORDERS[code]).toHaveLength(26);
      expect(CURRENT_ITEM_SETS.letter_sounds[code]).toBeDefined();
      expect(CURRENT_ITEM_SETS.word_reading[code]).toBeDefined();
    }
  });
});

test.each(['letter_sounds', 'word_reading'])('fails at load if %s shared instructions are missing', code => {
  jest.isolateModules(() => {
    jest.doMock('../src/assessment-questions', () => ({
      sharedInstructionsFor: (questionCode, language) =>
        questionCode === code && language === 'zu' ? null : 'shared instructions',
    }));
    expect(() => require('../src/utils/assessmentRegistry')).toThrow(`${code}/zu`);
  });
  jest.dontMock('../src/assessment-questions');
});
