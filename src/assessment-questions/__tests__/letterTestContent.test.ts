import { CURRENT_ITEM_SETS } from '../itemsets/current';
import { WELA_PLUS_FULL_2024_1 } from '../battery/wela_plus_full';
import * as Package from '../index';
import type { LetterSoundsItemSet, StopRule } from '../index';

const LANGUAGES = ['en', 'xh'] as const;
const STOP_RULE: StopRule = { kind: 'consecutive_wrong', stop_at: 10 };
const GRID_A_ROWS = [
  'l a m E p n L s o e',
  'Y i K N d H f U b v',
  'F y C I T k D Z f d',
  't z O J P r c W p o',
  'w A E x Q I g O U z',
  'X r V B j h q u R G',
];
const WORDS = {
  en: [
    'the', 'and', 'is', 'it', 'to', 'in', 'he', 'was', 'on', 'at',
    'his', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'one', 'our',
    'out', 'day', 'get', 'has', 'him', 'how', 'its', 'may', 'new', 'now',
    'old', 'see', 'two', 'way', 'who', 'did', 'let', 'say', 'she', 'too',
    'any', 'big', 'end', 'far', 'got', 'hand', 'help', 'just', 'long', 'make',
  ],
  xh: [
    'inja', 'amanzi', 'umama', 'ubaba', 'indlu', 'isikolo', 'umntana', 'inkomo', 'intaka', 'ilanga',
    'inyoka', 'imbali', 'isisu', 'ubuso', 'umlomo', 'amehlo', 'indlela', 'isango', 'ilitye', 'umthi',
    'inkwenkwe', 'intombi', 'inyama', 'isonka', 'ubisi', 'itafile', 'isitulo', 'incwadi', 'ipensile', 'ibhola',
    'ikatsu', 'inguruma', 'isiketi', 'ibhatyi', 'ihempe', 'ibhulukhwe', 'umnqwazi', 'izihlangu', 'unyawo', 'isandla',
    'indlebe', 'impumlo', 'intloko', 'amadolo', 'imilenze', 'iminwe', 'amazinyo', 'ulwimi', 'isikhalo', 'uthando',
  ],
};

describe.each(LANGUAGES)('letter_sounds Grid A content (%s)', (language) => {
  test('every item is a single Unicode letter', () => {
    const itemSet: LetterSoundsItemSet = CURRENT_ITEM_SETS.letter_sounds[language];
    for (const letter of itemSet.rows.flat()) {
      expect(letter).toMatch(/^\p{L}$/u);
    }
  });

  test('has the six printed rows of ten letters', () => {
    const { rows } = CURRENT_ITEM_SETS.letter_sounds[language];
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row).toHaveLength(10);
    }
    expect(rows.map((row) => row.join(' '))).toEqual(GRID_A_ROWS);
  });

  test('the item-set id matches its code, version, and language', () => {
    const itemSet = CURRENT_ITEM_SETS.letter_sounds[language];
    expect(itemSet.question_code).toBe('letter_sounds');
    expect(itemSet.question_version).toBe('2026.2');
    expect(itemSet.item_set_id).toBe(
      `${itemSet.question_code}@${itemSet.question_version}.${itemSet.language}`,
    );
    expect(itemSet).not.toHaveProperty('columns');
    expect(itemSet).not.toHaveProperty('letters');
  });

  test('uses the requested supported language code', () => {
    const itemSet = CURRENT_ITEM_SETS.letter_sounds[language];
    expect(['en', 'xh', 'zu']).toContain(itemSet.language);
    expect(itemSet.language).toBe(language);
  });

  test('stops after ten consecutive wrong decisions', () => {
    expect(CURRENT_ITEM_SETS.letter_sounds[language].stop_rule).toEqual(STOP_RULE);
  });

  test('the battery Q1 uses the same Question code and version', () => {
    const itemSet = CURRENT_ITEM_SETS.letter_sounds[language];
    expect(WELA_PLUS_FULL_2024_1.questions[0]).toMatchObject({
      question_code: itemSet.question_code,
      question_version: itemSet.question_version,
    });
  });
});

test('English and isiXhosa use the same Grid A rows and cover all 26 letters case-insensitively', () => {
  const { en, xh } = CURRENT_ITEM_SETS.letter_sounds;
  expect(en.rows).toBe(xh.rows);
  expect(en.rows).toEqual(xh.rows);
  expect(new Set(en.rows.flat().map((letter) => letter.toLowerCase())).size).toBe(26);
});

test.each(LANGUAGES)('word_reading (%s) preserves all fifty placeholder words in order', (language) => {
  const itemSet = CURRENT_ITEM_SETS.word_reading[language];
  expect(itemSet).toMatchObject({
    item_set_id: `word_reading@2026.1.${language}`,
    question_code: 'word_reading',
    question_version: '2026.1',
    language,
  });
  expect(itemSet.words).toHaveLength(50);
  expect(itemSet.words).toEqual(
    WORDS[language].map((word, index) => ({ item_key: String(index), word })),
  );
  expect(itemSet.row_lengths).toEqual([5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
  expect(itemSet).not.toHaveProperty('stop_rule');
});

test('the package exports the current registry and old and new versioned sets', () => {
  expect(Package.CURRENT_ITEM_SETS).toBe(CURRENT_ITEM_SETS);
  expect(Object.keys(CURRENT_ITEM_SETS)).toEqual(['letter_sounds', 'word_reading']);
  expect(Object.keys(CURRENT_ITEM_SETS.letter_sounds)).toEqual(['en', 'xh']);
  expect(Object.keys(CURRENT_ITEM_SETS.word_reading)).toEqual(['en', 'xh']);
  expect(Package.LETTER_SOUNDS_2026_2_EN).toBe(CURRENT_ITEM_SETS.letter_sounds.en);
  expect(Package.LETTER_SOUNDS_2026_2_XH).toBe(CURRENT_ITEM_SETS.letter_sounds.xh);
  expect(Package.LETTER_SOUNDS_2026_1_EN.question_version).toBe('2026.1');
  expect(Package.LETTER_SOUNDS_2026_1_XH.question_version).toBe('2026.1');
  expect(Package.WORD_READING_2026_1_EN).toBe(CURRENT_ITEM_SETS.word_reading.en);
  expect(Package.WORD_READING_2026_1_XH).toBe(CURRENT_ITEM_SETS.word_reading.xh);
});

test('battery Q1 uses the exact new instructions in both languages', () => {
  for (const language of LANGUAGES) {
    expect(WELA_PLUS_FULL_2024_1.questions[0].instructions?.[language]).toBe(
      'Hand the child Reading Card side A. Point to each letter and ask the child for its sound. Mark each letter Correct or Incorrect. The test stops by itself after 10 wrong in a row. Otherwise STOP at 1 minute.',
    );
  }
});
