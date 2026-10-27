import { getEgraAssessment } from '../../../../content/egra';
import { adaptEgraForm, timedInstructions } from '../adapter';
import { EGRA_BATTERIES } from '..';
import { bundledItemSetFor } from '../../battery/bundledItemSets';
import { WELA_PLUS_FULL_2024_1 } from '../../battery/wela_plus_full';
import { markingSentence } from '../../battery/markingSentence';
import {
  SHARED_READING_VERSION, SHARED_READING_FORMS, SHARED_READING_SETS,
  sharedItemSetFor, sharedInstructionsFor,
} from '../sharedReading';

const languages = ['xh', 'en', 'af', 'zu'] as const;
const codes = ['letter_sounds', 'word_reading', 'oral_reading', 'reading_comprehension'] as const;
const expectedForms = {
  xh: { letters: 'dbe-egra-xh-hl-3-v1', reading: 'dbe-egra-xh-hl-1-v1' },
  en: { letters: 'dbe-egra-en-hl-3-v1', reading: 'dbe-egra-en-hl-1-v1' },
  af: { letters: 'dbe-egra-af-hl-3-v1', reading: 'dbe-egra-af-hl-1-v1' },
  zu: { letters: 'smrs-egra-zu-1-v1', reading: 'smrs-egra-zu-1-v1' },
};

