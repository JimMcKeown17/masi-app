import type { ItemSet } from '../types/ItemSet';
import type { ReadSentencesItemSet } from '../questions/ReadSentencesQuestion/types';

const SENTENCES = [
  'Usana luyalila',
  'Umakhulu upheka ipapa',
  'Ndivuka kusasa ndaxukuxa',
  'Amakhwenkwe adlala ibhola',
];

export const WELA_PLUS_READ_SENTENCES_XH: ItemSet<ReadSentencesItemSet> = {
  item_set_id: 'wela_plus_read_sentences@2024.1.xh',
  question_code: 'wela_plus_read_sentences',
  question_version: '2024.1',
  language: 'xh',
  sentences: SENTENCES.map((sentence, sentenceIndex) => ({
    item_key: `s${sentenceIndex + 1}`,
    words: sentence.split(' ').map((word, wordIndex) => ({
      item_key: `s${sentenceIndex + 1}.w${wordIndex + 1}`,
      word,
    })),
  })),
};
