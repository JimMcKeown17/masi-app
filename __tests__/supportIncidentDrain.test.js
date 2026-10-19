global.__MASI_NO_DEFAULT_HANDLE__ = true;

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as sqlite from '../test-support/expoSQLiteRealEngine';
import { bindTestActor } from '../test-support/actorTestUtils';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { runMigrations } from '../src/db/migrations';
import { createSupportIncidentRepository, incidentRepeatKey } from '../src/db/repositories/supportIncidentRepository';
import { createSyncOutboxRepository, readUnsentSummary } from '../src/db/repositories/syncOutboxRepository';
import { createSyncStateRepository } from '../src/db/repositories/syncStateRepository';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { buildIncidentEnvelope, drainSupportIncidents } from '../src/services/supportIncidents';
import { INSTALL_ID_KEY, resetInstallIdForTests } from '../src/services/installId';
import { getRuntimeDiagnostics } from '../src/utils/runtimeDiagnostics';
import { StaleActorError } from '../src/session/staleActor';
import { requestOpen, resetHandleRegistryForTests } from '../src/session/signedInHandle';

jest.mock('../src/utils/runtimeDiagnostics', () => ({ getRuntimeDiagnostics: jest.fn() }));

const A = '11111111-1111-4111-8111-111111111111';
const envelope = {
  appVersion: '1.2.0', buildNumber: '7', updateId: null,
  backend: 'segygjzpujphwvrubusm', installId: 'i-1',
};
let db;
let repository;
let outboxRepository;
let stateRepository;
let supabaseClient;
let calls;

beforeEach(async () => {
  await sqlite.__resetMockDatabases();
  db = bindTestActor(await sqlite.openDatabaseAsync(`masi-${A}.db`), A);
  await runMigrations(db);
  repository = createSupportIncidentRepository({ database: db });
  outboxRepository = createSyncOutboxRepository({ database: db });
  stateRepository = createSyncStateRepository({ database: db });
  ({ supabaseClient, calls } = createSupabaseMock());
  resetInstallIdForTests();
  await AsyncStorage.clear();
  await AsyncStorage.setItem(INSTALL_ID_KEY, envelope.installId);
  getRuntimeDiagnostics.mockReturnValue({
    application: { version: envelope.appVersion, build: envelope.buildNumber, name: 'not included' },
    update: { id: envelope.updateId, channel: 'not included' },
    backend: { projectId: envelope.backend },
    device: { deviceName: 'private device name' },
  });
});
afterEach(async () => {
  await resetHandleRegistryForTests();
  await sqlite.__resetMockDatabases();
  resetInstallIdForTests();
  jest.restoreAllMocks();
});

const queue = async (key = 'one', payload = { unsentByTable: { children: 1 } }) => {
  const incident = { kind: 'left_behind_unsent_work', repeatKey: incidentRepeatKey(key), payload };
  expect(await repository.enqueue(incident)).toEqual({ queued: true });
  return incident;
};
const drain = (options = {}) => drainSupportIncidents({
  repository, supabaseClient, enqueueRequest: (task) => task(), envelope, ...options,
});
const engine = (options = {}) => createOutboxSyncEngine({
  database: db, outboxRepository, stateRepository, supportIncidentRepository: repository,
  supabaseClient, enqueueRequest: (task) => task(),
  getAuthSession: async () => ({ data: { session: { user: { id: A } } } }),
  ...options,
});
const stored = () => db.getAllAsync('select id, status, attempts, last_error, next_attempt_at from support_incident_queue order by created_at, id');

test('buildIncidentEnvelope selects only release, backend and installation metadata', async () => {
  expect(await buildIncidentEnvelope()).toEqual(envelope);
});

test('sends pending rows once with the complete RPC shape; true and false both acknowledge delivery', async () => {
  await queue('one', { unsentByTable: { children: 2 }, appVersion: 'obsolete' });
  await queue('two');
  const pending = await repository.listPending();
  supabaseClient.rpc.mockResolvedValueOnce({ data: true, error: null })
    .mockResolvedValueOnce({ data: false, error: null });
  const enqueueRequest = jest.fn(task => task());
  expect(await drain({ enqueueRequest })).toEqual({ sent: 2, rejected: 0, failed: 0 });
  expect(enqueueRequest).toHaveBeenCalledTimes(2);
  expect(supabaseClient.rpc.mock.calls).toEqual(pending.map(row => [
    'report_mobile_support_incident', {
      p_kind: row.kind, p_repeat_key: `i-1:${row.repeatKey}`,
      p_payload: { ...row.payload, ...envelope },
    },
  ]));
  expect(await repository.listPending()).toEqual([]);
  expect(await drain()).toEqual({ sent: 0, rejected: 0, failed: 0 });
  expect(supabaseClient.rpc).toHaveBeenCalledTimes(2);
  expect((await stored()).map(row => row.status)).toEqual(['sent', 'sent']);
});

