global.__MASI_NO_DEFAULT_HANDLE__ = true;

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  requestOpen, requestClose, setLatestAuthSession, resetHandleRegistryForTests,
} from '../src/session/signedInHandle';
import { AuthUnavailableError, StaleActorError, isStaleActorError } from '../src/session/staleActor';
import { createPathDatabaseOpener } from '../test-support/actorTestUtils';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const session = (userId, token) => ({ user: { id: userId }, access_token: token });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const response = () => new Response('[]', {
  status: 200, headers: { 'content-type': 'application/json' },
});
const requestDetails = (url, init) => ({
  url: String(url), method: init.method, auth: new Headers(init.headers).get('Authorization'),
});

let dir;
let openDatabase;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-handle-data-'));
  openDatabase = createPathDatabaseOpener(dir);
});
afterEach(async () => {
  await resetHandleRegistryForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

test('a class upsert sends the letter order editions header alongside authorization', async () => {
  const transport = jest.fn(async () => response());
  setLatestAuthSession(session(A, 'token-A'));
  const handle = await requestOpen({ userId: A, openDatabase, fetchImpl: transport });
  expect(await handle.enqueueRequest(() => handle.dataClient.from('classes').upsert({ id: 'class-1', name: 'Class' })))
    .toMatchObject({ error: null });
  expect(transport).toHaveBeenCalledTimes(1);
  const [url, init] = transport.mock.calls[0];
  expect(String(url)).toContain('/rest/v1/classes');
  expect(init.method).toBe('POST');
  const headers = new Headers(init.headers);
  expect(headers.get('Authorization')).toBe('Bearer token-A');
  expect(headers.get('X-Masi-Letter-Order-Editions')).toBe('2026-10-23');
});

test('T18: a task paused mid-request is refused at its next send after A signs out and B signs in', async () => {
  const sent = [];
  const enteredSelect = deferred();
  const releaseSelect = deferred();
  const resumeAfterSwitch = deferred();
  const transport = jest.fn(async (url, init) => {
    sent.push(requestDetails(url, init));
    if (String(url).includes('select=')) {
      enteredSelect.resolve();
      await releaseSelect.promise;
    }
    return response();
  });
  setLatestAuthSession(session(A, 'token-A'));
  const a = await requestOpen({ userId: A, openDatabase, fetchImpl: transport });
  const task = a.enqueueRequest(async () => {
    await a.dataClient.from('child_class_memberships').select('id').eq('child_id', 'c1');
    // Aborting fetch may settle the select before its transport responds. Keep the
    // continuation parked until B is current, regardless of that transport behavior.
    await resumeAfterSwitch.promise;
    await a.dataClient.from('child_class_memberships').update({ unassigned_at: 'now' }).eq('id', 'm1');
    return a.dataClient.from('child_class_memberships').upsert({ id: 'm2' });
  });
  const outcome = task.then((value) => ({ value }), (error) => ({ error }));
  try {
    await Promise.race([enteredSelect.promise, task]);
    await requestClose({ reason: 'test' });
    setLatestAuthSession(session(B, 'token-B'));
    await requestOpen({ userId: B, openDatabase, fetchImpl: transport });
  } finally {
    releaseSelect.resolve();
    resumeAfterSwitch.resolve();
  }
  expect(isStaleActorError((await outcome).error)).toBe(true);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ method: 'GET', auth: 'Bearer token-A' });
  expect(sent.filter((request) => request.method !== 'GET')).toEqual([]);
  expect(sent.every((request) => !String(request.auth).includes('token-B'))).toBe(true);
});

test('T18: rpc is fenced the same way', async () => {
  const sent = [];
  const enteredSelect = deferred();
  const releaseSelect = deferred();
  const resumeAfterSwitch = deferred();
  const transport = jest.fn(async (url, init) => {
    sent.push(requestDetails(url, init));
    enteredSelect.resolve();
    await releaseSelect.promise;
    return response();
  });
  setLatestAuthSession(session(A, 'token-A'));
  const a = await requestOpen({ userId: A, openDatabase, fetchImpl: transport });
  const task = a.enqueueRequest(async () => {
    await a.dataClient.from('children').select('id');
    await resumeAfterSwitch.promise;
    return a.dataClient.rpc('delete_child_if_no_history', { p_child_id: 'c1' });
  });
  const outcome = task.then((value) => ({ value }), (error) => ({ error }));
  try {
    await Promise.race([enteredSelect.promise, task]);
    await requestClose({ reason: 'test' });
    setLatestAuthSession(session(B, 'token-B'));
    await requestOpen({ userId: B, openDatabase, fetchImpl: transport });
  } finally {
    releaseSelect.resolve();
    resumeAfterSwitch.resolve();
  }
  expect(isStaleActorError((await outcome).error)).toBe(true);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ method: 'GET', auth: 'Bearer token-A' });
  expect(sent.filter((request) => request.url.includes('/rpc/'))).toEqual([]);
  expect(sent.every((request) => !String(request.auth).includes('token-B'))).toBe(true);
});

