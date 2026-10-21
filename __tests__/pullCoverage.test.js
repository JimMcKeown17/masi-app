jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {} }));

import { isCoverageWalkComplete, isSessionHistoryComplete, isMasteryInputsComplete } from '../src/services/pullCoverage';
import { runMigrations } from '../src/db/migrations';
import { runSessionHistoryPull, createSessionHistoryState } from '../src/services/sessionHistoryPull';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import {
  createAssessmentHistoryStates, runAssessmentHistoryPull, runLetterMasteryHistoryPull,
  runBatteryRunHistoryPull,
} from '../src/services/assessmentHistoryPull';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createMasteryRepository } from '../src/db/repositories/masteryRepository';
import { createHistoryServer, masteryRow } from '../test-support/assessmentHistoryServer';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { createOutboxSyncEngine } from '../src/services/offlineSync';

const walked = { windowStart: '2026-01-15', complete: true, lastFailureAt: null, rescanChildIds: ['child-a', 'child-b'] };

test('a finished walk covering every present child of this year is complete', () => {
  expect(isCoverageWalkComplete(walked, { childIds: ['child-a', 'child-b'], windowStart: '2026-01-15' })).toBe(true);
  expect(isCoverageWalkComplete(JSON.stringify(walked), { childIds: ['child-a'] })).toBe(true);
});
test('an unfinished walk, a failure since the last success, last year, or an uncovered child is not', () => {
  expect(isCoverageWalkComplete({ ...walked, complete: false }, { childIds: ['child-a'] })).toBe(false);
  expect(isCoverageWalkComplete({ ...walked, lastFailureAt: '2026-10-20T07:00:00.000Z' }, { childIds: ['child-a'] })).toBe(false);
  expect(isCoverageWalkComplete(walked, { childIds: ['child-a'], windowStart: '2027-01-13' })).toBe(false);
  expect(isCoverageWalkComplete(walked, { childIds: ['child-a', 'child-c'] })).toBe(false);
});
test('anything malformed fails closed', () => {
  for (const bad of [null, undefined, '', 'not json', '[]', 42, { complete: true }]) {
    expect(isCoverageWalkComplete(bad, { childIds: ['child-a'] })).toBe(false);
  }
});

test('malformed coverage fields fail closed even with no present children', () => {
  for (const patch of [{ complete: 1 }, { lastFailureAt: undefined }, { rescanChildIds: null },
    { rescanChildIds: ['child-a', null] }, { rescanChildIds: 'child-a' }]) {
    expect(isCoverageWalkComplete({ ...walked, ...patch })).toBe(false);
  }
  expect(isCoverageWalkComplete({ ...walked, windowStart: undefined })).toBe(true);
});

