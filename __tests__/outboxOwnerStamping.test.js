import { bindTestActor, TEST_ACTOR_ID } from '../test-support/actorTestUtils';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { initializeTestDatabase } from '../test-support/testDatabase';
import { MIGRATIONS, runMigrations } from '../src/db/migrations';
import { enqueueDomainOutbox } from '../src/db/repositories/domainRepositoryUtils';
import { insertOutboxRecord } from '../src/db/repositories/sqliteRepositoryUtils';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { getConnectionActor, requireCurrentHandle } from '../src/session/signedInHandle';
import { createOutboxSyncEngine } from '../src/services/offlineSync';

const EA = TEST_ACTOR_ID;
const HEAD_OFFICE = 'head-office';
let db;
beforeEach(async () => {
  db = createBetterSqliteTestDatabase();
  await runMigrations(db);
});
afterEach(async () => db.closeAsync());

const seedChild = async (connection) => {
  await connection.runAsync("insert into programmes (id, code, name) values ('programme', 'lit', 'Literacy')");
  await connection.runAsync(`insert into children (id, first_name, last_name, created_by, reading_level, sync_status)
    values ('child', 'Test', 'Child', ?, 'letters', 'synced')`, HEAD_OFFICE);
  await connection.runAsync(`insert into child_ea_assignments (id, child_id, user_id, created_by, sync_status)
    values ('assignment', 'child', ?, ?, 'synced')`, EA, HEAD_OFFICE);
};

const editAndUpload = async (database, connection) => {
  await seedChild(connection);
  await createChildrenRepository({ database }).updateChild('child', { reading_level: 'words' });
  const outbox = createSyncOutboxRepository({ database });
  const rows = await outbox.getReadyRecords({ ownerUserId: EA });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ table_name: 'children', record_id: 'child', operation: 'update', owner_user_id: EA });
  expect(await connection.getFirstAsync("select created_by, reading_level from children where id = 'child'"))
    .toEqual({ created_by: HEAD_OFFICE, reading_level: 'words' });
  const { supabaseClient, calls } = createSupabaseMock();
  const engine = createOutboxSyncEngine({
    database, supabaseClient, enqueueRequest: (task) => task(),
    getAuthSession: async () => ({ data: { session: { user: { id: EA } } } }),
  });
  expect((await engine.syncAll()).totalSynced).toBe(1);
  expect(calls).toEqual([expect.objectContaining({ type: 'update', tableName: 'children', column: 'id', value: 'child' })]);
  expect(calls[0].payload).toMatchObject({ reading_level: 'words' });
  expect(calls[0].payload).not.toHaveProperty('created_by');
  const updateQuery = supabaseClient.from.mock.results[0].value.update.mock.results[0].value;
  expect(updateQuery.eq).toHaveBeenCalledWith('id', 'child');
  expect(updateQuery.eq.mock.results[0].value.select).toHaveBeenCalledWith('id');
  expect(await outbox.getReadyRecords()).toEqual([]);
};

test('T6: an EA edit to a Head Office child is owned by the bound adapter actor and uploads by id', async () => {
  bindTestActor(db, EA);
  await editAndUpload(db, db);
});

test('T6: the default handle writer and transaction facade resolve TEST_ACTOR_ID and upload the EA edit', async () => {
  const handle = requireCurrentHandle();
  const writer = await initializeTestDatabase();
  expect(handle.userId).toBe(TEST_ACTOR_ID);
  expect(getConnectionActor(writer)).toBe(TEST_ACTOR_ID);
  await handle.withTransaction(async txn => expect(getConnectionActor(txn)).toBe(TEST_ACTOR_ID));
  await editAndUpload(handle, writer);
});

