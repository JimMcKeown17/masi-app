import React from 'react';
import { renderHook, act, waitFor, cleanupAsync } from '@testing-library/react-native';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { getDefaultTestHandle } from '../test-support/defaultTestHandle';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { draftStart, holdDraftWrite } from '../test-support/lessonDraftTestUtils';
import { MON } from '../test-support/lessonSaveFixtures';
import { useLessonDraft } from '../src/hooks/useLessonDraft';
import * as transitions from '../src/lessonPlan/lessonDraftState';
import * as engine from '../src/lessonPlan/engine/lessonPlan';
import { planForSave } from '../src/lessonPlan/engine';

let handle, start;
// Dispose mounted screens before the global default-handle teardown publishes closed.
const testHook = (name, run) => test(name, async () => {
  try { await run(); } finally { await cleanupAsync(); }
});
const wrapper = ({ children }) => <SignedInEAContext.Provider value={{
  handle, repositories: handle.repositories, services: handle.services,
}}>{children}</SignedInEAContext.Provider>;
const mount = options => renderHook(() => useLessonDraft(options ?? { start }), { wrapper });
const ready = async result => waitFor(() => {
  expect(result.current.status).toMatch(/unsaved|ready/);
  expect(result.current.plan).not.toBeNull();
});
const change = async (result, transition, ...args) => {
  await act(async () => { await result.current.apply(transition, ...args); });
};
const refusal = async promise => {
  let error;
  try { await promise; } catch (caught) { error = caught; }
  expect(error).toBeDefined();
};

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'performance'] });
  jest.setSystemTime(new Date(MON));
  handle = getDefaultTestHandle();
  await handle.withTransaction(async db => {
    await seedCoreData(db);
    await db.runAsync('update staff_programme_assignments set user_id = ?', handle.userId);
    await db.runAsync("update classes set home_language = 'English'");
    await db.runAsync("insert into classes (id, school_id, name, grade, academic_year_id, home_language) values ('class-2', 'school-1', 'Other', '2', 'year-2026', 'isiXhosa')");
    for (const id of ['c1', 'c2']) {
      await db.runAsync("insert into children (id, first_name, last_name, class_id, reading_level, created_by) values (?, ?, 'Child', 'class-1', 'Letter Knowledge', ?)", id, id, handle.userId);
      await db.runAsync("insert into child_ea_assignments (id, user_id, child_id) values (?, ?, ?)", id, handle.userId, id);
    }
    await db.runAsync("insert into groups (id, name, programme_id, class_id) values ('group-1', 'Group 1', 'programme-a', 'class-1')");
  });
  start = { group: { id: 'group-1', class_id: 'class-1', programme_id: 'programme-a' },
    members: [{ id: 'c1', class_id: 'class-1' }, { id: 'c2', class_id: 'class-1' }], upNextGroupId: 'group-1' };
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

testHook('attendance before the first tick recomputes the plan; after it, it does not', async () => {
  const { result } = mount();
  await ready(result);
  expect(await handle.repositories.lessonDrafts.getActive()).toBeNull();
  expect(result.current.plan.present_child_ids).toEqual(['c1', 'c2']);
  await change(result, transitions.toggleAbsent, 'c2');
  await waitFor(() => expect(result.current.plan.present_child_ids).toEqual(['c1']));
  await change(result, transitions.toggleTick, 'letters', 'a');
  const frozen = result.current.plan;
  expect(result.current.draft.plan_fixed_at).toBe(MON);
  await change(result, transitions.toggleAbsent, 'c2');
  await waitFor(() => expect(result.current.lessonInput.presentChildren).toHaveLength(2));
  expect(result.current.plan).toEqual(frozen);
  expect((await handle.repositories.lessonDrafts.getActive()).plan).toEqual(frozen);
});
testHook('a different day never recomputes, frozen or not', async () => {
  const planSpy = jest.spyOn(engine, 'computeLessonPlan');
  for (const frozen of [false, true]) {
    const row = await handle.repositories.lessonDrafts.create(draftStart({ plan_fixed_at: frozen ? MON : null }));
    jest.setSystemTime(new Date('2026-10-21T09:00:00.000Z'));
    const { result, unmount } = mount({ draftId: row.id });
    await ready(result);
    expect(result.current.plan).toEqual(row.plan);
    await change(result, transitions.toggleAbsent, 'c2');
    await waitFor(() => expect(result.current.lessonInput.presentChildren).toHaveLength(1));
    expect(result.current.plan).toEqual(row.plan);
    expect(planSpy).not.toHaveBeenCalled();
    unmount();
    await handle.services.lessonDraft.discard();
  }
});
testHook('a mixed-class group needs a class; choosing stores class, language, pack and plan', async () => {
  start = { ...start, group: { ...start.group, class_id: null },
    members: [{ id: 'c1', class_id: 'class-1' }, { id: 'c2', class_id: 'class-2' }] };
  const { result } = mount();
  await waitFor(() => expect(result.current.needs).toBe('class'));
  await act(async () => {
    await refusal(result.current.ensureDraft());
    await refusal(result.current.apply(transitions.toggleTick, 'letters', 'a'));
  });
  expect(await handle.repositories.lessonDrafts.getActive()).toBeNull();
  await change(result, transitions.chooseClass, { classId: 'class-2' });
  await ready(result);
  const row = await handle.repositories.lessonDrafts.getActive();
  expect(row).toMatchObject({ class_id: 'class-2', language_code: 'xh', pack_id: 'isixhosa-interim-letters-v1',
    plan: { present_child_ids: ['c1', 'c2'] } });
  expect(result.current.needs).toBeNull();
});
testHook('a class with no language needs a language (P6)', async () => {
  await handle.withTransaction(db => db.runAsync('update classes set home_language = null'));
  const { result } = mount();
  await waitFor(() => expect(result.current.needs).toBe('language'));
  await act(async () => { await refusal(result.current.ensureDraft()); });
  await change(result, transitions.chooseLanguage, { languageCode: 'en' });
  await ready(result);
  expect(await handle.repositories.lessonDrafts.getActive()).toMatchObject({
    class_id: 'class-1', language_code: 'en', pack_id: 'english-interim-letters-v1', plan: { made_on: '2026-10-19' },
  });
});
testHook('engine functions run once per change', async () => {
  const planSpy = jest.spyOn(engine, 'computeLessonPlan');
  const choicesSpy = jest.spyOn(engine, 'computeLessonChoices');
  const { result, rerender } = mount();
  await ready(result);
  expect(planSpy).toHaveBeenCalledTimes(1);
  expect(choicesSpy).toHaveBeenCalledTimes(1);
  rerender({});
  await change(result, transitions.setNotes, 'nothing pedagogical changed');
  expect(planSpy).toHaveBeenCalledTimes(1);
  expect(choicesSpy).toHaveBeenCalledTimes(1);
  await change(result, transitions.toggleAbsent, 'c2');
  await waitFor(() => expect(result.current.plan.present_child_ids).toEqual(['c1']));
  expect(planSpy).toHaveBeenCalledTimes(2);
  expect(choicesSpy).toHaveBeenCalledTimes(2);
});
testHook('two mounted hook instances on one draft see the same draft, including a held edit', async () => {
  const first = mount();
  await ready(first.result);
  let row;
  await act(async () => { row = await first.result.current.ensureDraft(); });
  const held = await holdDraftWrite();
  let write;
  act(() => { write = first.result.current.apply(transitions.toggleTick, 'letters', 'a'); });
  await held.entered;
  const second = mount({ draftId: row.id });
  await waitFor(() => expect(second.result.current.draft?.ticks.letters).toEqual(['a']));
  expect(second.result.current.draft).toBe(first.result.current.draft);
  await act(async () => { held.release(); await write; });
  await waitFor(() => expect(second.result.current.draft).toBe(first.result.current.draft));
});

