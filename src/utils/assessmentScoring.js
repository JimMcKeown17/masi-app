// Pure scoring + record assembly shared by every assessment capture UI.
// Keeping this here (not in a screen) guarantees grid and sequential modes
// produce identically shaped records — the foundation of a valid A/B comparison.

import { toLocalDateString } from './localDate';

export function computeAssessmentResult(letterStates, lastTappedIndex, letters) {
  if (lastTappedIndex < 0) {
    return { lettersAttempted: 0, correctResponses: 0, incorrectLetters: [], correctLetters: [], accuracy: 0 };
  }

  const lettersAttempted = lastTappedIndex + 1;
  const correctLetters = [];
  const incorrectLetters = [];

  for (let i = 0; i <= lastTappedIndex; i++) {
    if (letterStates[i] === true) {
      correctLetters.push({ index: i, letter: letters[i] });
    } else {
      incorrectLetters.push({ index: i, letter: letters[i] });
    }
  }

  const correctResponses = correctLetters.length;
  const accuracy = lettersAttempted > 0 ? Math.round((correctResponses / lettersAttempted) * 100) : 0;

  return { lettersAttempted, correctResponses, incorrectLetters, correctLetters, accuracy };
}

/**
 * Build the canonical saved-assessment record. Both capture screens call this so the
 * only fields that vary by mode are capture_mode and correction_count.
 *
 * Shape mirrors LetterAssessmentScreen's original inline save object exactly, plus
 * capture_mode and correction_count. assessmentsRepository.saveAssessment is the
 * impedance layer: it injects programme_id, maps date_assessed->assessment_date /
 * correct_responses->score / letters_attempted->total_items, and splits the EGRA detail
 * into assessment_items. This builder only assembles the fat object the repo persists.
 */
export function buildAssessmentRecord({
  id, userId, childId, assessmentType, letterSet, attemptNumber,
  captureMode, correctionCount = 0, elapsedSeconds, finalLastIndex, letterStates, now,
}) {
  const result = computeAssessmentResult(letterStates, finalLastIndex, letterSet.letters);
  const dateAssessed = toLocalDateString(now);

  return {
    id,
    user_id: userId,
    child_id: childId,
    assessment_type: assessmentType,
    capture_mode: captureMode,
    items_tested: letterSet.letters,
    attempt_number: attemptNumber,
    letter_set_id: letterSet.id,
    letter_language: letterSet.language,
    completion_time: elapsedSeconds,
    letters_attempted: result.lettersAttempted,
    correct_responses: result.correctResponses,
    accuracy: result.accuracy,
    correct_letters: result.correctLetters,
    incorrect_letters: result.incorrectLetters,
    last_letter_attempted: finalLastIndex >= 0
      ? { index: finalLastIndex, letter: letterSet.letters[finalLastIndex] }
      : null,
    correction_count: correctionCount,
    date_assessed: dateAssessed,
    device_info: {},
    synced: false,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
}
