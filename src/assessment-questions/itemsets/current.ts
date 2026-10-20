import { LETTER_SOUNDS_2026_1_EN } from './letter_sounds@2026.1.en';
import { LETTER_SOUNDS_2026_1_XH } from './letter_sounds@2026.1.xh';
import { WORD_READING_2026_1_EN } from './word_reading@2026.1.en';
import { WORD_READING_2026_1_XH } from './word_reading@2026.1.xh';

export const CURRENT_ITEM_SETS = {
  letter_sounds: { en: LETTER_SOUNDS_2026_1_EN, xh: LETTER_SOUNDS_2026_1_XH },
  word_reading: { en: WORD_READING_2026_1_EN, xh: WORD_READING_2026_1_XH },
} as const;
