jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { createSyncStateRepository } from '../src/db/repositories/syncStateRepository';

const liveTestSession = async () => ({ data: { session: { user: { id: 'test-user' } } } });

const createSupabaseMock = ({ upsertResults = {} } = {}) => {
  const supabaseClient = {
    from: jest.fn((tableName) => ({
      upsert: jest.fn(async () => upsertResults[tableName] || { error: null }),
      delete: jest.fn(() => ({ eq: jest.fn(async () => ({ error: null })) })),
    })),
    rpc: jest.fn(async () => ({ data: true, error: null })),
  };
  return { supabaseClient };
};

describe('syncAll result.success semantics (trust UX, Finding 6)', () => {
  let db;
  let outbox;
  let stateRepository;

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase();
    await runMigrations(db);
    outbox = createSyncOutboxRepository({ database: db });
    stateRepository = createSyncStateRepository({ database: db });
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  // A bare child (no class_id) has no pending FK/grant evidence, so a 42501 on it is a
  // genuine terminal denial while a code-less error stays retriable.
  const seedChild = async (id) => {
    await db.runAsync(
      "insert into children (id, first_name, last_name, sync_status) values (?, 'Amahle', 'Dlamini', 'pending')",
      id,
    );
    await outbox.enqueue({
      tableName: 'children',
      recordId: id,
      operation: 'insert',
      payload: { id, first_name: 'Amahle', last_name: 'Dlamini' },
    });
  };

  test('a retriable failure leaves the pass successful and stamps lastSuccessfulSyncTime', async () => {
    await seedChild('child-wait');
    const { supabaseClient } = createSupabaseMock({
      upsertResults: { children: { error: { message: 'network down' } } },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(true);
    expect(result.totalRetriable).toBe(1);
    expect(result.totalTerminal).toBe(0);
    expect(result.totalFailed).toBe(1);
    // The record is still owed: retriable-failed in the outbox, not terminal.
    expect((await outbox.getById('children:child-wait:insert')).status).toBe('failed');

    const meta = await stateRepository.getSyncMeta();
    expect(meta.lastSyncTime).toBeTruthy();
    expect(meta.lastSuccessfulSyncTime).toBe(meta.lastSyncTime);
  });

  test('a terminal failure flips success false and does not stamp lastSuccessfulSyncTime', async () => {
    await seedChild('child-stuck');
    const { supabaseClient } = createSupabaseMock({
      upsertResults: { children: { error: { code: '42501', message: 'row-level security' } } },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(false);
    expect(result.totalTerminal).toBe(1);
    expect(result.totalRetriable).toBe(0);
    expect((await outbox.getById('children:child-stuck:insert')).status).toBe('terminal');

    const meta = await stateRepository.getSyncMeta();
    expect(meta.lastSyncTime).toBeTruthy();
    expect(meta.lastSuccessfulSyncTime).toBeNull();
  });

  test('a preflight error flips success false even when every record is fine', async () => {
    await seedChild('child-fine');
    const { supabaseClient } = createSupabaseMock();
    const failingOutbox = {
      ...outbox,
      resetInFlight: jest.fn(async () => { throw new Error('disk I/O error'); }),
    };
    const engine = createOutboxSyncEngine({
      getAuthSession: liveTestSession,
      database: db,
      supabaseClient,
      outboxRepository: failingOutbox,
    });

    const result = await engine.syncAll();

    expect(result.success).toBe(false);
    expect(result.preflightErrors.some((entry) => entry.step === 'resetInFlight')).toBe(true);

    const meta = await stateRepository.getSyncMeta();
    expect(meta.lastSuccessfulSyncTime).toBeNull();
  });

  test('a retriable failure plus skipped dependents still counts as a successful pass', async () => {
    await seedChild('child-wait');
    await db.runAsync(
      "insert into child_ea_assignments (id, user_id, child_id, sync_status) values ('assignment-1', 'user-1', 'child-wait', 'pending')",
    );
    await outbox.enqueue({
      tableName: 'child_ea_assignments',
      recordId: 'assignment-1',
      operation: 'insert',
      payload: { id: 'assignment-1', user_id: 'user-1', child_id: 'child-wait' },
    });
    const { supabaseClient } = createSupabaseMock({
      upsertResults: { children: { error: { message: 'network down' } } },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.tableResults.child_ea_assignments).toEqual(expect.objectContaining({
      skipped: true,
      skippedDependency: 'children',
    }));
    expect(result.success).toBe(true);
    const meta = await stateRepository.getSyncMeta();
    expect(meta.lastSuccessfulSyncTime).toBe(meta.lastSyncTime);
  });
});
