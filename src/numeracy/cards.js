import { isGroupMastered } from '../utils/groupMastery';
import { childKnows, childReadyFor, curriculumStepKeys, groupStepState } from './groupSteps';

const text = (value) => typeof value === 'string' ? value : '';

/** Compare the date, creation time and id of lessons; never taught (null) comes first. */
export const compareRecency = (a, b) => {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  for (const key of ['date', 'createdAt', 'id']) {
    const left = text(a[key]);
    const right = text(b[key]);
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
};

/** Keep dated history on or before the lesson day, including that day. */
export const historyThroughLessonDate = (history, lessonDate) => (
  (Array.isArray(history) ? history : []).filter((entry) => (
    typeof entry?.date === 'string' && entry.date.length > 0 && entry.date <= lessonDate
  ))
);
const taughtItems = (entry) => Array.isArray(entry.taught) ? entry.taught : [];
export const newestMatching = (history, matches) => history.reduce((latest, entry) => (
  taughtItems(entry).some((item) => item != null && matches(item))
    && compareRecency(entry, latest) > 0 ? entry : latest
), null);

const stepsIn = (curriculum) => curriculum.skills.flatMap((skill) => skill.steps);

/** Counts and raw help lists use distinct present ids in first-seen order. */
export function cardReadiness({ curriculum, presentChildIds, knownByChild, stepKey }) {
  const presentIds = [...new Set(Array.isArray(presentChildIds) ? presentChildIds : [])];
  const step = stepsIn(curriculum).find((candidate) => candidate.key === stepKey);
  const stepKeys = curriculumStepKeys(curriculum);
  const readyIds = presentIds.filter((id) => childReadyFor(knownByChild, id, step, stepKeys));
  return {
    readyCount: readyIds.length,
    presentCount: presentIds.length,
    needHelp: presentIds.filter((id) => !readyIds.includes(id)),
    canHelp: presentIds.filter((id) => childKnows(knownByChild, id, step.key)),
  };
}

/** Rotate activities by recency, preferring activities of at most five minutes for warm-ups. */
export function pickNumeracyActivity({ curriculum, history, lessonDate, stepKey, slot }) {
  const step = stepsIn(curriculum).find((candidate) => candidate.key === stepKey);
  const eligibleHistory = historyThroughLessonDate(history, lessonDate);
  const short = slot === 'warm_up' ? step.activities.filter((a) => a.minutes <= 5) : [];
  const candidates = short.length > 0 ? short : step.activities;
  const lastDone = (name) => newestMatching(eligibleHistory, (item) => item.step_key === step.key && item.activity === name);
  return [...candidates].sort((a, b) => compareRecency(lastDone(a.name), lastDone(b.name)))[0].name;
}

/** P5: children needing help appear only in that display list, even if they know the card step. */
export function cardHelpLists(card) {
  return { needHelp: card.needHelp, canHelp: card.canHelp.filter((id) => !card.needHelp.includes(id)) };
}

/** Any known state counts; an absent child's map means no steps are known. */
export function firstUnknownStep({ curriculum, known, skillKey }) {
  const skill = curriculum.skills.find((candidate) => candidate.key === skillKey);
  return skill ? [...skill.steps].sort((a, b) => a.size - b.size)
    .find((step) => !known?.has(step.key))?.key ?? null : null;
}

/** P4: prefer a missing prerequisite in the card's skill, then another skill in curriculum order.
 * An absent prerequisite stays unknown; if none has a current skill, there is no step to name.
 */
export function stillOnStep({ curriculum, knownByChild, childId, stepKey }) {
  const steps = stepsIn(curriculum);
  const step = steps.find((candidate) => candidate.key === stepKey);
  const stepKeys = curriculumStepKeys(curriculum);
  if (childReadyFor(knownByChild, childId, step, stepKeys)) return null;
  const missing = step.comes_after.filter((key) => !stepKeys.has(key) || !childKnows(knownByChild, childId, key));
  const ownSkill = curriculum.skills.find((skill) => skill.steps.some((candidate) => candidate.key === stepKey));
  const missingSkill = ownSkill.steps.some((candidate) => missing.includes(candidate.key))
    ? ownSkill : curriculum.skills.find((skill) => skill.steps.some((candidate) => missing.includes(candidate.key)));
  return missingSkill ? firstUnknownStep({ curriculum, known: knownByChild?.get(childId), skillKey: missingSkill.key }) : null;
}

/** Ready options follow curriculum order. Review uses each skill's highest eligible step;
 * taken review keys are excluded after selection, so taking the highest does not offer a lower review.
 */
export function swapOptions({ curriculum, presentChildIds, knownByChild, slot, takenStepKeys }) {
  const { readySteps, groupKnown } = groupStepState({ curriculum, presentChildIds, knownByChild });
  const skills = curriculum.skills.filter((skill) => skill.slot === slot);
  const taken = new Set(takenStepKeys);
  const ready = skills.flatMap((skill) => skill.steps)
    .filter((step) => readySteps.includes(step.key) && !taken.has(step.key))
    .map((step) => ({ step_key: step.key, review: false }));
  if (ready.length > 0) return ready;
  return skills.flatMap((skill) => {
    const step = [...skill.steps].sort((a, b) => b.size - a.size).find((candidate) => {
      if (!groupKnown.includes(candidate.key)) return false;
      const { readyCount, presentCount } = cardReadiness({ curriculum, presentChildIds, knownByChild, stepKey: candidate.key });
      return isGroupMastered(readyCount, presentCount);
    });
    return step && !taken.has(step.key) ? [{ step_key: step.key, review: true }] : [];
  });
}
