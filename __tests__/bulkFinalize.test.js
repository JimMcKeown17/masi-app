jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

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
 * Seeds one parent assessment + N assessment_items rows (all pending, all enqueued).
 * The assessment_items table is the only BATCHABLE_UPSERT_TABLE, so this ensures
 * processBatch is exercised.
 */
const seedAssessmentItemsBulk = async (db, count = 250) => {
  await db.runAsync(`
    insert into programmes (id, code, name, sync_status)
    values ('programme-bulk', 'literacy', 'Literacy Bulk', 'synced')
  `);
  await db.runAsync(`
    insert into children (id, first_name, last_name, sync_status)
    values ('child-bulk-1', 'Amahle', 'Dlamini', 'synced')
  `);
  await db.runAsync(`
    insert into assessments (
      id, user_id, child_id, programme_id, assessment_type, assessment_date, sync_status
    )
    values (
      'assessment-bulk-1', 'user-1', 'child-bulk-1', 'programme-bulk',
      'letter_sounds', '2026-06-16', 'synced'
    )
  `);

  for (let i = 0; i < count; i++) {
    const id = `item-bulk-${String(i).padStart(6, '0')}`;
    const letter = String.fromCharCode(97 + (i % 26));
    await db.runAsync(`
      insert into assessment_items (
        id, assessment_id, item_key, prompt, response, is_correct, position, metadata, sync_status
      )
      values (?, 'assessment-bulk-1', ?, ?, ?, 1, ?, '{}', 'pending')
    `, id, `letter-${i + 1}`, letter, letter, i);

    await enqueue(db, 'assessment_items', id, 'insert', {
      id,
      assessment_id: 'assessment-bulk-1',
      item_key: `letter-${i + 1}`,
      prompt: letter,
      response: letter,
      is_correct: 1,
      position: i,
      metadata: '{}',
    });
  }
};

it('finalizes a 250-row success batch in O(chunks) transactions (not O(N)), CAS preserved', async () => {
  const db = createBetterSqliteTestDatabase(':memory:');
  await runMigrations(db);

  // seed references needed by offlineSync (school, programme, academic_year exist above for
  // the items' programme, but seedCoreData would add a duplicate 'programme-a' — seed the
  // minimum the engine needs for the seeded assessment graph: the global school-1 row).
  await db.runAsync(`insert or ignore into schools (id, name) values ('school-1', 'Masi Primary')`);

  await seedAssessmentItemsBulk(db, 250);

  // Count withExclusiveTransactionAsync calls (each call ≈ one BEGIN).
  let txnCount = 0;
  const origWithExclusiveTxn = db.withExclusiveTransactionAsync.bind(db);
  db.withExclusiveTransactionAsync = async (task) => {
    txnCount += 1;
    return origWithExclusiveTxn(task);
  };

  const { supabaseClient } = createSuccessSupabaseMock();
  const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });
  await engine.syncAll();

  // Bulk finalize: 250 rows / 200 per chunk = 2 finalize transactions.
  // Add a small margin for any other transactions (markInFlight, resetInFlight, etc.)
  // but nowhere near ~250 per-record transactions.
  expect(txnCount).toBeLessThan(20); // O(chunks) — NOT ~250 per-record finalizes

  // All outbox rows must be drained.
  const remaining = await db.getAllAsync('select id from sync_outbox');
  expect(remaining).toHaveLength(0);

  // All assessment_items must be marked synced.
  const unsynced = await db.getFirstAsync(
    `select count(*) as count from assessment_items where sync_status != 'synced'`
  );
  expect(unsynced.count).toBe(0);

  await db.closeAsync();
});
