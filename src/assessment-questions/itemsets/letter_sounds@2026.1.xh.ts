import type { LetterSoundsItemSet } from '../questions/LetterSoundsQuestion/types';

export const LETTER_SOUNDS_2026_1_XH: LetterSoundsItemSet = {
  item_set_id: 'letter_sounds@2026.1.xh',
  question_code: 'letter_sounds',
  question_version: '2026.1',
  language: 'xh',
  rows: [
    ['l', 'a', 'm', 'e', 's', 'n', 'l', 's', 'm', 'e', 'y', 'i'],
    ['k', 'n', 'd', 'h', 'f', 'u', 'h', 'v', 'f', 'y', 'c', 'i'],
    ['t', 'k', 'd', 'z', 'f', 'd', 't', 'z', 'o', 'j', 'p', 'r'],
    ['c', 'w', 'p', 'o', 'w', 'a', 'e', 'x', 'q', 'l', 'g', 'o'],
    ['u', 'z', 'x', 'r', 'v', 'b', 'j', 'b', 'q', 'u', 'r', 'g'],
  ],
  stop_rule: { kind: 'consecutive_wrong', stop_at: 10 },
};
