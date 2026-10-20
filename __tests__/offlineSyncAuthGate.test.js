import { bindTestActor } from '../test-support/actorTestUtils';
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'),
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

const setFileOwner = (db, userId) => db.runAsync(
  "insert into local_state (key, value, updated_at) values ('file_owner_user_id', ?, '2026-10-17T00:00:00.000Z') "
    + 'on conflict(key) do update set value = excluded.value', userId
);

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

const seedTimeEntries = async (db, itemIds = [
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000202',
]) => {
  for (const itemId of itemIds) {
    const item = {
      id: itemId,
      user_id: 'user-1',
      sign_in_time: '2026-05-25T08:00:00.000Z',
    };
    await db.runAsync(`
      insert into time_entries (id, user_id, sign_in_time, sync_status)
      values (?, ?, ?, 'pending')
    `, item.id, item.user_id, item.sign_in_time);
    await createSyncOutboxRepository({ database: db }).enqueue({
      tableName: 'time_entries',
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
    db = bindTestActor(createBetterSqliteTestDatabase(), liveSession.user.id);
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
    const engine = createOutboxSyncEngine({ enqueueRequest: (task) => task(),
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
    const engine = createOutboxSyncEngine({ enqueueRequest: (task) => task(),
      database: db,
      supabaseClient,
      outboxRepository,
      stateRepository,
      getAuthSession: mockGetAuthSession,
    });

    const result = await engine.syncAll();

    expect(mockGetAuthSession).toHaveBeenCalledTimes(2);
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

  test('a pass uploads the file owner\'s rows, adopts legacy NULL owners and quarantines a foreign owner', async () => {
    const aPayload = await seedPendingClass(db, { id: 'class-a', name: 'Grade A' });
    const bPayload = await seedPendingClass(db, { id: 'class-b', name: 'Grade B' });
    await seedPendingClass(db, { id: 'class-null', name: 'Grade NULL' });
    // A legacy row queued before local migration 12 has no owner.
    await db.runAsync("update sync_outbox set owner_user_id = null where record_id = 'class-null'");
    bindTestActor(db, 'ea-a');
    await outboxRepository.enqueue({
      tableName: 'classes', recordId: aPayload.id, operation: 'insert', payload: aPayload,
    });
    bindTestActor(db, 'ea-b');
    await outboxRepository.enqueue({
      tableName: 'classes', recordId: bPayload.id, operation: 'insert', payload: bPayload,
    });
    await setFileOwner(db, 'ea-b');
    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ enqueueRequest: (task) => task(),
      database: db,
      supabaseClient,
      outboxRepository,
      stateRepository,
      getAuthSession: async () => ({ data: { session: { user: { id: 'ea-b' } } } }),
    });

    const result = await engine.syncAll();

    expect(result).toEqual(expect.objectContaining({ totalSynced: 2, totalFailed: 0 }));
    expect(calls.map((call) => call.payload.id).sort()).toEqual(['class-b', 'class-null']);
    // ea-a's row in ea-b's file is an integrity fault: quarantined, never uploaded, still unsent.
    expect(await outboxRepository.getById('classes:class-a:insert')).toEqual(expect.objectContaining({
      status: 'terminal',
      last_error: 'foreign_owner',
      owner_user_id: 'ea-a',
    }));
    expect(await db.getFirstAsync("select sync_status from classes where id = 'class-a'"))
      .toEqual({ sync_status: 'terminal' });
  });

  test('engine getSyncStatus returns the whole file despite an obsolete owner filter', async () => {
    bindTestActor(db, 'ea-a');
    await outboxRepository.enqueue({
      tableName: 'classes', recordId: 'a-row', operation: 'insert', payload: { id: 'a-row' },
    });
    bindTestActor(db, 'ea-b');
    await outboxRepository.enqueue({
      tableName: 'classes', recordId: 'b-row', operation: 'insert', payload: { id: 'b-row' },
    });
    bindTestActor(db, 'user-1');
    await outboxRepository.enqueue({
      tableName: 'classes', recordId: 'null-row', operation: 'insert', payload: { id: 'null-row' },
    });
    // Simulate a legacy null owner; v12 forbids creating one through enqueue.
    await db.runAsync('update sync_outbox set owner_user_id = null where record_id = ?', 'null-row');
    const engine = createOutboxSyncEngine({ enqueueRequest: (task) => task(),
      database: db,
      supabaseClient: createSupabaseMock().supabaseClient,
      outboxRepository,
      stateRepository,
      getAuthSession: liveTestSession,
    });

    expect(await engine.getSyncStatus({ ownerUserId: 'ea-b' })).toEqual(expect.objectContaining({
      unsyncedCount: 3,
      readyCount: 3,
      breakdown: { classes: 3 },
    }));
  });

  test('a pass adopts and resets a legacy in-flight row, and never resets a foreign one', async () => {
    for (const [recordId, actor] of [
      ['class-a', 'ea-a'],
      ['class-b', 'ea-b'],
      ['class-null', null],
    ]) {
      bindTestActor(db, actor || 'user-1');
      const payload = await seedPendingClass(db, { id: recordId, name: recordId });
      await outboxRepository.enqueue({
        tableName: 'classes', recordId, operation: 'insert', payload,
      });
      if (actor === null) await db.runAsync('update sync_outbox set owner_user_id = null where record_id = ?', recordId);
    }
    await outboxRepository.markInFlight([
      'classes:class-a:insert',
      'classes:class-b:insert',
      'classes:class-null:insert',
    ]);
    await setFileOwner(db, 'ea-b');
    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ enqueueRequest: (task) => task(),
      database: db,
      supabaseClient,
      outboxRepository,
      stateRepository,
      getAuthSession: async () => ({ data: { session: { user: { id: 'ea-b' } } } }),
    });

    await engine.syncAll();

    expect(calls.map((call) => call.payload.id).sort()).toEqual(['class-b', 'class-null']);
    expect(await outboxRepository.getById('classes:class-a:insert')).toEqual(expect.objectContaining({
      status: 'terminal',
      last_error: 'foreign_owner',
      owner_user_id: 'ea-a',
    }));
  });

  test('a mid-pass user switch aborts before upload and leaves the selected row pending', async () => {
    const payload = await seedPendingClass(db, { id: 'class-a', name: 'Grade A' });
    bindTestActor(db, 'ea-a');
    await outboxRepository.enqueue({
      tableName: 'classes', recordId: payload.id, operation: 'insert', payload,
    });
    const { supabaseClient, calls } = createSupabaseMock();
    const getAuthSession = jest.fn()
      .mockResolvedValueOnce({ data: { session: { user: { id: 'ea-a' } } } })
      .mockResolvedValue({ data: { session: { user: { id: 'ea-b' } } } });
    const engine = createOutboxSyncEngine({ enqueueRequest: (task) => task(),
      database: db,
      supabaseClient,
      outboxRepository,
      stateRepository,
      getAuthSession,
    });

    const result = await engine.syncAll();

    expect(getAuthSession).toHaveBeenCalledTimes(2);
    expect(calls).toEqual([]);
    expect(result).toEqual(expect.objectContaining({ totalSynced: 0, totalFailed: 0 }));
    expect(await outboxRepository.getById('classes:class-a:insert')).toEqual(expect.objectContaining({
      status: 'pending',
      retry_count: 0,
      last_error: null,
    }));
  });

  test('a mid-pass user switch aborts a batch before upload and restores every row to pending', async () => {
    const itemIds = await seedTimeEntries(db);
    await db.runAsync("update sync_outbox set owner_user_id = 'ea-a' where table_name = 'time_entries'");
    await setFileOwner(db, 'ea-a');
    const { supabaseClient, calls } = createSupabaseMock();
    const getAuthSession = jest.fn()
      .mockResolvedValueOnce({ data: { session: { user: { id: 'ea-a' } } } })
      .mockResolvedValue({ data: { session: { user: { id: 'ea-b' } } } });
    const engine = createOutboxSyncEngine({ enqueueRequest: (task) => task(),
      database: db,
      supabaseClient,
      outboxRepository,
      stateRepository,
      getAuthSession,
    });

    const result = await engine.syncAll();

    expect(getAuthSession).toHaveBeenCalledTimes(2);
    expect(calls).toEqual([]);
    expect(result).toEqual(expect.objectContaining({ totalSynced: 0, totalFailed: 0 }));
    const rows = await Promise.all(
      itemIds.map((itemId) => outboxRepository.getById(`time_entries:${itemId}:insert`))
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === 'pending')).toBe(true);
    expect(rows.every((row) => row.retry_count === 0 && row.last_error === null)).toBe(true);
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
      .mockResolvedValueOnce({ data: { session: liveSession } })
      .mockResolvedValue({ data: { session: null } });
    const engine = createOutboxSyncEngine({ enqueueRequest: (task) => task(),
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
    expect(mockGetAuthSession).toHaveBeenCalledTimes(3);
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
    const engine = createOutboxSyncEngine({ enqueueRequest: (task) => task(),
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
    expect(mockGetAuthSession).toHaveBeenCalledTimes(3);
    expect(outboxRow.status).toBe('terminal');
    expect(outboxRow.next_retry_at).toBeNull();
    expect(outboxRow.last_error).toBe(`${AUTHENTICATED_DENIAL_MARKER} RLS denied`);
    expect(await db.getFirstAsync('select sync_status, last_sync_error from classes where id = ?', 'class-auth-gate'))
      .toEqual({ sync_status: 'terminal', last_sync_error: `${AUTHENTICATED_DENIAL_MARKER} RLS denied` });
  });

  test('batched 42501s flow through the same downgrade and marker logic per row', async () => {
    const itemIds = await seedTimeEntries(db);
    const { supabaseClient } = createSupabaseMock({
      upsertResults: {
        'time_entries:batch': {
          error: { code: '42501', message: 'RLS denied batch' },
        },
        time_entries: {
          error: { code: '42501', message: 'RLS denied item' },
        },
      },
    });
    const mockGetAuthSession = jest.fn(liveTestSession);
    const engine = createOutboxSyncEngine({ enqueueRequest: (task) => task(),
      database: db,
      supabaseClient,
      outboxRepository,
      stateRepository,
      getAuthSession: mockGetAuthSession,
    });

    const result = await engine.syncAll();
    const rows = await Promise.all(
      itemIds.map((itemId) => outboxRepository.getById(`time_entries:${itemId}:insert`))
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
      from time_entries
      order by id
    `);
    expect(domainRows).toEqual([
      { sync_status: 'terminal', last_sync_error: `${AUTHENTICATED_DENIAL_MARKER} RLS denied item` },
      { sync_status: 'terminal', last_sync_error: `${AUTHENTICATED_DENIAL_MARKER} RLS denied item` },
    ]);
  });
});
