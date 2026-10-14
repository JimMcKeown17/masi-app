import type { ItemSet } from '../types/ItemSet';
import type { LetterSoundsItemSet } from '../questions/LetterSoundsQuestion/types';

export const FIXTURE_LETTER_SOUNDS_EN: ItemSet<LetterSoundsItemSet> = {
  item_set_id: 'wela_plus_letter_sounds@fixture.en',
  question_code: 'wela_plus_letter_sounds',
  question_version: 'fixture',
  language: 'en',
  letters: [
    'a', 'b', 'c', 'd', 'e',
    'f', 'g', 'h', 'i', 'j',
    'k', 'l', 'm', 'n', 'o',
    'p', 'q', 'r', 's', 't',
    'u', 'v', 'w', 'x', 'y',
  ],
  columns: 12,
};
