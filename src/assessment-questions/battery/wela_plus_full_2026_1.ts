import type { BatteryConfig, BatteryQuestion } from '../types/BatteryConfig';
import { SHARED_READING_VERSION, sharedInstructionsFor } from '../egra/sharedReading';
import { WELA_PLUS_2024_1_QUESTIONS as Q } from './wela_plus_full';

function sharedInstructions(code: string): Record<string, string> {
  const en = sharedInstructionsFor(code, 'en');
  const xh = sharedInstructionsFor(code, 'xh');
  if (en === null || xh === null) {
    throw new TypeError(`Missing shared reading instructions: ${code}`);
  }
  return { en, xh };
}

const sentences: BatteryQuestion = {
  ...Q.wela_plus_read_sentences,
  materials: { item: 'reading_card', side: 'D' },
  instructions: Object.fromEntries(Object.entries(Q.wela_plus_read_sentences.instructions!)
    .map(([language, text]) => [language, text.replace('side B', 'side D')])),
};

export const WELA_PLUS_FULL_2026_1: BatteryConfig = {
  title: 'WelaPLUS',
  aboutMinutes: 32,
  battery_code: 'wela_plus_full',
  battery_version: '2026.1',
  languages: ['en', 'xh'],
  readingCard: 'Reading Card 2026.3',
  questions: [
    { title: 'Letter sounds', question_code: 'letter_sounds', question_version: SHARED_READING_VERSION,
      durationSec: 60, materials: { item: 'reading_card', side: 'A' },
      instructions: sharedInstructions('letter_sounds') },
    Q.wela_plus_listen_and_answer_story,
    Q.wela_plus_first_sound,
    Q.wela_plus_phoneme_blend,
    Q.wela_plus_letter_writing,
    { title: 'Reading words', question_code: 'word_reading', question_version: SHARED_READING_VERSION,
      durationSec: 60, materials: { item: 'reading_card', side: 'B' },
      instructions: sharedInstructions('word_reading') },
    sentences,
    { title: 'Reading a story', question_code: 'oral_reading', question_version: SHARED_READING_VERSION,
      durationSec: 60, materials: { item: 'reading_card', side: 'C' },
      instructions: sharedInstructions('oral_reading') },
    { title: 'Story comprehension', question_code: 'reading_comprehension', question_version: SHARED_READING_VERSION,
      materials: null, instructions: sharedInstructions('reading_comprehension') },
    Q.wela_plus_write_cvcs,
    Q.wela_plus_write_sentences_dictation,
    Q.wela_plus_story_writing,
  ],
  prerequisites: {
    reading_comprehension: { depends_on: 'oral_reading', minScore: 1, on_unmet_reason: 'skipped_prerequisite_unmet' },
  },
  skipRule: {
    triggers: [
      { question_code: 'letter_sounds', first_row_length: 10 },
      { question_code: 'wela_plus_letter_writing', first_row_length: 6 },
      { question_code: 'word_reading', first_row_length: 8 },
    ],
    skips: ['word_reading', 'wela_plus_read_sentences', 'oral_reading', 'reading_comprehension',
      'wela_plus_write_cvcs', 'wela_plus_write_sentences_dictation', 'wela_plus_story_writing'],
  },
};