test('22023 rejects the invalid row and continues to the next row', async () => {
  await queue('one');
  await queue('two');
  const [first, second] = await repository.listPending();
  supabaseClient.rpc.mockResolvedValueOnce({ data: null, error: { code: '22023' } })
    .mockResolvedValueOnce({ data: true, error: null });
  expect(await drain()).toEqual({ sent: 1, rejected: 1, failed: 0 });
  expect(await stored()).toEqual([
    { id: first.id, status: 'rejected', attempts: 0, last_error: '22023', next_attempt_at: null },
    { id: second.id, status: 'sent', attempts: 0, last_error: null, next_attempt_at: null },
  ]);
});

test.each(['returned', 'thrown'])('a %s transport failure backs off the first row and stops this drain', async (mode) => {
  await queue('one');
  await queue('two');
  const [first, second] = await repository.listPending();
  const error = { code: '08006', message: 'Network request failed' };
  if (mode === 'returned') supabaseClient.rpc.mockResolvedValueOnce({ data: null, error });
  else supabaseClient.rpc.mockRejectedValueOnce(error);
  expect(await drain()).toEqual({ sent: 0, rejected: 0, failed: 1 });
  expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
  expect(await stored()).toEqual([
    { id: first.id, status: 'pending', attempts: 1, last_error: error.message, next_attempt_at: expect.any(String) },
    { id: second.id, status: 'pending', attempts: 0, last_error: null, next_attempt_at: null },
  ]);
});

test.each(['thrown', 'returned'])('a %s stale-actor refusal propagates without changing queue evidence', async (mode) => {
  await queue();
  const before = await stored();
  const stale = new StaleActorError();
  const enqueueRequest = mode === 'thrown'
    ? jest.fn(async () => { throw stale; })
    : jest.fn(async () => ({ error: stale }));
  await expect(drain({ enqueueRequest })).rejects.toBe(stale);
  expect(await stored()).toEqual(before);
  expect(supabaseClient.rpc).not.toHaveBeenCalled();
});

test('T12: the whole RPC request excludes child identity, name and private domain notes', async () => {
  await seedCoreData(db);
  await createChildrenRepository({ database: db }).saveChildRecord({
    id: 'c-secret-child-id', first_name: 'Thandiwe', last_name: 'Fixture',
    class_id: 'class-1', programme_id: 'programme-a', created_by: A, synced: false,
    created_at: '2026-05-21T08:00:00.000Z', updated_at: '2026-05-21T08:00:00.000Z',
  });
  await db.runAsync(`insert into sessions (id, user_id, programme_id, session_date, notes)
    values ('private-session', ?, 'programme-a', '2026-10-17', 'private note')`, A);
  await db.runAsync(`insert into session_attendees (id, session_id, child_id, notes)
    values ('private-attendee', 'private-session', 'c-secret-child-id', 'private note')`);
  const summary = await readUnsentSummary(db);
  expect(summary.total).toBeGreaterThan(0);
  expect(JSON.stringify(await db.getAllAsync('select payload from sync_outbox'))).toContain('c-secret-child-id');
  await repository.enqueue({
    kind: 'left_behind_unsent_work', repeatKey: incidentRepeatKey(A, 'children:c-secret-child-id:insert', summary.oldestCreatedAt),
    payload: { unsentByTable: summary.byTable },
  });
  expect(await drain()).toEqual({ sent: 1, rejected: 0, failed: 0 });
  const request = JSON.stringify(supabaseClient.rpc.mock.calls);
  for (const secret of ['c-secret-child-id', 'Thandiwe', 'private note']) expect(request).not.toContain(secret);
});

test('a drain respects its row limit', async () => {
  await queue('one');
  await queue('two');
  expect(await drain({ limit: 1 })).toEqual({ sent: 1, rejected: 0, failed: 0 });
  expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
  expect(await repository.countDue()).toBe(1);
});

test('a full pass with a live session drains an incident even when the domain outbox is empty', async () => {
  await queue();
  expect(await engine().syncAll()).toMatchObject({
    success: true, totalSynced: 0, totalFailed: 0, incidents: { sent: 1, rejected: 0, failed: 0 },
  });
  expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
  expect(await repository.countDue()).toBe(0);
});

