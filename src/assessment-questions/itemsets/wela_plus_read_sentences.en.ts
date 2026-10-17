import type { ItemSet } from '../types/ItemSet';
import type { ReadSentencesItemSet } from '../questions/ReadSentencesQuestion/types';

const SENTENCES = [
  'A cat ran',
  'The pot was red',
  'The car was driving very fast',
  'Who wants to come with me today?',
];

export const WELA_PLUS_READ_SENTENCES_EN: ItemSet<ReadSentencesItemSet> = {
  item_set_id: 'wela_plus_read_sentences@2024.1.en',
  question_code: 'wela_plus_read_sentences',
  question_version: '2024.1',
  language: 'en',
  sentences: SENTENCES.map((sentence, sentenceIndex) => ({
    item_key: `s${sentenceIndex + 1}`,
    words: sentence.split(' ').map((word, wordIndex) => ({
      item_key: `s${sentenceIndex + 1}.w${wordIndex + 1}`,
      word,
    })),
  })),
};
