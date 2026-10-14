import type { ItemSet } from '../types/ItemSet';
import type { WriteCvcsItemSet } from '../questions/WriteCvcsQuestion/types';

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

export const FIXTURE_WRITE_CVCS_EN: ItemSet<WriteCvcsItemSet> = {
  item_set_id: 'wela_plus_write_cvcs@fixture.en',
  question_code: 'wela_plus_write_cvcs',
  question_version: 'fixture',
  language: 'en',
  prompts: STUB_WORDS.map((word, idx) => ({
    item_key: `q9.item_${idx + 1}`,
    word,
  })),
};
