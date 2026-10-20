import type { LetterSoundsItemSet } from '../questions/LetterSoundsQuestion/types';

export const LETTER_SOUNDS_2026_1_EN: LetterSoundsItemSet = {
  item_set_id: 'letter_sounds@2026.1.en',
  question_code: 'letter_sounds',
  question_version: '2026.1',
  language: 'en',
  rows: [
    ['a', 'n', 'i', 't', 'm', 's', 'p', 'e', 'b', 'c', 'i', 'u'],
    ['f', 'l', 'd', 'h', 'o', 'k', 'g', 'f', 'r', 'u', 'f', 's'],
    ['e', 's', 'i', 'a', 'y', 'u', 'w', 'c', 'z', 'm', 'o', 'f'],
    ['n', 'p', 'q', 'j', 't', 'v', 'x', 'y', 'a', 'n', 't', 'n'],
    ['k', 'b', 'm', 's', 'p', 'e', 'b', 'l', 'd', 'g', 'a', 'd'],
  ],
  stop_rule: { kind: 'consecutive_wrong', stop_at: 10 },
};
