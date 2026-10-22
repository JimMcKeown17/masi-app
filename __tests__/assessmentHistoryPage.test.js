jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ ...require('../test-support/supabaseTestConfig'), supabase: {} }));

import { runMigrations } from '../src/db/migrations';
import { createAssessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { createBatteryRunsRepository } from '../src/db/repositories/batteryRunsRepository';
import { createMigratedDatabase } from '../test-support/sqliteRepositoryTestUtils';
import { createCountingSqliteTestDatabase } from '../test-support/countingSqliteAdapter';
import { selectRowsByIds } from '../src/db/repositories/historyPageApply';
import { runRepositoryTransaction } from '../src/db/repositories/repositoryRuntime';
import { requestOpen, resetHandleRegistryForTests } from '../src/session/signedInHandle';
import * as engine from '../test-support/expoSQLiteRealEngine';
import { serverFamily, serverRun, seedHistoryData, USER, OTHER_USER, CHILD, UNKNOWN_CHILD, stamp, uuid } from '../test-support/assessmentHistoryFixtures';

const scope = 'assessment_history_pull:test';
const pullState = { lastPulledAt: stamp(), cursor: JSON.stringify({ updatedAt: stamp(150), id: 'cursor-id' }) };
const options = { scope, pullState, admit: () => true };
const page = () => Array.from({ length: 50 }, (_, i) => serverFamily(i + 1));

describe('assessment history page apply', () => {
  let db;
  let repository;
  const count = async (table) => (await db.getFirstAsync(`select count(*) as n from ${table}`)).n;
  const assertEmpty = async () => {
    expect(await count('assessments')).toBe(0);
    expect(await count('assessment_items')).toBe(0);
    expect(await db.getFirstAsync('select * from sync_state where scope = ?', scope)).toBeNull();
  };
  beforeEach(async () => {
    db = await createMigratedDatabase(runMigrations);
    await seedHistoryData(db);
    repository = createAssessmentsRepository({ database: db });
  });
  afterEach(async () => { await db.closeAsync(); });

  test('a page of 50 families of 61 items lands with its cursor', async () => {
    expect(await repository.saveHistoryPage(page(), options)).toEqual({ inserted: 50, present: 0, runsInserted: 0, runsAdvanced: 0 });
    expect(await count('assessments')).toBe(50);
    expect(await count('assessment_items')).toBe(3050);
    expect(await count('sync_outbox')).toBe(0);
    expect(await db.getFirstAsync('select last_pulled_at, cursor from sync_state where scope = ?', scope))
      .toEqual({ last_pulled_at: pullState.lastPulledAt, cursor: pullState.cursor });
    expect((await db.getFirstAsync(`select count(*) as n from assessment_items i join assessments a on a.id = i.assessment_id
      where i.created_at = a.created_at and i.updated_at = a.updated_at and i.server_updated_at = a.updated_at
        and i.sync_status = 'synced' and a.sync_status = 'synced' and a.server_updated_at = a.updated_at`)).n).toBe(3050);
    expect(await db.getFirstAsync('select derived, notes, teacher_name_snapshot from assessments where id = ?', serverFamily(1).id))
      .toEqual({ derived: JSON.stringify(serverFamily(1).derived), notes: 'Server notes', teacher_name_snapshot: 'Test teacher' });
    expect(await db.getFirstAsync('select is_correct, metadata from assessment_items limit 1'))
      .toEqual({ is_correct: 1, metadata: JSON.stringify({ reached: true }) });
  });

  test('replaying the page changes nothing', async () => {
    await repository.saveHistoryPage(page(), options);
    const parents = await db.getAllAsync('select * from assessments order by id');
    const items = await db.getAllAsync('select * from assessment_items order by id');
    expect(await repository.saveHistoryPage(page(), options)).toEqual({ inserted: 0, present: 50, runsInserted: 0, runsAdvanced: 0 });
    expect(await db.getAllAsync('select * from assessments order by id')).toEqual(parents);
    expect(await db.getAllAsync('select * from assessment_items order by id')).toEqual(items);
    expect(await count('sync_outbox')).toBe(0);
  });

  test('a pending local family with the same id is left alone', async () => {
    const family = serverFamily(1);
    const result = Object.fromEntries(['question_code', 'question_version', 'item_set_id', 'language', 'stopped_reason', 'duration_ms', 'derived', 'items'].map((key) => [key, family[key]]));
    await repository.saveQuestionResult({ assessmentId: family.id, result, childId: CHILD, userId: USER });
    const parent = await db.getFirstAsync('select * from assessments where id = ?', family.id);
    const items = await db.getAllAsync('select * from assessment_items order by position');
    const outbox = await db.getFirstAsync('select * from sync_outbox where id = ?', `assessments:${family.id}:insert`);
    expect(await repository.saveHistoryPage([family], options)).toMatchObject({ inserted: 0, present: 1 });
    expect(await db.getFirstAsync('select * from assessments where id = ?', family.id)).toEqual(parent);
    expect(parent.sync_status).toBe('pending');
    expect(await db.getAllAsync('select * from assessment_items order by position')).toEqual(items);
    expect(items).toHaveLength(61);
    expect(await db.getFirstAsync('select * from sync_outbox where id = ?', outbox.id)).toEqual(outbox);
  });

  test('a short items array rejects the page whole', async () => {
    const rows = [serverFamily(1), serverFamily(2), serverFamily(3)];
    rows[1].items.pop();
    let failure;
    try { await repository.saveHistoryPage(rows, options); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(TypeError);
    expect(failure.kind).toBe('query');
    await assertEmpty();
  });

  test('an unknown child becomes a history reference child; a roster child keeps its names', async () => {
    await repository.saveHistoryPage([serverFamily(1, { childId: UNKNOWN_CHILD }), serverFamily(2)], options);
    expect(await db.getFirstAsync('select first_name, last_name, preferred_name, history_reference, sync_status from children where id = ?', UNKNOWN_CHILD))
      .toEqual({ first_name: 'Server', last_name: 'Child', preferred_name: 'Server preferred', history_reference: 1, sync_status: 'synced' });
    expect(await db.getFirstAsync('select first_name, preferred_name, history_reference from children where id = ?', CHILD))
      .toEqual({ first_name: 'Local', preferred_name: 'Local preferred', history_reference: 0 });
    const replay = serverFamily(1, { childId: UNKNOWN_CHILD });
    replay.child_first_name = 'Changed';
    await repository.saveHistoryPage([replay], options);
    expect((await db.getFirstAsync('select first_name from children where id = ?', UNKNOWN_CHILD)).first_name).toBe('Server');
  });

  test('a Q1 result whose run is not on the phone lands with the run first', async () => {
    expect(await db.getFirstAsync('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    const run = serverRun();
    expect(await repository.saveHistoryPage([serverFamily(1, { run })], options)).toMatchObject({ inserted: 1, runsInserted: 1 });
    expect(await db.getFirstAsync('select started_here, sync_status from battery_runs where id = ?', run.id))
      .toEqual({ started_here: 0, sync_status: 'synced' });
    expect((await db.getFirstAsync('select battery_run_id from assessments')).battery_run_id).toBe(run.id);
  });

  test("another EA's run header from before the year lands as the FK target and never lists", async () => {
    const run = serverRun(1, { user_id: OTHER_USER, started_at: '2026-01-14T20:00:00Z' });
    const family = { ...serverFamily(1, { run }), user_id: OTHER_USER, assessment_date: '2026-01-15' };
    await repository.saveHistoryPage([family], options);
    expect(await db.getFirstAsync('select started_here, started_at from battery_runs where id = ?', run.id))
      .toEqual({ started_here: 0, started_at: '2026-01-14T20:00:00Z' });
    expect((await db.getFirstAsync('select battery_run_id from assessments')).battery_run_id).toBe(run.id);
    expect(await createBatteryRunsRepository({ database: db }).getRunsForUser(USER)).toEqual([]);
  });

  test('the statement budget holds', async () => {
    const counted = createCountingSqliteTestDatabase();
    try {
      await runMigrations(counted);
      await seedHistoryData(counted);
      counted.resetQueryLog();
      await createAssessmentsRepository({ database: counted }).saveHistoryPage(page(), options);
      expect(counted.getQueryCount()).toBeLessThan(100);
      expect(Math.max(...counted.getQueryLog().map(({ sql }) => (sql.match(/\?/g) || []).length))).toBeLessThanOrEqual(999);
    } finally { await counted.closeAsync(); }
  });

  test('lookups stay within the 999-binding budget', async () => {
    const counted = createCountingSqliteTestDatabase();
    try {
      await runMigrations(counted);
      await seedHistoryData(counted);
      counted.resetQueryLog();
      const ids = [CHILD, ...Array.from({ length: 1199 }, (_, i) => uuid(500_000 + i))];
      const found = await runRepositoryTransaction(counted, (txn) => selectRowsByIds(txn, 'children', ids, ['id', 'first_name']));
      expect([...found.values()]).toEqual([{ id: CHILD, first_name: 'Local' }]);
      const queries = counted.getQueryLog().filter(({ sql }) => /where id in/.test(sql));
      expect(queries).toHaveLength(2);
      expect(queries.every(({ sql }) => (sql.match(/\?/g) || []).length <= 999)).toBe(true);
    } finally { await counted.closeAsync(); }
  });

  test('embedded run headers are deduplicated before merge', async () => {
    const run = serverRun();
    const second = { ...serverFamily(2, { run }), question_code: 'listening_comprehension' };
    expect(await repository.saveHistoryPage([serverFamily(1, { run }), second], options))
      .toEqual({ inserted: 2, present: 0, runsInserted: 1, runsAdvanced: 0 });
    expect(await count('battery_runs')).toBe(1);
  });

  test('an actor change at the cursor write rolls back the whole page', async () => {
    let admissions = 0;
    await expect(repository.saveHistoryPage([serverFamily(1, { childId: UNKNOWN_CHILD, run: serverRun() })], {
      ...options, admit: () => ++admissions === 1,
    })).rejects.toMatchObject({ kind: 'cancelled' });
    await assertEmpty();
    expect(await count('battery_runs')).toBe(0);
    expect(await db.getFirstAsync('select id from children where id = ?', UNKNOWN_CHILD)).toBeNull();
    expect(admissions).toBe(2);
  });

  test("a pullState function is resolved inside the page's transaction", async () => {
    const resolved = { lastPulledAt: stamp(), cursor: 'bounded-cursor' };
    await repository.saveHistoryPage([serverFamily(1), serverFamily(2), serverFamily(3)], {
      ...options, pullState: async (txn) => {
        expect(await txn.getFirstAsync('select count(*) as n from assessments')).toEqual({ n: 3 });
        return resolved;
      },
    });
    expect((await db.getFirstAsync('select cursor from sync_state where scope = ?', scope)).cursor).toBe(resolved.cursor);
    await db.runAsync('delete from assessment_items');
    await db.runAsync('delete from assessments');
    await db.runAsync('delete from sync_state');
    await expect(repository.saveHistoryPage([serverFamily(4)], {
      ...options, pullState: async () => { throw new Error('bound failed'); },
    })).rejects.toMatchObject({ message: 'bound failed' });
    await assertEmpty();
  });

  test('the multi-row statements pass the signed-in facade', async () => {
    await resetHandleRegistryForTests();
    await engine.__resetMockDatabases();
    let writer;
    try {
      const handle = await requestOpen({ userId: USER, openDatabase: engine.openDatabaseAsync });
      writer = await engine.openDatabaseAsync(handle.fileName, { useNewConnection: true });
      await seedHistoryData(writer);
      const rows = page().slice(0, 10);
      rows[0] = serverFamily(1, { run: serverRun() });
      await createAssessmentsRepository({ database: handle }).saveHistoryPage(rows, options);
      expect(await (await handle.getReader()).getFirstAsync('select count(*) as n from assessment_items')).toEqual({ n: 610 });
      await createBatteryRunsRepository({ database: handle }).saveHistoryPage([
        serverRun(1, { status: 'completed', completed_at: stamp(2), updated_at: stamp(3) }),
      ], options);
      expect(await (await handle.getReader()).getFirstAsync('select status, started_here from battery_runs'))
        .toEqual({ status: 'completed', started_here: 0 });
    } finally {
      if (writer) await writer.closeAsync();
      await resetHandleRegistryForTests();
      await engine.__resetMockDatabases();
    }
  });
});
