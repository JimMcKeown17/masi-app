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
      ownerUserId: 'ea-old',
    });
    await outbox.enqueue({
      tableName: 'children',
      recordId: 'child-1',
      operation: 'insert',
      payload: { id: 'child-1', first_name: 'Updated' },
      ownerUserId: 'ea-updated',
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
      owner_user_id: 'ea-updated',
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

  test('getSyncStatus separates ready work from backed-off work', async () => {
    await outbox.enqueue({
      tableName: 'sessions',
      recordId: 'ready-1',
      operation: 'insert',
      payload: { id: 'ready-1' },
    });
    await outbox.enqueue({
      tableName: 'sessions',
      recordId: 'backed-off-1',
      operation: 'insert',
      payload: { id: 'backed-off-1' },
    });
    await outbox.markRetriableFailure('sessions:backed-off-1:insert', {
      errorMessage: 'network down',
      nextRetryAt: '2099-01-01T00:00:00.000Z',
    });

    const status = await outbox.getSyncStatus();

    expect(status.unsyncedCount).toBe(2);
    expect(status.readyCount).toBe(1);
  });

  test('readiness and every status counter are scoped to the current owner plus NULL rows', async () => {
    const enqueue = (recordId, ownerUserId) => outbox.enqueue({
      tableName: 'sessions',
      recordId,
      operation: 'insert',
      payload: { id: recordId },
      ownerUserId,
    });

    await enqueue('a-pending', 'ea-a');
    await enqueue('a-terminal', 'ea-a');
    await enqueue('b-pending', 'ea-b');
    await enqueue('b-backed-off', 'ea-b');
    await enqueue('b-terminal', 'ea-b');
    await enqueue('null-pending', null);
    await enqueue('null-terminal', null);
    await outbox.markTerminalFailure('sessions:a-terminal:insert', { errorMessage: 'A terminal' });
    await outbox.markRetriableFailure('sessions:b-backed-off:insert', {
      errorMessage: 'B waiting',
      nextRetryAt: '2099-01-01T00:00:00.000Z',
    });
    await outbox.markTerminalFailure('sessions:b-terminal:insert', { errorMessage: 'B terminal' });
    await outbox.markTerminalFailure('sessions:null-terminal:insert', { errorMessage: 'NULL terminal' });

    expect((await outbox.getReadyRecords({ ownerUserId: 'ea-b' })).map((row) => row.record_id))
      .toEqual(['b-pending', 'null-pending']);
    expect((await outbox.getReadyRecords()).map((row) => row.record_id))
      .toEqual(['a-pending', 'b-pending', 'null-pending']);

    const scoped = await outbox.getSyncStatus({ ownerUserId: 'ea-b' });
    expect(scoped).toEqual(expect.objectContaining({
      unsyncedCount: 3,
      readyCount: 2,
      failedCount: 3,
      inFlightCount: 0,
      waitingCount: 3,
      needsAttentionCount: 2,
      backedOffCount: 1,
      breakdown: { sessions: 3 },
    }));
    expect(scoped.needsAttentionItems.map((item) => item.id)).toEqual([
      'b-terminal',
      'null-terminal',
    ]);

    const unscoped = await outbox.getSyncStatus();
    expect(unscoped).toEqual(expect.objectContaining({
      unsyncedCount: 4,
      readyCount: 3,
      failedCount: 4,
      needsAttentionCount: 3,
      backedOffCount: 1,
      breakdown: { sessions: 4 },
    }));
  });

  test('resetInFlight only recovers the current owner plus NULL rows', async () => {
    await outbox.enqueue({
      tableName: 'sessions', recordId: 'a-row', operation: 'insert', payload: { id: 'a-row' }, ownerUserId: 'ea-a',
    });
    await outbox.enqueue({
      tableName: 'sessions', recordId: 'b-row', operation: 'insert', payload: { id: 'b-row' }, ownerUserId: 'ea-b',
    });
    await outbox.enqueue({
      tableName: 'sessions', recordId: 'null-row', operation: 'insert', payload: { id: 'null-row' }, ownerUserId: null,
    });
    await outbox.markInFlight([
      'sessions:a-row:insert',
      'sessions:b-row:insert',
      'sessions:null-row:insert',
    ]);

    await outbox.resetInFlight({ ownerUserId: 'ea-b' });

    expect(await db.getAllAsync('select record_id, status from sync_outbox order by record_id')).toEqual([
      { record_id: 'a-row', status: 'in_flight' },
      { record_id: 'b-row', status: 'pending' },
      { record_id: 'null-row', status: 'pending' },
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

  test('getPendingHardDeleteIds returns active hard-deletes for the owner plus legacy rows', async () => {
    const enqueueDelete = (recordId, ownerUserId) => outbox.enqueue({
      tableName: 'children',
      recordId,
      operation: 'hard_delete',
      payload: { id: recordId },
      ownerUserId,
    });
    await enqueueDelete('legacy-child', null);
    await enqueueDelete('pending-child', 'ea-a');
    await enqueueDelete('failed-child', 'ea-a');
    await enqueueDelete('in-flight-child', 'ea-a');
    await enqueueDelete('other-owner-child', 'ea-b');
    await enqueueDelete('terminal-child', 'ea-a');
    await outbox.enqueue({
      tableName: 'children',
      recordId: 'updated-child',
      operation: 'update',
      payload: { id: 'updated-child' },
      ownerUserId: 'ea-a',
    });
    await outbox.markRetriableFailure('children:failed-child:hard_delete', { errorMessage: 'offline' });
    await outbox.markInFlight(['children:in-flight-child:hard_delete']);
    await outbox.markTerminalFailure('children:terminal-child:hard_delete', { errorMessage: 'denied' });

    expect(await outbox.getPendingHardDeleteIds({
      tableName: 'children',
      ownerUserId: 'ea-a',
    })).toEqual(new Set([
      'legacy-child',
      'pending-child',
      'failed-child',
      'in-flight-child',
    ]));
  });

  test('getSyncStatus splits waiting, backed-off, and needs-attention counts in one snapshot', async () => {
    await outbox.enqueue({ tableName: 'children', recordId: 'pending-1', operation: 'insert', payload: { id: 'pending-1' } });
    await outbox.enqueue({ tableName: 'sessions', recordId: 'ready-failed-1', operation: 'insert', payload: { id: 'ready-failed-1' } });
    await outbox.enqueue({ tableName: 'sessions', recordId: 'backed-off-1', operation: 'insert', payload: { id: 'backed-off-1' } });
    await outbox.enqueue({ tableName: 'assessments', recordId: 'terminal-1', operation: 'insert', payload: { id: 'terminal-1' } });
    await outbox.enqueue({ tableName: 'groups', recordId: 'stranded-1', operation: 'insert', payload: { id: 'stranded-1' } });

    // next_retry_at null means "ready now" (still waiting, not backed off).
    await outbox.markRetriableFailure('sessions:ready-failed-1:insert', { errorMessage: 'network down' });
    await outbox.markRetriableFailure('sessions:backed-off-1:insert', {
      errorMessage: 'server busy',
      nextRetryAt: '2099-01-01T00:00:00.000Z',
    });
    await outbox.markTerminalFailure('assessments:terminal-1:insert', { errorMessage: 'RLS denied' });
    // A row stranded in_flight by a killed pass is still owed (R5): it counts as waiting.
    await outbox.markInFlight(['groups:stranded-1:insert']);

    const status = await outbox.getSyncStatus();

    expect(status.waitingCount).toBe(4);        // pending + both retriable-failed + stranded in_flight
    expect(status.needsAttentionCount).toBe(1); // terminal only
    expect(status.backedOffCount).toBe(1);      // failed with a future next_retry_at
    expect(status.nextRetryAt).toBe('2099-01-01T00:00:00.000Z');

    // Back-compat fields unchanged.
    expect(status.unsyncedCount).toBe(3);       // in_flight still excluded here, as before
    expect(status.failedCount).toBe(3);         // failed(2) + terminal(1), conflated as before
    expect(status.inFlightCount).toBe(1);

    // Itemized terminal rows only, now carrying retry metadata.
    expect(status.needsAttentionItems).toEqual([
      expect.objectContaining({
        table: 'assessments',
        id: 'terminal-1',
        terminal: true,
        nextRetryAt: null,
        retryCount: 0,
      }),
    ]);
    const backedOffItem = status.failedItems.find((item) => item.id === 'backed-off-1');
    expect(backedOffItem).toEqual(expect.objectContaining({
      nextRetryAt: '2099-01-01T00:00:00.000Z',
      retryCount: 1,
    }));
  });

  test('getSyncStatus on an empty outbox reports zero split counts and no nextRetryAt', async () => {
    const status = await outbox.getSyncStatus();
    expect(status).toEqual(expect.objectContaining({
      waitingCount: 0,
      needsAttentionCount: 0,
      backedOffCount: 0,
      nextRetryAt: null,
      needsAttentionItems: [],
    }));
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

  test('reads persisted reconcile breaker notes without returning ordinary pull state', async () => {
    const note = {
      scope: 'childEaAssignments',
      candidateCount: 15,
      wouldEndCount: 12,
      triggeredAt: '2026-07-13T12:00:00.000Z',
    };
    await syncState.setPullState('pull_reconcile_breaker:childEaAssignments', {
      cursor: JSON.stringify(note),
    });
    await syncState.setPullState('child_data_pull', {
      lastPulledAt: '2026-07-13T12:01:00.000Z',
    });

    await expect(syncState.getReconcileBreakerNotes()).resolves.toEqual([note]);
  });
});
