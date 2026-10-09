import type { ItemSet } from '../types/ItemSet';
import type { WriteCvcsItemSet } from '../questions/WriteCvcsQuestion/types';

// PLACEHOLDER content — 12 stub CVCs; real WelaPLUS words land in #34.
const STUB_WORDS = [
  'cat',
  'dog',
  'sun',
  'pig',
  'run',
  'big',
  'red',
  'top',
  'man',
  'hat',
  'cup',
  'log',
];

export const WELA_PLUS_WRITE_CVCS_EN: ItemSet<WriteCvcsItemSet> = {
  item_set_id: 'wela_plus_write_cvcs@stub-2026-06-04.en',
  question_code: 'wela_plus_write_cvcs',
  question_version: 'stub-2026-06-04',
  language: 'en',
  prompts: STUB_WORDS.map((word, idx) => ({
    item_key: `q9.item_${idx + 1}`,
    word,
  })),
};
