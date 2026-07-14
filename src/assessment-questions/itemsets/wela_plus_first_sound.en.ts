import type { ItemSet } from '../types/ItemSet';
import type { ListenFirstSoundItemSet } from '../questions/ListenFirstSoundQuestion/types';

// PLACEHOLDER content — real pedagogy-supplied prompts land in #34.
// Stub-marked item_set_id so any captured run is distinguishable.
export const WELA_PLUS_FIRST_SOUND_EN: ItemSet<ListenFirstSoundItemSet> = {
  item_set_id: 'wela_plus_first_sound@stub-2026-06-02.en',
  question_code: 'wela_plus_first_sound',
  question_version: 'stub-2026-06-02',
  language: 'en',
  prompts: [
    { item_key: 'q3.first_sound.item_1', prompt: 'apple' },
    { item_key: 'q3.first_sound.item_2', prompt: 'ball' },
    { item_key: 'q3.first_sound.item_3', prompt: 'cat' },
    { item_key: 'q3.first_sound.item_4', prompt: 'dog' },
    { item_key: 'q3.first_sound.item_5', prompt: 'egg' },
    { item_key: 'q3.first_sound.item_6', prompt: 'fish' },
    { item_key: 'q3.first_sound.item_7', prompt: 'goat' },
    { item_key: 'q3.first_sound.item_8', prompt: 'hat' },
    { item_key: 'q3.first_sound.item_9', prompt: 'ink' },
    { item_key: 'q3.first_sound.item_10', prompt: 'jug' },
  ],
};
