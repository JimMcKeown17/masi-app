/**
 * Letter Mastery Utility
 *
 * Computes evidence from the recorded prompts, independent of the current item set.
 */

import { LETTER_EVIDENCE_CODES } from './assessmentRegistry';

/** Select eligible evidence from results already bounded to the active academic year. */
export function pickLatestLetterResult(results, { childId, languageCode }) {
  return results.filter(result => (
    result.child_id === childId
    && result.language === languageCode
    && LETTER_EVIDENCE_CODES.includes(result.question_code)
    && !result.stopped_reason?.startsWith('skipped_')
    && result.items?.some(item => item.metadata?.reached !== false)
  )).sort((a, b) => (
    (b.assessment_date || '').localeCompare(a.assessment_date || '')
    || (b.created_at || '').localeCompare(a.created_at || '')
  ))[0] || null;
}

/**
 * A letter needs at least one reached occurrence, with every reached occurrence correct.
 * Prompts and the pedagogical order are compared case-insensitively.
 * @param {Object|null} result - The child's latest stored letter result
 * @param {string[]} pedagogicalOrder - The 26-letter tracker order
 * @returns {Set<string>} Lowercase letters mastered by assessment evidence
 */
export function computeAssessmentMastery(result, pedagogicalOrder) {
  if (!Array.isArray(result?.items) || !Array.isArray(pedagogicalOrder)) {
    return new Set();
  }
  const eligibleLetters = new Set(pedagogicalOrder.map(letter => letter.toLowerCase()));
  const allReachedCorrect = new Map();
  for (const item of result.items) {
    if (item.metadata?.reached === false || typeof item.prompt !== 'string') continue;
    const letter = item.prompt.toLowerCase();
    if (!eligibleLetters.has(letter)) continue;
    allReachedCorrect.set(letter, (allReachedCorrect.get(letter) ?? true) && item.is_correct === true);
  }
  return new Set([...allReachedCorrect].filter(([, correct]) => correct).map(([letter]) => letter));
}
