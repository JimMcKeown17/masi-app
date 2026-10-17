import type { ItemSet } from '../types/ItemSet';
import type { LetterSoundsItemSet } from '../questions/LetterSoundsQuestion/types';

export const WELA_PLUS_LETTER_SOUNDS_EN: ItemSet<LetterSoundsItemSet> = {
  item_set_id: 'wela_plus_letter_sounds@2024.1.en',
  question_code: 'wela_plus_letter_sounds',
  question_version: '2024.1',
  language: 'en',
  columns: 12,
  letters: 'a n i t m s p e b c i u f l d h o k g f r u f s e s i a y u w c z m o f n p q j t v x y a n t n k b m s p e b l d g a d'.split(' '),
};
