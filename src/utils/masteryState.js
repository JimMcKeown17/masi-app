/**
 * Shared mastery-state loader for the letter tracker surfaces.
 *
 * Single source of truth for "which letters are assessment-mastered and which
 * are coach-taught" so LetterMasteryPanel (ChildResults / LetterTracker) and
 * LetterTrackerBottomSheet (session form) can never diverge. Write timing is
 * deliberately NOT here: the panel writes immediately, the sheet defers via
 * pendingChanges. Only reads and pure counting live in this module.
 */
import { LANGUAGE_LABELS, PEDAGOGICAL_ORDERS } from './assessmentRegistry';
import { computeAssessmentMastery } from './letterMastery';

export async function loadMasteryState({ repositories, userId, childId, languageCode }) {
  const pedagogicalOrder = PEDAGOGICAL_ORDERS[languageCode];
  if (!pedagogicalOrder) {
    return {
      pedagogicalOrder: null,
      assessmentMastered: new Set(),
      latestAssessment: null,
      taughtRecords: [],
    };
  }

  // userId resolves the active programme; evidence may have been recorded by any EA.
  const latestAssessment = await repositories.assessments.latestLetterResult({
    userId, childId, language: languageCode,
  });
  const assessmentMastered = computeAssessmentMastery(latestAssessment, pedagogicalOrder);

  const allMastery = await repositories.mastery.getLetterMastery({ userId, childId });
  // Plan 2 re-keys letter_mastery to codes
  const confirmationLanguage = LANGUAGE_LABELS[languageCode];
  const taughtRecords = allMastery.filter(
    r => r.child_id === childId && r.language === confirmationLanguage && !r._deleted
  );

  return { pedagogicalOrder, assessmentMastered, latestAssessment, taughtRecords };
}

export function countMastered({ assessmentMastered, taughtLetters, pendingChanges = {}, pedagogicalOrder }) {
  let count = 0;
  for (const letter of pedagogicalOrder) {
    if (assessmentMastered.has(letter)) { count += 1; continue; }
    if (pendingChanges[letter] === true) { count += 1; continue; }
    if (pendingChanges[letter] === false) continue;
    if (taughtLetters.has(letter)) { count += 1; continue; }
  }
  return count;
}
