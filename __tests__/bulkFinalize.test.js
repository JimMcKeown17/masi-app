import { bindTestActor } from '../test-support/actorTestUtils';
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {} }));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { createOutboxSyncEngine } from '../src/services/offlineSync';

const liveTestSession = async () => ({
  data: { session: { user: { id: 'test-user' } } },
});

const createSuccessSupabaseMock = () => {
  const supabaseClient = {
    from: jest.fn(() => ({
      upsert: jest.fn(async () => ({ error: null })),
      delete: jest.fn(() => ({
        eq: jest.fn(async () => ({ error: null })),
      })),
    })),
    rpc: jest.fn(async () => ({ data: true, error: null })),
  };
  return { supabaseClient };
};

const enqueue = async (db, tableName, recordId, operation, payload) => {
  const outbox = createSyncOutboxRepository({ database: db });
  await outbox.enqueue({ tableName, recordId, operation, payload });
};

/**
 * Seeds N pending time-entry inserts so the generic processBatch path is exercised.
 * Assessment items now travel only inside their parent's atomic RPC family.
 */
const seedTimeEntriesBulk = async (db, count = 250) => {
  for (let i = 0; i < count; i++) {
    const id = `time-bulk-${String(i).padStart(6, '0')}`;
    const signInTime = '2026-06-16T08:00:00.000Z';
    await db.runAsync(`
      insert into time_entries (id, user_id, sign_in_time, sync_status)
      values (?, 'user-1', ?, 'pending')
    `, id, signInTime);
    await enqueue(db, 'time_entries', id, 'insert', {
      id, user_id: 'user-1', sign_in_time: signInTime,
    });
  }
};

it('finalizes a 250-row success batch in O(chunks) transactions (not O(N)), CAS preserved', async () => {
  const db = bindTestActor(createBetterSqliteTestDatabase(':memory:'), 'test-user');
  await runMigrations(db);

  await db.runAsync(`insert or ignore into schools (id, name) values ('school-1', 'Masi Primary')`);

  await seedTimeEntriesBulk(db, 250);

  // Count withExclusiveTransactionAsync calls (each call ≈ one BEGIN).
  let txnCount = 0;
  const origWithExclusiveTxn = db.withExclusiveTransactionAsync.bind(db);
  db.withExclusiveTransactionAsync = async (task) => {
    txnCount += 1;
    return origWithExclusiveTxn(task);
  };

  const { supabaseClient } = createSuccessSupabaseMock();
  const engine = createOutboxSyncEngine({ enqueueRequest: (task) => task(), getAuthSession: liveTestSession, database: db, supabaseClient });
  await engine.syncAll();

  // Bulk finalize: 250 rows / 200 per chunk = 2 finalize transactions.
  // Add a small margin for any other transactions (markInFlight, resetInFlight, etc.)
  // but nowhere near ~250 per-record transactions.
  expect(txnCount).toBeLessThan(20); // O(chunks) — NOT ~250 per-record finalizes

  // All outbox rows must be drained.
  const remaining = await db.getAllAsync('select id from sync_outbox');
  expect(remaining).toHaveLength(0);

  // All time entries must be marked synced.
  const unsynced = await db.getFirstAsync(
    `select count(*) as count from time_entries where sync_status != 'synced'`
  );
  expect(unsynced.count).toBe(0);

  await db.closeAsync();
});