test('T23: after TOKEN_REFRESHED the next request carries the new token', async () => {
  const sent = [];
  const transport = jest.fn(async (url, init) => { sent.push(requestDetails(url, init)); return response(); });
  setLatestAuthSession(session(A, 'token-1'));
  const a = await requestOpen({ userId: A, openDatabase, fetchImpl: transport });
  expect(await a.enqueueRequest(() => a.dataClient.from('children').select('id'))).toMatchObject({ error: null });
  setLatestAuthSession(session(A, 'token-2'));
  expect(await a.enqueueRequest(() => a.dataClient.from('children').select('id'))).toMatchObject({ error: null });
  expect(sent.map((request) => request.auth)).toEqual(['Bearer token-1', 'Bearer token-2']);
  expect(transport).toHaveBeenCalledTimes(2);
});

test('T23: a request made outside a queued task is refused', async () => {
  const transport = jest.fn(async () => response());
  setLatestAuthSession(session(A, 'token-A'));
  const a = await requestOpen({ userId: A, openDatabase, fetchImpl: transport });
  const result = await a.dataClient.from('children').select('id');
  expect(result).toMatchObject({ data: null, error: { code: '' }, status: 0 });
  expect(result.error.message).toContain('StaleActorError:');
  await expect(a.requireAccessToken()).rejects.toBeInstanceOf(StaleActorError);
  expect(transport).not.toHaveBeenCalled();
});

test('ruling 2: an open handle with no session returns a retriable codeless error, not StaleActorError', async () => {
  const transport = jest.fn(async () => response());
  setLatestAuthSession(session(A, 'token-A'));
  const a = await requestOpen({ userId: A, openDatabase, fetchImpl: transport });
  setLatestAuthSession(null);
  const result = await a.enqueueRequest(() => a.dataClient.from('children').select('id'));
  expect(result).toMatchObject({ data: null, error: { code: '' }, status: 0 });
  expect(result.error.message).toContain('auth unavailable');
  expect(isStaleActorError(result.error)).toBe(false);
  expect(transport).not.toHaveBeenCalled();
});

test('a request that exceeds the timeout resolves as a codeless error', async () => {
  const transport = jest.fn(() => new Promise(() => {}));
  setLatestAuthSession(session(A, 'token-A'));
  const a = await requestOpen({ userId: A, openDatabase, fetchImpl: transport, timeoutMs: 20 });
  const started = Date.now();
  const result = await a.enqueueRequest(() => a.dataClient.from('children').select('id'));
  expect(Date.now() - started).toBeLessThan(200);
  expect(result).toMatchObject({ data: null, error: { code: '', message: 'TypeError: Network request failed' }, status: 0 });
  expect(transport).toHaveBeenCalledTimes(1);
  expect(requestDetails(...transport.mock.calls[0])).toMatchObject({ method: 'GET', auth: 'Bearer token-A' });
  expect(transport.mock.calls[0][1].signal.aborted).toBe(true);
  transport.mockImplementation(async () => response());
  await expect(a.enqueueRequest(() => a.dataClient.from('children').select('id')))
    .resolves.toMatchObject({ error: null });
  expect(transport).toHaveBeenCalledTimes(2);
});

test.each([
  ['missing session', null],
  ['another user', session(B, 'token-B')],
  ['missing token', session(A, undefined)],
])('ruling 2: %s throws AuthUnavailableError without marking the task stale', async (_, unavailable) => {
  const transport = jest.fn(async () => response());
  setLatestAuthSession(session(A, 'token-A'));
  const a = await requestOpen({ userId: A, openDatabase, fetchImpl: transport });
  setLatestAuthSession(unavailable);
  await expect(a.enqueueRequest(() => a.dataClient.from('children').select('id').throwOnError()))
    .rejects.toBeInstanceOf(AuthUnavailableError);
  expect(transport).not.toHaveBeenCalled();
  setLatestAuthSession(session(A, 'token-restored'));
  await expect(a.enqueueRequest(() => a.dataClient.from('children').select('id')))
    .resolves.toMatchObject({ error: null });
  expect(transport).toHaveBeenCalledTimes(1);
  expect(requestDetails(...transport.mock.calls[0]).auth).toBe('Bearer token-restored');
});