describe('isSessionHistoryComplete', () => {
  let db;
  const wall = Date.parse('2026-10-20T08:00:00.000Z');
  const addDeliveryChild = async (childId) => {
    await db.runAsync("insert into children (id, first_name, last_name, class_id, sync_status) values (?, 'New', 'Child', 'class-1', 'synced')", childId);
    await db.runAsync("insert into child_ea_assignments (id, user_id, child_id, sync_status) values (?, 'user-1', ?, 'synced')", `cea-${childId}`, childId);
  };
  const pull = (client) => runSessionHistoryPull({
    userId: 'user-1', force: true,
    deps: { state: createSessionHistoryState(), database: db, client, enqueueRequest: (task) => task(),
      wallNow: () => wall, random: () => 0.5 },
  });
  const emptyServer = { rpc: () => ({ abortSignal: () => Promise.resolve({ data: [], error: null }) }) };
  const failingServer = { rpc: () => ({ abortSignal: () => Promise.resolve({ data: null, error: { message: 'boom', code: 'XX000' } }) }) };

  beforeEach(async () => {
    db = await createMigratedDatabase(runMigrations);
    await seedCoreData(db);
    await addDeliveryChild('child-a');
    await addDeliveryChild('child-b');
    await db.runAsync("insert into children (id, first_name, last_name, class_id, sync_status) values ('child-g', 'Group', 'Only', 'class-1', 'synced')");
  });
  afterEach(async () => { await db.closeAsync(); });

  const complete = (childIds) => isSessionHistoryComplete({ database: db, userId: 'user-1', childIds });

  test('before any walk, history is incomplete', async () => {
    expect(await complete(['child-a'])).toBe(false);
  });
  test('a finished walk makes its children complete, and only them', async () => {
    await pull(emptyServer);
    expect(await complete(['child-a', 'child-b'])).toBe(true);
    expect(await complete(['child-a', 'child-g'])).toBe(false); // uncovered child (group-only member)
  });
  test('a child newly assigned between walks is incomplete until the next walk', async () => {
    await pull(emptyServer);
    await addDeliveryChild('child-c');
    expect(await complete(['child-a', 'child-c'])).toBe(false);
    await pull(emptyServer);
    expect(await complete(['child-a', 'child-c'])).toBe(true);
  });
  test('a year rollover before the next pull makes last year’s walk incomplete', async () => {
    await pull(emptyServer);
    await db.runAsync('update academic_years set is_active = 0');
    await db.runAsync(`insert into academic_years (id, label, starts_on, ends_on, is_active)
      values ('year-2027', '2027', '2027-01-13', '2027-12-10', 1)`);
    expect(await complete(['child-a'])).toBe(false);
    expect(await isSessionHistoryComplete({ database: db, userId: 'user-1', childIds: ['child-a'], academicYearStart: '2026-01-15' })).toBe(true); // explicit year wins
    await pull(emptyServer);
    expect(await complete(['child-a'])).toBe(true);
  });
  test('a failure since the last success is incomplete until a page succeeds', async () => {
    await pull(emptyServer);
    await pull(failingServer);
    expect(await complete(['child-a'])).toBe(false);
    await pull(emptyServer);
    expect(await complete(['child-a'])).toBe(true);
  });
  test('another programme’s walk does not count', async () => {
    await pull(emptyServer);
    expect(await isSessionHistoryComplete({ database: db, userId: 'user-1', programmeId: 'programme-b', childIds: ['child-a'] })).toBe(false);
  });

  test('missing programme or academic year is incomplete', async () => {
    await pull(emptyServer);
    await db.runAsync("update staff_programme_assignments set ended_at = '2026-10-20T08:00:00.000Z'");
    expect(await complete(['child-a'])).toBe(false);
    expect(await isSessionHistoryComplete({ database: db, userId: 'user-1', programmeId: 'programme-a' })).toBe(true);
    await db.runAsync('update academic_years set is_active = 0');
    expect(await isSessionHistoryComplete({ database: db, userId: 'user-1', programmeId: 'programme-a' })).toBe(false);
  });

  test('empty childIds gives the walk-level answer without changing stored state', async () => {
    expect(await complete([])).toBe(false);
    await pull(emptyServer);
    const before = await db.getAllAsync('select * from sync_state');
    expect(await complete([])).toBe(true);
    expect(await complete(['child-g'])).toBe(false);
    expect(await db.getAllAsync('select * from sync_state')).toEqual(before);
  });
});

