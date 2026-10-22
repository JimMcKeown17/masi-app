// __tests__/childrenHistoryReference.test.js
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations, CURRENT_SCHEMA_VERSION } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { _testBuildSyncPayload as buildSyncPayload } from '../src/services/offlineSync';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const insertReference = (db, id = 'child-ref') => db.runAsync(`
  insert into children (id, first_name, last_name, history_reference, sync_status)
  values (?, 'Lindiwe', 'Mbeki', 1, 'synced')
`, id);

describe('history reference children', () => {
  let db;
  beforeEach(async () => { db = await createMigratedDatabase(runMigrations); await seedCoreData(db); });
  afterEach(async () => { await db.closeAsync(); });

  test('schema v10 adds history_reference defaulting to 0 with a 0/1 check', async () => {
    expect(await db.getFirstAsync('select version, name from schema_migrations where version = 10'))
      .toEqual({ version: 10, name: 'children_history_reference' });
    expect((await db.getFirstAsync('pragma user_version')).user_version).toBe(CURRENT_SCHEMA_VERSION);
    await db.runAsync("insert into children (id, first_name, last_name) values ('c-plain', 'A', 'B')");
    expect((await db.getFirstAsync("select history_reference from children where id = 'c-plain'")).history_reference).toBe(0);
    let checkError;
    try {
      await db.runAsync("insert into children (id, first_name, last_name, history_reference) values ('c-bad', 'A', 'B', 2)");
    } catch (error) { checkError = error; }
    expect(String(checkError?.message)).toMatch(/CHECK constraint/i);
  });

  test('a full-row server save upgrades a reference row in place', async () => {
    await insertReference(db);
    const repository = createChildrenRepository({ database: db });
    await repository.saveChildRecord({
      id: 'child-ref', first_name: 'Lindiwe', last_name: 'Mbeki', class_id: 'class-1',
      created_by: 'user-9', sync_status: 'synced', synced: true,
      created_at: '2026-03-01T08:00:00.000Z', updated_at: '2026-03-01T08:00:00.000Z',
    });
    expect(await db.getFirstAsync("select history_reference, class_id from children where id = 'child-ref'"))
      .toEqual({ history_reference: 0, class_id: 'class-1' });
  });

  test('a local edit of a reference row is refused and enqueues nothing', async () => {
    await insertReference(db);
    const repository = createChildrenRepository({ database: db });
    let caught;
    try {
      await repository.saveChildRecord({ id: 'child-ref', first_name: 'X', last_name: 'Y', synced: false });
    } catch (error) { caught = error; }
    expect(caught?.message).toBe('History reference children are read-only');
    expect((await db.getFirstAsync("select count(*) as n from sync_outbox where record_id = 'child-ref'")).n).toBe(0);
  });

  test('every local mutation path refuses a reference row and enqueues nothing; a later roster save still promotes it', async () => {
    await insertReference(db);
    const repository = createChildrenRepository({ database: db });
    const attempts = {
      save: () => repository.save({ id: 'child-ref', first_name: 'X', last_name: 'Y' }, { actorUserId: 'user-1' }),
      updateChild: () => repository.updateChild('child-ref', { first_name: 'X' }, { actorUserId: 'user-1' }),
      archiveChild: () => repository.archiveChild('child-ref', { actorUserId: 'user-1', archiveReason: 'left_school' }),
      deleteIfNoHistory: () => repository.deleteIfNoHistory('child-ref'),
    };
    for (const [name, attempt] of Object.entries(attempts)) {
      let caught;
      try { await attempt(); } catch (error) { caught = error; }
      expect([name, caught?.message]).toEqual([name, 'History reference children are read-only']);
    }
    expect(await db.getFirstAsync("select first_name, history_reference, sync_status, archived_at from children where id = 'child-ref'"))
      .toEqual({ first_name: 'Lindiwe', history_reference: 1, sync_status: 'synced', archived_at: null });
    expect((await db.getFirstAsync("select count(*) as n from sync_outbox where record_id = 'child-ref'")).n).toBe(0);
    await repository.saveChildRecord({ id: 'child-ref', first_name: 'Lindiwe', last_name: 'Mbeki', class_id: 'class-1', synced: true, sync_status: 'synced' });
    expect((await db.getFirstAsync("select history_reference from children where id = 'child-ref'")).history_reference).toBe(0);
  });

  test('getChildNamesByIds returns reference and roster children while getChildren still excludes references', async () => {
    await insertReference(db);
    await db.runAsync("insert into children (id, first_name, last_name, hidden_at) values ('child-roster', 'Amahle', 'Dlamini', '2026-10-21')");
    const repository = createChildrenRepository({ database: db });
    expect(await repository.getChildNamesByIds(['child-ref', 'child-roster', 'missing', 'child-ref'])).toEqual({
      'child-ref': { name: 'Lindiwe Mbeki', hidden: false }, 'child-roster': { name: 'Amahle Dlamini', hidden: true },
    });
    expect((await repository.getChildren()).map(row => row.id)).toEqual(['child-roster']);
    expect(await repository.getChildNamesByIds([])).toEqual({});
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
  });

  test('child name lookup spans bounded chunks without changing roster eligibility', async () => {
    const ids = Array.from({ length: 1205 }, (_, i) => 'ref-' + i);
    for (const id of ids) await insertReference(db, id);
    const repository = createChildrenRepository({ database: db });
    const read = jest.spyOn(db, 'getAllAsync');
    const names = await repository.getChildNamesByIds(ids);
    expect(read.mock.calls.length).toBeGreaterThan(1);
    expect(read.mock.calls.every(([, ...bindings]) => bindings.length <= 999)).toBe(true);
    read.mockRestore();
    expect(Object.keys(names)).toHaveLength(1205);
    expect(names['ref-1204']).toEqual({ name: 'Lindiwe Mbeki', hidden: false });
    expect(await repository.getChildren()).toEqual([]);
  });

  test('history_reference never reaches a push payload', () => {
    const payload = buildSyncPayload('children', {
      id: '00000000-0000-4000-8000-000000000001', first_name: 'A', last_name: 'B', history_reference: 0,
    });
    expect(payload).not.toHaveProperty('history_reference');
  });
});
