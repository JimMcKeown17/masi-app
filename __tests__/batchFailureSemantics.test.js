jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

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
 * Seeds a child + parent assessment + N assessment_items rows, all enqueued as
 * 'assessment_items' inserts. Uses seedCoreData's school-1 / programme-a as FKs.
 */
const seedAssessmentItemsForThrowTest = async (db, count = 3) => {
  await db.runAsync(`
    insert into children (id, first_name, last_name, sync_status)
    values ('child-throw-test', 'Amahle', 'Dlamini', 'synced')
  `);
  await db.runAsync(`
    insert into assessments (
      id, user_id, child_id, programme_id, assessment_type, assessment_date, sync_status
    )
    values (
      'assessment-throw-1', 'user-1', 'child-throw-test', 'programme-a',
      'letter_sounds', '2026-06-16', 'synced'
    )
  `);

  for (let i = 0; i < count; i++) {
    const id = `item-throw-${String(i).padStart(4, '0')}`;
    const letter = String.fromCharCode(97 + (i % 26));
    const item = {
      id,
      assessment_id: 'assessment-throw-1',
      item_key: `letter-${i + 1}`,
      prompt: letter,
      response: letter,
      is_correct: 1,
      position: i,
      metadata: '{}',
    };
    await db.runAsync(`
      insert into assessment_items (
        id, assessment_id, item_key, prompt, response, is_correct, position, metadata, sync_status
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `, item.id, item.assessment_id, item.item_key, item.prompt, item.response,
      item.is_correct, item.position, item.metadata);
    await enqueue(db, 'assessment_items', id, 'insert', item);
  }
};

it('a thrown per-row request in the batch fallback finalizes retriable, none left in_flight', async () => {
  const db = createBetterSqliteTestDatabase(':memory:');
  await runMigrations(db);
  await seedCoreData(db);
  await seedAssessmentItemsForThrowTest(db, 3);

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

  const engine = createOutboxSyncEngine({ database: db, supabaseClient: batchFailsThenRowThrows });
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
  const db = createBetterSqliteTestDatabase(':memory:');
  await runMigrations(db);
  await seedCoreData(db);
  await seedAssessmentItemsForThrowTest(db, 3);

  const engine = createOutboxSyncEngine({ database: db, supabaseClient: throwingSupabase() });
  const result = await engine.syncAll();

  const rows = await db.getAllAsync(`select status, last_error from sync_outbox`);
  expect(rows).toHaveLength(3);
  expect(rows.every((r) => r.status === 'failed')).toBe(true);
  expect(rows.every((r) => r.last_error && r.last_error.length > 0)).toBe(true);
  expect(rows.some((r) => r.status === 'in_flight')).toBe(false);
  expect(result.totalFailed).toBe(3);

  await db.closeAsync();
});
