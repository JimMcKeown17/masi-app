import type { LetterSoundsItemSet } from '../questions/LetterSoundsQuestion/types';
import { GRID_A_ROWS } from './grid_a';

export const LETTER_SOUNDS_2026_2_XH: LetterSoundsItemSet = {
  item_set_id: 'letter_sounds@2026.2.xh',
  question_code: 'letter_sounds',
  question_version: '2026.2',
  language: 'xh',
  rows: GRID_A_ROWS,
  stop_rule: { kind: 'consecutive_wrong', stop_at: 10 },
};
