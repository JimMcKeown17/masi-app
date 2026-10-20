import { bindTestActor } from '../test-support/actorTestUtils';
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {} }));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import {
  createOutboxSyncEngine,
  SYNC_BATCH_LIMITS,
} from '../src/services/offlineSync';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const liveTestSession = async () => ({
  data: { session: { user: { id: 'test-user' } } },
});

// Supabase mock whose upsert THROWS — simulates a network throw mid-batch.
// .from() returns synchronously, .upsert() is the async call that throws.
// This routes through runBatchServerOperation's `supabaseClient.from(...).upsert(...)` path.
const throwingSupabase = () => ({
  from: () => ({
    upsert: async () => { throw new Error('network down'); },
    delete: () => ({
      eq: async () => ({ error: null }),
    }),
  }),
  rpc: async () => ({ data: true, error: null }),
});

const enqueue = async (db, tableName, recordId, operation, payload) => {
  const outbox = createSyncOutboxRepository({ database: db });
  await outbox.enqueue({ tableName, recordId, operation, payload });
};

/**
 * Seeds N time-entry inserts to exercise the generic batching and fallback path.
 */
const seedTimeEntriesForThrowTest = async (db, count = 3) => {
  for (let i = 0; i < count; i++) {
    const id = `time-throw-${String(i).padStart(4, '0')}`;
    const item = {
      id,
      user_id: 'user-1',
      sign_in_time: '2026-06-16T08:00:00.000Z',
    };
    await db.runAsync(`
      insert into time_entries (id, user_id, sign_in_time, sync_status)
      values (?, ?, ?, 'pending')
    `, item.id, item.user_id, item.sign_in_time);
    await enqueue(db, 'time_entries', id, 'insert', item);
  }
};

