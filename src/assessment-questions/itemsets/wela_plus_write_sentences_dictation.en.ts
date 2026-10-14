import type { ItemSet } from '../types/ItemSet';
import type { WriteSentencesFromDictationItemSet } from '../questions/WriteSentencesFromDictationQuestion/types';

// PLACEHOLDER version metadata — Task 12 finalizes the bundled content version.
const STUB_SENTENCES = [
  'Mom got a cat from a pet shop.',
  'It drinks milk and sleeps with us.',
];

export const WELA_PLUS_WRITE_SENTENCES_DICTATION_EN: ItemSet<WriteSentencesFromDictationItemSet> = {
  item_set_id: 'wela_plus_write_sentences_dictation@stub-2026-06-04.en',
  question_code: 'wela_plus_write_sentences_dictation',
  question_version: 'stub-2026-06-04',
  language: 'en',
  sentences: STUB_SENTENCES.map((sentence, sentenceIndex) => ({
    item_key: `s${sentenceIndex + 1}`,
    words: sentence.split(' ').map((word, wordIndex) => ({
      item_key: `s${sentenceIndex + 1}.w${wordIndex + 1}`,
      word,
    })),
  })),
};
