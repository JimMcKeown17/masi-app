import type { ItemSet } from '../types/ItemSet';
import type { ListenPhonemeBlendItemSet } from '../questions/ListenPhonemeBlendQuestion/types';

// PLACEHOLDER content — real pedagogy-supplied prompts land in #34.
export const WELA_PLUS_PHONEME_BLEND_EN: ItemSet<ListenPhonemeBlendItemSet> = {
  item_set_id: 'wela_plus_phoneme_blend@stub-2026-06-02.en',
  question_code: 'wela_plus_phoneme_blend',
  question_version: 'stub-2026-06-02',
  language: 'en',
  prompts: [
    { item_key: 'q4.phoneme_blend.item_1', segmented: 's-u-n', word: 'sun' },
    { item_key: 'q4.phoneme_blend.item_2', segmented: 'c-a-t', word: 'cat' },
    { item_key: 'q4.phoneme_blend.item_3', segmented: 'p-i-g', word: 'pig' },
    { item_key: 'q4.phoneme_blend.item_4', segmented: 'h-a-t', word: 'hat' },
    { item_key: 'q4.phoneme_blend.item_5', segmented: 'r-u-n', word: 'run' },
    { item_key: 'q4.phoneme_blend.item_6', segmented: 'd-o-g', word: 'dog' },
    { item_key: 'q4.phoneme_blend.item_7', segmented: 'b-i-g', word: 'big' },
    { item_key: 'q4.phoneme_blend.item_8', segmented: 'm-a-p', word: 'map' },
  ],
};
