/**
 * Shared mastery-state loader for the letter tracker surfaces.
 *
 * Single source of truth for "which letters are assessment-mastered and which
 * are coach-taught" so LetterMasteryPanel (ChildResults / LetterTracker) and
 * LetterTrackerBottomSheet (session form) can never diverge. Write timing is
 * deliberately NOT here: the panel writes immediately, the sheet defers via
 * pendingChanges. Only reads and pure counting live in this module.
 */
import { LETTER_SETS, PEDAGOGICAL_ORDERS } from '../constants/egraConstants';
import { computeAssessmentMastery } from './letterMastery';
import { assessmentsRepository } from '../db/repositories/assessmentsRepository';
import { masteryRepository } from '../db/repositories/masteryRepository';

export async function loadMasteryState({ userId, childId, languageKey }) {
  const letterSet = LETTER_SETS[languageKey];
  const pedagogicalOrder = PEDAGOGICAL_ORDERS[languageKey];
  if (!letterSet || !pedagogicalOrder) {
    return {
      letterSet: null,
      pedagogicalOrder: null,
      assessmentMastered: new Set(),
      latestAssessment: null,
      taughtRecords: [],
    };
  }

  // Latest LETTER assessment for this language. Word assessments also stamp
  // letter_language, and computeAssessmentMastery returns an empty set for
  // them, so filtering by type here is what keeps a newer word assessment
  // from wiping tracker mastery.
  const allAssessments = await assessmentsRepository.getAssessments({ userId, childId });
  const childAssessments = allAssessments
    .filter(a => a.child_id === childId
      && a.letter_language === letterSet.language
      && (a.assessment_type || 'letter_egra') === 'letter_egra')
    .sort((a, b) => {
      const dateCmp = b.date_assessed.localeCompare(a.date_assessed);
      if (dateCmp !== 0) return dateCmp;
      return b.created_at.localeCompare(a.created_at);
    });
  const latestAssessment = childAssessments[0] || null;
  const assessmentMastered = computeAssessmentMastery(latestAssessment, letterSet, pedagogicalOrder);

  const allMastery = await masteryRepository.getLetterMastery({ userId, childId });
  const taughtRecords = allMastery.filter(
    r => r.child_id === childId && r.language === letterSet.language && !r._deleted
  );

  return { letterSet, pedagogicalOrder, assessmentMastered, latestAssessment, taughtRecords };
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
