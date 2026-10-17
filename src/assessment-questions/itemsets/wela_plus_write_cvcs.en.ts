import type { ItemSet } from '../types/ItemSet';
import type { WriteCvcsItemSet } from '../questions/WriteCvcsQuestion/types';

export const WELA_PLUS_WRITE_CVCS_EN: ItemSet<WriteCvcsItemSet> = {
  item_set_id: 'wela_plus_write_cvcs@2024.1.en',
  question_code: 'wela_plus_write_cvcs',
  question_version: '2024.1',
  language: 'en',
  words: [
    { item_key: 'w1', word: 'jam', letters: ['j', 'a', 'm'] },
    { item_key: 'w2', word: 'hut', letters: ['h', 'u', 't'] },
    { item_key: 'w3', word: 'fin', letters: ['f', 'i', 'n'] },
    { item_key: 'w4', word: 'net', letters: ['n', 'e', 't'] },
  ],
};
