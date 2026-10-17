import type { ItemSet } from '../types/ItemSet';
import type { LetterWritingFromPicturesItemSet } from '../questions/LetterWritingFromPicturesQuestion/types';

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
  'xylophone',
  'yarn',
  'zebra',
];

export const FIXTURE_LETTER_WRITING_EN: ItemSet<LetterWritingFromPicturesItemSet> = {
  item_set_id: 'wela_plus_letter_writing@fixture.en',
  question_code: 'wela_plus_letter_writing',
  question_version: 'fixture',
  language: 'en',
  itemsPerPage: 8,
  columns: 4,
  prompts: STUB_ALTS.map((alt, idx) => ({
    item_key: `q5.item_${idx + 1}`,
    picture: { source: null, alt },
    expected_letter: alt.charAt(0),
  })),
};
