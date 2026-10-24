import type { BatteryQuestion } from '../types/BatteryConfig';
import type { Result, StoppedReason } from '../types/Result';
import { bundledItemSetFor } from './bundledItemSets';

export function skippedResult(question: BatteryQuestion, language: string, reason: StoppedReason): Result {
  if (!reason.startsWith('skipped_')) {
    throw new TypeError('A skipped result requires a skipped_ reason');
  }
  const set = bundledItemSetFor(question.question_code, question.question_version, language);
  if (!set) {
    throw new TypeError(`No bundled item set for ${question.question_code}@${question.question_version}/${language}`);
  }
  return {
    question_code: set.question_code,
    question_version: set.question_version,
    item_set_id: set.item_set_id,
    language: set.language,
    duration_ms: 0,
    stopped_reason: reason,
    items: [],
    derived: {
      total_correct: 0,
      total_attempted: 0,
      percent: 0,
      last_attempted_position: null,
    },
  };
}
