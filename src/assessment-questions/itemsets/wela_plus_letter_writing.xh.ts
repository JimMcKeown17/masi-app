import type { ItemSet } from '../types/ItemSet';
import type { LetterWritingFromPicturesItemSet } from '../questions/LetterWritingFromPicturesQuestion/types';

const LETTERS = 'afkoswbglptxchmquydinrvzej'.split('');
const NAMES = [
  'i-apile (apple)',
  'ufudo (tortoise)',
  'ikati (cat)',
  'i-orenji (orange)',
  'isonka (bread)',
  'iwatchi (watch)',
  'ubisi (milk)',
  'drum',
  'ilanga (sun)',
  'i-pere (pear)',
  'itafile (table)',
  'ixesha (clock)',
  'icephe (spoon)',
  'ihagu (pig)',
  'imoto (car)',
  'iqanda (egg)',
  'umthi (tree)',
  'iyeza (medicine)',
  'idada (duck)',
  'inja (dog)',
  'nest',
  'iroboti (traffic light)',
  'ivani (van)',
  'axe',
  'i-emele (bucket)',
  'ijug (jug)',
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
