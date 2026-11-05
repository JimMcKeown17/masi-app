import { bindTestActor } from '../test-support/actorTestUtils';
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {} }));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { runMigrations } from '../src/db/migrations';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { createOutboxSyncEngine, SYNC_BATCH_LIMITS } from '../src/services/offlineSync';

// Lifecycle safety O1 item 5 (MA-BUG-20261104-021): a refused row forced into a pass and then
// not attempted (deferred, user switch, thrown claim or request) stays refused. It never becomes
// "waiting" (pending/failed), and its domain row keeps a consistent status and version.
const USER = 'user-1';
const liveSession = async () => ({ data: { session: { user: { id: USER } } } });
const childId = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('refused rows in a forced pass', () => {
  let db;
  let outbox;

  beforeEach(async () => {
    db = bindTestActor(createBetterSqliteTestDatabase(), USER);
    await runMigrations(db);
    outbox = createSyncOutboxRepository({ database: db });
  });
  afterEach(async () => { await db.closeAsync(); });

  // Refused child inserts: batchable, and stamped, so the claim bumps their domain row too.
  const seedRefusedInserts = async (count) => {
    const ids = Array.from({ length: count }, (_, index) => childId(index + 1));
    for (const id of ids) {
      await db.runAsync(`insert into children (id, first_name, last_name, created_by, row_version, sync_status)
        values (?, 'Amahle', 'Dlamini', ?, 1, 'terminal')`, id, USER);
      await outbox.enqueue({ tableName: 'children', recordId: id, operation: 'insert',
        payload: { id, first_name: 'Amahle', last_name: 'Dlamini', created_by: USER } });
      await outbox.markTerminalFailure(`children:${id}:insert`, { errorMessage: '42501-authenticated: denied', errorCode: '42501' });
    }
    return ids;
  };
  const statuses = async () => (await db.getAllAsync('select status from sync_outbox order by id')).map(row => row.status);
  const expectDomainConsistent = async () => {
    const rows = await db.getAllAsync(`select c.id, c.sync_status, c.row_version, json_extract(o.payload, '$.row_version') as sent
      from children c join sync_outbox o on o.record_id = c.id order by c.id`);
    for (const row of rows) {
      expect(row.sync_status).toBe('terminal');
      if (row.sent != null) expect(row.sent).toBe(row.row_version);
    }
  };
  const engine = (supabaseClient, overrides = {}) => createOutboxSyncEngine({
    database: db, supabaseClient, outboxRepository: overrides.outboxRepository || outbox,
    enqueueRequest: overrides.enqueueRequest || (task => task()), getAuthSession: overrides.getAuthSession || liveSession,
  });

  test('rows deferred past the fallback budget stay refused, with consistent domain rows', async () => {
    const count = SYNC_BATCH_LIMITS.maxFallbackRecordsPerPass + 5;
    await seedRefusedInserts(count);
    const snapshot = () => db.getAllAsync(`select o.id, o.status, o.updated_at, o.payload, c.sync_status, c.row_version
      from sync_outbox o join children c on c.id = o.record_id order by o.created_at, o.id`);
    const before = await snapshot();
    const denied = { error: { code: '42501', message: 'row-level security' } };
    const { supabaseClient, calls } = createSupabaseMock({ upsertResults: { children: denied } });
    const result = await engine(supabaseClient).syncAll({ force: true });
    expect(calls.filter(call => Array.isArray(call.payload))).toHaveLength(1);
    expect(result.totalDeferred).toBe(5);
    expect(await statuses()).toEqual(Array(count).fill('terminal'));
    await expectDomainConsistent();
    // The rows never sent are exactly as before the pass, so their delivered receipts still match.
    const after = await snapshot();
    const sent = new Set(calls.filter(call => !Array.isArray(call.payload)).map(call => `children:${call.payload.id}:insert`));
    expect(sent.size).toBe(SYNC_BATCH_LIMITS.maxFallbackRecordsPerPass);
    expect(after.filter(row => !sent.has(row.id))).toEqual(before.filter(row => !sent.has(row.id)));
  });

  test('a request that throws after the claim returns the rows to refused, not failed', async () => {
    await seedRefusedInserts(3);
    const { supabaseClient } = createSupabaseMock();
    const enqueueRequest = async () => { throw new Error('socket hang up'); };
    await engine(supabaseClient, { enqueueRequest }).syncAll({ force: true });
    expect(await statuses()).toEqual(['terminal', 'terminal', 'terminal']);
    expect((await db.getAllAsync('select retry_count, next_retry_at from sync_outbox'))
      .every(row => row.retry_count === 0 && row.next_retry_at === null)).toBe(true);
    await expectDomainConsistent();
  });

  test.each(['batch', 'single'])('a user switch after the claim returns %s rows to refused', async mode => {
    if (mode === 'batch') await seedRefusedInserts(2);
    else {
      await outbox.enqueue({ tableName: 'battery_runs', recordId: 'run-1', operation: 'update', payload: { id: 'run-1' } });
      await outbox.markTerminalFailure('battery_runs:run-1:update', { errorMessage: 'refused', errorCode: '22023' });
    }
    let calls = 0;
    const getAuthSession = async () => {
      calls += 1;
      return { data: { session: { user: { id: calls === 1 ? USER : 'someone-else' } } } };
    };
    const { supabaseClient, calls: requests } = createSupabaseMock();
    const before = await db.getAllAsync('select id, status, updated_at, payload from sync_outbox order by id');
    await engine(supabaseClient, { getAuthSession }).syncAll({ force: true });
    expect(requests).toEqual([]);
    expect(await statuses()).toEqual(Array(mode === 'batch' ? 2 : 1).fill('terminal'));
    await expectDomainConsistent();
    expect(await db.getAllAsync('select id, status, updated_at, payload from sync_outbox order by id')).toEqual(before);
  });

  test.each(['single', 'batch'])('a claim that throws changes nothing (%s)', async mode => {
    await seedRefusedInserts(mode === 'batch' ? 2 : 1);
    await db.runAsync(`insert into time_entries (id, user_id, sign_in_time, sync_status)
      values ('time-1', ?, '2026-05-25T08:00:00.000Z', 'failed')`, USER);
    await outbox.enqueue({ tableName: 'time_entries', recordId: 'time-1', operation: 'insert',
      payload: { id: 'time-1', user_id: USER, sign_in_time: '2026-05-25T08:00:00.000Z' } });
    await outbox.markRetriableFailure('time_entries:time-1:insert', {
      errorMessage: 'network', nextRetryAt: '2099-01-01T00:00:00.000Z' });
    const before = await db.getAllAsync('select * from sync_outbox order by id');
    const throwingOutbox = { ...outbox, markInFlightAndGet: async () => { throw new Error('disk I/O error'); } };
    const { supabaseClient, calls } = createSupabaseMock();
    const result = await engine(supabaseClient, { outboxRepository: throwingOutbox }).syncAll({ force: true });
    expect(calls).toEqual([]);
    expect(result.preflightErrors).toEqual([]);
    expect(await db.getAllAsync('select * from sync_outbox order by id')).toEqual(before);
    await expectDomainConsistent();
  });

  test.each([1, 2])('a claim that commits and then throws hands %i refused rows back as refused', async count => {
    await seedRefusedInserts(count);
    const committedThenThrows = {
      ...outbox,
      markInFlightAndGet: async (ids) => {
        await outbox.markInFlightAndGet(ids);
        throw new Error('claim snapshot failed after commit');
      },
    };
    const { supabaseClient, calls } = createSupabaseMock();
    await engine(supabaseClient, { outboxRepository: committedThenThrows }).syncAll({ force: true });
    expect(calls).toEqual([]);
    expect(await statuses()).toEqual(Array(count).fill('terminal'));
    await expectDomainConsistent();
  });

  test('a dependency check that throws fails only its own row', async () => {
    for (const id of ['time-a', 'time-b']) {
      await db.runAsync(`insert into time_entries (id, user_id, sign_in_time, sync_status)
        values (?, ?, '2026-05-25T08:00:00.000Z', 'pending')`, id, USER);
      await outbox.enqueue({ tableName: 'time_entries', recordId: id, operation: 'update',
        payload: { id, user_id: USER, sign_out_time: '2026-05-25T15:00:00.000Z' } });
    }
    const checking = {
      ...outbox,
      hasPendingOperation: async (args) => {
        if (args.recordId === 'time-a') throw new Error('dependency read failed');
        return outbox.hasPendingOperation(args);
      },
    };
    const { supabaseClient, calls } = createSupabaseMock();
    const result = await engine(supabaseClient, { outboxRepository: checking }).syncAll();
    expect(calls.map(call => `${call.type}:${call.value}`)).toEqual(['update:time-b']);
    expect(result).toMatchObject({ totalSynced: 1, totalRetriable: 1, preflightErrors: [] });
    expect(await db.getAllAsync('select id, status from sync_outbox')).toEqual([
      { id: 'time_entries:time-a:update', status: 'pending' },
    ]);
  });

  test('markReady and markReadyMany never demote a refused row', async () => {
    await seedRefusedInserts(2);
    const [first, second] = (await db.getAllAsync('select id from sync_outbox order by id')).map(row => row.id);
    await outbox.markReady(first);
    await outbox.markReadyMany([first, second]);
    expect(await statuses()).toEqual(['terminal', 'terminal']);
  });

  test('a refused archive, restore or edit is never claimed, even when asked directly', async () => {
    await db.runAsync(`insert into children (id, first_name, last_name, created_by, sync_status)
      values ('child-a', 'Amahle', 'Dlamini', ?, 'terminal')`, USER);
    await outbox.enqueue({ tableName: 'children', recordId: 'child-a', operation: 'archive',
      payload: { id: 'child-a', archived_at: '2026-05-25T12:00:00.000Z' } });
    await outbox.markTerminalFailure('children:child-a:archive', { errorMessage: 'not applied', errorCode: 'ARCHIVE_NOT_APPLIED' });
    expect(await outbox.markInFlightAndGet(['children:child-a:archive'])).toEqual([]);
    expect(await statuses()).toEqual(['terminal']);
    expect(await db.getFirstAsync("select sync_status, row_version from children where id = 'child-a'"))
      .toEqual({ sync_status: 'terminal', row_version: 1 });
  });
});
