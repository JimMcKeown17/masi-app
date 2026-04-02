/**
 * Letter Mastery Utility
 *
 * Computes which letters a child has mastered based on their most recent
 * EGRA assessment. Assessment mastery is computed on-the-fly (not stored)
 * so it always reflects the latest assessment data.
 */

/**
 * Determine which of the 26 tracker letters are "assessment-mastered"
 * based on the child's most recent EGRA assessment.
 *
 * Rule: "All correct among attempted." For each unique letter in the
 * pedagogical order, find all positions in the 60-letter EGRA set where
 * that letter appears. Only consider positions within the attempted range
 * (0 to last_letter_attempted.index). If ALL attempted instances were
 * correct, the letter is mastered. Un-attempted positions are excluded.
 *
 * @param {Object|null} assessment - The child's most recent assessment record
 * @param {Object} egraLetterSet - The EGRA letter set (e.g., ENGLISH_LETTER_SET)
 * @param {string[]} pedagogicalOrder - The 26-letter tracker order
 * @returns {Set<string>} Set of lowercase letters that are assessment-mastered
 */
export function computeAssessmentMastery(assessment, egraLetterSet, pedagogicalOrder) {
  const mastered = new Set();

  if (!assessment || !assessment.last_letter_attempted || assessment.last_letter_attempted.index == null) {
    return mastered;
  }

  // Only compute letter mastery from letter assessments, not word assessments
  if (assessment.assessment_type && assessment.assessment_type !== 'letter_egra') {
    return mastered;
  }

  const attemptedUpTo = assessment.last_letter_attempted.index;
  const letters = egraLetterSet.letters;

  // Build a Set of correct indices for O(1) lookup
  const correctIndices = new Set(
    (assessment.correct_letters || []).map(c => c.index)
  );

  for (const trackerLetter of pedagogicalOrder) {
    // Find all positions in the EGRA 60-letter set where this letter appears
    // (case-insensitive, single chars only — digraphs naturally excluded)
    const attemptedPositions = [];
    for (let i = 0; i <= attemptedUpTo && i < letters.length; i++) {
      if (letters[i].toLowerCase() === trackerLetter) {
        attemptedPositions.push(i);
      }
    }

    // Only mark mastered if there are attempted positions AND all were correct
    if (attemptedPositions.length > 0 && attemptedPositions.every(pos => correctIndices.has(pos))) {
      mastered.add(trackerLetter);
    }
  }

  return mastered;
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
