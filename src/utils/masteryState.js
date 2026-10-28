/**
 * Shared mastery-state loader for the letter tracker surfaces.
 *
 * Single source of truth for "which letters are assessment-mastered and which
 * are coach-taught" so LetterMasteryPanel (ChildResults / LetterTracker) and
 * LetterTrackerBottomSheet (session form) can never diverge. Write timing is
 * deliberately NOT here: the panel writes immediately, the sheet defers via
 * pendingChanges. Only reads and pure counting live in this module.
 */
import { TRACKER_LETTERS } from './assessmentRegistry';
import { computeLetterMastery } from './letterMastery';

export async function loadMasteryState({ repositories, userId, childId, languageCode }) {
  const trackerLetters = TRACKER_LETTERS[languageCode];
  if (!trackerLetters) {
    return {
      trackerLetters: null,
      assessmentMastered: new Set(),
      latestAssessment: null,
      taughtRecords: [],
    };
  }

  // userId resolves the active programme; evidence may have been recorded by any EA.
  // Newest first: each letter keeps the newest result that reached it.
  const letterResults = await repositories.assessments.letterEvidenceFor({
    userId, childId, language: languageCode,
  });
  const latestAssessment = letterResults[0] ?? null;
  const assessmentMastered = computeLetterMastery(letterResults, trackerLetters);

  const taughtRecords = (await repositories.mastery.getLetterMastery({
    childId, language: languageCode,
  })).filter(r => r.confirmed);

  return { trackerLetters, assessmentMastered, latestAssessment, taughtRecords };
}

export function countMastered({ assessmentMastered, taughtLetters, pendingChanges = {}, trackerLetters }) {
  let count = 0;
  for (const letter of trackerLetters) {
    if (assessmentMastered.has(letter)) { count += 1; continue; }
    if (pendingChanges[letter]?.mastered === true) { count += 1; continue; }
    if (pendingChanges[letter]?.mastered === false) continue;
    if (taughtLetters.has(letter)) { count += 1; continue; }
  }
  return count;
}

export function pendingChangesLanguageCode(pendingChanges) {
  const [firstChange] = Object.values(pendingChanges ?? {});
  return firstChange?.languageCode ?? null;
}

export function assertTrackerChanges(changesByChild) {
  for (const [childId, changes] of Object.entries(changesByChild ?? {})) {
    for (const [letter, change] of Object.entries(changes ?? {})) {
      const languageCode = change?.languageCode;
      const trackerLetters = Object.prototype.hasOwnProperty.call(TRACKER_LETTERS, languageCode)
        ? TRACKER_LETTERS[languageCode]
        : null;
      const valid = change !== null && typeof change === 'object' &&
        typeof change.mastered === 'boolean' &&
        Array.isArray(trackerLetters) && trackerLetters.includes(letter) &&
        typeof change.madeAt === 'string' && Number.isFinite(Date.parse(change.madeAt));

      if (!valid) {
        const error = new Error(
          `Letter tracker change for child ${childId}, letter ${letter} is malformed or has no tracker language (${String(languageCode)})`
        );
        error.code = 'TRACKER_CHANGE_INVALID';
        throw error;
      }
    }
  }
}
