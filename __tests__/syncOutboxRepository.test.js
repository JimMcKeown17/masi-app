jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { createSyncStateRepository } from '../src/db/repositories/syncStateRepository';

describe('SQLite sync outbox repository', () => {
  let db;
  let outbox;

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase();
    await runMigrations(db);
    outbox = createSyncOutboxRepository({ database: db });
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  test('enqueue is idempotent for a table, record, and operation', async () => {
    await outbox.enqueue({
      tableName: 'children',
      recordId: 'child-1',
      operation: 'insert',
      payload: { id: 'child-1', first_name: 'Old' },
    });
    await outbox.enqueue({
      tableName: 'children',
      recordId: 'child-1',
      operation: 'insert',
      payload: { id: 'child-1', first_name: 'Updated' },
    });

    const rows = await db.getAllAsync('select * from sync_outbox');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({
      id: 'children:child-1:insert',
      table_name: 'children',
      record_id: 'child-1',
      operation: 'insert',
      status: 'pending',
      retry_count: 0,
    }));
    expect(JSON.parse(rows[0].payload)).toEqual({ id: 'child-1', first_name: 'Updated' });
  });

  test('retry attempts and next retry readiness persist across repository instances', async () => {
    await outbox.enqueue({
      tableName: 'children',
      recordId: 'child-1',
      operation: 'insert',
      payload: { id: 'child-1' },
    });

    await outbox.markRetriableFailure('children:child-1:insert', {
      errorMessage: 'network down',
      nextRetryAt: '2099-01-01T00:00:00.000Z',
    });

    expect(await outbox.getReadyRecords()).toEqual([]);

    const reopenedOutbox = createSyncOutboxRepository({ database: db });
    expect(await reopenedOutbox.getById('children:child-1:insert')).toEqual(expect.objectContaining({
      retry_count: 1,
      status: 'failed',
      last_error: 'network down',
      next_retry_at: '2099-01-01T00:00:00.000Z',
    }));

    await reopenedOutbox.markReady('children:child-1:insert');
    expect(await reopenedOutbox.getReadyRecords()).toEqual([
      expect.objectContaining({
        id: 'children:child-1:insert',
        retry_count: 1,
        payload: { id: 'child-1' },
      }),
    ]);
  });

  test('failed and terminal rows are visible while in-flight rows do not inflate unsynced count', async () => {
    await outbox.enqueue({
      tableName: 'children',
      recordId: 'pending-child',
      operation: 'insert',
      payload: { id: 'pending-child' },
    });
    await outbox.enqueue({
      tableName: 'sessions',
      recordId: 'failed-session',
      operation: 'insert',
      payload: { id: 'failed-session' },
    });
    await outbox.enqueue({
      tableName: 'assessments',
      recordId: 'terminal-assessment',
      operation: 'insert',
      payload: { id: 'terminal-assessment' },
    });
    await outbox.enqueue({
      tableName: 'groups',
      recordId: 'in-flight-group',
      operation: 'insert',
      payload: { id: 'in-flight-group' },
    });

    await outbox.markRetriableFailure('sessions:failed-session:insert', { errorMessage: 'network down' });
    await outbox.markTerminalFailure('assessments:terminal-assessment:insert', { errorMessage: 'RLS denied' });
    await outbox.markInFlight(['groups:in-flight-group:insert']);

    expect(await outbox.getFailedItems()).toEqual([
      expect.objectContaining({
        table: 'sessions',
        id: 'failed-session',
        reason: 'network down',
        terminal: false,
      }),
      expect.objectContaining({
        table: 'assessments',
        id: 'terminal-assessment',
        reason: 'RLS denied',
        terminal: true,
      }),
    ]);

    expect(await outbox.getSyncStatus()).toEqual(expect.objectContaining({
      unsyncedCount: 2,
      failedCount: 2,
      inFlightCount: 1,
      breakdown: expect.objectContaining({
        children: 1,
        sessions: 1,
        assessments: 0,
        groups: 0,
      }),
    }));
  });

  test('getReadyRecords claims terminal rows only when includeTerminal is set (force Sync Now)', async () => {
    await outbox.enqueue({ tableName: 'assessments', recordId: 'term-1', operation: 'insert', payload: { id: 'term-1' } });
    await outbox.markTerminalFailure('assessments:term-1:insert', { errorMessage: 'RLS denied' });

    // Default (auto-sync + non-force Sync Now): terminal rows are NOT claimable.
    expect(await outbox.getReadyRecords()).toEqual([]);
    expect(await outbox.getReadyRecords({ includeBackedOff: true })).toEqual([]);

    // includeTerminal (force Sync Now): the terminal row becomes claimable again.
    const ready = await outbox.getReadyRecords({ includeBackedOff: true, includeTerminal: true });
    expect(ready).toEqual([expect.objectContaining({ recordId: 'term-1', status: 'terminal' })]);
  });

  describe('hasPendingRecord point-query for pending parent evidence (#48)', () => {
    test('true when a pending row exists for (table, id)', async () => {
      await outbox.enqueue({ tableName: 'children', recordId: 'child-1', operation: 'insert', payload: { id: 'child-1' } });
      expect(await outbox.hasPendingRecord({ tableName: 'children', recordId: 'child-1' })).toBe(true);
    });

    test('true when the row is in_flight', async () => {
      await outbox.enqueue({ tableName: 'children', recordId: 'child-2', operation: 'insert', payload: { id: 'child-2' } });
      await outbox.markInFlight(['children:child-2:insert']);
      expect(await outbox.hasPendingRecord({ tableName: 'children', recordId: 'child-2' })).toBe(true);
    });

    test('false when no row exists (parent already synced -> row deleted)', async () => {
      expect(await outbox.hasPendingRecord({ tableName: 'children', recordId: 'nope' })).toBe(false);
    });

    test('false when the only row is terminal (doomed parent must not keep children retrying)', async () => {
      await outbox.enqueue({ tableName: 'children', recordId: 'child-3', operation: 'insert', payload: { id: 'child-3' } });
      await outbox.markTerminalFailure('children:child-3:insert', { errorMessage: 'boom' });
      expect(await outbox.hasPendingRecord({ tableName: 'children', recordId: 'child-3' })).toBe(false);
    });

    test('false for missing args', async () => {
      expect(await outbox.hasPendingRecord({ tableName: 'children', recordId: null })).toBe(false);
    });
  });
});

describe('SQLite sync state repository', () => {
  let db;
  let syncState;

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase();
    await runMigrations(db);
    syncState = createSyncStateRepository({ database: db });
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  test('stores per-scope pull cursors and global sync timestamps', async () => {
    await syncState.setPullState('children', {
      lastPulledAt: '2026-05-21T10:00:00.000Z',
      cursor: 'cursor-1',
    });
    await syncState.updateSyncMeta({
      lastSyncTime: '2026-05-21T10:01:00.000Z',
      lastSuccessfulSyncTime: '2026-05-21T10:01:00.000Z',
    });

    expect(await syncState.getPullState('children')).toEqual({
      scope: 'children',
      lastPulledAt: '2026-05-21T10:00:00.000Z',
      cursor: 'cursor-1',
    });
    expect(await syncState.getSyncMeta()).toEqual(expect.objectContaining({
      lastSyncTime: '2026-05-21T10:01:00.000Z',
      lastSuccessfulSyncTime: '2026-05-21T10:01:00.000Z',
    }));
  });
});
