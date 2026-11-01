/** NumeracyDraft = lesson_drafts row with kind 'numeracy', language_code null, pack_id null,
 *    plan: StoredNumeracyPlan | null,
 *    ticks: { taught: TaughtCard[] | null }, // null = the plan's cards
 *    tracker_changes: { [childId]: { [stepKey]: { mastered: boolean, madeAt: ISO } } },
 *    reading_level_changes: {}
 *  TaughtCard = { slot: 'warm_up'|'activity', step_key: string, activity: string }
 *  StoredNumeracyPlan = Plan (Track C) & { curriculum_edition, made_on: 'YYYY-MM-DD',
 *    present_child_ids: string[], complete: { history, ticks, evidence } }
 */
export { toggleAbsent, addChildForToday, removeChildForToday, setLessonDate, setNotes } from '../lessonPlan/lessonDraftState';

export const newNumeracyDraftInput = ({ group, members, programmeId, classId = null, lessonDate }) => ({
  kind: 'numeracy', programme_id: programmeId, group_id: group.id, class_id: classId,
  language_code: null, pack_id: null, lesson_date: lessonDate,
  attendance: { childIds: [...new Set(members.map(child => child.id))], absentChildIds: [], addedChildIds: [] },
  plan: null, plan_fixed_at: null, ticks: { taught: null },
  tracker_changes: {}, reading_level_changes: {}, notes: null,
});
const cardsFromPlan = plan => (plan?.cards ?? []).map(({ slot, step_key, activity }) => ({ slot, step_key, activity }));
export const taughtCards = draft => draft.ticks.taught ?? cardsFromPlan(draft.plan);
const freeze = (draft, { plan, nowIso }) => draft.plan_fixed_at == null ? { plan, plan_fixed_at: nowIso } : {};

/** The first Swap freezes the suggestion. index === length appends an activity card for
 *  Choose a step when the suggestion has no activity cards (Open question 5).
 */
export const swapCard = (draft, index, { step_key, activity }, options) => {
  const base = draft.ticks.taught ?? cardsFromPlan(draft.plan_fixed_at == null ? options.plan : draft.plan);
  const taught = [...base];
  taught[index] = { slot: index === base.length ? 'activity' : base[index].slot, step_key, activity };
  return { ticks: { ...draft.ticks, taught }, ...freeze(draft, options) };
};
export const freezeForWrapUp = (draft, options) => ({
  ...freeze(draft, options),
  ticks: { ...draft.ticks, taught: draft.ticks.taught ?? cardsFromPlan(draft.plan_fixed_at == null ? options.plan : draft.plan) },
});
export const clearChildStepChanges = (draft, childId) => ({
  tracker_changes: Object.fromEntries(Object.entries(draft.tracker_changes).filter(([id]) => id !== childId)),
});
export const setStepChanges = (draft, childId, changes) => Object.keys(changes ?? {}).length === 0
  ? clearChildStepChanges(draft, childId)
  : { tracker_changes: { ...draft.tracker_changes, [childId]: { ...changes } } };
