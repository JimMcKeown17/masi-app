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

const seedAssessmentItems = async (db, itemIds = [
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000202',
]) => {
  await db.runAsync(`
    insert into children (id, first_name, last_name, sync_status)
    values ('child-auth-gate-assessment', 'Amahle', 'Dlamini', 'synced')
  `);
  await db.runAsync(`
    insert into assessments (
      id,
      user_id,
      child_id,
      programme_id,
      assessment_type,
      assessment_date,
      sync_status
    )
    values (
      'assessment-auth-gate',
      'user-1',
      'child-auth-gate-assessment',
      'programme-1',
      'letter_sounds',
      '2026-05-25',
      'synced'
    )
  `);

  for (const [index, itemId] of itemIds.entries()) {
    const item = {
      id: itemId,
      assessment_id: 'assessment-auth-gate',
      item_key: `letter-${index + 1}`,
      prompt: String.fromCharCode(97 + index),
      response: String.fromCharCode(97 + index),
      is_correct: 1,
      position: index,
      metadata: '{}',
    };
    await db.runAsync(`
      insert into assessment_items (
        id,
        assessment_id,
        item_key,
        prompt,
        response,
        is_correct,
        position,
        metadata,
        sync_status
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `, item.id, item.assessment_id, item.item_key, item.prompt, item.response, item.is_correct, item.position, item.metadata);
    await createSyncOutboxRepository({ database: db }).enqueue({
      tableName: 'assessment_items',
      recordId: item.id,
      operation: 'insert',
      payload: item,
    });
  }

  return itemIds;
};

const liveSession = { user: { id: 'test-user' } };
const liveTestSession = async () => ({ data: { session: liveSession } });
const missingTestSession = async () => ({ data: { session: null } });
const AUTHENTICATED_DENIAL_MARKER = '42501-authenticated:';

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

  test('a 42501 after the session vanished mid-cycle is retriable, not terminal', async () => {
    await seedPendingClass(db);
    const { supabaseClient } = createSupabaseMock({
      upsertResults: {
        classes: { error: { code: '42501', message: 'RLS denied' } },
      },
    });
    const mockGetAuthSession = jest.fn()
      .mockResolvedValueOnce({ data: { session: liveSession } })
      .mockResolvedValue({ data: { session: null } });
    const engine = createOutboxSyncEngine({
      database: db,
      supabaseClient,
      outboxRepository,
      stateRepository,
      getAuthSession: mockGetAuthSession,
    });

    const result = await engine.syncAll();
    const outboxRow = await outboxRepository.getById('classes:class-auth-gate:insert');

    expect(result).toEqual(expect.objectContaining({
      // Finding 6 semantics: the downgraded (retriable) 42501 leaves the pass successful.
      success: true,
      totalSynced: 0,
      totalFailed: 1,
      totalRetriable: 1,
      totalTerminal: 0,
    }));
    expect(mockGetAuthSession).toHaveBeenCalledTimes(2);
    expect(outboxRow.status).toBe('failed');
    expect(outboxRow.next_retry_at).toEqual(expect.any(String));
    expect(outboxRow.last_error).toBe('RLS denied');
    expect(outboxRow.last_error.startsWith(AUTHENTICATED_DENIAL_MARKER)).toBe(false);
    expect(await db.getFirstAsync('select sync_status, last_sync_error from classes where id = ?', 'class-auth-gate'))
      .toEqual({ sync_status: 'failed', last_sync_error: 'RLS denied' });
  });

  test('a 42501 with a live session stays terminal and carries the authenticated marker', async () => {
    await seedPendingClass(db);
    const { supabaseClient } = createSupabaseMock({
      upsertResults: {
        classes: { error: { code: '42501', message: 'RLS denied' } },
      },
    });
    const mockGetAuthSession = jest.fn(liveTestSession);
    const engine = createOutboxSyncEngine({
      database: db,
      supabaseClient,
      outboxRepository,
      stateRepository,
      getAuthSession: mockGetAuthSession,
    });

    const result = await engine.syncAll();
    const outboxRow = await outboxRepository.getById('classes:class-auth-gate:insert');

    expect(result).toEqual(expect.objectContaining({
      success: false,
      totalSynced: 0,
      totalFailed: 1,
    }));
    expect(mockGetAuthSession).toHaveBeenCalledTimes(2);
    expect(outboxRow.status).toBe('terminal');
    expect(outboxRow.next_retry_at).toBeNull();
    expect(outboxRow.last_error).toBe(`${AUTHENTICATED_DENIAL_MARKER} RLS denied`);
    expect(await db.getFirstAsync('select sync_status, last_sync_error from classes where id = ?', 'class-auth-gate'))
      .toEqual({ sync_status: 'terminal', last_sync_error: `${AUTHENTICATED_DENIAL_MARKER} RLS denied` });
  });

  test('batched 42501s flow through the same downgrade and marker logic per row', async () => {
    const itemIds = await seedAssessmentItems(db);
    const { supabaseClient } = createSupabaseMock({
      upsertResults: {
        'assessment_items:batch': {
          error: { code: '42501', message: 'RLS denied batch' },
        },
        assessment_items: {
          error: { code: '42501', message: 'RLS denied item' },
        },
      },
    });
    const mockGetAuthSession = jest.fn(liveTestSession);
    const engine = createOutboxSyncEngine({
      database: db,
      supabaseClient,
      outboxRepository,
      stateRepository,
      getAuthSession: mockGetAuthSession,
    });

    const result = await engine.syncAll();
    const rows = await Promise.all(
      itemIds.map((itemId) => outboxRepository.getById(`assessment_items:${itemId}:insert`))
    );

    expect(result).toEqual(expect.objectContaining({
      success: false,
      totalSynced: 0,
      totalFailed: 2,
    }));
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === 'terminal')).toBe(true);
    expect(rows.every((row) => row.last_error === `${AUTHENTICATED_DENIAL_MARKER} RLS denied item`)).toBe(true);
    expect(rows.every((row) => row.next_retry_at === null)).toBe(true);
    const domainRows = await db.getAllAsync(`
      select sync_status, last_sync_error
      from assessment_items
      order by id
    `);
    expect(domainRows).toEqual([
      { sync_status: 'terminal', last_sync_error: `${AUTHENTICATED_DENIAL_MARKER} RLS denied item` },
      { sync_status: 'terminal', last_sync_error: `${AUTHENTICATED_DENIAL_MARKER} RLS denied item` },
    ]);
  });
});
