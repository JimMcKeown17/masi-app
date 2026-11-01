import { groupStepState, childKnows } from './groupSteps';

/** Curriculum = { edition, skills: Skill[] }
 *  Skill = { key, label, hint, group: 'main'|'counting', slot: 'warm_up'|'activity', steps: Step[] }
 *  Step = { key, skill, label, size, goal, activities: Activity[], tick_when, comes_after: string[], note_for_partner }
 *  Activity = { name, minutes, how, needs, source, source_ref }
 *  KnownState = 'assessment' | 'ticked' | 'implied'
 */

/** input = { curriculum, presentChildIds: string[], knownByChild: Map<childId, Map<stepKey, KnownState>>,
 *            history: Array<{ date: 'YYYY-MM-DD', createdAt: string, id: string, taught: Array<{ slot, step_key, activity }> }>,
 *            // createdAt = ISO, the session's created_at; id = session id
 *            activityCardCount: number,   // 2 in this release
 *            lessonDate: 'YYYY-MM-DD',
 *            complete: { history: boolean, ticks: boolean, evidence: boolean } }
 *  Plan = { engine_version: 1,
 *           cards: Array<{ slot: 'warm_up'|'activity', step_key, activity: string,   // activity = Activity.name
 *                          readyCount: number, presentCount: number, needHelp: string[], canHelp: string[] }>,
 *           reason: 'ok'|'no_children'|'no_ready_activity'|'incomplete_inputs',
 *           readySteps: string[] }   // groupStepState().readySteps, for Swap
 */
export const NUMERACY_ENGINE_VERSION = 1;

const text = (value) => typeof value === 'string' ? value : '';
const compareRecency = (a, b) => {
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
const taughtItems = (entry) => Array.isArray(entry.taught) ? entry.taught : [];
const newestMatching = (history, matches) => history.reduce((latest, entry) => (
  taughtItems(entry).some((item) => item != null && matches(item))
    && compareRecency(entry, latest) > 0 ? entry : latest
), null);

/** Suggest cards from group readiness, rotating skills and activities by lesson recency. */
export function planNumeracyLesson(input) {
  const { curriculum, knownByChild, activityCardCount, lessonDate, complete } = input;
  const { presentIds, groupKnown, groupStepBySkill, readySteps } = groupStepState(input);
  if (presentIds.length === 0) {
    return { engine_version: NUMERACY_ENGINE_VERSION, cards: [], reason: 'no_children', readySteps: [] };
  }
  const history = (Array.isArray(input.history) ? input.history : []).filter((entry) => (
    typeof entry?.date === 'string' && entry.date.length > 0 && entry.date <= lessonDate
  ));
  const lastTaught = (skillKey) => newestMatching(history, (item) => (
    typeof item.step_key === 'string' && item.step_key.split('.')[0] === skillKey
  ));
  // Stable sorting retains curriculum/file order when recency keys tie.
  const rank = (skills) => [...skills].sort((a, b) => compareRecency(lastTaught(a.key), lastTaught(b.key)));
  const pickActivity = (step, slot) => {
    const short = slot === 'warm_up' ? step.activities.filter((a) => a.minutes <= 5) : [];
    const candidates = short.length > 0 ? short : step.activities;
    const lastDone = (name) => newestMatching(history, (item) => item.step_key === step.key && item.activity === name);
    return [...candidates].sort((a, b) => compareRecency(lastDone(a.name), lastDone(b.name)))[0].name;
  };
  const hasReadyStep = (skill) => readySteps.includes(groupStepBySkill.get(skill.key));
  const warmSkills = curriculum.skills.filter((skill) => skill.slot === 'warm_up');
  const readyWarm = rank(warmSkills.filter(hasReadyStep))[0];
  const reviewWarm = readyWarm ? null : rank(warmSkills.filter((skill) => (
    skill.steps.some((step) => groupKnown.includes(step.key))
  )))[0];
  const warmSkill = readyWarm ?? reviewWarm;
  const warmStep = readyWarm ? groupStepBySkill.get(readyWarm.key) : reviewWarm
    ? [...reviewWarm.steps].filter((step) => groupKnown.includes(step.key)).sort((a, b) => b.size - a.size)[0].key
    : null;
  const makeCard = (skill, stepKey) => {
    const ordered = [...skill.steps].sort((a, b) => a.size - b.size);
    const index = ordered.findIndex((step) => step.key === stepKey);
    const step = ordered[index];
    const previous = ordered[index - 1];
    return {
      slot: skill.slot,
      step_key: step.key,
      activity: pickActivity(step, skill.slot),
      readyCount: presentIds.filter((id) => step.comes_after.every((key) => childKnows(knownByChild, id, key))).length,
      presentCount: presentIds.length,
      needHelp: previous ? presentIds.filter((id) => !childKnows(knownByChild, id, previous.key)) : [],
      canHelp: presentIds.filter((id) => childKnows(knownByChild, id, step.key)),
    };
  };
  const activityCards = rank(curriculum.skills.filter((skill) => skill.slot === 'activity' && hasReadyStep(skill)))
    .slice(0, activityCardCount).map((skill) => makeCard(skill, groupStepBySkill.get(skill.key)));
  const cards = [...(warmSkill ? [makeCard(warmSkill, warmStep)] : []), ...activityCards];
  const incomplete = ['history', 'ticks', 'evidence'].some((key) => complete?.[key] !== true);
  return {
    engine_version: NUMERACY_ENGINE_VERSION,
    cards,
    reason: incomplete ? 'incomplete_inputs' : activityCards.length === 0 ? 'no_ready_activity' : 'ok',
    readySteps,
  };
}
