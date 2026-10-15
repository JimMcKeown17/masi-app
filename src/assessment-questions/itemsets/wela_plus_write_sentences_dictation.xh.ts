import type { ItemSet } from '../types/ItemSet';
import type { WriteSentencesFromDictationItemSet } from '../questions/WriteSentencesFromDictationQuestion/types';

const SENTENCES = [
  'Ikati yam isela ubisi',
  'Ithanda inyama kwaye ihlala elangeni.',
];

export const WELA_PLUS_WRITE_SENTENCES_DICTATION_XH: ItemSet<WriteSentencesFromDictationItemSet> = {
  item_set_id: 'wela_plus_write_sentences_dictation@2024.1.xh',
  question_code: 'wela_plus_write_sentences_dictation',
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
