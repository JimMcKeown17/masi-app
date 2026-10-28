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
      'LANGUAGE_LABELS', 'LETTER_EVIDENCE_CODES', 'TRACKER_LETTERS',
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

  test('tracker letters are alphabetical under language codes without unsupported-language substitution', () => {
    expect(registry.TRACKER_LETTERS).toEqual({
      en: [...'abcdefghijklmnopqrstuvwxyz'],
      xh: [...'abcdefghijklmnopqrstuvwxyz'],
      af: [...'abcdefghijklmnopqrstuvwxyz'],
    });
    expect(registry.TRACKER_LETTERS.zu).toBeUndefined();
    expect(registry.TRACKER_LETTERS[null]).toBeUndefined();
  });

  test('the tracker letter map and every language set are frozen', () => {
    expect(Object.isFrozen(registry.TRACKER_LETTERS)).toBe(true);
    for (const [code, letters] of Object.entries(registry.TRACKER_LETTERS)) {
      expect(letters.join('')).toBe('abcdefghijklmnopqrstuvwxyz');
      expect(typeof registry.LANGUAGE_LABELS[code]).toBe('string');
      expect(Object.isFrozen(letters)).toBe(true);
    }
  });

  test('every class language an EA can choose has a tracker language', () => {
    const codes = HOME_LANGUAGES.map(registry.languageCodeForHomeLanguage);
    expect(codes).toEqual(['xh', 'en', 'af']);
    for (const code of codes) {
      expect(registry.TRACKER_LETTERS[code]).toHaveLength(26);
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
