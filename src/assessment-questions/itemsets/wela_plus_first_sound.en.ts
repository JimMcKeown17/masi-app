import type { ItemSet } from '../types/ItemSet';
import type { ListenFirstSoundItemSet } from '../questions/ListenFirstSoundQuestion/types';

export const WELA_PLUS_FIRST_SOUND_EN: ItemSet<ListenFirstSoundItemSet> = {
  item_set_id: 'wela_plus_first_sound@2024.1.en',
  question_code: 'wela_plus_first_sound',
  question_version: '2024.1',
  language: 'en',
  prompts: 'walk read dance paint cut sing jump hug look talk'.split(' ').map((prompt, index) => ({
    item_key: `q3.first_sound.item_${index + 1}`,
    prompt,
  })),
};
