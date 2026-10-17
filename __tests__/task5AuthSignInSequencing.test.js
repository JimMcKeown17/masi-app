import React from 'react';
import { Text } from 'react-native';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../src/services/supabaseClient';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { readPersistedSession } from '../src/services/persistedAuthSession';
import { revokeAuthSessionAdmission } from '../src/services/authSessionStorage';
import { AUTH_REQUEST_TIMEOUT_MS } from '../src/services/authRequestFetch';
import { getCurrentHandle, resetHandleRegistryForTests } from '../src/session/signedInHandle';
import * as engine from '../test-support/expoSQLiteRealEngine';
import * as sqlite from 'expo-sqlite';

// Exercise the production client, storage fence, transport deadline and processLock.
jest.mock('../config/supabaseProjectConfig', () => ({
  resolveSupabaseProjectConfig: () => require('../test-support/supabaseTestConfig'),
}));
global.__MASI_NO_DEFAULT_HANDLE__ = true;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const barrier = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const session = id => ({ user: { id, email: `${id}@example.org` }, access_token: `token-${id}`, refresh_token: `refresh-${id}`, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const rejectedRefresh = () => json({ message: 'Invalid Refresh Token: Refresh Token Not Found' }, 400);
let auth;
let transport;
function Tree() {
  auth = useAuth();
  return <Text testID="actor">{auth.user?.id || 'signed-out'}</Text>;
}
const signIn = async id => {
  await act(async () => { expect((await auth.signIn(`${id}@example.org`, 'secret')).error).toBeNull(); });
  await waitFor(() => expect(getCurrentHandle()?.userId).toBe(id));
};
beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  await supabase.auth.initialize();
  await supabase.auth.stopAutoRefresh();
  await resetHandleRegistryForTests(); await engine.__resetMockDatabases(); await AsyncStorage.clear();
  revokeAuthSessionAdmission();
  sqlite.__setDatabaseFactory(engine.openDatabaseAsync);
  transport = jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
    if (String(url).includes('grant_type=password')) return json(session(JSON.parse(init.body).email.split('@')[0]));
    throw new Error(`Unexpected test request: ${new URL(url).pathname}`);
  });
});
afterEach(async () => {
  cleanup(); await supabase.auth.stopAutoRefresh();
  await resetHandleRegistryForTests(); await engine.__resetMockDatabases();
  jest.restoreAllMocks(); jest.useRealTimers();
});

test('A refresh rejected before B login completes cannot revoke B admission or credentials', async () => {
  const view = render(<AuthProvider><Tree /></AuthProvider>);
  await signIn(A);
  const refreshEntered = barrier(); const releaseRefresh = barrier();
  const loginEntered = barrier(); const releaseLogin = barrier();
  const original = transport.getMockImplementation();
  transport.mockImplementation(async (url, init) => {
    if (String(url).includes('grant_type=refresh_token')) {
      refreshEntered.resolve(); await releaseRefresh.promise; return rejectedRefresh();
    }
    if (String(url).includes('grant_type=password')) { loginEntered.resolve(); await releaseLogin.promise; }
    return original(url, init);
  });
  let refreshing; let signingIn;
  act(() => { refreshing = supabase.auth.refreshSession(); });
  await refreshEntered.promise;
  try {
    act(() => { signingIn = auth.signIn(`${B}@example.org`, 'secret'); });
    await act(async () => {});
    expect(transport.mock.calls.filter(([url]) => String(url).includes('grant_type=password'))).toHaveLength(1);
    await act(async () => { releaseRefresh.resolve(); expect((await refreshing).error.status).toBe(400); });
    await loginEntered.promise;
    expect(view.getByTestId('actor').props.children).toBe(A);
    expect(getCurrentHandle()?.userId).toBe(A);
    await act(async () => { releaseLogin.resolve(); expect((await signingIn).error).toBeNull(); });
    await waitFor(() => expect(getCurrentHandle()?.userId).toBe(B));
    expect(view.getByTestId('actor').props.children).toBe(B);
    expect(await readPersistedSession()).toMatchObject({ user: { id: B }, access_token: `token-${B}` });
  } finally {
    releaseRefresh.resolve(); releaseLogin.resolve(); await Promise.allSettled([refreshing, signingIn]);
  }
});

