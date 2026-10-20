import * as S from '../itemsets/index';
import { CONTENT_PENDING } from '../itemsets/contentStatus';
import { render, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { ReadWordsQuestion } from '../index';

const { CURRENT_ITEM_SETS, ...bundledSets } = S;
const all = Object.values(bundledSets) as Array<Record<string, any>>;

test('every bundled item set has its expected version and identity', () => {
  expect(all).toHaveLength(24);
  const current = Object.values(CURRENT_ITEM_SETS).flatMap(Object.values);
  for (const s of all) {
    const version = current.some((itemSet) => itemSet === s) ? '2026.1' : '2024.1';
    expect(s.question_version).toBe(version);
    expect(s.item_set_id).toBe(`${s.question_code}@${version}.${s.language}`);
    expect(['en', 'xh']).toContain(s.language);
  }
});

const count = {
  letters: (s: any) => s.rows.flat().length,
  words: (s: any) => s.words.length,
  sentenceWords: (s: any) => s.sentences.reduce((n: number, x: any) => n + x.words.length, 0),
  cvcLetters: (s: any) => s.words.reduce((n: number, w: any) => n + w.letters.length, 0),
};

test.each([
  ['LETTER_SOUNDS_2026_1_EN', count.letters, 60], ['LETTER_SOUNDS_2026_1_XH', count.letters, 60],
  ['WORD_READING_2026_1_EN', count.words, 50], ['WORD_READING_2026_1_XH', count.words, 50],
  ['WELA_PLUS_READ_WORDS_EN', count.words, 40], ['WELA_PLUS_READ_WORDS_XH', count.words, 40],
  ['WELA_PLUS_READ_SENTENCES_EN', count.sentenceWords, 20], ['WELA_PLUS_READ_SENTENCES_XH', count.sentenceWords, 11],
  ['WELA_PLUS_READ_PASSAGE_EN', count.words, 80], ['WELA_PLUS_READ_PASSAGE_XH', count.words, 45],
  ['WELA_PLUS_WRITE_CVCS_EN', count.cvcLetters, 12], ['WELA_PLUS_WRITE_CVCS_XH', count.cvcLetters, 18],
  ['WELA_PLUS_WRITE_SENTENCES_DICTATION_EN', count.sentenceWords, 15], ['WELA_PLUS_WRITE_SENTENCES_DICTATION_XH', count.sentenceWords, 9],
])('%s max score', (name, fn, expected) => {
  expect(fn((S as any)[name])).toBe(expected);
});

test('fixed-size Questions', () => {
  for (const l of ['EN', 'XH']) {
    expect((S as any)[`WELA_PLUS_FIRST_SOUND_${l}`].prompts).toHaveLength(10);
    expect((S as any)[`WELA_PLUS_PHONEME_BLEND_${l}`].prompts).toHaveLength(8);
    expect((S as any)[`WELA_PLUS_LISTEN_AND_ANSWER_STORY_${l}`].questions).toHaveLength(5);
    expect((S as any)[`WELA_PLUS_STORY_WRITING_${l}`].dimensions.map((d: any) => d.code)).toEqual(['meaning_making', 'spelling', 'length', 'vocabulary']);
    const lw = (S as any)[`WELA_PLUS_LETTER_WRITING_${l}`];
    expect(lw.prompts.map((p: any) => p.expected_letter).join('')).toBe('afkoswbglptxchmquydinrvzej');
    expect(lw.columns).toBe(6);
  }
});

test.each([S.WELA_PLUS_STORY_WRITING_EN, S.WELA_PLUS_STORY_WRITING_XH])(
  '$item_set_id uses the interim 1–4 rubric with empty anchors', (itemSet) => {
    expect(itemSet.score_range).toEqual({ min: 1, max: 4 });
    expect(itemSet.dimensions.every((d) => d.anchors.length === 0)).toBe(true);
  },
);

test('isiXhosa Q9 scores every letter of each full word in numbered order', () => {
  expect(S.WELA_PLUS_WRITE_CVCS_XH.words.map((w) => [w.word, w.letters])).toEqual([
    ['lala', ['l', 'a', 'l', 'a']],
    ['sela', ['s', 'e', 'l', 'a']],
    ['imali', ['i', 'm', 'a', 'l', 'i']],
    ['idolo', ['i', 'd', 'o', 'l', 'o']],
  ]);
});

test('isiXhosa Q5 picture names match the scoring grid, including the clock for x', () => {
  expect(S.WELA_PLUS_LETTER_WRITING_XH.prompts.map((p) => p.picture.alt)).toEqual([
    'i-apile (apple)', 'ufudo (tortoise)', 'ikati (cat)', 'i-orenji (orange)', 'isonka (bread)', 'iwatchi (watch)',
    'ubisi (milk)', 'drum', 'ilanga (sun)', 'i-pere (pear)', 'itafile (table)', 'ixesha (clock)',
    'icephe (spoon)', 'ihagu (pig)', 'imoto (car)', 'iqanda (egg)', 'umthi (tree)', 'iyeza (medicine)',
    'idada (duck)', 'inja (dog)', 'nest', 'iroboti (traffic light)', 'ivani (van)', 'axe',
    'i-emele (bucket)', 'ijug (jug)',
  ]);
});

test('card layouts', () => {
  expect(S.LETTER_SOUNDS_2026_1_EN.rows.map((row) => row.length)).toEqual([12, 12, 12, 12, 12]);
  expect(S.LETTER_SOUNDS_2026_1_XH.rows.map((row) => row.length)).toEqual([12, 12, 12, 12, 12]);
  expect(S.WELA_PLUS_READ_WORDS_EN.row_lengths).toEqual([7, 7, 7, 7, 7, 5]);
  expect(S.WELA_PLUS_READ_WORDS_XH.row_lengths).toEqual([7, 7, 7, 7, 7, 5]);
  expect(S.WELA_PLUS_READ_PASSAGE_EN.paragraph_starts).toEqual([0, 24, 40, 66]);
});

test('EN and XH Q1 rows match the 2024 handouts', () => {
  expect(S.LETTER_SOUNDS_2026_1_EN.rows[0].join(' ')).toBe('a n i t m s p e b c i u');
  expect(S.LETTER_SOUNDS_2026_1_XH.rows[4].join(' ')).toBe('u z x r v b j b q u r g');
});

test('language="xh" without an override renders isiXhosa content', () => {
  const r = render(<ReadWordsQuestion language="xh" instructions="." onComplete={jest.fn()} />);
  fireEvent.press(r.getByText('Start'));
  expect(r.getByLabelText('inja, idle')).toBeTruthy();
});

test('pending content lists exactly the remaining picture, rubric, language-review, letter-card, and word-list work', () => {
  expect(CONTENT_PENDING).toEqual([
    { item_set_id: 'wela_plus_letter_writing@2024.1.xh', field: 'prompts.picture', note: 'Masi team to choose better pictures for g (drum), n (nest) and z (axe) and supply their isiXhosa names; draw new clock artwork for x (ixesha).' },
    { item_set_id: 'wela_plus_story_writing@2024.1.en', field: 'dimensions.anchors', note: 'Interim scale: score each dimension 1–4 with no anchor descriptions. The rubric is expected to be redesigned.' },
    { item_set_id: 'wela_plus_story_writing@2024.1.xh', field: 'dimensions.anchors', note: 'Interim scale: score each dimension 1–4 with no anchor descriptions; isiXhosa labels still needed. The rubric is expected to be redesigned.' },
    { item_set_id: 'all@2024.1.xh', field: 'strings', note: 'First-language review of every isiXhosa string.' },
    { item_set_id: 'letter_sounds@2026.1.en', field: 'rows', note: 'Masi team to supply the mixed-case single-letter list and card layout (rows of 10 or fewer; a typeface where I and l differ).' },
    { item_set_id: 'letter_sounds@2026.1.xh', field: 'rows', note: 'Masi team to supply the mixed-case single-letter list and card layout (rows of 10 or fewer; a typeface where I and l differ).' },
    { item_set_id: 'word_reading@2026.1.en', field: 'words', note: 'Placeholder word lists — replace with real EGRA word lists.' },
    { item_set_id: 'word_reading@2026.1.xh', field: 'words', note: 'Placeholder word lists — replace with real EGRA word lists.' },
  ]);
});