describe('isMasteryInputsComplete through real walks', () => {
  const A = 'get_assessment_history_page', M = 'get_letter_mastery_page';
  let db, states, server, wall;
  const assignment = childId => ({
    id: `cea-${childId}`, user_id: 'user-1', child_id: childId,
    assigned_at: '2026-01-15', unassigned_at: null, synced: true,
  });
  const member = (childId, classId = 'class-1', year = 'year-2026') => db.runAsync(`
    insert into child_class_memberships
      (id, child_id, class_id, academic_year_id, sync_status, enrolled_at)
    values (?, ?, ?, ?, 'synced', '2026-01-15')`, `cm-${childId}-${year}`, childId, classId, year);
  const addChild = async (childId, classId = 'class-1') => {
    await db.runAsync("insert into children (id, first_name, last_name, sync_status) values (?, 'Local', 'Child', 'synced')", childId);
    await createChildrenRepository({ database: db }).saveServerStaffChildRows([assignment(childId)]);
    await member(childId, classId);
  };
  const run = (walk, key, { force = false } = {}) => walk({
    userId: 'user-1', force, deps: {
      database: db, state: states[key], client: server.client, enqueueRequest: task => task(),
      wallNow: () => wall, now: () => 0, random: () => 0,
    },
  });
  const assessments = options => run(runAssessmentHistoryPull, 'assessments', options);
  const mastery = options => run(runLetterMasteryHistoryPull, 'mastery', options);
  const both = async () => {
    expect((await assessments()).status).toBe('complete');
    expect((await mastery()).status).toBe('complete');
  };
  const complete = (childIds = ['child-a', 'child-b'], options = {}) => isMasteryInputsComplete({
    database: db, userId: 'user-1', childIds, ...options,
  });
  beforeEach(async () => {
    db = await createMigratedDatabase(runMigrations);
    await seedCoreData(db);
    await db.runAsync(`insert into class_ea_assignments (id, class_id, ea_user_id, programme_id, sync_status, assigned_at)
      values ('ca-class-1', 'class-1', 'user-1', 'programme-a', 'synced', '2026-01-15')`);
    await db.runAsync(`insert into classes (id, school_id, name, grade, academic_year_id)
      values ('class-9', 'school-1', 'Unheld', '1', 'year-2026')`);
    await addChild('child-a');
    await addChild('child-b');
    await addChild('child-g', 'class-9');
    states = createAssessmentHistoryStates();
    server = createHistoryServer();
    wall = Date.parse('2026-09-01T09:00:00Z');
  });
  afterEach(async () => { await db.closeAsync(); });

  test('before any walk it is false', async () => {
    expect(await complete()).toBe(false);
  });

  test('a refused correction restored by a pull converges after successful Retry', async () => {
    const acceptedAt = '2026-09-01T07:00:00.000001+00:00';
    const retryAt = '2026-09-01T09:00:00.000001+00:00';
    let accepted = masteryRow('child-a', 'k', acceptedAt);
    server.lists[M] = () => [accepted];
    await both();
    const repository = createMasteryRepository({ database: db });
    const correction = await repository.setLetterMastery({
      childId: 'child-a', letter: 'k', language: 'en', confirmed: false, changedAt: '2026-09-01T09:00:00Z',
    });
    const { supabaseClient } = createSupabaseMock({ rpcResults: {
      set_letter_mastery: { data: null, error: { code: 'MA001', message: 'correction refused' } },
    } });
    const engine = createOutboxSyncEngine({ database: db, supabaseClient, enqueueRequest: task => task(),
      getAuthSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) });
    expect(await engine.syncAll()).toMatchObject({ totalTerminal: 1 });
    await mastery({ force: true });
    expect(await repository.getLetterMastery({ childId: 'child-a' }))
      .toEqual([expect.objectContaining({ confirmed: true, correction_id: accepted.correction_id })]);
    const evidence = await db.getFirstAsync("select * from sync_outbox where table_name = 'letter_mastery'");
    expect(evidence.status).toBe('terminal');
    expect(JSON.parse(evidence.payload).correction_id).toBe(correction.correction_id);
    accepted = { ...accepted, confirmed: false, changed_at: retryAt, updated_at: retryAt,
      correction_id: correction.correction_id, changed_by: 'user-1' };
    supabaseClient.rpc.mockResolvedValue({ data: [{ outcome: 'applied', confirmed: false,
      changed_at: retryAt, correction_id: accepted.correction_id, changed_by: accepted.changed_by }], error: null });
    await engine.retryFailedItem('letter_mastery', correction.id);
    expect(await engine.syncAll()).toMatchObject({ totalSynced: 1 });
    expect(await repository.getLetterMastery({ childId: 'child-a' })).toEqual([expect.objectContaining({
      confirmed: false, changed_at: retryAt, correction_id: accepted.correction_id, changed_by: 'user-1',
      server_changed_at: retryAt, server_correction_id: accepted.correction_id, sync_status: 'synced',
    })]);
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
    await mastery({ force: true });
    expect((await repository.getLetterMastery({ childId: 'child-a' }))[0].confirmed).toBe(false);
    expect(await complete(['child-a'])).toBe(true);
  });

  test('after both walks it is true for covered children and false for an uncovered one', async () => {
    expect((await mastery()).status).toBe('complete');
    expect(await complete()).toBe(false); // Mastery alone cannot establish assessment coverage.
    expect((await assessments()).status).toBe('complete');
    expect(await complete()).toBe(true);
    expect(await complete(['child-a', 'child-g'])).toBe(false);
  });

  test.each(['assessment', 'mastery'])('a failure since the last success makes it false until a walk succeeds (%s)', async kind => {
    await both();
    server.disabled.add(kind === 'assessment' ? A : M);
    const walk = kind === 'assessment' ? assessments : mastery;
    expect((await walk({ force: true })).status).toBe('disabled');
    expect(await complete()).toBe(false);
    server.disabled.clear();
    expect((await walk()).status).toBe('complete');
    expect(await complete()).toBe(true);
  });

  test("last year's assessment walk does not count", async () => {
    await both();
    await db.runAsync('update academic_years set is_active = 0');
    await db.runAsync(`insert into academic_years (id, label, starts_on, ends_on, is_active)
      values ('year-2027', '2027', '2027-01-13', '2027-12-10', 1)`);
    for (const childId of ['child-a', 'child-b']) await member(childId, 'class-1', 'year-2027');
    server.year = 'year-2027';
    expect(await complete()).toBe(false);
    expect((await assessments()).status).toBe('complete');
    expect(await complete()).toBe(true); // Mastery has no year window.
  });

  test('a child gained between walks is false until the re-walk', async () => {
    await both();
    await addChild('child-c');
    expect(await complete(['child-a', 'child-c'])).toBe(false);
    await both();
    expect(await complete(['child-a', 'child-c'])).toBe(true);
  });

  test('losing the class assignment makes its children false at once', async () => {
    await both();
    await db.runAsync("update class_ea_assignments set unassigned_at = '2026-09-01T09:01:00Z'");
    expect(await complete()).toBe(false); // No intervening walk writes a new cursor.
  });

  test('a delivery child lost and regained is false until the mastery re-walk finishes', async () => {
    await both();
    await db.runAsync("update child_ea_assignments set unassigned_at = '2026-09-01T09:01:00Z' where child_id = 'child-a'");
    expect(await complete(['child-a'])).toBe(false);
    wall += 16 * 60_000;
    expect((await mastery()).status).toBe('complete');
    await db.runAsync("update child_ea_assignments set unassigned_at = null where child_id = 'child-a'");
    expect(await complete(['child-a'])).toBe(false);
    expect(await complete(['child-b'])).toBe(true);
    server.calls.length = 0;
    expect((await mastery()).status).toBe('complete');
    expect(server.calls.some(call => call.name === M && call.args.p_after_id === null)).toBe(true);
    expect(await complete(['child-a'])).toBe(true);
  });

  test('a class lost and regained is false until the assessment re-walk finishes', async () => {
    await both();
    await db.runAsync("update class_ea_assignments set unassigned_at = '2026-09-01T09:01:00Z'");
    wall += 16 * 60_000;
    expect((await assessments()).status).toBe('complete');
    await db.runAsync('update class_ea_assignments set unassigned_at = null');
    expect(await complete()).toBe(false);
    server.calls.length = 0;
    expect((await assessments()).status).toBe('complete');
    expect(server.calls.some(call => call.name === A && call.args.p_after_id === null)).toBe(true);
    expect(await complete()).toBe(true);
  });

  test('a handover inside the freshness window keeps the child false until the re-walk restores its row', async () => {
    const t0 = '2026-09-01T07:00:00.000001+00:00', t1 = '2026-09-01T08:00:00.000001+00:00';
    let visible = true;
    const rows = [masteryRow('child-a', 'k', t0), masteryRow('child-b', 'a', t1)];
    server.lists[M] = () => visible ? rows : rows.slice(1);
    const children = createChildrenRepository({ database: db });
    const readK = () => createMasteryRepository({ database: db }).getLetterMastery({ childId: 'child-a', language: 'en' });
    await both();
    expect(await complete()).toBe(true);
    expect(await readK()).toEqual([expect.objectContaining({ letter: 'k', server_changed_at: t0 })]);
    wall += 5 * 60_000; visible = false;
    expect(await children.saveServerStaffChildRows([assignment('child-b'), assignment('child-g')], {
      reconcile: { acknowledgedIds: ['cea-child-b', 'cea-child-g'], pulledAt: new Date(wall).toISOString(), userId: 'user-1' },
    })).toMatchObject({ ended: 1 });
    expect(await readK()).toEqual([]);
    wall += 60_000; server.calls.length = 0;
    expect(await mastery()).toEqual({ status: 'fresh', pages: 0 });
    expect(server.calls).toEqual([]);
    wall += 60_000;
    await children.saveServerStaffChildRows([assignment('child-a')]);
    visible = true;
    expect(await complete(['child-a'])).toBe(false);
    expect(await complete(['child-b'])).toBe(true);
    server.calls.length = 0;
    expect((await mastery()).status).toBe('complete');
    expect(server.calls.some(call => call.name === M && call.args.p_after_id === null)).toBe(true);
    expect(await readK()).toEqual([expect.objectContaining({ letter: 'k', server_changed_at: t0 })]);
    expect(await complete(['child-a'])).toBe(true);
  });

  test('a year mismatch keeps it false', async () => {
    await both();
    server.year = 'year-2027';
    expect((await assessments({ force: true })).status).toBe('year_mismatch');
    expect(await complete()).toBe(false);
  });

  test("the run walk's state does not matter", async () => {
    await both();
    server.disabled.add('get_battery_run_history_page');
    expect((await run(runBatteryRunHistoryPull, 'batteryRuns')).status).toBe('disabled');
    expect(await complete()).toBe(true);
  });

  test('missing actor, programme, year or either cursor is incomplete', async () => {
    expect(await isMasteryInputsComplete({ database: db })).toBe(false);
    await assessments();
    expect(await complete()).toBe(false);
    await mastery();
    expect(await complete([], { programmeId: null })).toBe(false);
    expect(await complete([], { programmeId: 'programme-b' })).toBe(false);
    await db.runAsync("update staff_programme_assignments set ended_at = '2026-09-01T09:01:00Z'");
    expect(await complete()).toBe(false);
    expect(await complete(undefined, { programmeId: 'programme-a' })).toBe(true);
    await db.runAsync('update academic_years set is_active = 0');
    expect(await complete(undefined, { programmeId: 'programme-a' })).toBe(false);
  });

  test('empty childIds gives the walk-level answer and reads never change state or call the server', async () => {
    expect(await complete([])).toBe(false);
    await both();
    const before = await db.getAllAsync('select * from sync_state order by scope');
    server.calls.length = 0;
    expect(await complete([])).toBe(true);
    expect(await complete(['child-g'])).toBe(false);
    for (const childIds of [null, 'child-a', ['child-a', null]]) expect(await complete(childIds)).toBe(false);
    expect(await db.getAllAsync('select * from sync_state order by scope')).toEqual(before);
    expect(server.calls).toEqual([]);
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
  });
});
