import type { ItemSet } from '../types/ItemSet';
import type { WriteSentencesFromDictationItemSet } from '../questions/WriteSentencesFromDictationQuestion/types';

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

export const FIXTURE_WRITE_SENTENCES_DICTATION_EN: ItemSet<WriteSentencesFromDictationItemSet> = {
  item_set_id: 'wela_plus_write_sentences_dictation@fixture.en',
  question_code: 'wela_plus_write_sentences_dictation',
  question_version: 'fixture',
  language: 'en',
  prompts: STUB_SENTENCES.map((sentence, idx) => ({
    item_key: `q10.item_${idx + 1}`,
    sentence,
  })),
};