// Literal identities captured by running bundledItemSetFor on the unmodified code.
const legacy: {
  batteries: Array<{ version: string; languages: Record<string, string[]> }>;
  quick: Array<{ language: string; ids: Array<string | null> }>;
} = {
  "batteries": [
    {
      "version": "2024.1",
      "languages": {
        "en": [
          "letter_sounds@2026.2.en",
          "wela_plus_listen_and_answer_story@2024.1.en",
          "wela_plus_first_sound@2024.1.en",
          "wela_plus_phoneme_blend@2024.1.en",
          "wela_plus_letter_writing@2024.1.en",
          "wela_plus_read_words@2024.1.en",
          "wela_plus_read_sentences@2024.1.en",
          "wela_plus_read_passage@2024.1.en",
          "wela_plus_write_cvcs@2024.1.en",
          "wela_plus_write_sentences_dictation@2024.1.en",
          "wela_plus_story_writing@2024.1.en"
        ],
        "xh": [
          "letter_sounds@2026.2.xh",
          "wela_plus_listen_and_answer_story@2024.1.xh",
          "wela_plus_first_sound@2024.1.xh",
          "wela_plus_phoneme_blend@2024.1.xh",
          "wela_plus_letter_writing@2024.1.xh",
          "wela_plus_read_words@2024.1.xh",
          "wela_plus_read_sentences@2024.1.xh",
          "wela_plus_read_passage@2024.1.xh",
          "wela_plus_write_cvcs@2024.1.xh",
          "wela_plus_write_sentences_dictation@2024.1.xh",
          "wela_plus_story_writing@2024.1.xh"
        ]
      }
    },
    {
      "version": "dbe-egra-xh-hl-1-v1",
      "languages": {
        "xh": [
          "letter_sounds@dbe-egra-xh-hl-1-v1-masi60.xh",
          "word_reading@dbe-egra-xh-hl-1-v1.xh",
          "oral_reading@dbe-egra-xh-hl-1-v1.xh",
          "reading_comprehension@dbe-egra-xh-hl-1-v1.xh"
        ]
      }
    },
    {
      "version": "dbe-egra-xh-hl-2-v1",
      "languages": {
        "xh": [
          "letter_sounds@dbe-egra-xh-hl-2-v1.xh",
          "word_reading@dbe-egra-xh-hl-2-v1.xh",
          "oral_reading@dbe-egra-xh-hl-2-v1.xh",
          "reading_comprehension@dbe-egra-xh-hl-2-v1.xh"
        ]
      }
    },
    {
      "version": "dbe-egra-xh-hl-3-v1",
      "languages": {
        "xh": [
          "letter_sounds@dbe-egra-xh-hl-3-v1.xh",
          "word_reading@dbe-egra-xh-hl-3-v1.xh",
          "oral_reading@dbe-egra-xh-hl-3-v1.xh",
          "reading_comprehension@dbe-egra-xh-hl-3-v1.xh"
        ]
      }
    },
    {
      "version": "dbe-egra-en-hl-1-v1",
      "languages": {
        "en": [
          "letter_sounds@dbe-egra-en-hl-1-v1-masi60.en",
          "word_reading@dbe-egra-en-hl-1-v1.en",
          "oral_reading@dbe-egra-en-hl-1-v1.en",
          "reading_comprehension@dbe-egra-en-hl-1-v1.en"
        ]
      }
    },
    {
      "version": "dbe-egra-en-hl-2-v1",
      "languages": {
        "en": [
          "letter_sounds@dbe-egra-en-hl-2-v1.en",
          "word_reading@dbe-egra-en-hl-2-v1.en",
          "oral_reading@dbe-egra-en-hl-2-v1.en",
          "reading_comprehension@dbe-egra-en-hl-2-v1.en"
        ]
      }
    },
    {
      "version": "dbe-egra-en-hl-3-v1",
      "languages": {
        "en": [
          "letter_sounds@dbe-egra-en-hl-3-v1.en",
          "word_reading@dbe-egra-en-hl-3-v1.en",
          "oral_reading@dbe-egra-en-hl-3-v1.en",
          "reading_comprehension@dbe-egra-en-hl-3-v1.en"
        ]
      }
    },
    {
      "version": "dbe-egra-en-fal-1-v1",
      "languages": {
        "en": [
          "letter_sounds@dbe-egra-en-fal-1-v1-masi60.en",
          "word_reading@dbe-egra-en-fal-1-v1.en",
          "oral_reading@dbe-egra-en-fal-1-v1.en",
          "reading_comprehension@dbe-egra-en-fal-1-v1.en"
        ]
      }
    },
    {
      "version": "dbe-egra-en-fal-2-v1",
      "languages": {
        "en": [
          "letter_sounds@dbe-egra-en-fal-2-v1.en",
          "word_reading@dbe-egra-en-fal-2-v1.en",
          "oral_reading@dbe-egra-en-fal-2-v1.en",
          "reading_comprehension@dbe-egra-en-fal-2-v1.en"
        ]
      }
    },
    {
      "version": "dbe-egra-en-fal-3-v1",
      "languages": {
        "en": [
          "letter_sounds@dbe-egra-en-fal-3-v1.en",
          "word_reading@dbe-egra-en-fal-3-v1.en",
          "oral_reading@dbe-egra-en-fal-3-v1.en",
          "reading_comprehension@dbe-egra-en-fal-3-v1.en"
        ]
      }
    },
    {
      "version": "dbe-egra-af-hl-1-v1",
      "languages": {
        "af": [
          "letter_sounds@dbe-egra-af-hl-1-v1-masi60.af",
          "word_reading@dbe-egra-af-hl-1-v1.af",
          "oral_reading@dbe-egra-af-hl-1-v1.af",
          "reading_comprehension@dbe-egra-af-hl-1-v1.af"
        ]
      }
    },
    {
      "version": "dbe-egra-af-hl-2-v1",
      "languages": {
        "af": [
          "letter_sounds@dbe-egra-af-hl-2-v1.af",
          "word_reading@dbe-egra-af-hl-2-v1.af",
          "oral_reading@dbe-egra-af-hl-2-v1.af",
          "reading_comprehension@dbe-egra-af-hl-2-v1.af"
        ]
      }
    },
    {
      "version": "dbe-egra-af-hl-3-v1",
      "languages": {
        "af": [
          "letter_sounds@dbe-egra-af-hl-3-v1.af",
          "word_reading@dbe-egra-af-hl-3-v1.af",
          "oral_reading@dbe-egra-af-hl-3-v1.af",
          "reading_comprehension@dbe-egra-af-hl-3-v1.af"
        ]
      }
    },
    {
      "version": "smrs-egra-zu-1-v1",
      "languages": {
        "zu": [
          "letter_sounds@smrs-egra-zu-1-v1.zu",
          "word_reading@smrs-egra-zu-1-v1.zu",
          "oral_reading@smrs-egra-zu-1-v1.zu",
          "reading_comprehension@smrs-egra-zu-1-v1.zu"
        ]
      }
    }
  ],
  "quick": [
    {
      "language": "en",
      "ids": [
        "letter_sounds@2026.2.en",
        "word_reading@2026.1.en",
        "letter_sounds@2026.1.en"
      ]
    },
    {
      "language": "xh",
      "ids": [
        "letter_sounds@2026.2.xh",
        "word_reading@2026.1.xh",
        "letter_sounds@2026.1.xh"
      ]
    },
    {
      "language": "af",
      "ids": [
        "letter_sounds@2026.2.af",
        "word_reading@2026.1.af",
        null
      ]
    }
  ]
};

