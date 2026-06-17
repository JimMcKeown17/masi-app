jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { createSyncStateRepository } from '../src/db/repositories/syncStateRepository';
import { createOutboxSyncEngine } from '../src/services/offlineSync';

const enqueue = async (db, tableName, recordId, operation, payload) => {
  const outbox = createSyncOutboxRepository({ database: db });
  await outbox.enqueue({ tableName, recordId, operation, payload });
};

// Mock that errors for ONE table and succeeds for every other table. The errored table's upsert
// returns a retriable error so the row ends 'failed' (a real, classified attempt), exercising the
// "one record fails, the rest still sync" path without throwing.
const supabaseFailingTable = (failTable) => ({
  from: (tableName) => ({
    upsert: async () => (
      tableName === failTable
        ? { error: { message: 'network down' } }
        : { error: null }
    ),
    delete: () => ({ eq: async () => ({ error: null }) }),
  }),
  rpc: async () => ({ data: true, error: null }),
});

const successSupabase = () => ({
  from: () => ({
    upsert: async () => ({ error: null }),
    delete: () => ({ eq: async () => ({ error: null }) }),
  }),
  rpc: async () => ({ data: true, error: null }),
});

const seedClass = async (db, id) => {
  await db.runAsync(`insert or ignore into schools (id, name, sync_status) values ('school-1', 'Masi Primary', 'synced')`);
  await db.runAsync(`
    insert into classes (id, school_id, name, grade, sync_status)
    values (?, 'school-1', 'Grade 1A', '1', 'pending')
  `, id);
  await enqueue(db, 'classes', id, 'insert', { id, school_id: 'school-1', name: 'Grade 1A', grade: '1' });
};

const seedTimeEntry = async (db, id) => {
  await db.runAsync(`
    insert into time_entries (id, user_id, sign_in_time, sign_in_lat, sign_in_lon, sync_status)
    values (?, 'user-1', '2026-06-16T08:00:00.000Z', -34.1, 18.4, 'pending')
  `, id);
  await enqueue(db, 'time_entries', id, 'insert', {
    id, user_id: 'user-1', sign_in_time: '2026-06-16T08:00:00.000Z', sign_in_lat: -34.1, sign_in_lon: 18.4,
  });
};

it('one record fails while the healthy record still syncs and meta is written', async () => {
  const db = createBetterSqliteTestDatabase(':memory:');
  await runMigrations(db);
  await seedClass(db, 'class-good');
  await seedTimeEntry(db, 'time-bad');

  const beforeSync = new Date().toISOString();
  // time_entries upsert errors (retriable); classes succeeds.
  const engine = createOutboxSyncEngine({ database: db, supabaseClient: supabaseFailingTable('time_entries') });

  const result = await engine.syncAll();

  expect(result.totalSynced).toBe(1);
  expect(result.totalFailed).toBe(1);

  // Healthy record drained + synced.
  expect(await db.getFirstAsync('select sync_status from classes where id = ?', 'class-good'))
    .toEqual({ sync_status: 'synced' });
  expect(await db.getFirstAsync('select id from sync_outbox where record_id = ?', 'class-good'))
    .toBeNull();

  // Bad record ended 'failed' with a recorded error — NOT stranded in_flight.
  const badOutbox = await db.getFirstAsync('select status, last_error from sync_outbox where record_id = ?', 'time-bad');
  expect(badOutbox.status).toBe('failed');
  expect(badOutbox.last_error && badOutbox.last_error.length > 0).toBe(true);

  // No row stranded in_flight anywhere.
  expect((await db.getAllAsync(`select id from sync_outbox where status = 'in_flight'`))).toHaveLength(0);

  // Meta written.
  const meta = await createSyncStateRepository({ database: db }).getSyncMeta();
  expect(meta.lastSyncTime).toBeTruthy();
  expect(meta.lastSyncTime >= beforeSync).toBe(true);

  await db.closeAsync();
});

it('a getById throw after markInFlight does not strand the row in_flight and the pass completes', async () => {
  const db = createBetterSqliteTestDatabase(':memory:');
  await runMigrations(db);
  await seedClass(db, 'class-good');
  await seedTimeEntry(db, 'time-getbyid-boom');

  const badId = 'time_entries:time-getbyid-boom:insert';
  const real = createSyncOutboxRepository({ database: db });
  const wrapped = {
    ...real,
    getById: async (id) => {
      if (id === badId) throw new Error('getById boom');
      return real.getById(id);
    },
  };

  const beforeSync = new Date().toISOString();
  const engine = createOutboxSyncEngine({ database: db, outboxRepository: wrapped, supabaseClient: successSupabase() });

  // Must not throw.
  const result = await engine.syncAll();
  expect(result).toBeTruthy();

  // The healthy record still synced.
  expect(await db.getFirstAsync('select sync_status from classes where id = ?', 'class-good'))
    .toEqual({ sync_status: 'synced' });

  // The getById-throwing row is NOT in_flight (pending or failed — both acceptable; we never strand).
  const badOutbox = await db.getFirstAsync('select status from sync_outbox where id = ?', badId);
  expect(badOutbox).toBeTruthy();
  expect(badOutbox.status).not.toBe('in_flight');
  expect(['pending', 'failed']).toContain(badOutbox.status);

  // No row stranded in_flight anywhere.
  expect((await db.getAllAsync(`select id from sync_outbox where status = 'in_flight'`))).toHaveLength(0);

  // Meta written despite the throw mid-pass.
  const meta = await createSyncStateRepository({ database: db }).getSyncMeta();
  expect(meta.lastSyncTime).toBeTruthy();
  expect(meta.lastSyncTime >= beforeSync).toBe(true);

  await db.closeAsync();
});

it('sync meta is written even when a loop-body path throws', async () => {
  const db = createBetterSqliteTestDatabase(':memory:');
  await runMigrations(db);
  await seedTimeEntry(db, 'time-loop-throw');

  const badId = 'time_entries:time-loop-throw:insert';
  const real = createSyncOutboxRepository({ database: db });
  const wrapped = {
    ...real,
    getById: async (id) => {
      if (id === badId) throw new Error('getById boom');
      return real.getById(id);
    },
  };

  const stateRepository = createSyncStateRepository({ database: db });
  const updateSpy = jest.spyOn(stateRepository, 'updateSyncMeta');

  const engine = createOutboxSyncEngine({
    database: db,
    outboxRepository: wrapped,
    stateRepository,
    supabaseClient: successSupabase(),
  });

  await expect(engine.syncAll()).resolves.toBeTruthy();

  expect(updateSpy).toHaveBeenCalled();
  expect(updateSpy.mock.calls[0][0]).toEqual(expect.objectContaining({ lastSyncTime: expect.any(String) }));

  const meta = await stateRepository.getSyncMeta();
  expect(meta.lastSyncTime).toBeTruthy();

  updateSpy.mockRestore();
  await db.closeAsync();
});
