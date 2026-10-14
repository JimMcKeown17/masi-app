import type { ItemSet } from '../types/ItemSet';
import type { WriteCvcsItemSet } from '../questions/WriteCvcsQuestion/types';

export const FIXTURE_WRITE_CVCS_EN: ItemSet<WriteCvcsItemSet> = {
  item_set_id: 'wela_plus_write_cvcs@fixture.en',
  question_code: 'wela_plus_write_cvcs',
  question_version: 'fixture',
  language: 'en',
  words: [
    { item_key: 'w1', word: 'jam', letters: ['j', 'a', 'm'] },
    { item_key: 'w2', word: 'hut', letters: ['h', 'u', 't'] },
    { item_key: 'w3', word: 'fin', letters: ['f', 'i', 'n'] },
    { item_key: 'w4', word: 'net', letters: ['n', 'e', 't'] },
  ],
};
