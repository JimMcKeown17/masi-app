import * as state from '../src/lessonPlan/lessonDraftState';
import { lessonDraftInput, MON } from '../test-support/lessonSaveFixtures';

const draft = overrides => lessonDraftInput({ plan_fixed_at: null, ...overrides });
const after = (row, transition, ...args) => ({ ...row, ...transition(row, ...args) });

test('newLessonDraftInput starts with the group context and no edits', () => {
  expect(state.newLessonDraftInput({ group: { id: 'g', programme_id: 'own' }, members: [{ id: 'c1' }, { id: 'c2' }],
    programmeId: 'fallback', classId: 'class-1', languageCode: 'en', packId: 'pack', lessonDate: '2026-10-19' })).toEqual({
    group_id: 'g', programme_id: 'own', class_id: 'class-1', language_code: 'en', pack_id: 'pack', lesson_date: '2026-10-19',
    attendance: { childIds: ['c1', 'c2'], absentChildIds: [], addedChildIds: [] },
    plan: null, plan_fixed_at: null, ticks: { letters: [], blends: [], books: [], noOneNew: [], blendTierShown: null },
    tracker_changes: {}, reading_level_changes: {}, notes: null,
  });
  expect(state.newLessonDraftInput({ group: { id: 'g' }, members: [], programmeId: 'fallback',
    lessonDate: '2026-10-19' }).programme_id).toBe('fallback');
});

