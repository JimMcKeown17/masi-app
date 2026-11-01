jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ ...require('../test-support/supabaseTestConfig'), supabase: {} }));
import { runMigrations } from '../src/db/migrations';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { bindTestActor } from '../test-support/actorTestUtils';
import { createHistoryServer, skillMasteryRow, deferred } from '../test-support/assessmentHistoryServer';
import { createSkillMasteryRepository } from '../src/db/repositories/skillMasteryRepository';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { createAssessmentHistoryStates, runAssessmentHistoryPull, runLetterMasteryHistoryPull, runSkillMasteryHistoryPull, skillMasteryHistoryScope } from '../src/services/assessmentHistoryPull';
import { createAssessmentHistoryStore } from '../src/services/assessmentHistoryStatus';
import { isMasteryInputsComplete, skillMasteryCompletenessByChild } from '../src/services/pullCoverage';
import { uuid } from '../test-support/assessmentHistoryFixtures';

const T0 = '2026-09-01T07:00:00.000001+00:00';
const T1 = '2026-09-01T08:00:00.000001+00:00';
const T2 = '2026-09-01T08:20:00.000001+00:00';
const RPC = 'get_skill_mastery_page';
const assignment = suffix => ({
  id: 'cea-' + suffix, user_id: 'user-1', child_id: 'child-' + suffix,
  assigned_at: '2026-01-15T00:00:00Z', unassigned_at: null, sync_status: 'synced', synced: true,
});

