/**
 * Letter Mastery Utility
 *
 * Computes evidence from the recorded prompts, independent of the current item set.
 * Each letter takes its status from the newest letter result that reached it, so a chart
 * that never asks a letter (English HL 3 has no q, v, x or z) or a child who does not reach
 * it in time leaves that letter's earlier evidence in place (Jim, 2026-10-27).
 */

import { LETTER_EVIDENCE_CODES } from './assessmentRegistry';

/**
 * Eligible letter results for one child and language, newest first.
 * Callers pass results already bounded to the active academic year.
 */
export function eligibleLetterResults(results, { childId, languageCode }) {
  return results.filter(result => (
    result.child_id === childId
    && result.language === languageCode
    && LETTER_EVIDENCE_CODES.includes(result.question_code)
    && !result.stopped_reason?.startsWith('skipped_')
    && result.items?.some(item => item.metadata?.reached !== false)
  )).sort((a, b) => (
    (b.assessment_date || '').localeCompare(a.assessment_date || '')
    || (b.created_at || '').localeCompare(a.created_at || '')
  ));
}

/** The newest eligible letter result, for "Last assessed" and similar labels. */
export function pickLatestLetterResult(results, options) {
  return eligibleLetterResults(results, options)[0] || null;
}

/**
 * Per letter in one result: true when every reached occurrence was correct.
 * Letters the result never reached are absent. Prompts compare case-insensitively.
 */
function reachedLetterOutcomes(result, eligibleLetters) {
  const outcomes = new Map();
  if (!Array.isArray(result?.items)) return outcomes;
  for (const item of result.items) {
    if (item.metadata?.reached === false || typeof item.prompt !== 'string') continue;
    const letter = item.prompt.toLowerCase();
    if (!eligibleLetters.has(letter)) continue;
    outcomes.set(letter, (outcomes.get(letter) ?? true) && item.is_correct === true);
  }
  return outcomes;
}

/**
 * Letters mastered by assessment evidence. Each letter is decided by the newest result that
 * reached it: mastered when every reached occurrence there was correct.
 * @param {Object[]} results - Eligible letter results, newest first (see eligibleLetterResults)
 * @param {string[]} pedagogicalOrder - The 26-letter tracker order
 * @returns {Set<string>} Lowercase letters mastered by assessment evidence
 */
export function computeLetterMastery(results, pedagogicalOrder) {
  if (!Array.isArray(results) || !Array.isArray(pedagogicalOrder)) return new Set();
  const eligibleLetters = new Set(pedagogicalOrder.map(letter => letter.toLowerCase()));
  const decided = new Map();
  for (const result of results) {
    for (const [letter, correct] of reachedLetterOutcomes(result, eligibleLetters)) {
      if (!decided.has(letter)) decided.set(letter, correct);
    }
    if (decided.size === eligibleLetters.size) break;
  }
  return new Set([...decided].filter(([, correct]) => correct).map(([letter]) => letter));
}
