jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
import { getDefaultTestHandle, TEST_ACTOR_ID } from '../test-support/defaultTestHandle';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';

const liveSession = async () => ({ data: { session: { user: { id: TEST_ACTOR_ID } } } });
const read = async id => (await getDefaultTestHandle().getReader()).getFirstAsync('select * from sync_outbox where id = ?', id);
const seed = async ({ parentPending = false } = {}) => {
  const h = getDefaultTestHandle();
  await h.withTransaction(async txn => {
    await txn.runAsync("insert into children (id, first_name, last_name, sync_status) values ('child', 'Test', 'Child', 'synced')");
    await txn.runAsync("insert into programmes (id, code, name) values ('programme', 'lit', 'Literacy')");
    await txn.runAsync("insert into sessions (id, user_id, programme_id, session_date, sync_status) values ('session', ?, 'programme', '2026-10-29', ?)", TEST_ACTOR_ID, parentPending ? 'pending' : 'synced');
    await txn.runAsync("insert into session_attendees (id, session_id, child_id) values ('attendee', 'session', 'child')");
  });
  if (parentPending) await h.services.repositories.syncOutbox.enqueue({ id: 'parent', tableName: 'sessions', recordId: 'session', operation: 'insert', payload: { id: 'session' } });
  await h.services.repositories.syncOutbox.enqueue({ id: 'upload', tableName: 'session_attendees', recordId: 'attendee', operation: 'insert',
    payload: { id: 'attendee', session_id: 'session', child_id: 'child' } });
};
const run = (result, options = {}) => {
  const h = getDefaultTestHandle();
  const { supabaseClient } = createSupabaseMock({ upsertResults: { session_attendees: result } });
  return createOutboxSyncEngine({ database: h, supabaseClient,
    enqueueRequest: h.enqueueRequest, getAuthSession: liveSession, ...options }).syncAll({ tableName: 'session_attendees' });
};

test('23503 with pending parent persists needs_parent atomically with the failure', async () => {
  await seed({ parentPending: true });
  const before = await read('upload');
  await run({ error: { code: '23503', message: 'raw parent failure' } });
  expect(await read('upload')).toMatchObject({ status: 'failed', error_class: 'needs_parent', error_code: '23503',
    last_error: 'raw parent failure', payload: before.payload, owner_user_id: before.owner_user_id, retry_count: 1 });
});

test('public repository failure methods persist validated defaults and structured values', async () => {
  await seed();
  const repo = getDefaultTestHandle().services.repositories.syncOutbox;
  await repo.markRetriableFailure('upload', { errorMessage: 'raw retry', errorClass: 'needs_reauth', errorCode: 'pgrst301' });
  expect(await read('upload')).toMatchObject({ status: 'failed', error_class: 'needs_reauth', error_code: 'PGRST301', last_error: 'raw retry' });
  await repo.markRetriableFailure('upload', { errorClass: 'invalid', errorCode: 'invalid-code' });
  expect(await read('upload')).toMatchObject({ error_class: 'retryable', error_code: 'OTHER' });
  await repo.markTerminalFailure('upload');
  expect(await read('upload')).toMatchObject({ status: 'terminal', error_class: 'terminal', error_code: 'OTHER' });
  await repo.markTerminalFailure('upload', { errorClass: 'needs_parent', errorCode: 'archive_required' });
  expect(await read('upload')).toMatchObject({ error_class: 'terminal', error_code: 'ARCHIVE_REQUIRED' });
});

test.each([['23503', 0, 0], ['PGRST204', 7, 8]])('terminal %s persists the actual escalation decision', async (code, retryCount, finalCount) => {
  await seed();
  await getDefaultTestHandle().withTransaction(txn => txn.runAsync('update sync_outbox set retry_count = ? where id = ?', retryCount, 'upload'));
  await run({ error: { code, message: 'raw terminal' } });
  expect(await read('upload')).toMatchObject({ status: 'terminal', error_class: 'terminal', error_code: code, retry_count: finalCount });
});

test('a codeless thrown request persists TRANSPORT without interpreting its message', async () => {
  await seed();
  await run(() => { throw new Error('23503 looks like a parent but is only text'); });
  expect(await read('upload')).toMatchObject({ status: 'failed', error_class: 'retryable', error_code: 'TRANSPORT',
    last_error: '23503 looks like a parent but is only text' });
});

test('42501 downgraded after the live session disappears records needs_reauth', async () => {
  await seed();
  let checks = 0;
  await run({ error: { code: '42501', message: 'raw denial' } }, { getAuthSession: async () => ++checks <= 2
    ? liveSession() : { data: { session: null } } });
  expect(await read('upload')).toMatchObject({ status: 'failed', error_class: 'needs_reauth', error_code: '42501' });
});