test('A refresh response released with 400 after B completes cannot reach SDK cleanup after the 30 s bound', async () => {
  const view = render(<AuthProvider><Tree /></AuthProvider>);
  await signIn(A);
  const entered = barrier(); const release = barrier();
  const original = transport.getMockImplementation();
  let requestSignal;
  transport.mockImplementation(async (url, init) => {
    if (String(url).includes('grant_type=refresh_token')) {
      requestSignal = init.signal;
      entered.resolve(); await release.promise; return rejectedRefresh();
    }
    return original(url, init);
  });
  let refreshing; let signingIn;
  act(() => { refreshing = supabase.auth.refreshSession(); });
  await entered.promise;
  const started = Date.now();
  try {
    act(() => { signingIn = auth.signIn(`${B}@example.org`, 'secret'); });
    await act(async () => { await jest.advanceTimersByTimeAsync(AUTH_REQUEST_TIMEOUT_MS - 1); });
    expect(view.getByTestId('actor').props.children).toBe(A);
    expect(transport.mock.calls.filter(([url]) => String(url).includes('grant_type=password'))).toHaveLength(1);
    expect(requestSignal.aborted).toBe(false);
    await act(async () => { await jest.advanceTimersByTimeAsync(1); expect((await signingIn).error).toBeNull(); });
    await waitFor(() => expect(getCurrentHandle()?.userId).toBe(B));
    expect(Date.now() - started).toBe(AUTH_REQUEST_TIMEOUT_MS);
    expect(requestSignal.aborted).toBe(true);
    expect((await refreshing).error.name).toBe('AuthRetryableFetchError');
    expect(view.getByTestId('actor').props.children).toBe(B);
    expect(await readPersistedSession()).toMatchObject({ user: { id: B } });
    await act(async () => { release.resolve(); await supabase.auth.getSession(); });
    expect(view.getByTestId('actor').props.children).toBe(B);
    expect(getCurrentHandle()?.userId).toBe(B);
    expect(await readPersistedSession()).toMatchObject({ user: { id: B }, access_token: `token-${B}` });
  } finally {
    release.resolve(); await Promise.allSettled([refreshing, signingIn]);
  }
});

test('A alone is signed out and its storage cleared when its current refresh is rejected with 400', async () => {
  const view = render(<AuthProvider><Tree /></AuthProvider>);
  await signIn(A);
  transport.mockImplementation(async () => rejectedRefresh());
  await act(async () => { expect((await supabase.auth.refreshSession()).error.status).toBe(400); });
  await waitFor(() => expect(view.getByTestId('actor').props.children).toBe('signed-out'));
  await act(async () => { await supabase.auth.getSession(); });
  expect(getCurrentHandle()).toBeNull();
  expect(await readPersistedSession()).toBeNull();
  expect(await AsyncStorage.getItem(supabase.auth.storageKey)).toBeNull();
  expect(await AsyncStorage.getItem(`${supabase.auth.storageKey}-user`)).toBeNull();
});

test.each(['SIGNED_OUT', 'USER_UPDATED'])('pending B login defers %s and retains B after settlement', async event => {
  const view = render(<AuthProvider><Tree /></AuthProvider>);
  await signIn(A);
  const entered = barrier(); const release = barrier();
  const original = transport.getMockImplementation();
  transport.mockImplementation(async (url, init) => { entered.resolve(); await release.promise; return original(url, init); });
  const events = jest.fn();
  const unsubscribe = auth.subscribeToAuthEvents(events);
  let signingIn;
  act(() => { signingIn = auth.signIn(`${B}@example.org`, 'secret'); });
  await entered.promise;
  try {
    await act(async () => { await supabase.auth._notifyAllSubscribers(event, null); });
    await act(async () => { await jest.advanceTimersByTimeAsync(15_000); });
    expect(view.getByTestId('actor').props.children).toBe(A);
    expect(getCurrentHandle()?.userId).toBe(A);
    expect(await readPersistedSession()).toMatchObject({ user: { id: A } });
    expect(events).not.toHaveBeenCalled();
    await act(async () => { release.resolve(); expect((await signingIn).error).toBeNull(); });
    await waitFor(() => expect(getCurrentHandle()?.userId).toBe(B));
    expect(view.getByTestId('actor').props.children).toBe(B);
    expect(await readPersistedSession()).toMatchObject({ user: { id: B } });
  } finally { release.resolve(); await signingIn; unsubscribe(); }
});

test('failed B login reconciles a deferred real A revocation to signed out', async () => {
  const view = render(<AuthProvider><Tree /></AuthProvider>);
  await signIn(A);
  const entered = barrier(); const release = barrier();
  transport.mockImplementation(async (url) => {
    if (String(url).includes('grant_type=refresh_token')) {
      entered.resolve(); await release.promise; return rejectedRefresh();
    }
    return json({ message: 'Invalid login credentials' }, 400);
  });
  let refreshing; let signingIn;
  act(() => { refreshing = supabase.auth.refreshSession(); });
  await entered.promise;
  try {
    act(() => { signingIn = auth.signIn(`${B}@example.org`, 'wrong'); });
    await act(async () => { release.resolve(); await refreshing; expect((await signingIn).error.status).toBe(400); });
    await waitFor(() => expect(view.getByTestId('actor').props.children).toBe('signed-out'));
    await act(async () => { await supabase.auth.getSession(); });
    expect(getCurrentHandle()).toBeNull();
    expect(await readPersistedSession()).toBeNull();
  } finally { release.resolve(); await Promise.allSettled([refreshing, signingIn]); }
});
