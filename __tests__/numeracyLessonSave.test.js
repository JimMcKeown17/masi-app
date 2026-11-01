global.__MASI_NO_DEFAULT_HANDLE__ = true;
jest.mock('expo-updates', () => ({ channel: null }));
import fs from 'fs';
import os from 'os';
import path from 'path';
import { requestOpen, resetHandleRegistryForTests } from '../src/session/signedInHandle';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { newNumeracyDraftInput } from '../src/numeracyLesson/numeracyDraftState';
import { storeNumeracyPlan } from '../src/numeracy/planRecord';
import { saveNumeracyLesson } from '../src/services/numeracyLessonSave';
import { LessonSaveError } from '../src/services/lessonSave';
import * as skillRepository from '../src/db/repositories/skillMasteryRepository';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { buildSessionTypeFields } from '../src/utils/sessionTypeResolver';
const USER = '11111111-1111-4111-8111-111111111111';
const TAP = '2026-10-19T08:00:00.000Z', NOW = '2026-10-21T10:00:00.000Z', DATE = '2026-10-21';
const taught = [
  { slot: 'warm_up', step_key: 'finger_flash.5', activity: 'Flash' },
  { slot: 'activity', step_key: 'count.5', activity: 'Count' },
  { slot: 'activity', step_key: 'add.5', activity: 'Add' },
];
const complete = { history: true, ticks: true, evidence: true };
let handle, repositories, draft, writer, dir, transport;
const write = task => handle.withTransaction(task);
const read = async (sql, ...params) => (await handle.getReader()).getAllAsync(sql, ...params);
const save = extra => saveNumeracyLesson({ handle, draft, sessionTypeFields: buildSessionTypeFields({ jobTitlesCache: [] }), nowIso: NOW, ...extra });
const snapshot = async () => Promise.all(['sessions', 'session_attendees', 'skill_mastery', 'sync_outbox', 'lesson_drafts'].map(table => read(`select * from ${table} order by rowid`)));
const rejectSave = async (code, extra, childIds) => {
  const before = await snapshot(); let caught;
  try { await save(extra); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(LessonSaveError); expect(caught.code).toBe(code); expect(caught.childIds).toEqual(childIds);
  expect(await snapshot()).toEqual(before);
};
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-numeracy-save-'));
  transport = jest.fn(async () => { throw new Error('save must not make a request'); });
  handle = await requestOpen({ userId: USER, fetchImpl: transport, openDatabase: async (name, options) => {
    const db = createBetterSqliteTestDatabase(path.join(dir, name), { honorQueryOnly: true });
    if (!options?.useNewConnection) writer = db;
    return db;
  } });
  repositories = handle.repositories;
  await write(async txn => {
    await seedCoreData(txn);
    await txn.runAsync("update staff_programme_assignments set user_id = ?, programme_id = 'programme-b'", USER);
    for (const id of ['c1', 'c2']) {
      await txn.runAsync("insert into children (id, first_name, last_name, class_id, created_by, sync_status) values (?, 'Test', 'Child', 'class-1', 'head-office', 'synced')", id);
      await txn.runAsync("insert into child_ea_assignments (id, user_id, child_id, assigned_at, sync_status) values (?, ?, ?, '2026-01-15', 'synced')", `direct-${id}`, USER, id);
    }
    await txn.runAsync("insert into groups (id, name, programme_id, class_id, created_by, sync_status) values ('group-1', 'Group 1', 'programme-b', 'class-1', ?, 'synced')", USER);
    await txn.runAsync("insert into group_ea_assignments (id, group_id, ea_user_id, programme_id, assigned_at, sync_status) values ('group-grant', 'group-1', ?, 'programme-b', '2026-01-15', 'synced')", USER);
  });
  const plan = storeNumeracyPlan({ plan: { engine_version: 1, reason: 'ok', readySteps: taught.map(c => c.step_key), cards: taught.map(c => ({ ...c, readyCount: 2, presentCount: 2, needHelp: [], canHelp: [] })) }, curriculumEdition: 'seen-edition', lessonDate: DATE, presentChildIds: ['c1', 'c2'], complete });
  draft = await repositories.lessonDrafts.create({ ...newNumeracyDraftInput({ group: { id: 'group-1' }, members: [{ id: 'c1' }, { id: 'c2' }], programmeId: 'programme-b', classId: 'class-1', lessonDate: DATE }), plan, tracker_changes: { c1: { 'add.5': { mastered: true, madeAt: TAP } }, c2: { 'count.5': { mastered: true, madeAt: TAP } } } });
});
afterEach(async () => {
  expect(transport).not.toHaveBeenCalled();
  jest.restoreAllMocks(); await resetHandleRegistryForTests(); fs.rmSync(dir, { recursive: true, force: true });
});
test('saves the session, attendees, every tick and discards the draft in one transaction', async () => {
  expect(await save()).toEqual({ sessionId: draft.session_id, keptBack: 0 });
  expect(await read('select id from sessions')).toEqual([{ id: draft.session_id }]);
  const saved = (await repositories.sessions.getSessions({ userId: USER }))[0];
  expect(saved.activities).toEqual({ numeracy: { curriculum_edition: 'seen-edition', plan: { engine_version: 1, suggested: taught, reasons: { reason: 'ok', made_on: DATE, complete, cards: taught.map(({ slot, step_key }) => ({ slot, step_key, ready_count: 2, present_count: 2 })) } }, taught } });
  expect(await read('select child_id, group_id from session_attendees order by child_id')).toEqual([{ child_id: 'c1', group_id: 'group-1' }, { child_id: 'c2', group_id: 'group-1' }]);
  expect(await read('select child_id, step_key, sync_status, programme_id, changed_at from skill_mastery order by child_id')).toEqual([
    { child_id: 'c1', step_key: 'add.5', sync_status: 'pending', programme_id: 'programme-b', changed_at: TAP },
    { child_id: 'c2', step_key: 'count.5', sync_status: 'pending', programme_id: 'programme-b', changed_at: TAP },
  ]);
  expect((await read('select table_name from sync_outbox')).map(r => r.table_name).sort()).toEqual(['session_attendees', 'session_attendees', 'sessions', 'skill_mastery', 'skill_mastery']);
  expect(await read('select * from lesson_drafts')).toEqual([]);
});
test('a failure on the last tick writes nothing', async () => {
  const original = writer.runAsync; let ticks = 0;
  jest.spyOn(writer, 'runAsync').mockImplementation(async (sql, ...params) => {
    if (/insert\s+into\s+"?skill_mastery"?/i.test(sql) && ++ticks === 2) throw new Error('last tick failed');
    return original(sql, ...params);
  });
  const before = await snapshot(); let caught;
  try { await save(); } catch (error) { caught = error; }
  expect(caught?.message).toBe('last tick failed'); expect(ticks).toBe(2);
  expect(await snapshot()).toEqual(before);
  for (const table of ['sessions', 'session_attendees', 'skill_mastery', 'sync_outbox']) expect(await read(`select * from ${table}`)).toEqual([]);
  expect(await repositories.lessonDrafts.getActive()).toMatchObject({ id: draft.id });
});
test('a tap older than the owed correction time is skipped', async () => {
  const row = await repositories.skillMastery.setSkillMastery({ childId: 'c1', stepKey: 'add.5', confirmed: false, changedAt: TAP, programmeId: 'programme-b' });
  await write(txn => txn.runAsync("update sync_outbox set payload = json_set(payload, '$.changed_at', ?) where table_name = 'skill_mastery'", '2026-10-20T10:00:00.000001+00:00'));
  const owed = await read("select * from sync_outbox where table_name = 'skill_mastery'");
  expect(await save()).toEqual({ sessionId: draft.session_id, keptBack: 1 });
  expect(await read("select * from sync_outbox where record_id = ?", row.id)).toEqual(owed);
  expect(await read("select confirmed from skill_mastery where child_id = 'c1'")).toEqual([{ confirmed: 0 }]);
  expect(await read("select child_id from skill_mastery where child_id = 'c2'")).toHaveLength(1);
});
test('a null setSkillMastery result counts as kept back, not an error', async () => {
  const repo = skillRepository.createSkillMasteryRepository({ database: handle });
  jest.spyOn(repo, 'setSkillMastery').mockResolvedValueOnce(null);
  jest.spyOn(skillRepository, 'createSkillMasteryRepository').mockReturnValue(repo);
  expect(await save()).toEqual({ sessionId: draft.session_id, keptBack: 1 });
  expect(await read('select child_id from skill_mastery')).toEqual([{ child_id: 'c2' }]);
});
test('a back-dated lesson saves plan null with past_date and keeps taught', async () => {
  await save({ draft: { ...draft, lesson_date: '2026-10-20' } });
  expect((await repositories.sessions.getSessions({ userId: USER }))[0].activities.numeracy).toEqual({ curriculum_edition: 'seen-edition', plan: null, plan_reason: 'past_date', taught });
});
test('a tick for a retired step key is kept back', async () => {
  const repo = skillRepository.createSkillMasteryRepository({ database: handle });
  const setter = jest.spyOn(repo, 'setSkillMastery');
  jest.spyOn(skillRepository, 'createSkillMasteryRepository').mockReturnValue(repo);
  expect(await save({ draft: { ...draft, tracker_changes: { ...draft.tracker_changes, c1: { 'add.30': { mastered: true, madeAt: TAP } } } } })).toEqual({ sessionId: draft.session_id, keptBack: 1 });
  expect(setter).toHaveBeenCalledTimes(1); expect(setter.mock.calls[0][0].stepKey).toBe('count.5');
});
test('a child the EA no longer delivers to blocks a save with their ticks', async () => {
  await write(async txn => {
    await txn.runAsync("update child_ea_assignments set unassigned_at = ? where child_id = 'c2'", NOW);
    await txn.runAsync("insert into child_group_memberships (id, child_id, group_id, joined_at) values ('m2', 'c2', 'group-1', '2026-01-15')");
  });
  await rejectSave('CHANGES_NOT_WRITABLE', undefined, ['c2']);
});
test('an inactive programme refuses the save', async () => {
  await write(txn => txn.runAsync('update staff_programme_assignments set ended_at = ?', NOW));
  await rejectSave('PROGRAMME_NOT_ACTIVE');
});
test('a numeracy draft on a literacy programme refuses the save', async () => {
  await write(txn => txn.runAsync("update staff_programme_assignments set programme_id = 'programme-a'"));
  await rejectSave('PROGRAMME_NOT_NUMERACY', { draft: { ...draft, programme_id: 'programme-a' } });
});
test('a second save of the same draft reports ALREADY_SAVED', async () => {
  await save(); await rejectSave('ALREADY_SAVED');
  expect(await read('select id from sessions')).toEqual([{ id: draft.session_id }]);
});
test('the saved ticks sync through set_skill_mastery', async () => {
  await save();
  const { supabaseClient } = createSupabaseMock();
  supabaseClient.rpc.mockImplementation(async (name, p) => {
    expect(name).toBe('set_skill_mastery');
    return { data: [{ outcome: 'applied', confirmed: p.p_confirmed, changed_at: p.p_changed_at, correction_id: p.p_correction_id, changed_by: USER }], error: null };
  });
  const engine = createOutboxSyncEngine({ database: handle, supabaseClient, enqueueRequest: task => task(), getAuthSession: async () => ({ data: { session: { user: { id: USER } } } }) });
  const result = await engine.syncAll();
  expect(result.tableResults.skill_mastery).toBeDefined();
  expect(supabaseClient.rpc).toHaveBeenCalledTimes(2);
  expect(await read('select sync_status from skill_mastery')).toEqual([{ sync_status: 'synced' }, { sync_status: 'synced' }]);
});
