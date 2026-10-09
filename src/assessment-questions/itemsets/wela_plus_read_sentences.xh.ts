import type { ItemSet } from '../types/ItemSet';
import type { ReadSentencesItemSet } from '../questions/ReadSentencesQuestion/types';

// PLACEHOLDER content — English used as a placeholder until pedagogy supplies isiXhosa via #34.
export const WELA_PLUS_READ_SENTENCES_XH: ItemSet<ReadSentencesItemSet> = {
  item_set_id: 'wela_plus_read_sentences@stub-2026-06-04.xh',
  question_code: 'wela_plus_read_sentences',
  question_version: 'stub-2026-06-04',
  language: 'xh',
  sentences: [
    {
      item_key: 's1',
      words: [
        { item_key: 's1.w1', word: 'The' },
        { item_key: 's1.w2', word: 'cat' },
        { item_key: 's1.w3', word: 'sat' },
        { item_key: 's1.w4', word: 'down.' },
      ],
    },
    {
      item_key: 's2',
      words: [
        { item_key: 's2.w1', word: 'Pip' },
        { item_key: 's2.w2', word: 'has' },
        { item_key: 's2.w3', word: 'a' },
        { item_key: 's2.w4', word: 'red' },
        { item_key: 's2.w5', word: 'hat.' },
      ],
    },
    {
      item_key: 's3',
      words: [
        { item_key: 's3.w1', word: 'We' },
        { item_key: 's3.w2', word: 'ran' },
        { item_key: 's3.w3', word: 'to' },
        { item_key: 's3.w4', word: 'the' },
        { item_key: 's3.w5', word: 'big' },
        { item_key: 's3.w6', word: 'tree.' },
      ],
    },
    {
      item_key: 's4',
      words: [
        { item_key: 's4.w1', word: 'I' },
        { item_key: 's4.w2', word: 'can' },
        { item_key: 's4.w3', word: 'see' },
        { item_key: 's4.w4', word: 'the' },
        { item_key: 's4.w5', word: 'sun.' },
      ],
    },
  ],
};