it('a thrown batch request degrades to per-record fallback (rows still sync)', async () => {
  const db = bindTestActor(createBetterSqliteTestDatabase(':memory:'), 'test-user');
  await runMigrations(db);
  await seedCoreData(db);
  await seedTimeEntriesForThrowTest(db, 3);

  // Discriminate batch vs per-row by payload shape:
  //   runBatchServerOperation passes an Array  → this represents the single batch call → THROW
  //   runServerOperation passes a single Object → these are per-row fallback calls → SUCCEED
  const batchThrowsPerRowSucceeds = () => ({
    from: () => ({
      upsert: async (payload) => {
        if (Array.isArray(payload)) throw new Error('batch payload too large');
        return { data: [{}], error: null }; // per-row succeeds
      },
      delete: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
    rpc: async () => ({ data: true, error: null }),
  });

  const engine = createOutboxSyncEngine({ enqueueRequest: (task) => task(), getAuthSession: liveTestSession, database: db, supabaseClient: batchThrowsPerRowSucceeds() });
  const result = await engine.syncAll();

  // All rows synced via the per-record fallback; outbox drained; none failed.
  const remaining = await db.getAllAsync('select id from sync_outbox');
  expect(remaining).toHaveLength(0);
  expect(result.totalSynced).toBeGreaterThanOrEqual(3);
  expect(result.totalFailed).toBe(0);

  await db.closeAsync();
});

it('a thrown per-row request in the batch fallback finalizes retriable, none left in_flight', async () => {
  const db = bindTestActor(createBetterSqliteTestDatabase(':memory:'), 'test-user');
  await runMigrations(db);
  await seedCoreData(db);
  await seedTimeEntriesForThrowTest(db, 3);

  // First upsert call is the batch (3 items → 1 call) → returns error to trigger per-row fallback.
  // Subsequent upsert calls are the per-row fallback requests (3 calls, one per item) → each throws.
  // Both runBatchServerOperation and runServerOperation call .from(table).upsert(...).
  let upsertCalls = 0;
  const batchFailsThenRowThrows = {
    from: () => ({
      upsert: async () => {
        upsertCalls += 1;
        if (upsertCalls === 1) {
          return { data: null, error: { message: 'batch rejected' } }; // batch → fallback
        }
        throw new Error('per-row network down'); // per-row fallback → throw
      },
      delete: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
    rpc: async () => ({ data: true, error: null }),
  };

  const engine = createOutboxSyncEngine({ enqueueRequest: (task) => task(), getAuthSession: liveTestSession, database: db, supabaseClient: batchFailsThenRowThrows });
  await engine.syncAll();

  const rows = await db.getAllAsync('select status, last_error from sync_outbox');
  expect(rows).toHaveLength(3);
  expect(rows.some((r) => r.status === 'in_flight')).toBe(false); // none stranded
  expect(rows.every((r) => r.status === 'failed')).toBe(true);
  expect(rows.every((r) => r.last_error && r.last_error.length > 0)).toBe(true);
  // 1 batch call + 3 per-row calls = 4 total upsert calls
  expect(upsertCalls).toBe(4);

  await db.closeAsync();
});

it('a thrown batch error finalizes EVERY member as retriable failed with last_error (none in_flight)', async () => {
  const db = bindTestActor(createBetterSqliteTestDatabase(':memory:'), 'test-user');
  await runMigrations(db);
  await seedCoreData(db);
  await seedTimeEntriesForThrowTest(db, 3);

  const engine = createOutboxSyncEngine({ enqueueRequest: (task) => task(), getAuthSession: liveTestSession, database: db, supabaseClient: throwingSupabase() });
  const result = await engine.syncAll();

  const rows = await db.getAllAsync(`select status, last_error from sync_outbox`);
  expect(rows).toHaveLength(3);
  expect(rows.every((r) => r.status === 'failed')).toBe(true);
  expect(rows.every((r) => r.last_error && r.last_error.length > 0)).toBe(true);
  expect(rows.some((r) => r.status === 'in_flight')).toBe(false);
  expect(result.totalFailed).toBe(3);

  await db.closeAsync();
});

it('bounds failed-batch fan-out across the whole pass and leaves unattempted rows pending', async () => {
  const db = bindTestActor(createBetterSqliteTestDatabase(':memory:'), 'test-user');
  await runMigrations(db);
  await seedCoreData(db);
  await seedTimeEntriesForThrowTest(db, 150);

  const payloadSizes = [];
  let individualCalls = 0;
  let activeIndividualCalls = 0;
  let maxConcurrentIndividualCalls = 0;
  const batchFailsPerRowSucceeds = {
    from: () => ({
      upsert: async (payload) => {
        if (Array.isArray(payload)) {
          payloadSizes.push(payload.length);
          return { data: null, error: { message: 'systemic batch rejection' } };
        }
        individualCalls += 1;
        activeIndividualCalls += 1;
        maxConcurrentIndividualCalls = Math.max(
          maxConcurrentIndividualCalls,
          activeIndividualCalls
        );
        await new Promise((resolve) => setTimeout(resolve, 1));
        activeIndividualCalls -= 1;
        return { data: [{}], error: null };
      },
      delete: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
    rpc: async () => ({ data: true, error: null }),
  };

  const engine = createOutboxSyncEngine({ enqueueRequest: (task) => task(),
    getAuthSession: liveTestSession,
    database: db,
    supabaseClient: batchFailsPerRowSucceeds,
  });
  const result = await engine.syncAll();

  expect(SYNC_BATCH_LIMITS).toEqual({
    maxBatchRecords: 100,
    maxFallbackRecordsPerPass: 25,
    maxFallbackConcurrency: 5,
  });
  expect(payloadSizes).toEqual([100, 50]);
  expect(individualCalls).toBe(SYNC_BATCH_LIMITS.maxFallbackRecordsPerPass);
  expect(maxConcurrentIndividualCalls).toBeLessThanOrEqual(
    SYNC_BATCH_LIMITS.maxFallbackConcurrency
  );
  expect(result).toEqual(expect.objectContaining({
    success: true,
    totalSynced: SYNC_BATCH_LIMITS.maxFallbackRecordsPerPass,
    totalFailed: 0,
    totalRetriable: 0,
    totalDeferred: 150 - SYNC_BATCH_LIMITS.maxFallbackRecordsPerPass,
  }));
  expect(result.tableResults.time_entries).toEqual(expect.objectContaining({
    synced: SYNC_BATCH_LIMITS.maxFallbackRecordsPerPass,
    failed: 0,
    deferred: 150 - SYNC_BATCH_LIMITS.maxFallbackRecordsPerPass,
  }));

  const remaining = await db.getAllAsync(`
    select status, retry_count, last_error
    from sync_outbox
    order by record_id
  `);
  expect(remaining).toHaveLength(150 - SYNC_BATCH_LIMITS.maxFallbackRecordsPerPass);
  expect(remaining.every((row) => row.status === 'pending')).toBe(true);
  expect(remaining.every((row) => row.retry_count === 0)).toBe(true);
  expect(remaining.every((row) => row.last_error == null)).toBe(true);

  await db.closeAsync();
});
