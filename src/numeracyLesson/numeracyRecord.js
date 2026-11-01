import { CURRENT_EDITION } from '../../content/numeracy-curriculum';
import { presentChildIds } from '../db/repositories/lessonDraftsRepository';
import { savedNumeracyPlan } from '../numeracy/planRecord';
import { taughtCards } from './numeracyDraftState';

/** Keep the stored curriculum edition the EA saw; otherwise use the supplied edition,
 *  defaulting to CURRENT_EDITION. Only present children's non-empty changes are saved.
 */
export const buildNumeracySessionRecord = ({ draft, userId, sessionTypeFields, nowIso, curriculumEdition = CURRENT_EDITION }) => {
  const childIds = presentChildIds(draft.attendance);
  const present = new Set(childIds);
  const { plan, plan_reason } = savedNumeracyPlan({ stored: draft.plan, lessonDate: draft.lesson_date });
  return {
    session: {
      id: draft.session_id, user_id: userId, programme_id: draft.programme_id,
      group_id: draft.group_id, class_id: draft.class_id, session_date: draft.lesson_date,
      children_ids: childIds,
      activities: { numeracy: {
        curriculum_edition: draft.plan.curriculum_edition ?? curriculumEdition,
        plan, ...(plan_reason ? { plan_reason } : {}), taught: taughtCards(draft),
      } },
      notes: draft.notes ?? '', ...sessionTypeFields,
      synced: false, created_at: nowIso, updated_at: nowIso,
    },
    stepChanges: Object.fromEntries(Object.entries(draft.tracker_changes).filter(([id, changes]) => present.has(id) && Object.keys(changes ?? {}).length > 0)),
  };
};
