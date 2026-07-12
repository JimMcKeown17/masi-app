jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { createSyncStateRepository } from '../src/db/repositories/syncStateRepository';
import { createOutboxSyncEngine } from '../src/services/offlineSync';

const liveSession = async () => ({ data: { session: { user: { id: 'user-1' } } } });

describe('deterministic server error attempt budget', () => {
  let db;
  let outboxRepository;
  let stateRepository;

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase();
    await runMigrations(db);
    await db.runAsync("insert into schools (id, name) values ('school-1', 'Masi Primary')");
    await db.runAsync(`
      insert into classes (id, school_id, name, grade, created_by, sync_status)
      values ('class-1', 'school-1', 'Grade 1A', '1', 'user-1', 'pending')
    `);
    outboxRepository = createSyncOutboxRepository({ database: db });
    stateRepository = createSyncStateRepository({ database: db });
    await outboxRepository.enqueue({
      tableName: 'classes',
      recordId: 'class-1',
      operation: 'insert',
      payload: {
        id: 'class-1',
        school_id: 'school-1',
        name: 'Grade 1A',
        grade: '1',
        created_by: 'user-1',
      },
      ownerUserId: 'user-1',
    });
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  test('the eighth PGRST204 is terminal and a ninth forced pass can recover it', async () => {
    let serverError = { code: 'PGRST204', message: 'schema cache is stale' };
    const upsert = jest.fn(async () => ({ error: serverError }));
    const engine = createOutboxSyncEngine({
      database: db,
      outboxRepository,
      stateRepository,
      getAuthSession: liveSession,
      supabaseClient: {
        from: jest.fn(() => ({ upsert })),
      },
    });

    for (let attempt = 1; attempt <= 7; attempt += 1) {
      await engine.syncAll({ force: true });
      expect(await outboxRepository.getById('classes:class-1:insert')).toEqual(expect.objectContaining({
        status: 'failed',
        retry_count: attempt,
      }));
    }

    const eighthResult = await engine.syncAll({ force: true });
    const exhausted = await outboxRepository.getById('classes:class-1:insert');

    expect(upsert).toHaveBeenCalledTimes(8);
    expect(eighthResult).toEqual(expect.objectContaining({
      success: false,
      totalTerminal: 1,
      totalRetriable: 0,
    }));
    expect(exhausted).toEqual(expect.objectContaining({
      status: 'terminal',
      retry_count: 8,
      next_retry_at: null,
    }));
    expect(exhausted.last_error).toBe('deterministic: schema cache is stale');

    serverError = null;
    const ninthResult = await engine.syncAll({ force: true });

    expect(upsert).toHaveBeenCalledTimes(9);
    expect(ninthResult).toEqual(expect.objectContaining({ success: true, totalSynced: 1 }));
    expect(await outboxRepository.getById('classes:class-1:insert')).toBeNull();
    expect(await db.getFirstAsync("select sync_status from classes where id = 'class-1'"))
      .toEqual({ sync_status: 'synced' });
  });

  test('a codeless network error remains retriable after twenty attempts', async () => {
    const upsert = jest.fn(async () => ({ error: { message: 'network down' } }));
    const engine = createOutboxSyncEngine({
      database: db,
      outboxRepository,
      stateRepository,
      getAuthSession: liveSession,
      supabaseClient: {
        from: jest.fn(() => ({ upsert })),
      },
    });

    for (let attempt = 1; attempt <= 20; attempt += 1) {
      await engine.syncAll({ force: true });
    }

    expect(upsert).toHaveBeenCalledTimes(20);
    expect(await outboxRepository.getById('classes:class-1:insert')).toEqual(expect.objectContaining({
      status: 'failed',
      retry_count: 20,
      last_error: 'network down',
    }));
  });
});
