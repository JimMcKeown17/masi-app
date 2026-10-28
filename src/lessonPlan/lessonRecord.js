import { planForSave, deriveSessionReadingLevel } from './engine';
import { presentChildIds } from '../db/repositories/lessonDraftsRepository';

export const buildLessonRecord = ({ draft, userId, currentLevels, sessionTypeFields, nowIso }) => {
  const childIds = presentChildIds(draft.attendance);
  const present = new Set(childIds);
  const trackerChanges = Object.fromEntries(Object.entries(draft.tracker_changes).filter(([id]) => present.has(id)));
  const readingLevelChanges = Object.fromEntries(Object.entries(draft.reading_level_changes).filter(([id]) => present.has(id)));
  const blendTierShown = draft.ticks.blendTierShown ?? draft.plan.blend_tier ?? null;
  const { plan, plan_reason } = planForSave({ plan: draft.plan, lessonDate: draft.lesson_date });
  const trackerCheck = Object.values(trackerChanges).some(changes => Object.keys(changes).length > 0)
    ? 'marked' : childIds.every(id => draft.ticks.noOneNew?.includes(id)) ? 'none' : null;
  const activities = {
    letters_focused: draft.ticks.letters,
    session_reading_level: deriveSessionReadingLevel(draft.ticks.blends),
    child_reading_levels: Object.fromEntries(childIds.map(id => [id, readingLevelChanges[id] ?? currentLevels[id] ?? null])),
    comments: draft.notes ?? '',
    lesson: {
      version: 1,
      pack_id: draft.pack_id,
      language: draft.language_code,
      plan,
      ...(plan_reason === 'past_date' ? { plan_reason } : {}),
      blend_tier_shown: blendTierShown,
      blends_done: draft.ticks.blends,
      books_read: draft.ticks.books,
      tracker_check: trackerCheck,
    },
  };
  return {
    session: {
      id: draft.session_id, user_id: userId, programme_id: draft.programme_id,
      group_id: draft.group_id, class_id: draft.class_id, session_date: draft.lesson_date,
      children_ids: childIds, activities, notes: draft.notes ?? '', ...sessionTypeFields,
      synced: false, created_at: nowIso, updated_at: nowIso,
    },
    trackerChanges,
    readingLevelChanges,
  };
};
