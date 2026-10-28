const toggle = (values, value) => values.includes(value)
  ? values.filter(item => item !== value) : [...values, value];
const without = (values, key) => Object.fromEntries(Object.entries(values).filter(([id]) => id !== key));

export const newLessonDraftInput = ({ group, members, programmeId, classId = null,
  languageCode = null, packId = null, lessonDate }) => ({
  programme_id: group.programme_id ?? programmeId, group_id: group.id,
  class_id: classId, language_code: languageCode, pack_id: packId, lesson_date: lessonDate,
  attendance: { childIds: [...new Set(members.map(child => child.id))], absentChildIds: [], addedChildIds: [] },
  plan: null, plan_fixed_at: null,
  ticks: { letters: [], blends: [], books: [], noOneNew: [], blendTierShown: null },
  tracker_changes: {}, reading_level_changes: {}, notes: null,
});
export const toggleAbsent = (draft, childId) => ({
  attendance: { ...draft.attendance, absentChildIds: toggle(draft.attendance.absentChildIds, childId) },
});
export const addChildForToday = (draft, childId) => ({
  attendance: {
    ...draft.attendance,
    childIds: [...new Set([...draft.attendance.childIds, childId])],
    addedChildIds: draft.attendance.childIds.includes(childId) ? draft.attendance.addedChildIds
      : [...draft.attendance.addedChildIds, childId],
    absentChildIds: draft.attendance.absentChildIds.filter(id => id !== childId),
  },
});
export const removeChildForToday = (draft, childId) => ({
  attendance: draft.attendance.addedChildIds.includes(childId)
    ? Object.fromEntries(Object.entries(draft.attendance).map(([key, ids]) => [key, ids.filter(id => id !== childId)]))
    : draft.attendance,
});
const freeze = (draft, { plan, nowIso }) => draft.plan_fixed_at == null
  ? { plan, plan_fixed_at: nowIso } : {};
export const toggleTick = (draft, kind, value, options) => ({
  ticks: { ...draft.ticks, [kind]: toggle(draft.ticks[kind], value) }, ...freeze(draft, options),
});
export const toggleBookRead = (draft, bookId, options) => ({
  ticks: { ...draft.ticks, books: draft.ticks.books.some(book => book.id === bookId)
    ? draft.ticks.books.filter(book => book.id !== bookId) : [...draft.ticks.books, { id: bookId, how: 'printed' }] },
  ...freeze(draft, options),
});
export const setBlendTierShown = (draft, tier) => ({ ticks: { ...draft.ticks, blendTierShown: tier } });
// `changes` is the child's whole pending map from the tracker sheet, which deletes a letter
// when its change is undone, so it replaces the stored map rather than merging into it.
export const setTrackerChanges = (draft, childId, changes) => (Object.keys(changes ?? {}).length === 0
  ? { tracker_changes: without(draft.tracker_changes, childId) }
  : {
    tracker_changes: { ...draft.tracker_changes, [childId]: { ...changes } },
    ticks: { ...draft.ticks, noOneNew: (draft.ticks.noOneNew ?? []).filter(id => id !== childId) },
  });
export const toggleNoOneNew = (draft, childId) => ({
  ticks: { ...draft.ticks, noOneNew: toggle(draft.ticks.noOneNew ?? [], childId) },
  tracker_changes: { ...draft.tracker_changes, [childId]: Object.fromEntries(
    Object.entries(draft.tracker_changes[childId] ?? {}).filter(([letter]) => !draft.ticks.letters.includes(letter))
  ) },
});
export const setReadingLevel = (draft, childId, level, currentLevel) => ({
  reading_level_changes: level === currentLevel ? without(draft.reading_level_changes, childId)
    : { ...draft.reading_level_changes, [childId]: level },
});
export const setLessonDate = (draft, dateKey) => ({ lesson_date: dateKey });
export const setNotes = (draft, text) => ({ notes: text });
export const clearChildChanges = (draft, childId) => ({
  tracker_changes: without(draft.tracker_changes, childId),
  reading_level_changes: without(draft.reading_level_changes, childId),
  ticks: { ...draft.ticks, noOneNew: (draft.ticks.noOneNew ?? []).filter(id => id !== childId) },
});
export const chooseClass = (draft, { classId, languageCode, packId, plan }) => ({
  class_id: classId, language_code: languageCode, pack_id: packId, plan,
});
export const chooseLanguage = (draft, { languageCode, packId, plan }) => ({
  language_code: languageCode, pack_id: packId, plan,
});
export const setPlan = (draft, plan) => ({ plan });
