import { PEDAGOGICAL_ORDERS } from '../../utils/assessmentRegistry';
import { pickLatestLetterResult, computeAssessmentMastery } from '../../utils/letterMastery';

export const loadKnownLetters = async ({ repositories, userId, childIds, languageCode }) => {
  const order = PEDAGOGICAL_ORDERS[languageCode];
  if (!Array.isArray(order) || childIds.length === 0) return Object.fromEntries(childIds.map(id => [id, []]));
  const [results, marks] = await Promise.all([
    repositories.assessments.getLetterEvidenceResults({ userId, childIds }),
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
    const latest = pickLatestLetterResult(resultsByChild.get(id) ?? [], { childId: id, languageCode });
    const known = computeAssessmentMastery(latest, order);
    for (const letter of marksByChild.get(id) ?? []) known.add(letter);
    return [id, order.map(letter => letter.toLowerCase()).filter(letter => known.has(letter))];
  }));
};
