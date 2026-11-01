jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockOffline }));
const mockOffline = { lastSyncResult: null };
import React from 'react';
import { renderHook, act, waitFor, cleanupAsync } from '@testing-library/react-native';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { getDefaultTestHandle } from '../test-support/defaultTestHandle';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { createHistoryServer } from '../test-support/assessmentHistoryServer';
import { createSessionHistoryState } from '../src/services/sessionHistoryPull';
import { createSessionHistoryStore } from '../src/services/sessionHistoryStatus';
import { createAssessmentHistoryStore } from '../src/services/assessmentHistoryStatus';
import { useNumeracyLessonDraft } from '../src/hooks/useNumeracyLessonDraft';
import * as planner from '../src/numeracy/planLesson';
import * as transitions from '../src/numeracyLesson/numeracyDraftState';

let handle, start, store, server;
const wrapper = ({ children }) => <SignedInEAContext.Provider value={{ handle, services: handle.services,
  repositories: handle.repositories }}>{children}</SignedInEAContext.Provider>;
const mount = () => renderHook(() => useNumeracyLessonDraft({ start }), { wrapper });
const ready = result => waitFor(() => { expect(result.current.status).toMatch(/unsaved|ready/); expect(result.current.plan).not.toBeNull(); });
const testHook = (name, run) => test(name, async () => { try { await run(); } finally { await cleanupAsync(); } });
const change = async (result, transition, ...args) => act(async () => { await result.current.apply(transition, ...args); });
const freeze = async result => act(async () => { await result.current.ensureDraft(); });
const count = async () => (await (await handle.getReader()).getFirstAsync('select count(*) as n from lesson_drafts')).n;
const notify = async () => act(async () => { await store.start({ userId: handle.userId, force: true }); });
const coverage = async (complete = true) => handle.withTransaction(async transaction => {
  for (const scope of [`skill_mastery_pull:${handle.userId}`, `assessment_history_pull:${handle.userId}:programme-b`, `session_history_pull:${handle.userId}:programme-b`]) {
    await handle.repositories.syncState.setPullState(scope, { cursor: JSON.stringify({ complete, lastFailureAt: null,
      windowStart: '2026-01-15', rescanChildIds: ['c1', 'c2'] }) }, { transaction });
  }
});
beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'performance'] });
  jest.setSystemTime(new Date('2026-11-01T12:00:00.000Z'));
  mockOffline.lastSyncResult = null;
  handle = getDefaultTestHandle();
  await handle.withTransaction(async db => {
    await seedCoreData(db);
    await db.runAsync("update staff_programme_assignments set user_id = ?, programme_id = 'programme-b'", handle.userId);
    await db.runAsync("insert into class_ea_assignments (id, class_id, ea_user_id, programme_id, sync_status) values ('cea-class', 'class-1', ?, 'programme-b', 'synced')", handle.userId);
    await db.runAsync("insert into groups (id, name, programme_id, class_id) values ('g1', 'Group 1', 'programme-b', 'class-1')");
    await db.runAsync("insert into group_ea_assignments (id, group_id, ea_user_id, programme_id) values ('gea', 'g1', ?, 'programme-b')", handle.userId);
    for (const id of ['c1', 'c2']) {
      await db.runAsync("insert into children (id, first_name, last_name, class_id, created_by) values (?, ?, 'Child', 'class-1', ?)", id, id, handle.userId);
      await db.runAsync('insert into child_ea_assignments (id, user_id, child_id) values (?, ?, ?)', id, handle.userId, id);
      await db.runAsync("insert into child_programme_enrollments (id, child_id, programme_id) values (?, ?, 'programme-b')", id, id);
      await db.runAsync("insert into child_class_memberships (id, child_id, class_id, academic_year_id) values (?, ?, 'class-1', 'year-2026')", id, id);
      await db.runAsync("insert into child_group_memberships (id, child_id, group_id) values (?, ?, 'g1')", id, id);
    }
  });
  server = createHistoryServer();
  store = createAssessmentHistoryStore({ database: handle, repositories: handle.repositories, client: server.client, enqueueRequest: task => task() });
  handle.services.assessmentHistory.store = store;
  start = { groupId: 'g1', programmeId: 'programme-b', upNextGroupId: 'g1' };
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

