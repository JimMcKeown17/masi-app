global.__MASI_NO_DEFAULT_HANDLE__ = true;

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  requestOpen, requestClose, resetHandleRegistryForTests, setLatestAuthSession,
} from '../src/session/signedInHandle';
import { createPathDatabaseOpener } from '../test-support/actorTestUtils';
import * as observability from '../src/services/observability';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const CHILD = '33333333-3333-4333-8333-333333333333';
const SECOND = '44444444-4444-4444-8444-444444444444';
const PROGRAMME = '55555555-5555-4555-8555-555555555555';
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const response = (data = [], status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json' },
});
const child = (id = CHILD) => ({ id, first_name: 'Test', last_name: 'Child', created_by: A });
const referenceRows = (table, userId) => ({
  schools: [{ id: 'school', name: 'Test School' }],
  programmes: [{ id: PROGRAMME, code: 'literacy', name: 'Literacy' }],
  academic_years: [{ id: 'year', label: '2026', starts_on: '2026-01-01', ends_on: '2026-12-31', is_active: true }],
  staff_programme_assignments: [{ id: `staff-${userId}`, user_id: userId, programme_id: PROGRAMME }],
}[table] || []);
const observe = (promise) => promise.then((value) => ({ value }), (error) => ({ error }));
const within = async (promise, ms = 1000) => {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Did not complete within ${ms} ms`)), ms);
    })]);
  } finally { clearTimeout(timer); }
};
let dir;
let openDatabase;
const open = async (userId, fetchImpl) => {
  setLatestAuthSession({ user: { id: userId }, access_token: `token-${userId}` });
  return requestOpen({ userId, openDatabase, fetchImpl });
};
const pending = async (handle) => (await handle.getReader()).getAllAsync(
  'select record_id, status, retry_count, next_retry_at, last_error from sync_outbox order by record_id'
);
const assertNoAttempt = async (handle) => {
  expect(await handle.repositories.syncState.getSyncMeta()).toEqual({ lastSyncTime: null, lastSuccessfulSyncTime: null });
  expect(await (await handle.getReader()).getAllAsync("select * from local_state where key in ('sync_meta', 'last_sync_attempt_at')")).toEqual([]);
  expect(await (await handle.getReader()).getAllAsync('select * from sync_state')).toEqual([]);
};
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-handle-services-'));
  openDatabase = createPathDatabaseOpener(dir);
});
afterEach(async () => {
  await resetHandleRegistryForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

test('masteryInputsComplete reads only the captured handle and EA without starting a pull', async () => {
  const transport = jest.fn(async url => response(referenceRows(new URL(url).pathname.split('/').pop(), A)));
  const a = await open(A, transport);
  await a.services.referenceDataReady();
  await a.withTransaction(async tx => {
    await tx.runAsync("insert into children (id, first_name, last_name, sync_status) values (?, 'Test', 'Child', 'synced')", CHILD);
    await tx.runAsync("insert into classes (id, school_id, name, grade, academic_year_id) values ('held', 'school', 'Held', '1', 'year')");
    await tx.runAsync("insert into class_ea_assignments (id, class_id, ea_user_id, programme_id, sync_status) values ('class-ea', 'held', ?, ?, 'synced')", A, PROGRAMME);
    await tx.runAsync("insert into child_class_memberships (id, child_id, class_id, academic_year_id, sync_status) values ('membership', ?, 'held', 'year', 'synced')", CHILD);
    await tx.runAsync("insert into child_ea_assignments (id, user_id, child_id, sync_status) values ('delivery', ?, ?, 'synced')", A, CHILD);
  });
  transport.mockClear();
  expect(await a.services.assessmentHistory.masteryInputsComplete({ childIds: [CHILD] })).toBe(false);
  expect(transport).not.toHaveBeenCalled();
  await a.services.assessmentHistory.start({ force: true });
  const before = await (await a.getReader()).getAllAsync('select * from sync_state order by scope');
  transport.mockClear();
  expect(await a.services.assessmentHistory.masteryInputsComplete({ childIds: [CHILD], userId: B })).toBe(true);
  expect(await (await a.getReader()).getAllAsync('select * from sync_state order by scope')).toEqual(before);
  expect(transport).not.toHaveBeenCalled();
  const bTransport = jest.fn(async () => response());
  const b = await open(B, bTransport);
  expect(await b.services.assessmentHistory.masteryInputsComplete({ childIds: [CHILD] })).toBe(false);
  await expect(a.services.assessmentHistory.masteryInputsComplete({ childIds: [CHILD] }))
    .rejects.toMatchObject({ name: 'StaleActorError' });
  expect(bTransport).not.toHaveBeenCalled();
});

test.each(['update', 'batch'])('T3 / whole-pass: stale %s stops the pass without retries, fallback, metadata or sending the next record', async (mode) => {
  const entered = deferred();
  const release = deferred();
  const transport = jest.fn(async () => { entered.resolve(); await release.promise; return response([{ id: CHILD }]); });
  const report = jest.spyOn(observability, 'captureOperationalError');
  const a = await open(A, transport);
  for (const id of [CHILD, SECOND]) {
    await a.repositories.children.saveChildRecord({ ...child(id), synced: mode === 'update' });
    if (mode === 'update') await a.repositories.children.updateChild(id, { first_name: 'Edited' });
  }
  await a.withTransaction((txn) => txn.runAsync("update sync_outbox set retry_count = 2, next_retry_at = '2000-01-01T00:00:00.000Z'"));
  const before = await pending(a);
  const pass = observe(a.services.syncEngine.syncAll());
  await within(entered.promise);
  await requestClose({ reason: 'switch' });
  expect(transport.mock.calls[0][1].signal.aborted).toBe(true);
  const b = await open(B, transport);
  release.resolve();
  expect(await within(pass)).toMatchObject({ value: { success: false, abortedStaleActor: true, totalSynced: 0, totalFailed: 0 } });
  expect(transport).toHaveBeenCalledTimes(1);
  expect(await b.repositories.children.getChildren()).toEqual([]);
  const again = await open(A, transport);
  expect(await pending(again)).toEqual(before.map(row => ({
    ...row, last_error: mode === 'batch' ? 'Upload started; server outcome unknown' : row.last_error,
  })));
  expect((await again.repositories.children.getChildren()).every((row) => row.sync_status === 'pending')).toBe(true);
  await assertNoAttempt(again);
  expect(report).not.toHaveBeenCalled();
});

test.each(['upsert', 'UPDATE', 'lifecycle archive'])('T5: abort and replay of %s proves idempotent replay only (ruling 11)', async (operation) => {
  // Replayed content is harmless and carries a fresh version. This does NOT prove late-commit ordering.
  const entered = deferred();
  const server = new Map();
  let first = true;
  const transport = jest.fn(async (url, init) => {
    const parsed = new URL(url);
    const patch = JSON.parse(init.body);
    const id = init.method === 'PATCH' ? parsed.searchParams.get('id').slice(3) : patch.id;
    server.set(id, { ...server.get(id), ...patch });
    if (first) { first = false; entered.resolve(); return new Promise(() => {}); }
    return response([{ id }]);
  });
  const a = await open(A, transport);
  await a.repositories.children.saveChildRecord({ ...child(), synced: operation !== 'upsert' });
  if (operation !== 'upsert') server.set(CHILD, child());
  if (operation === 'UPDATE') await a.repositories.children.updateChild(CHILD, { first_name: 'Edited' });
  if (operation === 'lifecycle archive') await a.repositories.children.archiveChild(CHILD, { actorUserId: A, archivedAt: '2026-10-15T10:00:00.000Z' });
  const pass = observe(a.services.syncEngine.syncAll());
  await within(entered.promise);
  const landed = { ...server.get(CHILD) };
  await requestClose({ reason: 'sign out' });
  expect(transport.mock.calls[0][1].signal.aborted).toBe(true);
  expect(await within(pass)).toMatchObject({ value: { abortedStaleActor: true } });
  const again = await open(A, transport);
  expect(await pending(again)).toEqual([expect.objectContaining({ status: 'pending', retry_count: 0, next_retry_at: null })]);
  expect(await again.services.syncEngine.syncAll()).toMatchObject({ success: true, totalSynced: 1 });
  expect(transport).toHaveBeenCalledTimes(2);
  expect(landed.row_version).toBe(2);
  expect(server.get(CHILD)).toEqual({ ...landed, row_version: 3 });
  expect(await again.services.syncEngine.syncAll()).toMatchObject({ success: true, totalSynced: 0 });
  expect(transport).toHaveBeenCalledTimes(2);
});

test.each(['fulfilled', 'pending'])('T15: B never borrows A’s %s barrier; delayed/failing references prevent roster, class and history persistence', async (aState) => {
  const aEntered = deferred();
  const aTransport = jest.fn(async (url) => {
    aEntered.resolve();
    if (aState === 'pending') return new Promise(() => {});
    return response(referenceRows(new URL(url).pathname.split('/').pop(), A));
  });
  const a = await open(A, aTransport);
  const aReady = observe(a.services.referenceDataReady());
  if (aState === 'fulfilled') expect(await aReady).toHaveProperty('value');
  else await within(aEntered.promise);
  await requestClose({ reason: 'switch' });
  const bEntered = deferred();
  const release = deferred();
  let fail = true;
  const bTransport = jest.fn(async (url) => {
    const table = new URL(url).pathname.split('/').pop();
    if (table === 'schools' && fail) {
      bEntered.resolve();
      await release.promise;
      return response({ code: 'offline', message: 'reference pull failed' }, 503);
    }
    if (table === 'children') return response([{ ...child(), created_by: B }]);
    if (table === 'get_reconcile_acknowledgments') return response({});
    return response(referenceRows(table, B));
  });
  const b = await open(B, bTransport);
  const ready = b.services.referenceDataReady();
  expect(b.services.referenceDataReady()).toBe(ready);
  const pulls = [ready, b.services.pullRoster(), b.services.pullClasses(), b.services.sessionHistory.start({ force: true })].map(observe);
  await within(bEntered.promise);
  expect(await b.repositories.children.getChildren()).toEqual([]);
  expect(await (await b.getReader()).getAllAsync('select * from sessions')).toEqual([]);
  expect(await (await b.getReader()).getAllAsync('select * from sync_state')).toEqual([]);
  expect(b.services.sessionHistory.store.getSnapshot().pageVersion).toBe(0);
  release.resolve();
  const outcomes = await Promise.all(pulls);
  expect(outcomes.every((outcome) => outcome.error?.message === 'reference pull failed')).toBe(true);
  expect(await b.repositories.children.getChildren()).toEqual([]);
  expect(await (await b.getReader()).getAllAsync('select * from sync_state')).toEqual([]);
  expect(bTransport.mock.calls.every(([url]) => new URL(url).pathname.endsWith('/schools'))).toBe(true);
  fail = false;
  await b.services.referenceDataReady();
  await b.services.pullRoster();
  await b.services.sessionHistory.start({ force: true });
  expect(await b.repositories.children.getChildren()).toEqual([expect.objectContaining({ id: CHILD, created_by: B })]);
  expect(b.services.sessionHistory.store.getSnapshot()).toMatchObject({ running: false, pageVersion: 1, lastResult: { status: 'complete', pages: 1 } });
  expect(a.services.sessionHistory.store.getSnapshot().pageVersion).toBe(0);
  await aReady;
});

test('T19: a never-resolving A upload aborts; B reference pull and first upload reach transport within 1 s', async () => {
  const entered = deferred();
  const aTransport = jest.fn(() => { entered.resolve(); return new Promise(() => {}); });
  const a = await open(A, aTransport);
  await a.repositories.children.saveChildRecord(child());
  const pass = observe(a.services.syncEngine.syncAll());
  await within(entered.promise);
  const bReference = deferred();
  const bUpload = deferred();
  const bTransport = jest.fn(async (url, init) => {
    const table = new URL(url).pathname.split('/').pop();
    if (init.method === 'GET') { bReference.resolve(); return response(referenceRows(table, B)); }
    bUpload.resolve();
    return response();
  });
  await within((async () => {
    await requestClose({ reason: 'switch' });
    expect(aTransport.mock.calls[0][1].signal.aborted).toBe(true);
    const b = await open(B, bTransport);
    await b.services.referenceDataReady();
    await b.repositories.children.saveChildRecord({ ...child(SECOND), created_by: B });
    expect(await b.services.syncEngine.syncAll()).toMatchObject({ totalSynced: 1 });
    await Promise.all([bReference.promise, bUpload.promise]);
  })());
  expect(await within(pass)).toMatchObject({ value: { abortedStaleActor: true } });
});

test('a reference failure after the core tables loaded remains a failed barrier until the entire retry succeeds', async () => {
  let fail = true;
  const transport = jest.fn(async (url) => {
    const table = new URL(url).pathname.split('/').pop();
    if (table === 'staff_programme_assignments' && fail) return response({ code: 'offline', message: 'staff references failed' }, 503);
    return response(referenceRows(table, A));
  });
  const a = await open(A, transport);
  await expect(a.services.referenceDataReady()).rejects.toMatchObject({ message: 'staff references failed' });
  await expect(a.services.referenceDataReady()).rejects.toMatchObject({ message: 'staff references failed' });
  expect(await a.repositories.staffProgrammeAssignments.getAll()).toEqual([]);
  fail = false;
  await a.services.referenceDataReady();
  expect(await a.repositories.staffProgrammeAssignments.getAll()).toEqual([expect.objectContaining({ user_id: A })]);
});

test('close during an in-flight history pull writes no failure marker and cannot publish into B’s history store', async () => {
  const entered = deferred();
  const transport = jest.fn(async (url) => {
    const table = new URL(url).pathname.split('/').pop();
    if (table === 'get_delivery_history_page') { entered.resolve(); return new Promise(() => {}); }
    return response(referenceRows(table, A));
  });
  const a = await open(A, transport);
  const run = observe(a.services.sessionHistory.start({ force: true }));
  await within(entered.promise);
  await requestClose({ reason: 'switch' });
  const b = await open(B, async () => response());
  const snapshot = b.services.sessionHistory.store.getSnapshot();
  expect(await within(run)).toMatchObject({ error: { name: 'StaleActorError' } });
  expect(b.services.sessionHistory.store.getSnapshot()).toBe(snapshot);
  const again = await open(A, transport);
  expect(await (await again.getReader()).getAllAsync('select * from sync_state')).toEqual([]);
});

test("close during an in-flight assessment history pull writes no failure marker and cannot publish into B's store", async () => {
  const entered = deferred();
  const transport = jest.fn(async url => {
    const table = new URL(url).pathname.split('/').pop();
    if (table === 'get_battery_run_history_page') { entered.resolve(); return new Promise(() => {}); }
    return response(referenceRows(table, A));
  });
  const a = await open(A, transport);
  const run = observe(a.services.assessmentHistory.start({ force: true }));
  await within(entered.promise);
  await requestClose({ reason: 'switch' });
  const b = await open(B, async () => response());
  const snapshot = b.services.assessmentHistory.store.getSnapshot();
  expect(await within(run)).toMatchObject({ error: { name: 'StaleActorError' } });
  expect(b.services.assessmentHistory.store.getSnapshot()).toBe(snapshot);
  const again = await open(A, transport);
  expect(await (await again.getReader()).getAllAsync('select * from sync_state')).toEqual([]);
});

test('the complete repository graph, composite onboarding and profile cache are bound to one handle', async () => {
  const a = await open(A, async () => response());
  expect(a.services.repositories).toBe(a.repositories);
  expect(Object.keys(a.repositories).sort()).toEqual([
    'children', 'classes', 'groups', 'classEaAssignments', 'groupEaAssignments',
    'childClassMemberships', 'classOnboarding', 'classGroupingState', 'groupingVersions',
    'sessions', 'assessments', 'batteryRuns', 'mastery', 'timeEntries', 'schools', 'jobTitles', 'programmes',
    'staffProgrammeAssignments', 'assessmentTools', 'academicYears', 'assessmentWindows',
    'teachers', 'syncOutbox', 'syncState', 'localState', 'supportIncidents',
  ].sort());
  await a.repositories.programmes.replaceFromServer(referenceRows('programmes', A));
  await a.repositories.schools.replaceFromServer(referenceRows('schools', A));
  await a.services.deviceProfile.save({ id: A, label: 'A profile' });
  const incident = { kind: 'left_behind_unsent_work', repeatKey: 'a-file', payload: { unsentByTable: { children: 1 } } };
  expect(await a.repositories.supportIncidents.enqueue(incident)).toEqual({ queued: true });
  await a.repositories.classOnboarding.start({ userId: A, classData: { id: 'class-a', name: 'A class', grade: '1', school_id: 'school', programme_id: PROGRAMME, created_by: A } });
  expect(await a.repositories.classOnboarding.getPendingClassId(A)).toBe('class-a');
  const b = await open(B, async () => response());
  expect(await b.services.deviceProfile.get()).toBeNull();
  expect(await b.repositories.supportIncidents.listPending()).toEqual([]);
  await expect(a.repositories.supportIncidents.enqueue(incident)).rejects.toMatchObject({ name: 'StaleActorError' });
  expect(await b.repositories.classOnboarding.getPendingClassId(A)).toBeNull();
  await expect(a.repositories.classOnboarding.complete({ userId: A, classId: 'class-a' })).rejects.toMatchObject({ name: 'StaleActorError' });
  await expect(a.services.deviceProfile.save({ id: B })).rejects.toMatchObject({ name: 'StaleActorError' });
  const again = await open(A, async () => response());
  expect(await again.services.deviceProfile.get()).toEqual({ id: A, label: 'A profile' });
  expect(await again.repositories.supportIncidents.listPending()).toEqual([
    expect.objectContaining({ ...incident, attempts: 0 }),
  ]);
  expect(await again.repositories.classOnboarding.getPendingClassId(A)).toBe('class-a');
});

test('ruling 2: a token gap during a pass is retriable rather than a stale abort', async () => {
  const transport = jest.fn(async () => response());
  const a = await open(A, transport);
  await a.repositories.children.saveChildRecord(child());
  // Change auth at the token callback boundary, after the engine's pass/session admission.
  const requireAccessToken = a.requireAccessToken;
  jest.spyOn(a, 'requireAccessToken').mockImplementationOnce(async () => {
    setLatestAuthSession(null);
    return requireAccessToken();
  });
  const result = await a.services.syncEngine.syncAll();
  expect(result).toMatchObject({ totalRetriable: 1, totalSynced: 0 });
  expect(result.abortedStaleActor).toBeUndefined();
  expect((await pending(a))[0]).toMatchObject({ status: 'failed', retry_count: 1 });
  expect(transport).not.toHaveBeenCalled();
});

test('whole-pass cancellation during batch fallback leaves every row pending on reopen with no retry or metadata write', async () => {
  const entered = deferred();
  const transport = jest.fn(async () => {
    if (transport.mock.calls.length === 1) return response({ code: '503', message: 'batch unavailable' }, 503);
    entered.resolve();
    return new Promise(() => {});
  });
  const a = await open(A, transport);
  await a.repositories.children.saveChildRecord(child());
  await a.repositories.children.saveChildRecord(child(SECOND));
  const before = await pending(a);
  const pass = observe(a.services.syncEngine.syncAll());
  await within(entered.promise);
  await requestClose({ reason: 'close during fallback' });
  expect(await within(pass)).toMatchObject({ value: { success: false, abortedStaleActor: true, totalFailed: 0 } });
  expect(transport).toHaveBeenCalledTimes(2);
  expect(transport.mock.calls[1][1].signal.aborted).toBe(true);
  const again = await open(A, transport);
  expect(await pending(again)).toEqual(before.map(row => ({
    ...row, last_error: 'Upload started; server outcome unknown',
  })));
  await assertNoAttempt(again);
});

test('bound schools, lookups and class pulls persist through the handle repositories', async () => {
  const transport = jest.fn(async (url) => {
    const table = new URL(url).pathname.split('/').pop();
    if (table === 'job_titles') return response([{ id: 'job', code: 'ea', name: 'EA', sort_order: 1 }]);
    if (table === 'classes') return response([{
      id: 'server-class', name: '1A', grade: '1', school_id: 'school', created_by: A,
      class_ea_assignments: [{ id: 'server-assignment', class_id: 'server-class', ea_user_id: A, programme_id: PROGRAMME, created_by: A }],
    }]);
    if (table === 'get_reconcile_acknowledgments') return response({
      schema_version: 1, complete: true, user_id: A, active_programme_id: PROGRAMME,
      child_ea_assignment_ids: [], assigned_child_ids: [], visible_child_ids: [],
      child_programme_enrollment_ids: [], child_class_membership_ids: [],
      class_ea_assignment_ids: ['server-assignment'], class_ids: ['server-class'],
      group_ea_assignment_ids: [], group_ids: [], child_group_membership_ids: [],
    });
    return response(referenceRows(table, A));
  });
  const a = await open(A, transport);
  expect(await a.services.fetchAndCacheSchools()).toEqual(referenceRows('schools', A));
  await a.services.pullLookups();
  expect(await a.repositories.jobTitles.getAll()).toEqual([expect.objectContaining({ id: 'job', name: 'EA' })]);
  await a.services.pullClasses();
  expect(await a.repositories.classes.getClasses({ userId: A })).toEqual([expect.objectContaining({ id: 'server-class', sync_status: 'synced' })]);
  expect(await a.repositories.syncState.getPullState('classes_pull')).toMatchObject({ lastPulledAt: expect.any(String) });
  expect(await pending(a)).toEqual([]);
});

test('a partial background reference pull cannot satisfy readiness; readiness retries the missing staff assignment', async () => {
  let fail = true;
  const transport = jest.fn(async (url) => {
    const table = new URL(url).pathname.split('/').pop();
    if (table === 'staff_programme_assignments' && fail) return response({ message: 'staff references failed' }, 503);
    return response(referenceRows(table, A));
  });
  const a = await open(A, transport);
  await expect(a.services.pullReferenceData()).rejects.toMatchObject({ message: 'staff references failed' });
  expect(await a.repositories.schools.getAll()).toHaveLength(1);
  expect(await a.repositories.programmes.getAll()).toHaveLength(1);
  expect(await a.repositories.academicYears.getAll()).toHaveLength(1);
  expect(await a.repositories.staffProgrammeAssignments.getAll()).toEqual([]);
  await expect(a.services.referenceDataReady()).rejects.toMatchObject({ message: 'staff references failed' });
  expect(transport.mock.calls.filter(([url]) => String(url).includes('/staff_programme_assignments'))).toHaveLength(2);
  fail = false;
  await a.services.referenceDataReady();
  expect(await a.repositories.staffProgrammeAssignments.getAll()).toEqual([expect.objectContaining({ user_id: A })]);
});

test('cold readiness joins the background reference pull and waits for its last table', async () => {
  const entered = deferred(); const release = deferred();
  const transport = jest.fn(async (url) => {
    const table = new URL(url).pathname.split('/').pop();
    if (table === 'staff_programme_assignments') { entered.resolve(); await release.promise; }
    return response(referenceRows(table, A));
  });
  const a = await open(A, transport);
  const refresh = a.services.pullReferenceData();
  await within(entered.promise);
  let ready = false;
  const readiness = a.services.referenceDataReady().then(() => { ready = true; });
  try {
    // Queue a local read after the cache inspection to let a wrongly accepted barrier settle.
    await a.repositories.schools.getAll();
    expect(ready).toBe(false);
    expect(await a.repositories.localState.get('reference_data_complete_at')).toBeNull();
    release.resolve();
    await Promise.all([readiness, refresh]);
    expect(await a.repositories.staffProgrammeAssignments.getAll()).toHaveLength(1);
    expect(transport).toHaveBeenCalledTimes(7);
  } finally { release.resolve(); }
});

test.each([false, true])('a partial reference cache after reopen retries readiness instead of reporting ready, repeat refresh = %s', async repeatRefresh => {
  const partial = jest.fn(async url => {
    const table = new URL(url).pathname.split('/').pop();
    return table === 'staff_programme_assignments'
      ? response({ message: 'staff references failed' }, 503)
      : response(referenceRows(table, A));
  });
  const a = await open(A, partial);
  await expect(a.services.pullReferenceData()).rejects.toMatchObject({ message: 'staff references failed' });
  await requestClose({ reason: 'restart after partial reference refresh' });
  let offline = false;
  const transport = jest.fn(async url => {
    if (offline) return response({ message: 'Offline' }, 503);
    return partial(url);
  });
  const reopened = await open(A, transport);
  expect(await reopened.repositories.schools.getAll()).toHaveLength(1);
  expect(await reopened.repositories.programmes.getAll()).toHaveLength(1);
  expect(await reopened.repositories.academicYears.getAll()).toHaveLength(1);
  expect(await reopened.repositories.staffProgrammeAssignments.getAll()).toEqual([]);
  if (repeatRefresh) {
    await expect(reopened.services.pullReferenceData()).rejects.toMatchObject({ message: 'staff references failed' });
  }
  offline = true;
  const requests = transport.mock.calls.length;
  await expect(reopened.services.referenceDataReady()).rejects.toMatchObject({ message: 'Offline' });
  expect(transport).toHaveBeenCalledTimes(requests + 1);
  expect(await reopened.repositories.localState.get('reference_data_complete_at')).toBeNull();
});

test.each([true, false])('a previously completed cache is ready offline after reopen, assigned = %s', async assigned => {
  const a = await open(A, async url => {
    const table = new URL(url).pathname.split('/').pop();
    return response(!assigned && table === 'staff_programme_assignments' ? [] : referenceRows(table, A));
  });
  await a.services.pullReferenceData();
  const completedAt = await a.repositories.localState.get('reference_data_complete_at');
  expect(new Date(completedAt).toISOString()).toBe(completedAt);
  await requestClose({ reason: 'offline restart' });
  const offline = jest.fn(async () => { throw new TypeError('Offline'); });
  const reopened = await open(A, offline);
  await reopened.services.referenceDataReady();
  expect(offline).not.toHaveBeenCalled();
  expect(await reopened.repositories.staffProgrammeAssignments.getAll()).toHaveLength(assigned ? 1 : 0);
});

test('a completed reference pull with every table empty is ready offline after reopen', async () => {
  const online = jest.fn(async () => response());
  const a = await open(A, online);
  await a.services.pullReferenceData();
  expect(online).toHaveBeenCalledTimes(7);
  await requestClose({ reason: 'offline restart with empty references' });
  const offline = jest.fn(async () => { throw new TypeError('Offline'); });
  const reopened = await open(A, offline);
  await reopened.services.referenceDataReady();
  expect(offline).not.toHaveBeenCalled();
});

test.each([true, false])('a failed later refresh preserves completed-cache readiness after reopen, assigned = %s', async assigned => {
  let fail = false;
  const a = await open(A, async url => {
    const table = new URL(url).pathname.split('/').pop();
    if (fail && table === 'staff_programme_assignments') return response({ message: 'staff references failed' }, 503);
    return response(!assigned && table === 'staff_programme_assignments' ? [] : referenceRows(table, A));
  });
  await a.services.pullReferenceData();
  const completedAt = await a.repositories.localState.get('reference_data_complete_at');
  expect(new Date(completedAt).toISOString()).toBe(completedAt);
  fail = true;
  await expect(a.services.pullReferenceData()).rejects.toMatchObject({ message: 'staff references failed' });
  expect(await a.repositories.localState.get('reference_data_complete_at')).toBe(completedAt);
  await requestClose({ reason: 'offline restart after failed later refresh' });
  const offline = jest.fn(async () => { throw new TypeError('Offline'); });
  const reopened = await open(A, offline);
  await reopened.services.referenceDataReady();
  expect(offline).not.toHaveBeenCalled();
  expect(await reopened.repositories.localState.get('reference_data_complete_at')).toBe(completedAt);
  expect(await reopened.repositories.staffProgrammeAssignments.getAll()).toHaveLength(assigned ? 1 : 0);
});

test.each(['failed', 'terminal', 'manual retry', 'terminal requeue', 're-enqueue'])('deleting a child after a committed insert loses its response retains the insert and queues hard_delete: %s', async mode => {
  const server = new Map();
  let loseResponse = true;
  const transport = jest.fn(async (url, init) => {
    const table = new URL(url).pathname.split('/').pop();
    const payload = JSON.parse(init.body);
    if (table === 'delete_child_if_no_history') {
      server.delete(payload.p_child_id);
      return response(true);
    }
    expect(table).toBe('children');
    for (const row of Array.isArray(payload) ? payload : [payload]) server.set(row.id, row);
    if (loseResponse) { loseResponse = false; throw new TypeError('Response lost after server commit'); }
    return response();
  });
  const a = await open(A, transport);
  await a.repositories.children.saveChildRecord(child());
  await a.services.syncEngine.syncAll();
  expect(server.has(CHILD)).toBe(true);
  expect(await pending(a)).toEqual([expect.objectContaining({ status: 'failed', retry_count: 1 })]);
  const insertId = `children:${CHILD}:insert`;
  if (mode === 'manual retry') await a.services.syncEngine.retryFailedItem('children', CHILD);
  if (mode === 'terminal' || mode === 'terminal requeue') {
    await a.repositories.syncOutbox.markTerminalFailure(insertId, { errorMessage: 'Upload failed' });
    if (mode === 'terminal requeue') await a.repositories.syncOutbox.requeueTerminalRows([insertId]);
  }
  if (mode === 're-enqueue') await a.repositories.children.saveChildRecord({ ...child(), first_name: 'Edited' });
  expect(await a.repositories.children.deleteIfNoHistory(CHILD)).toBe(true);
  expect(await a.repositories.syncOutbox.countUnsent()).toMatchObject({ total: 2 });
  expect(await a.repositories.children.getChildren()).toEqual([]);
  if (mode === 'failed') {
    await a.services.syncEngine.syncAll();
    expect(server.has(CHILD)).toBe(true); // hard_delete waits behind the backed-off INSERT.
  }
  for (let pass = 0; pass < 3; pass += 1) await a.services.syncEngine.syncAll({ force: true });
  expect(server.size).toBe(0);
  expect(await pending(a)).toEqual([]);
  expect(transport.mock.calls.map(([url]) => new URL(url).pathname.split('/').pop())).toEqual([
    'children', 'children', 'delete_child_if_no_history',
  ]);
});

test.each([false, true])('deleting after reopen retains an insert committed before sign-out lost its response, replaced in flight = %s', async replaced => {
  const entered = deferred();
  const server = new Map();
  let loseResponse = true;
  const transport = jest.fn(async (url, init) => {
    const table = new URL(url).pathname.split('/').pop();
    const payload = JSON.parse(init.body);
    if (table === 'delete_child_if_no_history') { server.delete(payload.p_child_id); return response(true); }
    for (const row of Array.isArray(payload) ? payload : [payload]) server.set(row.id, row);
    if (loseResponse) { loseResponse = false; entered.resolve(); return new Promise(() => {}); }
    return response();
  });
  const a = await open(A, transport);
  await a.repositories.children.saveChildRecord(child());
  const pass = a.services.syncEngine.syncAll();
  await within(entered.promise);
  expect(server.has(CHILD)).toBe(true);
  expect(await pending(a)).toEqual([expect.objectContaining({ status: 'in_flight', retry_count: 0 })]);
  if (replaced) await a.repositories.children.saveChildRecord({ ...child(), first_name: 'Edited while uploading' });
  await requestClose({ reason: 'sign out with response lost' });
  expect(await pass).toMatchObject({ abortedStaleActor: true });
  const reopened = await open(A, transport);
  expect(await pending(reopened)).toEqual([expect.objectContaining({ status: 'pending', retry_count: 0 })]);
  expect(await reopened.repositories.children.deleteIfNoHistory(CHILD)).toBe(true);
  expect(await reopened.repositories.syncOutbox.countUnsent()).toMatchObject({ total: 2 });
  for (let attempt = 0; attempt < 3; attempt += 1) await reopened.services.syncEngine.syncAll({ force: true });
  expect(server.size).toBe(0);
  expect(await pending(reopened)).toEqual([]);
  expect(transport.mock.calls.map(([url]) => new URL(url).pathname.split('/').pop())).toEqual([
    'children', 'children', 'delete_child_if_no_history',
  ]);
});

test('deleting a never-dispatched child removes it locally with zero outbox rows or requests', async () => {
  const transport = jest.fn();
  const a = await open(A, transport);
  await a.repositories.children.saveChildRecord(child());
  expect(await a.repositories.children.deleteIfNoHistory(CHILD)).toBe(true);
  expect(await a.repositories.children.getChildren()).toEqual([]);
  expect(await pending(a)).toEqual([]);
  expect(transport).not.toHaveBeenCalled();
});