testHook('beginSave from an untouched lesson includes the initial plan and locks edits immediately', async () => {
  const { result } = mount();
  await ready(result);
  const held = await holdDraftWrite();
  let saving, refused;
  act(() => {
    saving = result.current.beginSave();
    refused = result.current.apply(transitions.setNotes, 'too late').then(() => null, error => error);
  });
  await held.entered;
  expect((await refused)?.name).toBe('LessonDraftBusyError');
  let row;
  await act(async () => { held.release(); row = await saving; });
  expect(row.plan).toEqual(result.current.plan);
  expect(row.plan).not.toBeNull();
});
testHook('an untouched lesson opened before midnight and first changed after it keeps a plan for its own date', async () => {
  const { AppState } = require('react-native');
  const listeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
    listeners.push(listener); return { remove: () => {} };
  });
  jest.setSystemTime(new Date('2026-10-19T21:55:00.000Z')); // 23:55 Monday, programme time
  const { result } = mount();
  await ready(result);
  expect(result.current.draft.lesson_date).toBe('2026-10-19');
  jest.setSystemTime(new Date('2026-10-19T22:05:00.000Z')); // 00:05 Tuesday
  act(() => { for (const listener of listeners) listener('active'); });
  await waitFor(() => expect(result.current.plan.made_on).toBe('2026-10-20'));
  await change(result, transitions.toggleTick, 'letters', 'a');
  const stored = await handle.repositories.lessonDrafts.getActive();
  expect(stored.lesson_date).toBe('2026-10-20');
  expect(planForSave({ plan: stored.plan, lessonDate: stored.lesson_date })).toEqual({ plan: stored.plan, plan_reason: null });
});
testHook('a new lesson takes only group members on the visible roster, as the picker does', async () => {
  await handle.withTransaction(async db => {
    for (const id of ['hidden', 'handed-over']) {
      await db.runAsync("insert into children (id, first_name, last_name, class_id, created_by, hidden_at) values (?, ?, 'Child', 'class-1', ?, ?)",
        id, id, handle.userId, id === 'hidden' ? '2026-10-01T08:00:00Z' : null);
      await db.runAsync("insert into child_ea_assignments (id, user_id, child_id, assigned_at, unassigned_at) values (?, ?, ?, '2026-01-15', ?)",
        id, handle.userId, id, id === 'handed-over' ? '2026-10-01' : null);
    }
    for (const id of ['c1', 'c2', 'hidden', 'handed-over']) {
      await db.runAsync("insert into child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at) values (?, ?, 'class-1', 'year-2026', '2026-01-15')", `ccm-${id}`, id);
      await db.runAsync("insert into child_programme_enrollments (id, child_id, programme_id) values (?, ?, 'programme-a')", `cpe-${id}`, id);
      await db.runAsync("insert into child_group_memberships (id, child_id, group_id, joined_at) values (?, ?, 'group-1', '2026-01-15')", `cgm-${id}`, id);
    }
    await db.runAsync("insert into group_ea_assignments (id, group_id, ea_user_id, programme_id) values ('gea', 'group-1', ?, 'programme-a')", handle.userId);
  });
  const { result } = mount({ start: { groupId: 'group-1', upNextGroupId: 'group-1' } });
  await ready(result);
  expect(result.current.draft.attendance.childIds).toEqual(['c1', 'c2']);
});