test('the incident RPC runs after the domain outbox has uploaded', async () => {
  await seedCoreData(db);
  await outboxRepository.enqueue({ tableName: 'classes', recordId: 'class-1', operation: 'update', payload: { id: 'class-1', name: 'Updated' } });
  await queue();
  const handle = await requestOpen({ userId: A, openDatabase: sqlite.openDatabaseAsync, discover: async () => {} });
  const syncEngine = engine({
    database: handle,
    outboxRepository: createSyncOutboxRepository({ database: handle }),
    stateRepository: createSyncStateRepository({ database: handle }),
    supportIncidentRepository: createSupportIncidentRepository({ database: handle }),
  });
  expect(await syncEngine.syncAll()).toMatchObject({ success: true, totalSynced: 1, incidents: { sent: 1, rejected: 0, failed: 0 } });
  expect(calls.map(call => call.type)).toEqual(['update', 'rpc']);
});

test('an RPC failure does not change the domain pass success and leaves the incident pending', async () => {
  await queue();
  supabaseClient.rpc.mockResolvedValue({ data: null, error: { code: '08006', message: 'Network request failed' } });
  expect(await engine().syncAll()).toMatchObject({
    success: true, totalFailed: 0, preflightErrors: [], incidents: { sent: 0, rejected: 0, failed: 1 },
  });
  expect(await stored()).toEqual([expect.objectContaining({ status: 'pending', attempts: 1 })]);
});

test('a sessionless full pass never attempts the incident RPC', async () => {
  await queue();
  const before = await stored();
  const result = await engine({ getAuthSession: async () => ({ data: { session: null } }) }).syncAll();
  expect(result).toMatchObject({ success: true, skippedNoSession: true });
  expect(result.incidents).toBeUndefined();
  expect(supabaseClient.rpc).not.toHaveBeenCalled();
  expect(await stored()).toEqual(before);
});

test('syncTableByName never drains support incidents', async () => {
  await queue();
  const result = await engine().syncTableByName('children');
  expect(result.success).toBe(true);
  expect(result.incidents).toBeUndefined();
  expect(supabaseClient.rpc).not.toHaveBeenCalled();
  expect(await repository.countDue()).toBe(1);
});

test('getSyncStatus counts only due incidents without inflating domain work counts', async () => {
  const syncEngine = engine();
  await queue('first');
  expect(await syncEngine.getSyncStatus()).toMatchObject({
    incidentReadyCount: 1, unsyncedCount: 0, readyCount: 0, inFlightCount: 0, waitingCount: 0,
  });
  await syncEngine.syncAll();
  expect((await syncEngine.getSyncStatus()).incidentReadyCount).toBe(0);
  await queue('second');
  const [pending] = await repository.listPending();
  await repository.markAttemptFailed(pending.id, 'Network request failed', { now: '2099-01-01T00:00:00.000Z' });
  expect((await syncEngine.getSyncStatus()).incidentReadyCount).toBe(0);
});

test('status without an incident repository reports zero due incidents', async () => {
  expect((await engine({ supportIncidentRepository: null }).getSyncStatus()).incidentReadyCount).toBe(0);
});

test('a count failure falls back to zero, but a stale actor must still propagate', async () => {
  jest.spyOn(repository, 'countDue').mockRejectedValueOnce(new Error('incident count unavailable'))
    .mockRejectedValueOnce(new StaleActorError());
  const syncEngine = engine();
  expect(await syncEngine.getSyncStatus()).toMatchObject({ incidentReadyCount: 0, unsyncedCount: 0 });
  await expect(syncEngine.getSyncStatus()).rejects.toMatchObject({ name: 'StaleActorError' });
});

test('stale cancellation during incident drain aborts the whole pass without attempt metadata or queue changes', async () => {
  await queue();
  const before = await stored();
  const stale = new StaleActorError();
  const result = await engine({ enqueueRequest: async () => { throw stale; } }).syncAll();
  expect(result).toMatchObject({ success: false, abortedStaleActor: true });
  expect(result.incidents).toBeUndefined();
  expect(await stored()).toEqual(before);
  expect(await stateRepository.getSyncMeta()).toEqual({ lastSyncTime: null, lastSuccessfulSyncTime: null });
});

test('a local drain failure does not turn successful domain work into a failed pass', async () => {
  jest.spyOn(repository, 'listPending').mockRejectedValueOnce(new Error('queue unavailable'));
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const result = await engine().syncAll();
  expect(result).toMatchObject({ success: true, preflightErrors: [] });
  expect(console.warn).toHaveBeenCalledWith('syncAll: support incident drain failed:', 'queue unavailable');
});
