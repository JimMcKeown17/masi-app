jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { createSyncOutboxRepository, outboxRecordId } from '../src/db/repositories/syncOutboxRepository';
import { createOutboxSyncEngine, __testables } from '../src/services/offlineSync';

// ---------------------------------------------------------------------------
// 1. getRetryDelay cap
// ---------------------------------------------------------------------------

describe('getRetryDelay cap', () => {
  const { getRetryDelay } = __testables;

  it('returns BASE_RETRY_DELAY (5 s) at retry_count = 0', () => {
    expect(getRetryDelay(0)).toBe(5000);
  });

  it('returns 45 s for retry_count = 2 (5000 * 9)', () => {
    expect(getRetryDelay(2)).toBe(45000);
  });

  it('caps at 15 minutes for a very large retry_count', () => {
    const cap = 15 * 60 * 1000;
    expect(getRetryDelay(20)).toBe(cap);
    expect(getRetryDelay(100)).toBe(cap);
  });
});

// ---------------------------------------------------------------------------
// 2. getReadyRecords includeBackedOff
// ---------------------------------------------------------------------------

describe('getReadyRecords includeBackedOff', () => {
  let db;
  let outbox;
  const TABLE = 'children';
  const RECORD_ID = 'child-backed-off';
  const OUTBOX_ID = outboxRecordId(TABLE, RECORD_ID, 'insert');

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase(':memory:');
    await runMigrations(db);
    await db.runAsync("insert into schools (id, name) values ('school-1', 'Masi Primary')");
    await db.runAsync("insert into programmes (id, code, name) values ('programme-1', 'lit', 'Literacy')");
    outbox = createSyncOutboxRepository({ database: db });
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it('excludes a future-backed-off failed row by default, includes it when forced', async () => {
    // Seed a children domain row so FK is satisfied
    await db.runAsync(
      "insert into children (id, first_name, last_name, sync_status) values (?, 'Amahle', 'Dlamini', 'pending')",
      RECORD_ID,
    );
    // Enqueue then force into 'failed' + future next_retry_at
    await outbox.enqueue({ tableName: TABLE, recordId: RECORD_ID, operation: 'insert', payload: { id: RECORD_ID } });
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await db.runAsync(
      "update sync_outbox set status = 'failed', retry_count = 3, next_retry_at = ? where id = ?",
      future,
      OUTBOX_ID,
    );

    const defaultReady = await outbox.getReadyRecords({ limit: 100 });
    const forcedReady = await outbox.getReadyRecords({ limit: 100, includeBackedOff: true });

    expect(defaultReady.find((r) => r.id === OUTBOX_ID)).toBeUndefined();
    expect(forcedReady.find((r) => r.id === OUTBOX_ID)).toBeDefined();
  });

  it('still returns past-due failed rows when includeBackedOff is false', async () => {
    await db.runAsync(
      "insert into children (id, first_name, last_name, sync_status) values (?, 'Buhle', 'Zulu', 'pending')",
      RECORD_ID,
    );
    await outbox.enqueue({ tableName: TABLE, recordId: RECORD_ID, operation: 'insert', payload: { id: RECORD_ID } });
    const past = new Date(Date.now() - 5000).toISOString();
    await db.runAsync(
      "update sync_outbox set status = 'failed', retry_count = 1, next_retry_at = ? where id = ?",
      past,
      OUTBOX_ID,
    );

    const defaultReady = await outbox.getReadyRecords({ limit: 100 });
    expect(defaultReady.find((r) => r.id === OUTBOX_ID)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 3. retryFailedItem resets retry_count to 0
// ---------------------------------------------------------------------------

describe('retryFailedItem resets retry_count', () => {
  let db;
  const TABLE = 'children';
  const RECORD_ID = 'child-retry-reset';
  const OUTBOX_ID = outboxRecordId(TABLE, RECORD_ID, 'insert');

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase(':memory:');
    await runMigrations(db);
    await db.runAsync("insert into schools (id, name) values ('school-1', 'Masi Primary')");
    await db.runAsync("insert into programmes (id, code, name) values ('programme-1', 'lit', 'Literacy')");
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it('a failed row with retry_count=3 becomes pending with retry_count=0', async () => {
    await db.runAsync(
      "insert into children (id, first_name, last_name, sync_status) values (?, 'Amahle', 'Dlamini', 'pending')",
      RECORD_ID,
    );
    const outbox = createSyncOutboxRepository({ database: db });
    await outbox.enqueue({ tableName: TABLE, recordId: RECORD_ID, operation: 'insert', payload: { id: RECORD_ID } });
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await db.runAsync(
      "update sync_outbox set status = 'failed', retry_count = 3, next_retry_at = ?, last_error = 'network error' where id = ?",
      future,
      OUTBOX_ID,
    );

    // Verify precondition
    const before = await db.getFirstAsync('select status, retry_count from sync_outbox where id = ?', OUTBOX_ID);
    expect(before.status).toBe('failed');
    expect(before.retry_count).toBe(3);

    const engine = createOutboxSyncEngine({ database: db });
    await engine.retryFailedItem(TABLE, RECORD_ID);

    const row = await db.getFirstAsync(
      'select status, retry_count, next_retry_at, last_error from sync_outbox where id = ?',
      OUTBOX_ID,
    );
    expect(row.status).toBe('pending');
    expect(row.retry_count).toBe(0);
    expect(row.next_retry_at).toBeNull();
    expect(row.last_error).toBeNull();
  });

  it('also resets terminal rows to pending with retry_count=0', async () => {
    await db.runAsync(
      "insert into children (id, first_name, last_name, sync_status) values (?, 'Thabo', 'Mokoena', 'pending')",
      RECORD_ID,
    );
    const outbox = createSyncOutboxRepository({ database: db });
    await outbox.enqueue({ tableName: TABLE, recordId: RECORD_ID, operation: 'insert', payload: { id: RECORD_ID } });
    await db.runAsync(
      "update sync_outbox set status = 'terminal', retry_count = 10, last_error = 'duplicate' where id = ?",
      OUTBOX_ID,
    );

    const engine = createOutboxSyncEngine({ database: db });
    await engine.retryFailedItem(TABLE, RECORD_ID);

    const row = await db.getFirstAsync('select status, retry_count from sync_outbox where id = ?', OUTBOX_ID);
    expect(row.status).toBe('pending');
    expect(row.retry_count).toBe(0);
  });
});
