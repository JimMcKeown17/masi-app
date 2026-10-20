import type { ItemSet } from '../types/ItemSet';
import type { ReadWordsItemSet } from '../questions/ReadWordsQuestion/types';

export const WORD_READING_2026_1_EN: ItemSet<ReadWordsItemSet> = {
  item_set_id: 'word_reading@2026.1.en',
  question_code: 'word_reading',
  question_version: '2026.1',
  language: 'en',
  row_lengths: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  words: [
    'the', 'and', 'is', 'it', 'to',
    'in', 'he', 'was', 'on', 'at',
    'his', 'but', 'not', 'you', 'all',
    'can', 'had', 'her', 'one', 'our',
    'out', 'day', 'get', 'has', 'him',
    'how', 'its', 'may', 'new', 'now',
    'old', 'see', 'two', 'way', 'who',
    'did', 'let', 'say', 'she', 'too',
    'any', 'big', 'end', 'far', 'got',
    'hand', 'help', 'just', 'long', 'make',
  ].map((word, index) => ({ item_key: String(index), word })),
};
