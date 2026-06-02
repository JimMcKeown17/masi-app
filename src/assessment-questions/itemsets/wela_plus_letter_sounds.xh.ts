import type { ItemSet } from '../types/ItemSet';
import type { LetterSoundsItemSet } from '../questions/LetterSoundsQuestion/types';

// PLACEHOLDER content — real pedagogy-supplied isiXhosa letter set lands in #34.
// isiXhosa orthography includes additional letters/digraphs that pedagogy will provide.
export const WELA_PLUS_LETTER_SOUNDS_XH: ItemSet<LetterSoundsItemSet> = {
  // Stub-marked item_set_id; see EN file for rationale.
  item_set_id: 'wela_plus_letter_sounds@stub-2026-06-02.xh',
  question_code: 'wela_plus_letter_sounds',
  question_version: 'stub-2026-06-02',
  language: 'xh',
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
