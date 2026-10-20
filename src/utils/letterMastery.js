/**
 * Letter Mastery Utility
 *
 * Computes evidence from the recorded prompts, independent of the current item set.
 */

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

/**
 * Normalize a home_language string to a key for LETTER_SETS / PEDAGOGICAL_ORDERS.
 * Handles variations like 'English', 'english', 'isiXhosa', 'isixhosa', 'Xhosa'.
 *
 * @param {string} homeLanguage - The class home_language value
 * @returns {string} 'english' or 'isixhosa'
 */
export function normalizeLanguageKey(homeLanguage) {
  const lower = (homeLanguage || '').toLowerCase().trim();
  if (lower.includes('xhosa')) return 'isixhosa';
  return 'english';
}
