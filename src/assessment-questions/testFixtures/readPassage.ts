import type { ItemSet } from '../types/ItemSet';
import type { ReadPassageItemSet } from '../questions/ReadPassageQuestion/types';

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

export const FIXTURE_READ_PASSAGE_EN: ItemSet<ReadPassageItemSet> = {
  item_set_id: 'wela_plus_read_passage@fixture.en',
  question_code: 'wela_plus_read_passage',
  question_version: 'fixture',
  language: 'en',
  words: STUB_PASSAGE_WORDS.map((word, idx) => ({
    item_key: `p1.w${idx + 1}`,
    word,
  })),
};
