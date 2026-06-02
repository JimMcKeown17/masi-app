import type { ItemSet } from '../types/ItemSet';
import type { LetterSoundsItemSet } from '../questions/LetterSoundsQuestion/types';

// PLACEHOLDER content — real pedagogy-supplied letter set lands in #34.
// Shape (letters + lettersPerPage + columns) is the WelaPLUS Pattern A contract.
export const WELA_PLUS_LETTER_SOUNDS_EN: ItemSet<LetterSoundsItemSet> = {
  // Clearly-stub item_set_id so any captured run during scaffolding is
  // distinguishable from real WelaPLUS content. Swap to the canonical
  // `wela_plus_letter_sounds@2024.1.en` only when #34's pedagogy content lands.
  item_set_id: 'wela_plus_letter_sounds@stub-2026-06-02.en',
  question_code: 'wela_plus_letter_sounds',
  question_version: 'stub-2026-06-02',
  language: 'en',
  letters: [
    'a', 'b', 'c', 'd', 'e',
    'f', 'g', 'h', 'i', 'j',
    'k', 'l', 'm', 'n', 'o',
    'p', 'q', 'r', 's', 't',
    'u', 'v', 'w', 'x', 'y',
  ],
  lettersPerPage: 20,
  columns: 5,
};
