import { TRACKER_LETTERS } from '../../utils/assessmentRegistry';
import { eligibleLetterResults, computeLetterMastery } from '../../utils/letterMastery';

export const loadKnownLetters = async ({ repositories, userId, childIds, languageCode, programmeId, academicYear }) => {
  const trackerLetters = TRACKER_LETTERS[languageCode];
  if (!Array.isArray(trackerLetters) || childIds.length === 0) return Object.fromEntries(childIds.map(id => [id, []]));
  const [results, marks] = await Promise.all([
    repositories.assessments.getLetterEvidenceResults({ userId, childIds,
      ...(programmeId === undefined ? {} : { programmeId }),
      ...(academicYear === undefined ? {} : { academicYear }) }),
    repositories.mastery.getLetterMastery({ childIds, language: languageCode }),
  ]);
  const resultsByChild = new Map();
  for (const result of results) {
    const evidence = resultsByChild.get(result.child_id) ?? [];
    evidence.push(result);
    resultsByChild.set(result.child_id, evidence);
  }
  const marksByChild = new Map();
  for (const mark of marks) {
    if (!mark.confirmed) continue;
    const letters = marksByChild.get(mark.child_id) ?? [];
    letters.push(mark.letter.toLowerCase());
    marksByChild.set(mark.child_id, letters);
  }
  return Object.fromEntries(childIds.map(id => {
    // One rule with the tracker (C23): each letter takes the newest result that reached it.
    const letterResults = eligibleLetterResults(resultsByChild.get(id) ?? [], { childId: id, languageCode });
    const known = computeLetterMastery(letterResults, trackerLetters);
    for (const letter of marksByChild.get(id) ?? []) known.add(letter);
    return [id, trackerLetters.map(letter => letter.toLowerCase()).filter(letter => known.has(letter))];
  }));
};
