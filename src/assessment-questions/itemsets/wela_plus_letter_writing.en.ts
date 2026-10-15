import type { ItemSet } from '../types/ItemSet';
import type { LetterWritingFromPicturesItemSet } from '../questions/LetterWritingFromPicturesQuestion/types';

const LETTERS = 'afkoswbglptxchmquydinrvzej'.split('');
const NAMES = [
  'apple',
  'fish',
  'key',
  'orange',
  'sun',
  'whale',
  'bed',
  'gate',
  'leaf',
  'pot',
  'table',
  'x (figure behind sign)',
  'cat',
  'hat',
  'moon',
  'queen',
  'umbrella',
  'yo-yo',
  'dog',
  'insect',
  'net',
  'ring',
  'van',
  'zebra',
  'elephant',
  'jacket',
];

export const WELA_PLUS_LETTER_WRITING_EN: ItemSet<LetterWritingFromPicturesItemSet> = {
  item_set_id: 'wela_plus_letter_writing@2024.1.en',
  question_code: 'wela_plus_letter_writing',
  question_version: '2024.1',
  language: 'en',
  itemsPerPage: 26,
  columns: 6,
  prompts: LETTERS.map((letter, index) => ({
    item_key: letter,
    expected_letter: letter,
    picture: { source: null, alt: NAMES[index] },
  })),
};