describe('skill mastery handover through roster reconcile and history walk', () => {
  let db, mastery, children, server, states, wall, visible, rows;
  const deps = () => ({ database: db, state: states.skillMastery, client: server.client,
    enqueueRequest: task => task(), wallNow: () => wall, now: () => 0, random: () => 0 });
  const walk = (force = false) => runSkillMasteryHistoryPull({ userId: 'user-1', force, deps: deps() });
  const stateRow = () => db.getFirstAsync('select * from sync_state where scope = ?', skillMasteryHistoryScope('user-1'));
  const cursor = async () => JSON.parse((await stateRow()).cursor);
  const slot = () => db.getFirstAsync("select * from skill_mastery where child_id = 'child-m' and step_key = 'add.5'");
  const handover = () => children.saveServerStaffChildRows([assignment('n')], {
    reconcile: { acknowledgedIds: ['cea-n'], pulledAt: new Date(wall).toISOString(), userId: 'user-1' },
  });
  const restore = async () => {
    await children.saveServerStaffChildRows([assignment('m'), assignment('n')]);
    visible = true;
  };
  beforeEach(async () => {
    db = await createMigratedDatabase(runMigrations);
    bindTestActor(db, 'user-1');
    await seedCoreData(db);
    mastery = createSkillMasteryRepository({ database: db });
    children = createChildrenRepository({ database: db });
    for (const suffix of ['m', 'n']) {
      await db.runAsync("insert into children (id, first_name, last_name, sync_status) values (?, 'Local', 'Child', 'synced')", 'child-' + suffix);
      await db.runAsync("insert into child_programme_enrollments (id, child_id, programme_id, sync_status) values (?, ?, 'programme-a', 'synced')", 'en-' + suffix, 'child-' + suffix);
    }
    for (const suffix of ['m', 'n']) {
      await db.runAsync("insert into child_class_memberships (id, child_id, class_id, academic_year_id) values (?, ?, 'class-1', 'year-2026')", 'cm-' + suffix, 'child-' + suffix);
    }
    await children.saveServerStaffChildRows([assignment('m'), assignment('n')]);
    states = createAssessmentHistoryStates();
    wall = Date.parse('2026-09-01T09:00:00Z');
    visible = true;
    rows = [skillMasteryRow('child-m', 'add.5', T0), skillMasteryRow('child-n', 'add.10', T1)];
    server = createHistoryServer({ [RPC]: () => visible ? rows : rows.filter(row => row.child_id !== 'child-m') });
  });
  afterEach(async () => { await db.closeAsync(); });

  test("handover deletes synced ticks, keeps owed ones, and the return re-walks", async () => {
    const written = await mastery.setSkillMastery({ childId: 'child-m', stepKey: 'add.5', confirmed: true });
    const { supabaseClient } = createSupabaseMock({ rpcResults: {
      set_skill_mastery: { data: [{ outcome: 'applied', confirmed: true, changed_at: T1,
        correction_id: written.correction_id, changed_by: 'user-1' }], error: null },
    } });
    const engine = createOutboxSyncEngine({ database: db, supabaseClient, enqueueRequest: task => task(),
      getAuthSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) });
    expect(await engine.syncAll()).toMatchObject({ totalSynced: 1, totalFailed: 0 });
    expect(await slot()).toMatchObject({ sync_status: 'synced', server_changed_at: T1 });
    rows = [skillMasteryRow('child-m', 'add.5', T1, { correction_id: written.correction_id, changed_by: 'user-1' })];
    expect((await walk()).status).toBe('complete');
    expect((await cursor()).rescanChildIds).toEqual(['child-m', 'child-n']);
    await mastery.setSkillMastery({ childId: 'child-m', stepKey: 'add.10', confirmed: true });
    const pending = await db.getFirstAsync("select * from skill_mastery where step_key = 'add.10'");
    const outbox = await db.getAllAsync('select * from sync_outbox');
    expect(pending.sync_status).toBe('pending');
    expect(outbox).toHaveLength(1);

    visible = false;
    expect(await handover()).toMatchObject({ ended: 1 });
    expect(await slot()).toBeNull();
    expect((await children.getMyChildren('user-1')).map(child => child.id)).toEqual(['child-n']);
    expect((await cursor()).rescanChildIds).toEqual(['child-n']);
    rows = [skillMasteryRow('child-m', 'add.5', T2, { confirmed: false, correction_id: uuid(901) })];
    expect((await walk(true)).status).toBe('complete');
    expect((await mastery.getSkillMastery({ childId: 'child-m' })).map(row => row.step_key)).toEqual(['add.10']);
    expect((await cursor()).rescanChildIds).toEqual(['child-n']);

    await restore(); server.calls.length = 0;
    expect((await walk()).status).toBe('complete');
    expect(server.calls.some(call => call.args.p_after_id === null)).toBe(true);
    expect(await slot()).toMatchObject({ confirmed: 0, server_changed_at: T2 });
    expect(await db.getFirstAsync("select * from skill_mastery where step_key = 'add.10'")).toEqual(pending);
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual(outbox);
  });

  test('a walk in flight across the handover cannot re-add the child', async () => {
    await walk();
    wall += 16 * 60_000;
    const started = deferred(), release = deferred();
    server.onRequest = async () => { started.resolve(); await release.promise; };
    const running = walk();
    await started.promise;
    visible = false;
    expect(await handover()).toMatchObject({ ended: 1 });
    expect(await slot()).toBeNull();
    expect((await cursor()).rescanChildIds).toEqual(['child-n']);
    // An exhausted delta arrives after the handover has committed.
    server.lists[RPC] = () => [];
    release.resolve();
    expect((await running).status).toBe('complete');
    expect((await cursor()).rescanChildIds).toEqual(['child-n']);
    server.onRequest = null;
    server.lists[RPC] = () => rows;
    await restore(); server.calls.length = 0;
    expect((await walk()).status).toBe('complete');
    expect(server.calls.some(call => call.args.p_after_id === null)).toBe(true);
    expect(await slot()).toMatchObject({ server_changed_at: T0 });
  });

  test('a failing skill walk leaves letter mastery completeness and the letter cursor untouched', async () => {
    await db.runAsync("insert into class_ea_assignments (id, class_id, ea_user_id, programme_id, sync_status) values ('ca', 'class-1', 'user-1', 'programme-a', 'synced')");
    await db.runAsync("update child_class_memberships set sync_status = 'synced'");
    const store = createAssessmentHistoryStore({ database: db, client: server.client, enqueueRequest: task => task() });
    const common = { database: db, client: server.client, enqueueRequest: task => task() };
    await runAssessmentHistoryPull({ userId: 'user-1', deps: { ...common, state: states.assessments } });
    await runLetterMasteryHistoryPull({ userId: 'user-1', deps: { ...common, state: states.mastery } });
    const options = { database: db, userId: 'user-1', childIds: ['child-m', 'child-n'] };
    const before = await isMasteryInputsComplete(options);
    expect(before).toBe(true);
    const letter = await db.getFirstAsync("select * from sync_state where scope = 'letter_mastery_pull:user-1'");
    server.lists[RPC] = () => { throw { code: 'PGRST202', message: 'missing RPC' }; };
    await store.start({ userId: 'user-1' });
    expect(server.calls.some(call => call.name === RPC)).toBe(true);
    expect(store.getSnapshot().lastResults.skillMastery.status).not.toBe('complete');
    expect(await isMasteryInputsComplete(options)).toBe(before);
    expect(await db.getFirstAsync("select * from sync_state where scope = 'letter_mastery_pull:user-1'")).toEqual(letter);
    expect(await skillMasteryCompletenessByChild(options)).toEqual({ 'child-m': false, 'child-n': false });
  });
});
