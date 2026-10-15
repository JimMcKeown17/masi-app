import type { ItemSet } from '../types/ItemSet';
import type { ReadWordsItemSet } from '../questions/ReadWordsQuestion/types';

export const WELA_PLUS_READ_WORDS_EN: ItemSet<ReadWordsItemSet> = {
  item_set_id: 'wela_plus_read_words@2024.1.en',
  question_code: 'wela_plus_read_words',
  question_version: '2024.1',
  language: 'en',
  row_lengths: [7, 7, 7, 7, 7, 5],
  words: 'the and in of be run bus not are we like can but an have that for what was your why there how there how come with my up green box happy play every week farm table boy new old'.split(' ').map((word) => ({ item_key: word, word })),
};
