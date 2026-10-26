import * as sets from '../itemsets';
import type { ItemSet } from '../types/ItemSet';
import { egraItemSetFor } from '../egra';
import { sharedItemSetFor } from '../egra/sharedReading';

const BUNDLED_ITEM_SETS: Record<string, Record<string, ItemSet<object>>> = {
  'letter_sounds@2026.1': {
    en: sets.LETTER_SOUNDS_2026_1_EN,
    xh: sets.LETTER_SOUNDS_2026_1_XH,
  },
  'letter_sounds@2026.2': {
    en: sets.LETTER_SOUNDS_2026_2_EN,
    xh: sets.LETTER_SOUNDS_2026_2_XH,
    af: sets.LETTER_SOUNDS_2026_2_AF,
  },
  'word_reading@2026.1': {
    en: sets.WORD_READING_2026_1_EN,
    xh: sets.WORD_READING_2026_1_XH,
    af: sets.WORD_READING_2026_1_AF,
  },
  'wela_plus_listen_and_answer_story@2024.1': {
    en: sets.WELA_PLUS_LISTEN_AND_ANSWER_STORY_EN,
    xh: sets.WELA_PLUS_LISTEN_AND_ANSWER_STORY_XH,
  },
  'wela_plus_first_sound@2024.1': {
    en: sets.WELA_PLUS_FIRST_SOUND_EN,
    xh: sets.WELA_PLUS_FIRST_SOUND_XH,
  },
  'wela_plus_phoneme_blend@2024.1': {
    en: sets.WELA_PLUS_PHONEME_BLEND_EN,
    xh: sets.WELA_PLUS_PHONEME_BLEND_XH,
  },
  'wela_plus_letter_writing@2024.1': {
    en: sets.WELA_PLUS_LETTER_WRITING_EN,
    xh: sets.WELA_PLUS_LETTER_WRITING_XH,
  },
  'wela_plus_read_words@2024.1': {
    en: sets.WELA_PLUS_READ_WORDS_EN,
    xh: sets.WELA_PLUS_READ_WORDS_XH,
  },
  'wela_plus_read_sentences@2024.1': {
    en: sets.WELA_PLUS_READ_SENTENCES_EN,
    xh: sets.WELA_PLUS_READ_SENTENCES_XH,
  },
  'wela_plus_read_passage@2024.1': {
    en: sets.WELA_PLUS_READ_PASSAGE_EN,
    xh: sets.WELA_PLUS_READ_PASSAGE_XH,
  },
  'wela_plus_write_cvcs@2024.1': {
    en: sets.WELA_PLUS_WRITE_CVCS_EN,
    xh: sets.WELA_PLUS_WRITE_CVCS_XH,
  },
  'wela_plus_write_sentences_dictation@2024.1': {
    en: sets.WELA_PLUS_WRITE_SENTENCES_DICTATION_EN,
    xh: sets.WELA_PLUS_WRITE_SENTENCES_DICTATION_XH,
  },
  'wela_plus_story_writing@2024.1': {
    en: sets.WELA_PLUS_STORY_WRITING_EN,
    xh: sets.WELA_PLUS_STORY_WRITING_XH,
  },
};

export function bundledItemSetFor(
  questionCode: string,
  questionVersion: string,
  language: string,
): ItemSet | null {
  const key = `${questionCode}@${questionVersion}`;
  if (Object.prototype.hasOwnProperty.call(BUNDLED_ITEM_SETS, key)) {
    const languages = BUNDLED_ITEM_SETS[key];
    if (Object.prototype.hasOwnProperty.call(languages, language)) {
      // Question-specific interfaces have no index signature; expose their full, unchanged object.
      return languages[language] as ItemSet;
    }
  }
  return sharedItemSetFor(questionCode, questionVersion, language)
    ?? egraItemSetFor(questionCode, questionVersion, language) as ItemSet | null;
}
