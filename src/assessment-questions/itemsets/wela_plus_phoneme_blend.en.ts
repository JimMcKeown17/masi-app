import type { ItemSet } from '../types/ItemSet';
import type { ListenPhonemeBlendItemSet } from '../questions/ListenPhonemeBlendQuestion/types';

export const WELA_PLUS_PHONEME_BLEND_EN: ItemSet<ListenPhonemeBlendItemSet> = {
  item_set_id: 'wela_plus_phoneme_blend@2024.1.en',
  question_code: 'wela_plus_phoneme_blend',
  question_version: '2024.1',
  language: 'en',
  prompts: [
    ['s-u-n', 'sun'],
    ['b-oo-k', 'book'],
    ['m-ee', 'me'],
    ['u-p', 'up'],
    ['o-n', 'on'],
    ['s-ee', 'see'],
    ['f-or-k', 'fork'],
    ['j-a-m', 'jam'],
  ].map(([segmented, word], index) => ({
    item_key: `q4.phoneme_blend.item_${index + 1}`,
    segmented,
    word,
  })),
};