test.each(languages)('shared sets copy the pack exactly: %s', language => {
  expect(SHARED_READING_VERSION).toBe('2026.3');
  expect(SHARED_READING_FORMS).toEqual(expectedForms);
  const lettersForm = getEgraAssessment(expectedForms[language].letters)!;
  const readingForm = getEgraAssessment(expectedForms[language].reading)!;
  for (const code of codes) {
    const set = sharedItemSetFor(code, '2026.3', language)!;
    expect(set).toMatchObject({
      question_code: code, question_version: '2026.3', language,
      item_set_id: `${code}@2026.3.${language}`,
      source_form_id: code === 'letter_sounds' ? lettersForm.id : readingForm.id,
    });
    expect(set).toBe(SHARED_READING_SETS[code][language]);
  }
  const sets = SHARED_READING_SETS;
  expect(sets.letter_sounds[language].rows.flat()).toEqual(lettersForm.letters.items.map(i => i.text));
  expect(sets.word_reading[language].words).toEqual(readingForm.words.items.map((i, n) => ({ item_key: String(n), word: i.text })));
  expect(sets.oral_reading[language].words).toHaveLength(adaptEgraForm(readingForm).itemSets.oral_reading.words.length);
  expect(sets.oral_reading[language].words).toEqual(adaptEgraForm(readingForm).itemSets.oral_reading.words);
  expect(sets.reading_comprehension[language].passage).toBe(readingForm.passage.text);
  expect(sets.reading_comprehension[language].questions).toEqual(readingForm.comprehension.questions.map((q, n) => ({
    item_key: String(n), prompt: q.text, answer_guide: q.answerText,
  })));
});

test.each(languages)('shared shapes and no Masi extension: %s', language => {
  const letters = SHARED_READING_SETS.letter_sounds[language];
  const words = SHARED_READING_SETS.word_reading[language];
  expect(letters.rows.map(row => row.length)).toEqual(Array(language === 'zu' ? 11 : 10).fill(10));
  expect(letters.rows.flat()).toHaveLength(getEgraAssessment(expectedForms[language].letters)!.letters.items.length);
  expect(letters.stop_rule).toEqual({ kind: 'first_row_all_wrong', first_row_length: 10 });
  const columns = language === 'zu' ? 5 : 8;
  expect(words.row_lengths).toEqual(Array(10).fill(columns));
  expect(words.stop_rule).toEqual({ kind: 'first_row_all_wrong', first_row_length: columns });
});

test('bundled lookup finds shared sets with exact versions and languages only', () => {
  expect(bundledItemSetFor('word_reading', '2026.3', 'zu')).toBe(SHARED_READING_SETS.word_reading.zu);
  for (const language of languages) for (const code of codes) {
    expect(bundledItemSetFor(code, '2026.3', language)).toBe(sharedItemSetFor(code, '2026.3', language));
  }
  for (const [code, version, language] of [
    ['letter_sounds', '2026.3', 'st'], ['letter_sounds', '2026.9', 'xh'],
    ['word_reading', '2026.30', 'en'], ['oral_reading', ' 2026.3', 'af'],
    ['unknown', '2026.3', 'xh'], ['toString', '2026.3', 'en'],
    ['letter_sounds', '2026.3', 'constructor'], ['letter_sounds', '2026.3', 'EN'],
  ]) {
    expect(sharedItemSetFor(code, version, language)).toBeNull();
    expect(bundledItemSetFor(code, version, language)).toBeNull();
  }
});

test('old questions resolve only their own sets', () => {
  const batteries = [WELA_PLUS_FULL_2024_1, ...EGRA_BATTERIES];
  expect(batteries).toHaveLength(legacy.batteries.length);
  batteries.forEach((battery, index) => {
    const captured = legacy.batteries[index];
    expect(battery.battery_version).toBe(captured.version);
    expect(battery.languages).toEqual(Object.keys(captured.languages));
    for (const language of battery.languages) {
      battery.questions.forEach((question, position) => {
        const set = bundledItemSetFor(question.question_code, question.question_version, language)!;
        expect(set.question_version).toBe(question.question_version);
        expect(set.item_set_id).toBe(captured.languages[language][position]);
      });
    }
  });
  for (const { language, ids } of legacy.quick) {
    const lookups = [
      bundledItemSetFor('letter_sounds', '2026.2', language),
      bundledItemSetFor('word_reading', '2026.1', language),
      bundledItemSetFor('letter_sounds', '2026.1', language),
    ];
    expect(lookups.map(set => set?.item_set_id ?? null)).toEqual(ids);
  }
});

