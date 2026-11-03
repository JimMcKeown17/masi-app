/** StoredNumeracyPlan = Plan (Track C) & { curriculum_edition, made_on: 'YYYY-MM-DD',
 *    present_child_ids: string[], complete: { history: boolean, ticks: boolean, evidence: boolean } }
 *  TaughtCard = { slot: 'warm_up'|'activity', step_key: string, activity: string }
 *  SavedPlan = { engine_version, suggested: TaughtCard[], reasons: { reason, made_on,
 *    complete: { history: boolean, ticks: boolean, evidence: boolean },
 *    cards: Array<{ slot, step_key, ready_count: number, present_count: number }> } }
 */

/** Preserve the suggestion and the input completeness available when it was made. */
export function storeNumeracyPlan({ plan, curriculumEdition, lessonDate, presentChildIds, complete }) {
  return {
    ...plan,
    curriculum_edition: curriculumEdition,
    made_on: lessonDate,
    present_child_ids: [...new Set(presentChildIds)],
    complete: {
      history: complete?.history === true,
      ticks: complete?.ticks === true,
      evidence: complete?.evidence === true,
    },
  };
}

/** Supersession requires no loss of completeness and at least one newly complete input. */
export function isNumeracyPlanSuperseded(stored, complete) {
  const flags = ['history', 'ticks', 'evidence'].map((key) => ({
    s: stored?.complete?.[key] === true, n: complete?.[key] === true,
  }));
  return flags.every(({ s, n }) => n || !s) && flags.some(({ s, n }) => n && !s);
}

/** Persist suggestion and reasons only for the day on which the plan was made. */
export function savedNumeracyPlan({ stored, lessonDate }) {
  if (lessonDate !== stored.made_on) return { plan: null, plan_reason: 'past_date' };
  return {
    plan: {
      engine_version: stored.engine_version,
      suggested: stored.cards.map(({ slot, step_key, activity }) => ({ slot, step_key, activity })),
      reasons: {
        reason: stored.reason,
        made_on: stored.made_on,
        complete: stored.complete,
        cards: stored.cards.map((c) => ({ slot: c.slot, step_key: c.step_key, ready_count: c.readyCount, present_count: c.presentCount })),
      },
    },
    plan_reason: null,
  };
}