testHook('opening a group shows a plan without creating a draft', async () => {
  const { result } = mount(); await ready(result);
  expect(await count()).toBe(0); expect(result.current.plan.cards).toHaveLength(3);
  expect(result.current.draft).toMatchObject({ kind: 'numeracy', programme_id: 'programme-b', class_id: 'class-1', language_code: null, pack_id: null, ticks: { taught: null } });
  expect(result.current.cards.every(c => c.minutes > 0 && c.readiness.presentCount === 2)).toBe(true);
});
testHook('the first swap creates the draft, freezes the plan and changes that card', async () => {
  const { result } = mount(); await ready(result);
  await act(async () => { await result.current.swap(1, 'read_numbers.5'); });
  expect(await count()).toBe(1); expect(result.current.draft.kind).toBe('numeracy');
  expect(result.current.draft.plan_fixed_at).toBe(new Date().toISOString());
  expect(result.current.cards[1].step_key).toBe('read_numbers.5');
});
testHook('wrap up freezes the plan and fixes taught', async () => {
  const { result } = mount(); await ready(result); await freeze(result);
  expect(result.current.draft.ticks.taught).toHaveLength(3); expect(result.current.draft.plan_fixed_at).toBeTruthy();
  expect((await handle.repositories.lessonDrafts.getActive()).ticks).toEqual(result.current.draft.ticks);
  const fixed = result.current.draft.plan_fixed_at;
  await act(async () => { await result.current.beginSave(); });
  expect(result.current.status).toBe('saving');
  expect(result.current.draft.plan_fixed_at).toBe(fixed);
  await act(async () => { result.current.endSave({ saved: false }); });
});
testHook('a frozen plan never recomputes', async () => {
  const spy = jest.spyOn(planner, 'planNumeracyLesson');
  const { result } = mount(); await ready(result); await freeze(result); const plan = result.current.plan;
  await handle.repositories.skillMastery.setSkillMastery({ childId: 'c1', stepKey: 'add.10', confirmed: true });
  await notify(); await waitFor(() => expect(result.current.knownByChild.get('c1').has('add.10')).toBe(true));
  expect(result.current.plan).toEqual(plan); expect(spy).toHaveBeenCalledTimes(1);
});
testHook('an unfrozen plan recomputes when a child is marked absent', async () => {
  const spy = jest.spyOn(planner, 'planNumeracyLesson'); const { result } = mount(); await ready(result);
  await change(result, transitions.toggleAbsent, 'c2');
  await waitFor(() => expect(result.current.plan.present_child_ids).toEqual(['c1']));
  expect(spy).toHaveBeenCalledTimes(2);
  await waitFor(async () => expect((await handle.repositories.lessonDrafts.getActive()).plan.present_child_ids).toEqual(['c1']));
});
testHook('an unfrozen plan recomputes when inputs become more complete, never less', async () => {
  const { result } = mount(); await ready(result); await change(result, transitions.setNotes, 'Keep');
  await coverage(); await notify(); await waitFor(() => expect(result.current.plan.complete.ticks).toBe(true));
  const plan = result.current.plan;
  const reads = jest.spyOn(handle.repositories.skillMastery, 'getSkillMastery');
  await coverage(false);
  server.disabled.add('get_skill_mastery_page');
  await notify();
  await waitFor(() => expect(reads).toHaveBeenCalled());
  await ready(result);
  expect(await handle.services.assessmentHistory.skillMasteryCompletenessByChild({ childIds: ['c1'] })).toEqual({ c1: false });
  expect(result.current.plan).toEqual(plan);
});
testHook('a history page landing while mounted refreshes an unfrozen plan', async () => {
  const spy = jest.spyOn(planner, 'planNumeracyLesson'); const { result } = mount(); await ready(result);
  expect(result.current.plan.complete.ticks).toBe(false);
  const version = store.getSnapshot().pageVersion; await notify();
  expect(store.getSnapshot().pageVersion).toBeGreaterThan(version);
  await waitFor(() => expect(result.current.plan.complete.ticks).toBe(true)); expect(spy.mock.calls.length).toBeGreaterThan(1);
});
testHook('a history page landing on a frozen plan keeps cards and refreshes readiness', async () => {
  // One child knows the prerequisites and the other does not; Swap may choose any current step.
  await handle.repositories.skillMastery.setSkillMastery({ childId: 'c1', stepKey: 'finger_flash.5', confirmed: true });
  const { result } = mount(); await ready(result);
  await act(async () => { await result.current.swap(0, 'finger_flash.10'); });
  const before = result.current.cards[0]; const plan = result.current.plan;
  await handle.repositories.skillMastery.setSkillMastery({ childId: 'c2', stepKey: 'finger_flash.5', confirmed: true });
  await notify(); await waitFor(() => expect(result.current.cards[0].readiness.readyCount).toBe(before.readiness.readyCount + 1));
  expect(result.current.plan).toEqual(plan); expect(result.current.cards[0].step_key).toBe(before.step_key);
  expect(before.stillOn).toEqual([{ childId: 'c2', stepKey: 'finger_flash.5' }]);
});
testHook('a session-history page landing later refreshes the group history', async () => {
  const client = { rpc: (name) => ({ abortSignal: async () => ({ data: name === 'get_delivery_history_page' ? [{
    id: 'previous', user_id: handle.userId, programme_id: 'programme-b', group_id: 'g1', class_id: 'class-1',
    session_date: '2026-10-31', activities: { numeracy: { taught: before } }, notes: null,
    created_at: '2026-10-31T12:00:00.000Z', updated_at: '2026-10-31T12:00:00.000Z',
  }] : [], error: null }) }) };
  const sessionStore = createSessionHistoryStore({ state: createSessionHistoryState(), database: handle, repositories: handle.repositories, client, enqueueRequest: task => task() });
  handle.services.sessionHistory.store = sessionStore;
  await notify(); const { result } = mount(); await ready(result);
  expect(result.current.plan.complete).toEqual({ ticks: true, evidence: true, history: false });
  const before = result.current.cards.map(({ slot, step_key, activity }) => ({ slot, step_key, activity }));
  await act(async () => { await sessionStore.start({ userId: handle.userId, force: true }); });
  expect(sessionStore.getSnapshot().pageVersion).toBeGreaterThan(0);
  await waitFor(() => expect(result.current.plan.complete.history).toBe(true));
  expect(result.current.base.sessions.map(s => s.id)).toContain('previous');
  expect(result.current.cards[1].activity).not.toBe(before[1].activity);
});
testHook('a start whose programme is no longer maths opens nothing', async () => {
  await handle.withTransaction(db => db.runAsync("update staff_programme_assignments set programme_id = 'programme-a'"));
  const { result } = mount(); await waitFor(() => expect(result.current.status).toBe('wrong_programme'));
  expect(result.current.draft).toBeNull(); expect(await count()).toBe(0);
});
testHook('readiness lines follow today\'s attendance on a frozen plan', async () => {
  const { result } = mount(); await ready(result); await freeze(result); const step = result.current.cards[0].step_key;
  await change(result, transitions.toggleAbsent, 'c2');
  expect(result.current.cards[0].step_key).toBe(step); expect(result.current.cards[0].readiness.presentCount).toBe(1);
});
testHook('the plan is computed once per input change', async () => {
  const spy = jest.spyOn(planner, 'planNumeracyLesson'); const { result, rerender } = mount(); await ready(result);
  rerender({}); rerender({}); await change(result, transitions.setNotes, 'Unrelated'); rerender({});
  expect(spy).toHaveBeenCalledTimes(1);
});
// Codex review round 1: an abandoned start must not replace the shared controller's lesson.
testHook('a start abandoned during its group read never opens the controller', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const realGetGroups = handle.repositories.groups.getGroups;
  const getGroups = jest.spyOn(handle.repositories.groups, 'getGroups').mockImplementation(async (...args) => {
    await gate; return realGetGroups(...args);
  });
  const open = jest.spyOn(handle.services.lessonDraft, 'open');
  const view = mount();
  await waitFor(() => expect(getGroups).toHaveBeenCalled());
  view.unmount();
  await act(async () => { release(); await gate; await new Promise(resolve => setImmediate(resolve)); });
  await act(async () => { await new Promise(resolve => setImmediate(resolve)); });
  expect(open).not.toHaveBeenCalled();
});