test.each(languages)('one instruction text per shared Question, with practice only in instructions: %s', language => {
  const letters = getEgraAssessment(expectedForms[language].letters)!.letters;
  const words = getEgraAssessment(expectedForms[language].reading)!.words;
  expect(sharedInstructionsFor('letter_sounds', language)).toBe(`Hand the child Reading Card side A. ${timedInstructions('letter sounds', letters)}`);
  expect(sharedInstructionsFor('word_reading', language)).toBe(`Hand the child Reading Card side B. ${timedInstructions('words', words)}`);
  expect(sharedInstructionsFor('oral_reading', language)).toBe(`Hand the child Reading Card side C. Ask the child to read the story aloud. ${markingSentence('word')} The test stops by itself when the time is up.`);
  expect(sharedInstructionsFor('reading_comprehension', language)).toBe(`Ask the story questions. Use the answer guide to decide. ${markingSentence('question')}`);
  for (const [code, section] of [['letter_sounds', letters], ['word_reading', words]] as const) {
    if (section.practiceItems.length) {
      expect(sharedInstructionsFor(code, language)?.endsWith(` Practice first (not scored): ${section.practiceItems.join(', ')}`)).toBe(true);
    }
  }
  // Compare positions, never filter by practice text: legitimate scored copies must remain.
  expect(SHARED_READING_SETS.letter_sounds[language].rows.flat()).toEqual(letters.items.map(i => i.text));
  expect(SHARED_READING_SETS.word_reading[language].words.map(i => i.word)).toEqual(words.items.map(i => i.text));
});

test("instruction literals for xh letters and zu words retain today's timed wording", () => {
  expect(sharedInstructionsFor('letter_sounds', 'xh')).toBe(
    "Hand the child Reading Card side A. Ask the child to read the letter sounds in order. Mark each letter Correct or Incorrect. The black ring shows which letter you're on. The test stops by itself if every letter in the first row is wrong, or when the time is up.",
  );
  expect(sharedInstructionsFor('word_reading', 'zu')).toBe(
    "Hand the child Reading Card side B. Ask the child to read the words in order. Mark each word Correct or Incorrect. The black ring shows which word you're on. The test stops by itself if every word in the first row is wrong, or when the time is up. Practice first (not scored): usisi, icici",
  );
});

test('unknown instruction codes and languages return null', () => {
  for (const [code, language] of [['unknown', 'xh'], ['letter_sounds', 'st'], ['toString', 'en'], ['oral_reading', 'constructor']]) {
    expect(sharedInstructionsFor(code, language)).toBeNull();
  }
});

test('shared sets are built once and frozen throughout', () => {
  const frozen = (value: unknown): void => {
    if (value && typeof value === 'object') {
      expect(Object.isFrozen(value)).toBe(true);
      Object.values(value).forEach(frozen);
    }
  };
  frozen(SHARED_READING_SETS);
  for (const code of codes) for (const language of languages) {
    expect(sharedItemSetFor(code, '2026.3', language)).toBe(sharedItemSetFor(code, '2026.3', language));
  }
});

test('a missing configured pack form fails loudly at module load', () => {
  jest.isolateModules(() => {
    jest.doMock('../../../../content/egra', () => ({
      ...jest.requireActual('../../../../content/egra'), getEgraAssessment: () => null,
    }));
    try {
      expect(() => require('../sharedReading')).toThrow(TypeError);
      expect(() => require('../sharedReading')).toThrow('dbe-egra-xh-hl-3-v1');
    } finally {
      jest.dontMock('../../../../content/egra');
    }
  });
});

test('shared APIs are exported through both public entry points', () => {
  const egra = require('..');
  const pkg = require('../..');
  for (const [name, value] of Object.entries({ SHARED_READING_VERSION, SHARED_READING_FORMS, SHARED_READING_SETS, sharedItemSetFor, sharedInstructionsFor, timedInstructions })) {
    expect(egra[name]).toBe(value);
    expect(pkg[name]).toBe(value);
  }
});
