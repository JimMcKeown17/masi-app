jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  supabase: {},
}));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { createSyncStateRepository } from '../src/db/repositories/syncStateRepository';

const createSupabaseMock = ({ upsertResults = {} } = {}) => {
  const calls = [];
  const supabaseClient = {
    from: jest.fn((tableName) => ({
      upsert: jest.fn(async (payload, options) => {
        calls.push({ type: 'upsert', tableName, payload, options });
        const resultKey = Array.isArray(payload)
          ? `${tableName}:batch`
          : `${tableName}:${payload.id}`;
        const result = upsertResults[resultKey] || upsertResults[tableName];
        if (typeof result === 'function') {
          return result({ tableName, payload, options, calls });
        }
        return result || { error: null };
      }),
      delete: jest.fn(() => ({
        eq: jest.fn(async (column, value) => {
          calls.push({ type: 'delete', tableName, column, value });
          return { error: null };
        }),
      })),
    })),
  };

  return { supabaseClient, calls };
};

const seedReferences = async (db) => {
  await db.runAsync("insert into schools (id, name, sync_status) values ('school-1', 'Masi Primary', 'synced')");
  await db.runAsync("insert into programmes (id, code, name, sync_status) values ('programme-1', 'lit', 'Literacy', 'synced')");
};

const seedPendingClass = async (db, overrides = {}) => {
  const payload = {
    id: 'class-auth-gate',
    school_id: 'school-1',
    name: 'Grade 1A',
    grade: '1',
    ...overrides,
  };
  await db.runAsync(`
    insert into classes (id, school_id, name, grade, sync_status)
    values (?, ?, ?, ?, 'pending')
  `, payload.id, payload.school_id, payload.name, payload.grade);
  await createSyncOutboxRepository({ database: db }).enqueue({
    tableName: 'classes',
    recordId: payload.id,
    operation: 'insert',
    payload,
  });
  return payload;
};

const liveSession = { user: { id: 'test-user' } };
const liveTestSession = async () => ({ data: { session: liveSession } });
const missingTestSession = async () => ({ data: { session: null } });

describe('SQLite outbox auth gate', () => {
  let db;
  let outboxRepository;
  let stateRepository;

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase();
    await runMigrations(db);
    await seedReferences(db);
    outboxRepository = createSyncOutboxRepository({ database: db });
    stateRepository = createSyncStateRepository({ database: db });
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  test('a sessionless pass skips with the structured shape and touches nothing', async () => {
    await seedPendingClass(db);
    const { supabaseClient, calls } = createSupabaseMock();
    const mockGetAuthSession = jest.fn(missingTestSession);
    const engine = createOutboxSyncEngine({
      database: db,
      supabaseClient,
      outboxRepository,
      stateRepository,
      getAuthSession: mockGetAuthSession,
    });

    const result = await engine.syncAll();

    expect(result).toEqual(expect.objectContaining({
      success: true,
      skippedNoSession: true,
      totalSynced: 0,
      totalFailed: 0,
      failedRecords: [],
      tableResults: {},
      preflightErrors: [],
      durationMs: expect.any(Number),
    }));
    expect(mockGetAuthSession).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
    expect(await outboxRepository.getReadyRecords()).toHaveLength(1);
    expect(await engine.getSyncStatus()).toEqual(expect.objectContaining({
      lastSyncTime: null,
      lastSuccessfulSyncTime: null,
    }));
  });

  test('a live session proceeds normally', async () => {
    await seedPendingClass(db);
    const { supabaseClient, calls } = createSupabaseMock();
    const mockGetAuthSession = jest.fn(liveTestSession);
    const engine = createOutboxSyncEngine({
      database: db,
      supabaseClient,
      outboxRepository,
      stateRepository,
      getAuthSession: mockGetAuthSession,
    });

    const result = await engine.syncAll();

    expect(mockGetAuthSession).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({
      success: true,
      totalSynced: 1,
      totalFailed: 0,
    }));
    expect(result.skippedNoSession).toBeUndefined();
    expect(calls.map((call) => `${call.type}:${call.tableName}`)).toEqual(['upsert:classes']);
    expect(await db.getFirstAsync('select sync_status, last_sync_error from classes where id = ?', 'class-auth-gate'))
      .toEqual({ sync_status: 'synced', last_sync_error: null });
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
    expect(await engine.getSyncStatus()).toEqual(expect.objectContaining({
      lastSyncTime: expect.any(String),
      lastSuccessfulSyncTime: expect.any(String),
    }));
  });
});