test('unknown table finalization uses UNKNOWN_TABLE and refuses a newer snapshot', async () => {
  const h = getDefaultTestHandle();
  const repo = h.services.repositories.syncOutbox;
  await repo.enqueue({ id: 'unknown', tableName: 'removed_table', recordId: 'raw-id', operation: 'insert', payload: { raw: true } });
  const makeEngine = getAuthSession => createOutboxSyncEngine({ database: h, supabaseClient: {}, enqueueRequest: h.enqueueRequest, getAuthSession });
  await makeEngine(liveSession).syncAll();
  expect(await read('unknown')).toMatchObject({ status: 'terminal', error_class: 'terminal', error_code: 'UNKNOWN_TABLE' });
  await h.withTransaction(txn => txn.runAsync("update sync_outbox set status = 'pending', error_class = null, error_code = null where id = 'unknown'"));
  let checks = 0;
  await makeEngine(async () => {
    if (++checks === 2) await h.withTransaction(txn => txn.runAsync("update sync_outbox set payload = '{\"newer\":true}', updated_at = '2099-01-01' where id = 'unknown'"));
    return liveSession();
  }).syncAll();
  expect(await read('unknown')).toMatchObject({ status: 'pending', error_class: null, error_code: null, payload: '{"newer":true}' });
});

test('foreign-owner quarantine stamps terminal/FOREIGN_OWNER even on an already terminal row', async () => {
  await seed();
  const h = getDefaultTestHandle();
  await h.withTransaction(txn => txn.runAsync("update sync_outbox set owner_user_id = 'foreign', status = 'terminal', error_code = 'OTHER', error_class = 'terminal' where id = 'upload'"));
  await h.services.repositories.syncOutbox.quarantineForeignOwners({ fileUserId: TEST_ACTOR_ID });
  expect(await read('upload')).toMatchObject({ status: 'terminal', error_class: 'terminal', error_code: 'FOREIGN_OWNER', owner_user_id: 'foreign' });
});

test('a batch finalization exception persists disposition for every claimed row', async () => {
  const h = getDefaultTestHandle();
  for (const id of ['time-a', 'time-b', 'time-c']) {
    await h.withTransaction(txn => txn.runAsync("insert into time_entries (id, user_id, sign_in_time) values (?, ?, '2026-10-29T08:00:00Z')", id, TEST_ACTOR_ID));
    await h.services.repositories.syncOutbox.enqueue({ id, tableName: 'time_entries', recordId: id, operation: 'insert', payload: { id, user_id: TEST_ACTOR_ID, sign_in_time: '2026-10-29T08:00:00Z' } });
  }
  const writer = await require('../test-support/testDatabase').getTestWriter();
  await writer.execAsync("create trigger fail_ack before delete on sync_outbox begin select raise(abort, 'ack disk error'); end;");
  const { supabaseClient } = createSupabaseMock();
  await createOutboxSyncEngine({ database: h, supabaseClient, enqueueRequest: h.enqueueRequest, getAuthSession: liveSession }).syncAll();
  for (const id of ['time-a', 'time-b', 'time-c']) {
    expect(await read(id)).toMatchObject({ status: 'failed', error_class: 'retryable', error_code: 'SQLITE_CONSTRAINT_TRIGGER', retry_count: 1 });
  }
});

test.each([
  ['42501', false, 'terminal'], ['42501', true, 'needs_parent'],
  ['UPDATE_NOT_APPLIED', true, 'needs_parent'], ['28000', false, 'needs_reauth'],
  ['PGRST204', false, 'retryable'], [undefined, false, 'retryable'],
])('returned %s with pending evidence=%s records %s', async (code, parentPending, errorClass) => {
  await seed({ parentPending });
  await run({ error: { code, message: 'raw response' } });
  expect(await read('upload')).toMatchObject({ error_class: errorClass, error_code: code || 'OTHER', status: errorClass === 'terminal' ? 'terminal' : 'failed' });
});

test('pending grant evidence records needs_parent for a 42501', async () => {
  await seed();
  await getDefaultTestHandle().withTransaction(txn => txn.runAsync("insert into child_ea_assignments (id, user_id, child_id, sync_status) values ('grant', ?, 'child', 'pending')", TEST_ACTOR_ID));
  await run({ error: { code: '42501', message: 'grant pending' } });
  expect(await read('upload')).toMatchObject({ status: 'failed', error_class: 'needs_parent', error_code: '42501' });
});

test.each(['23503', 'PGRST204', 'throw'])('newer writes survive %s finalizer CAS misses without old dispositions', async code => {
  await seed();
  const h = getDefaultTestHandle();
  await run(async () => {
    await h.withTransaction(txn => txn.runAsync("update sync_outbox set status = 'pending', payload = '{\"newer\":true}', updated_at = '2099-01-01' where id = 'upload'"));
    if (code === 'throw') throw new Error('late transport failure');
    return { error: { code, message: 'late server failure' } };
  });
  expect(await read('upload')).toMatchObject({ status: 'pending', payload: '{"newer":true}', error_class: null, error_code: null, retry_count: 0 });
});