test('toggleAbsent toggles only attendance', () => {
  const row = draft();
  const absent = after(row, state.toggleAbsent, 'c1');
  expect(absent.attendance.absentChildIds).toEqual(['c1']);
  expect(state.toggleAbsent(absent, 'c1').attendance.absentChildIds).toEqual([]);
  expect(row.attendance.absentChildIds).toEqual([]);
});
test('addChildForToday adds a child once and makes them present', () => {
  let row = after(draft(), state.addChildForToday, 'c3');
  row = after(row, state.toggleAbsent, 'c3');
  row = after(row, state.addChildForToday, 'c3');
  expect(row.attendance).toEqual({ childIds: ['c1', 'c2', 'c3'], absentChildIds: [], addedChildIds: ['c3'] });
});
test('removeChildForToday removes an added child without removing a group member', () => {
  const row = after(after(draft(), state.addChildForToday, 'c3'), state.toggleAbsent, 'c3');
  expect(state.removeChildForToday(row, 'c3').attendance).toEqual(draft().attendance);
  expect(after(row, state.removeChildForToday, 'c1').attendance.childIds).toContain('c1');
});
test('toggleTick toggles letters and blends without mutating its input', () => {
  const row = draft();
  expect(state.toggleTick(row, 'letters', 'a', { plan: row.plan, nowIso: MON }).ticks.letters).toEqual([]);
  expect(state.toggleTick(row, 'blends', 'ma', { plan: row.plan, nowIso: MON }).ticks.blends).toEqual(['am', 'ma']);
  expect(row.ticks.letters).toEqual(['a']);
});
test('toggleBookRead defaults to printed and toggles by book id', () => {
  const row = draft();
  expect(state.toggleBookRead(row, 'b', { plan: row.plan, nowIso: MON }).ticks.books).toEqual([
    ...row.ticks.books, { id: 'b', how: 'printed' },
  ]);
  expect(state.toggleBookRead(row, 'reader-1', { plan: row.plan, nowIso: MON }).ticks.books).toEqual([]);
});
test('setBlendTierShown retains other ticks', () => {
  expect(state.setBlendTierShown(draft(), 'Word Reading').ticks).toEqual({ ...draft().ticks, blendTierShown: 'Word Reading' });
});
test('setTrackerChanges stores the sheet\'s whole map for the child, keeping each mark\'s time and language', () => {
  const mark = { mastered: false, languageCode: 'en', madeAt: MON };
  const pending = { ...draft().tracker_changes.c1, m: mark };
  expect(state.setTrackerChanges(draft(), 'c1', pending).tracker_changes.c1).toEqual(pending);
});
test('an undone mark is gone: the sheet\'s map without it replaces the stored one', () => {
  const tapped = after(draft(), state.setTrackerChanges, 'c1', {
    m: { mastered: true, languageCode: 'en', madeAt: MON }, z: { mastered: false, languageCode: 'en', madeAt: MON },
  });
  const undone = after(tapped, state.setTrackerChanges, 'c1', { z: tapped.tracker_changes.c1.z });
  expect(undone.tracker_changes.c1).toEqual({ z: tapped.tracker_changes.c1.z });
  const cleared = after(undone, state.setTrackerChanges, 'c1', {});
  expect(cleared.tracker_changes).not.toHaveProperty('c1');
});
test('an empty map leaves No one new yet as it was', () => {
  const none = after(draft({ tracker_changes: {} }), state.toggleNoOneNew, 'c1');
  expect(after(none, state.setTrackerChanges, 'c1', {}).ticks.noOneNew).toEqual(['c1']);
});
test('toggleNoOneNew toggles per child', () => {
  const row = after(draft(), state.toggleNoOneNew, 'c1');
  expect(row.ticks.noOneNew).toEqual(['c1']);
  expect(state.toggleNoOneNew(row, 'c1').ticks.noOneNew).toEqual([]);
});
test('setReadingLevel stores only a chosen change', () => {
  expect(state.setReadingLevel(draft(), 'c2', 'Word Reading', 'Letter Knowledge').reading_level_changes).toEqual({
    c1: '3 Letter Blends', c2: 'Word Reading',
  });
});
test('setLessonDate keeps the original plan for the save date rule', () => {
  expect(state.setLessonDate(draft(), '2026-10-18')).toEqual({ lesson_date: '2026-10-18' });
});
test('setNotes stores the text', () => {
  expect(state.setNotes(draft(), 'Notes')).toEqual({ notes: 'Notes' });
});
test('clearChildChanges clears only the selected child', () => {
  const row = draft({ ticks: { ...draft().ticks, noOneNew: ['c1', 'c2'] }, tracker_changes: {
    ...draft().tracker_changes, c2: draft().tracker_changes.c1,
  } });
  const result = after(row, state.clearChildChanges, 'c1');
  expect(result.tracker_changes).toEqual({ c2: row.tracker_changes.c2 });
  expect(result.reading_level_changes).toEqual({});
  expect(result.ticks.noOneNew).toEqual(['c2']);
});
test('chooseClass stores class, language, pack and plan together', () => {
  expect(state.chooseClass(draft(), { classId: 'c', languageCode: 'xh', packId: 'p', plan: { next: true } })).toEqual({
    class_id: 'c', language_code: 'xh', pack_id: 'p', plan: { next: true },
  });
});
test('chooseLanguage stores language, pack and plan together', () => {
  expect(state.chooseLanguage(draft(), { languageCode: 'xh', packId: 'p', plan: { next: true } })).toEqual({
    language_code: 'xh', pack_id: 'p', plan: { next: true },
  });
});
test('setPlan replaces the unfrozen plan', () => {
  expect(state.setPlan(draft(), { next: true })).toEqual({ plan: { next: true } });
});
test('the first tick freezes the plan; later ticks do not touch it', () => {
  for (const [transition, args] of [[state.toggleTick, ['letters', 'm']], [state.toggleTick, ['blends', 'ma']],
    [state.toggleBookRead, ['b']]]) {
    const row = draft();
    const patch = transition(row, ...args, { plan: row.plan, nowIso: MON });
    expect(patch).toMatchObject({ plan: row.plan, plan_fixed_at: MON });
    const later = transition({ ...row, ...patch }, ...args, { plan: { changed: true }, nowIso: '2026-10-20T09:00:00.000Z' });
    expect(later).not.toHaveProperty('plan');
    expect(later).not.toHaveProperty('plan_fixed_at');
  }
});
test('marking a child absent never changes membership or added children', () => {
  const row = after(draft(), state.addChildForToday, 'c3');
  const patch = state.toggleAbsent(row, 'c3');
  expect(Object.keys(patch)).toEqual(['attendance']);
  expect(patch.attendance.childIds).toEqual(row.attendance.childIds);
  expect(patch.attendance.addedChildIds).toEqual(['c3']);
});
test("No one new yet clears that child's marks for today's letters, and a later mark clears No one new yet", () => {
  const row = draft({ tracker_changes: { c1: {
    ...draft().tracker_changes.c1, z: { mastered: false, languageCode: 'en', madeAt: MON },
  } } });
  const none = after(row, state.toggleNoOneNew, 'c1');
  expect(none.tracker_changes.c1).toEqual({ z: row.tracker_changes.c1.z });
  expect(none.ticks.noOneNew).toEqual(['c1']);
  const marked = after(none, state.setTrackerChanges, 'c1', row.tracker_changes.c1);
  expect(marked.ticks.noOneNew).toEqual([]);
});
test('choosing the current level removes the reading-level change', () => {
  expect(state.setReadingLevel(draft(), 'c1', 'Letter Knowledge', 'Letter Knowledge').reading_level_changes).toEqual({});
});
