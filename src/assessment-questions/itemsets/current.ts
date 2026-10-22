import { LETTER_SOUNDS_2026_2_EN } from './letter_sounds@2026.2.en';
import { LETTER_SOUNDS_2026_2_XH } from './letter_sounds@2026.2.xh';
import { LETTER_SOUNDS_2026_2_AF } from './letter_sounds@2026.2.af';
import { WORD_READING_2026_1_EN } from './word_reading@2026.1.en';
import { WORD_READING_2026_1_XH } from './word_reading@2026.1.xh';
import { WORD_READING_2026_1_AF } from './word_reading@2026.1.af';

export const CURRENT_ITEM_SETS = {
  letter_sounds: { en: LETTER_SOUNDS_2026_2_EN, xh: LETTER_SOUNDS_2026_2_XH, af: LETTER_SOUNDS_2026_2_AF },
  word_reading: { en: WORD_READING_2026_1_EN, xh: WORD_READING_2026_1_XH, af: WORD_READING_2026_1_AF },
} as const;