test('batch CAS misses leave newer rows unstamped while siblings record the exception', async () => {
  const h = getDefaultTestHandle();
  for (const id of ['time-a', 'time-b']) {
    await h.withTransaction(txn => txn.runAsync("insert into time_entries (id, user_id, sign_in_time) values (?, ?, '2026-10-29T08:00:00Z')", id, TEST_ACTOR_ID));
    await h.services.repositories.syncOutbox.enqueue({ id, tableName: 'time_entries', recordId: id, operation: 'insert', payload: { id } });
  }
  const writer = await require('../test-support/testDatabase').getTestWriter();
  await writer.execAsync("create trigger fail_ack before delete on sync_outbox begin select raise(abort, 'ack disk error'); end;");
  const { supabaseClient } = createSupabaseMock({ upsertResults: { time_entries: async () => {
    await h.withTransaction(txn => txn.runAsync("update sync_outbox set status = 'pending', updated_at = '2099-01-01' where id = 'time-a'"));
    return { error: null };
  } } });
  await createOutboxSyncEngine({ database: h, supabaseClient, enqueueRequest: h.enqueueRequest, getAuthSession: liveSession }).syncAll();
  expect(await read('time-a')).toMatchObject({ status: 'pending', error_class: null, error_code: null, retry_count: 0 });
  expect(await read('time-b')).toMatchObject({ status: 'failed', error_class: 'retryable', error_code: 'SQLITE_CONSTRAINT_TRIGGER' });
});

test('stale cancellation and dependency skips never create failure dispositions', async () => {
  await seed({ parentPending: true });
  const h = getDefaultTestHandle();
  const { supabaseClient } = createSupabaseMock({ upsertResults: { sessions: { error: { message: 'parent failed' } } } });
  await createOutboxSyncEngine({ database: h, supabaseClient, enqueueRequest: h.enqueueRequest, getAuthSession: liveSession }).syncAll();
  expect(await read('upload')).toMatchObject({ status: 'pending', error_class: null, error_code: null });
  const { StaleActorError } = require('../src/session/staleActor');
  await run(() => { throw new StaleActorError(); });
  expect(await read('upload')).toMatchObject({ error_class: null, error_code: null });
});

test.each([
  ['pgrst204', 'PGRST204'], ['23503', '23503'], ['A'.repeat(40), 'A'.repeat(40)],
  ['A'.repeat(41), 'OTHER'], ['', 'OTHER'], [null, 'OTHER'], [undefined, 'OTHER'],
  [123, 'OTHER'], ['lower-case', 'OTHER'], ['with space', 'OTHER'], ['é', 'OTHER'],
  ['transport', 'TRANSPORT'], ['unknown_table', 'UNKNOWN_TABLE'], ['foreign_owner', 'FOREIGN_OWNER'],
])('normalizes structured code %p to %s', (raw, expected) => {
  expect(require('../src/utils/normalizeErrorCode').normalizeErrorCode(raw)).toBe(expected);
});

test('a missing auth session skips uploads without writing a failure disposition', async () => {
  await seed();
  const result = await run({ error: { code: '42501' } }, { getAuthSession: async () => ({ data: { session: null } }) });
  expect(result.skippedNoSession).toBe(true);
  expect(await read('upload')).toMatchObject({ status: 'pending', retry_count: 0, error_class: null, error_code: null });
});

test('a failed domain finalizer rolls back disposition and preserves last-resort pending reset', async () => {
  await seed();
  const writer = await require('../test-support/testDatabase').getTestWriter();
  await writer.execAsync(`create trigger fail_domain_finalize before update on session_attendees
    when new.sync_status = 'failed' begin select raise(abort, 'domain disk error'); end;`);
  await run(() => { throw new Error('network down'); });
  expect(await read('upload')).toMatchObject({ status: 'pending', retry_count: 0, error_class: null, error_code: null });
});

test('thrown batch and fallback requests record TRANSPORT on every attempted row', async () => {
  const h = getDefaultTestHandle();
  for (const id of ['time-a', 'time-b']) {
    await h.withTransaction(txn => txn.runAsync("insert into time_entries (id, user_id, sign_in_time) values (?, ?, '2026-10-29T08:00:00Z')", id, TEST_ACTOR_ID));
    await h.services.repositories.syncOutbox.enqueue({ id, tableName: 'time_entries', recordId: id, operation: 'insert', payload: { id } });
  }
  const { supabaseClient } = createSupabaseMock({ upsertResults: { time_entries: () => { throw new Error('network down'); } } });
  await createOutboxSyncEngine({ database: h, supabaseClient, enqueueRequest: h.enqueueRequest, getAuthSession: liveSession }).syncAll();
  for (const id of ['time-a', 'time-b']) expect(await read(id)).toMatchObject({ status: 'failed', error_class: 'retryable', error_code: 'TRANSPORT' });
});