test.each(['close', 'missing session', 'another user', 'refresh'])(
  'the send-time fence checks %s after the SDK token callback', async (change) => {
    const transport = jest.fn(async () => response());
    setLatestAuthSession(session(A, 'token-1'));
    const a = await requestOpen({ userId: A, openDatabase, fetchImpl: transport });
    const requireAccessToken = a.requireAccessToken;
    jest.spyOn(a, 'requireAccessToken').mockImplementationOnce(async () => {
      const token = await requireAccessToken();
      if (change === 'close') await requestClose({ reason: 'test' });
      else if (change === 'missing session') setLatestAuthSession(null);
      else if (change === 'another user') setLatestAuthSession(session(B, 'token-B'));
      else setLatestAuthSession(session(A, 'token-2'));
      return token;
    });
    const task = a.enqueueRequest(() => a.dataClient.from('children').select('id'));
    if (change === 'close') {
      await expect(task).rejects.toBeInstanceOf(StaleActorError);
    } else if (change === 'refresh') {
      await expect(task).resolves.toMatchObject({ error: null });
      expect(transport).toHaveBeenCalledTimes(1);
      expect(requestDetails(...transport.mock.calls[0]).auth).toBe('Bearer token-2');
    } else {
      await expect(task).resolves.toMatchObject({ error: { code: '' } });
    }
    if (change !== 'refresh') expect(transport).not.toHaveBeenCalled();
  }
);

test('closing aborts an in-flight request and rejects the task as stale even when transport ignores the signal', async () => {
  const entered = deferred();
  const transport = jest.fn(() => { entered.resolve(); return new Promise(() => {}); });
  setLatestAuthSession(session(A, 'token-A'));
  const a = await requestOpen({ userId: A, openDatabase, fetchImpl: transport });
  const task = a.enqueueRequest(() => a.dataClient.from('children').select('id'));
  const outcome = task.then((value) => ({ value }), (error) => ({ error }));
  await Promise.race([entered.promise, task]);
  await requestClose({ reason: 'test' });
  expect(isStaleActorError((await outcome).error)).toBe(true);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(requestDetails(...transport.mock.calls[0]).auth).toBe('Bearer token-A');
  expect(transport.mock.calls[0][1].signal.aborted).toBe(true);
});

test('a caller abort resolves as a codeless network error while the handle stays usable', async () => {
  const entered = deferred();
  const transport = jest.fn(() => { entered.resolve(); return new Promise(() => {}); });
  const controller = new AbortController();
  setLatestAuthSession(session(A, 'token-A'));
  const a = await requestOpen({ userId: A, openDatabase, fetchImpl: transport });
  const task = a.enqueueRequest(() => a.dataClient.from('children').select('id').abortSignal(controller.signal));
  await Promise.race([entered.promise, task]);
  controller.abort();
  await expect(task).resolves.toMatchObject({ error: { code: '', message: 'TypeError: Network request failed' } });
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0][1].signal.aborted).toBe(true);
  transport.mockImplementation(async () => response());
  await expect(a.enqueueRequest(() => a.dataClient.from('children').select('id')))
    .resolves.toMatchObject({ error: null });
  expect(transport).toHaveBeenCalledTimes(2);
});

test('opening a handle logs no Realtime auth warning (Masi does not use Realtime)', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    setLatestAuthSession(session(A, 'token-A'));
    await requestOpen({ userId: A, openDatabase, fetchImpl: jest.fn(async () => response()) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warn.mock.calls.filter(([message]) => String(message).includes('Realtime'))).toEqual([]);
  } finally {
    warn.mockRestore();
  }
});

test.each([200,401,403,409,499,500])('server contact admits HTTP %i only below 500', async status => {
  const transport = jest.fn(async () => new Response('{}', { status, headers: {'content-type':'application/json'} }));
  setLatestAuthSession(session(A,'token'));
  const h = await requestOpen({userId:A,openDatabase,fetchImpl:transport});
  await h.enqueueRequest(() => h.dataClient.rpc('test_contact',{}));
  if (status < 500) expect(h.lastServerResponseAt).toEqual(expect.any(String));
  else expect(h.lastServerResponseAt).toBeUndefined();
});