test.each(['domain', 'insert', 'repository'])('T7: %s enqueue without a bound actor fails closed', async entry => {
  const record = { id: 'outbox', tableName: 'children', recordId: 'child', operation: 'update', payload: { created_by: HEAD_OFFICE } };
  const action = entry === 'domain'
    ? () => enqueueDomainOutbox(db, record.tableName, record.recordId, record.operation, record.payload)
    : entry === 'insert'
      ? () => insertOutboxRecord(db, record)
      : () => createSyncOutboxRepository({ database: db }).enqueue(record);
  await expect(action()).rejects.toThrow('sync_outbox.owner_user_id is required');
  expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
});

const seedLegacyQueue = async () => {
  await db.closeAsync();
  db = createBetterSqliteTestDatabase();
  for (const migration of MIGRATIONS.filter(item => item.version <= 11)) await db.execAsync(migration.sql);
  await db.execAsync('PRAGMA user_version = 11');
  for (const [id, owner, status, table] of [
    ['ea-pending', EA, 'pending', 'children'],
    ['foreign-failed', HEAD_OFFICE, 'failed', 'children'],
    ['null-pending', null, 'pending', 'children'],
    ['ea-flight', EA, 'in_flight', 'children'],
    ['foreign-flight', HEAD_OFFICE, 'in_flight', 'children'],
    ['null-flight', null, 'in_flight', 'children'],
    ['foreign-terminal', HEAD_OFFICE, 'terminal', 'sessions'],
  ]) {
    await db.runAsync(`insert into sync_outbox (id, table_name, record_id, operation, owner_user_id, status)
      values (?, ?, ?, 'hard_delete', ?, ?)`, id, table, id, owner, status);
  }
  bindTestActor(db, EA);
  await runMigrations(db);
  return createSyncOutboxRepository({ database: db });
};

test('file-wide sync status includes foreign and null owners even when an old caller supplies an owner filter', async () => {
  const outbox = await seedLegacyQueue();
  const status = await outbox.getSyncStatus();
  expect(status).toMatchObject({ unsyncedCount: 3, inFlightCount: 3, waitingCount: 6, needsAttentionCount: 1, failedCount: 2 });
  expect(status.failedItems.map(item => item.id)).toEqual(['foreign-failed', 'foreign-terminal']);
  expect(await outbox.getSyncStatus({ ownerUserId: EA })).toEqual(status);
});

test('countUnsent counts pending, failed, in_flight and terminal file-wide and returns zero for an empty queue', async () => {
  const outbox = await seedLegacyQueue();
  expect(await outbox.countUnsent()).toEqual({ total: 7, byTable: { children: 6, sessions: 1 } });
  await db.runAsync('delete from sync_outbox');
  expect(await outbox.countUnsent()).toEqual({ total: 0, byTable: {} });
});

test('owner-scoped ready, hard-delete and reset queries exclude legacy null owners; omitted scope is file-wide', async () => {
  const outbox = await seedLegacyQueue();
  expect((await outbox.getReadyRecords({ ownerUserId: EA })).map(row => row.id)).toEqual(['ea-pending']);
  expect((await outbox.getReadyRecords()).map(row => row.id).sort()).toEqual(['ea-pending', 'foreign-failed', 'null-pending']);
  expect(await outbox.getPendingHardDeleteIds({ tableName: 'children', ownerUserId: EA })).toEqual(new Set(['ea-pending', 'ea-flight']));
  expect(await outbox.getPendingHardDeleteIds({ tableName: 'children' })).toEqual(new Set([
    'ea-pending', 'ea-flight', 'foreign-failed', 'foreign-flight', 'null-pending', 'null-flight',
  ]));
  await outbox.resetInFlight({ ownerUserId: EA });
  expect((await outbox.getById('ea-flight')).status).toBe('pending');
  expect((await outbox.getById('foreign-flight')).status).toBe('in_flight');
  expect((await outbox.getById('null-flight')).status).toBe('in_flight');
  await outbox.resetInFlight();
  expect((await outbox.getById('foreign-flight')).status).toBe('pending');
  expect((await outbox.getById('null-flight')).status).toBe('pending');
});
