import type { ItemSet } from '../types/ItemSet';
import type { LetterWritingFromPicturesItemSet } from '../questions/LetterWritingFromPicturesQuestion/types';

// PLACEHOLDER content — English used until pedagogy supplies isiXhosa via #34.
const STUB_ALTS = [
  'apple',
  'ball',
  'cat',
  'dog',
  'egg',
  'frog',
  'goat',
  'hat',
  'ink',
  'jug',
  'kite',
  'log',
  'mug',
  'nut',
  'orange',
  'pig',
  'queen',
  'rat',
  'sun',
  'top',
  'umbrella',
  'van',
  'web',
  'box',
  'yarn',
  'zebra',
];

export const WELA_PLUS_LETTER_WRITING_XH: ItemSet<LetterWritingFromPicturesItemSet> = {
  item_set_id: 'wela_plus_letter_writing@stub-2026-06-04.xh',
  question_code: 'wela_plus_letter_writing',
  question_version: 'stub-2026-06-04',
  language: 'xh',
  itemsPerPage: 8,
  columns: 4,
  prompts: STUB_ALTS.map((alt, idx) => ({
    item_key: `q5.item_${idx + 1}`,
    picture: { source: null, alt },
    expected_letter: alt.charAt(0),
  })),
};
