import type { ItemSet } from '../types/ItemSet';
import type { LetterWritingFromPicturesItemSet } from '../questions/LetterWritingFromPicturesQuestion/types';

const LETTERS = 'afkoswbglptxchmquydinrvzej'.split('');
const NAMES = [
  'i-apile (apple)',
  'ufudo (tortoise)',
  'ikati (cat)',
  'orange',
  'bread',
  'face',
  'milk',
  'drum',
  'sun',
  'pear',
  'table',
  'x (no picture)',
  'spoon',
  'pig',
  'car',
  'egg',
  'tree',
  'medicine',
  'duck',
  'dog',
  'nest',
  'traffic light',
  'van',
  'axe',
  'bucket',
  'jug',
];

export const WELA_PLUS_LETTER_WRITING_XH: ItemSet<LetterWritingFromPicturesItemSet> = {
  item_set_id: 'wela_plus_letter_writing@2024.1.xh',
  question_code: 'wela_plus_letter_writing',
  question_version: '2024.1',
  language: 'xh',
  itemsPerPage: 26,
  columns: 6,
  prompts: LETTERS.map((letter, index) => ({
    item_key: letter,
    expected_letter: letter,
    picture: { source: null, alt: NAMES[index] },
  })),
};
