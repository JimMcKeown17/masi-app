import type { ItemSet } from '../types/ItemSet';
import type { ReadPassageItemSet } from '../questions/ReadPassageQuestion/types';

// PLACEHOLDER content — real WelaPLUS passage lands in #34. Stub passage is short
// (~30 words) so contract tests run fast; passage length is variable in
// production (#34 will likely supply 60-80 words).
const STUB_PASSAGE_WORDS = [
  'A',
  'small',
  'bird',
  'named',
  'Pip',
  'lived',
  'in',
  'a',
  'tall',
  'tree.',
  'Pip',
  'flew',
  'over',
  'the',
  'river',
  'to',
  'find',
  'a',
  'sweet',
  'red',
  'berry.',
  'He',
  'ate',
  'one',
  'and',
  'flew',
  'back',
  'home',
  'feeling',
  'happy.',
];

export const WELA_PLUS_READ_PASSAGE_EN: ItemSet<ReadPassageItemSet> = {
  item_set_id: 'wela_plus_read_passage@stub-2026-06-04.en',
  question_code: 'wela_plus_read_passage',
  question_version: 'stub-2026-06-04',
  language: 'en',
  words: STUB_PASSAGE_WORDS.map((word, idx) => ({
    item_key: `p1.w${idx + 1}`,
    word,
  })),
};
