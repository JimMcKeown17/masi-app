import type { BatteryConfig } from '../types/BatteryConfig';
import { SHARED_READING_VERSION, sharedInstructionsFor } from './sharedReading';

function sharedInstructions(code: string): Record<string, string> {
  const xh = sharedInstructionsFor(code, 'xh');
  const en = sharedInstructionsFor(code, 'en');
  const af = sharedInstructionsFor(code, 'af');
  const zu = sharedInstructionsFor(code, 'zu');
  if (xh === null || en === null || af === null || zu === null) {
    throw new TypeError(`Missing shared reading instructions: ${code}`);
  }
  return { xh, en, af, zu };
}

export const FULL_EGRA_2026_1: BatteryConfig = {
  battery_code: 'egra',
  battery_version: '2026.1',
  title: 'Full EGRA',
  aboutMinutes: 6,
  languages: ['xh', 'en', 'af', 'zu'],
  readingCard: 'Reading Card 2026.3',
  prerequisites: {
    reading_comprehension: { depends_on: 'oral_reading', minScore: 1, on_unmet_reason: 'skipped_prerequisite_unmet' },
  },
  questions: [
    { title: 'Letter sounds', question_code: 'letter_sounds', question_version: SHARED_READING_VERSION,
      durationSec: 60, materials: { item: 'reading_card', side: 'A' },
      instructions: sharedInstructions('letter_sounds') },
    { title: 'Familiar words', question_code: 'word_reading', question_version: SHARED_READING_VERSION,
      durationSec: 60, materials: { item: 'reading_card', side: 'B' },
      instructions: sharedInstructions('word_reading') },
    { title: 'Reading a story', question_code: 'oral_reading', question_version: SHARED_READING_VERSION,
      durationSec: 60, materials: { item: 'reading_card', side: 'C' },
      instructions: sharedInstructions('oral_reading') },
    { title: 'Story comprehension', question_code: 'reading_comprehension', question_version: SHARED_READING_VERSION,
      materials: null, instructions: sharedInstructions('reading_comprehension') },
  ],
};
