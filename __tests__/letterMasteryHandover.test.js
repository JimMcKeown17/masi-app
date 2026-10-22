jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ ...require('../test-support/supabaseTestConfig'), supabase: {} }));
import { runMigrations } from '../src/db/migrations';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { bindTestActor } from '../test-support/actorTestUtils';
import { createHistoryServer, masteryRow, deferred } from '../test-support/assessmentHistoryServer';
import { createMasteryRepository } from '../src/db/repositories/masteryRepository';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { createAssessmentHistoryStates, runLetterMasteryHistoryPull, letterMasteryHistoryScope } from '../src/services/assessmentHistoryPull';
import { uuid } from '../test-support/assessmentHistoryFixtures';

const T0 = '2026-09-01T07:00:00.000001+00:00';
const T1 = '2026-09-01T08:00:00.000001+00:00';
const T2 = '2026-09-01T08:20:00.000001+00:00';
const RPC = 'get_letter_mastery_page';
const assignment = suffix => ({
  id: 'cea-' + suffix, user_id: 'user-1', child_id: 'child-' + suffix,
  assigned_at: '2026-01-15T00:00:00Z', unassigned_at: null, sync_status: 'synced', synced: true,
});

describe('letter mastery handover through roster reconcile and history walk', () => {
  let db, mastery, children, server, states, wall, visible, rows;
  const deps = () => ({ database: db, state: states.mastery, client: server.client,
    enqueueRequest: task => task(), wallNow: () => wall, now: () => 0, random: () => 0 });
  const walk = (force = false) => runLetterMasteryHistoryPull({ userId: 'user-1', force, deps: deps() });
  const stateRow = () => db.getFirstAsync('select * from sync_state where scope = ?', letterMasteryHistoryScope('user-1'));
  const cursor = async () => JSON.parse((await stateRow()).cursor);
  const slot = () => db.getFirstAsync("select * from letter_mastery where child_id = 'child-m' and letter = 'k'");
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
    mastery = createMasteryRepository({ database: db });
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
    rows = [masteryRow('child-m', 'k', T0), masteryRow('child-n', 'a', T1)];
    server = createHistoryServer({ [RPC]: () => visible ? rows : rows.filter(row => row.child_id !== 'child-m') });
  });
  afterEach(async () => { await db.closeAsync(); });

  test("Gate 4's sequence", async () => {
    const written = await mastery.setLetterMastery({ childId: 'child-m', letter: 'k', language: 'en', confirmed: true });
    const { supabaseClient } = createSupabaseMock({ rpcResults: {
      set_letter_mastery: { data: [{ outcome: 'applied', confirmed: true, changed_at: T1,
        correction_id: written.correction_id, changed_by: 'user-1' }], error: null },
    } });
    const engine = createOutboxSyncEngine({ database: db, supabaseClient, enqueueRequest: task => task(),
      getAuthSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) });
    expect(await engine.syncAll()).toMatchObject({ totalSynced: 1, totalFailed: 0 });
    expect(await slot()).toMatchObject({ sync_status: 'synced', server_changed_at: T1 });
    rows = [masteryRow('child-m', 'k', T1, { correction_id: written.correction_id, changed_by: 'user-1' })];
    expect((await walk()).status).toBe('complete');
    expect((await cursor()).rescanChildIds).toEqual(['child-m', 'child-n']);
    await mastery.setLetterMastery({ childId: 'child-m', letter: 's', language: 'en', confirmed: true });
    const pending = await db.getFirstAsync("select * from letter_mastery where letter = 's'");
    const outbox = await db.getAllAsync('select * from sync_outbox');
    expect(pending.sync_status).toBe('pending');
    expect(outbox).toHaveLength(1);

    visible = false;
    expect(await handover()).toMatchObject({ ended: 1 });
    expect(await slot()).toBeNull();
    expect((await children.getMyChildren('user-1')).map(child => child.id)).toEqual(['child-n']);
    expect((await cursor()).rescanChildIds).toEqual(['child-n']);
    rows = [masteryRow('child-m', 'k', T2, { confirmed: false, correction_id: uuid(901) })];
    expect((await walk(true)).status).toBe('complete');
    expect((await mastery.getLetterMastery({ childId: 'child-m', language: 'en' })).map(row => row.letter)).toEqual(['s']);
    expect((await cursor()).rescanChildIds).toEqual(['child-n']);

    await restore(); server.calls.length = 0;
    expect((await walk()).status).toBe('complete');
    expect(server.calls.some(call => call.args.p_after_id === null)).toBe(true);
    expect(await slot()).toMatchObject({ confirmed: 0, server_changed_at: T2 });
    expect(await db.getFirstAsync("select * from letter_mastery where letter = 's'")).toEqual(pending);
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual(outbox);
  });

  test('a handover inside the freshness window still re-walks on return', async () => {
    expect((await walk()).status).toBe('complete');
    expect(await cursor()).toMatchObject({ updatedAt: T1, rescanChildIds: ['child-m', 'child-n'] });
    wall += 5 * 60_000; visible = false;
    expect(await handover()).toMatchObject({ ended: 1 });
    expect(await slot()).toBeNull();
    expect((await cursor()).rescanChildIds).toEqual(['child-n']);
    wall += 60_000; server.calls.length = 0;
    const before = await stateRow();
    expect(await walk()).toEqual({ status: 'fresh', pages: 0 });
    expect(server.calls).toEqual([]);
    expect(await stateRow()).toEqual(before);
    wall += 60_000; await restore();
    expect((await walk()).status).toBe('complete');
    expect(server.calls.some(call => call.args.p_after_id === null)).toBe(true);
    expect(await slot()).toMatchObject({ server_changed_at: T0 });
    expect((await cursor()).rescanChildIds).toEqual(['child-m', 'child-n']);
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
});
