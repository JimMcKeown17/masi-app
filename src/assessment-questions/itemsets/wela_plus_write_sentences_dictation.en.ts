import type { ItemSet } from '../types/ItemSet';
import type { WriteSentencesFromDictationItemSet } from '../questions/WriteSentencesFromDictationQuestion/types';

// PLACEHOLDER content — 12 stub sentences; real WelaPLUS sentences land in #34.
const STUB_SENTENCES = [
  'The cat sat down.',
  'I can see the sun.',
  'We ran to the tree.',
  'A big dog ran fast.',
  'The boy has a red hat.',
  'My mum cooks rice.',
  'The bird flew high.',
  'I like to read books.',
  'She drew a small fish.',
  'We play in the park.',
  'The girl went to school.',
  'He helped his friend.',
];

export const WELA_PLUS_WRITE_SENTENCES_DICTATION_EN: ItemSet<WriteSentencesFromDictationItemSet> = {
  item_set_id: 'wela_plus_write_sentences_dictation@stub-2026-06-04.en',
  question_code: 'wela_plus_write_sentences_dictation',
  question_version: 'stub-2026-06-04',
  language: 'en',
  prompts: STUB_SENTENCES.map((sentence, idx) => ({
    item_key: `q10.item_${idx + 1}`,
    sentence,
  })),
};
