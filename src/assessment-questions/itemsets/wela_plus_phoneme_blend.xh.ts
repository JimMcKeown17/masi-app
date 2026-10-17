import type { ItemSet } from '../types/ItemSet';
import type { ListenPhonemeBlendItemSet } from '../questions/ListenPhonemeBlendQuestion/types';

export const WELA_PLUS_PHONEME_BLEND_XH: ItemSet<ListenPhonemeBlendItemSet> = {
  item_set_id: 'wela_plus_phoneme_blend@2024.1.xh',
  question_code: 'wela_plus_phoneme_blend',
  question_version: '2024.1',
  language: 'xh',
  prompts: [
    ['y-a-m', 'yam'],
    ['k-u-m', 'kum'],
    ['l-o', 'lo'],
    ['y-a', 'ya'],
    ['ke', 'ke'],
    ['x-a', 'xa'],
    ['b-a-m', 'bam'],
    ['s-a-m', 'sam'],
  ].map(([segmented, word], index) => ({
    item_key: `q4.phoneme_blend.item_${index + 1}`,
    segmented,
    word,
  })),
};
