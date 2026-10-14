import type { ItemSet } from '../types/ItemSet';
import type { WriteSentencesFromDictationItemSet } from '../questions/WriteSentencesFromDictationQuestion/types';

const STUB_SENTENCES = [
  'Ikati yam isela ubisi',
  'Ithanda inyama kwaye ihlala elangeni.',
];

export const WELA_PLUS_WRITE_SENTENCES_DICTATION_XH: ItemSet<WriteSentencesFromDictationItemSet> = {
  item_set_id: 'wela_plus_write_sentences_dictation@stub-2026-06-04.xh',
  question_code: 'wela_plus_write_sentences_dictation',
  question_version: 'stub-2026-06-04',
  language: 'xh',
  sentences: STUB_SENTENCES.map((sentence, sentenceIndex) => ({
    item_key: `s${sentenceIndex + 1}`,
    words: sentence.split(' ').map((word, wordIndex) => ({
      item_key: `s${sentenceIndex + 1}.w${wordIndex + 1}`,
      word,
    })),
  })),
};
