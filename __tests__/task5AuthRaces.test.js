import React from 'react';
import { Text, TextInput } from 'react-native';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider, Button } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { SignedInEAProvider } from '../src/context/SignedInEAContext';
import ProfileScreen from '../src/screens/main/ProfileScreen';
import HomeScreen from '../src/screens/main/HomeScreen';
import SessionFormScreen from '../src/screens/sessions/SessionFormScreen';
import { OfflineProvider, useOffline } from '../src/context/OfflineContext';
import { ChildrenProvider, useChildren } from '../src/context/ChildrenContext';
import { ClassesProvider, useClasses } from '../src/context/ClassesContext';
import { readPersistedSession, clearPersistedSession } from '../src/services/persistedAuthSession';
import { createAuthSessionStorage, revokeAuthSessionAdmission, resetAuthSessionAdmissionForTests } from '../src/services/authSessionStorage';
import { authRequestFetch, AUTH_REQUEST_TIMEOUT_MS } from '../src/services/authRequestFetch';
import { getCurrentHandle, requestOpen, requestClose, resetHandleRegistryForTests } from '../src/session/signedInHandle';
import * as engine from '../test-support/expoSQLiteRealEngine';
import * as sqlite from 'expo-sqlite';

global.__MASI_NO_DEFAULT_HANDLE__ = true;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const barrier = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const session = id => ({ user: { id, email: `${id}@example.org` }, access_token: `token-${id}`, refresh_token: `refresh-${id}`, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 });
const json = data => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
let mockClient;
let auth;
let transport;
let mockNetwork = { isConnected: false };
const mockNetListeners = new Set();
const navigation = { navigate: jest.fn() };
let roster;
let profileAuth;
const bootstrapStates = [];
jest.mock('../src/services/supabaseClient', () => ({ ...require('../test-support/supabaseTestConfig'), supabase: { get auth() { return mockClient.auth; } } }));
jest.mock('@react-native-community/netinfo', () => ({ fetch: async () => mockNetwork, addEventListener: fn => { mockNetListeners.add(fn); return () => mockNetListeners.delete(fn); } }));
jest.mock('@react-navigation/native', () => ({ NavigationContext: require('react').createContext(null), useFocusEffect: fn => require('react').useEffect(fn, [fn]) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
jest.mock('../src/hooks/useTimeTracking', () => ({ useTimeTracking: () => ({ isSignedIn: false }) }));
jest.mock('../src/screens/sessions/LiteracySessionForm', () => {
  const React = require('react'); const { Text } = require('react-native');
  return () => <Text>Literacy session form</Text>;
});

function Roster() {
  roster = { children: useChildren(), classes: useClasses(), offline: useOffline() };
  bootstrapStates.push(roster.classes.classBootstrapStatus);
  return <PaperProvider><HomeScreen navigation={navigation} /></PaperProvider>;
}

function ProfileProbe() {
  profileAuth = useAuth();
  return <Text testID="profile-role">{profileAuth.profile?.jobTitleCode || 'missing'}</Text>;
}

function Tree({ profile = false, rosters = false, sessionForm = false }) {
  auth = useAuth();
  return <><Text testID="actor">{auth.user?.id || 'signed-out'}</Text>{auth.user && auth.handle && <SignedInEAProvider key={`${auth.handle.userId}:${auth.handle.epoch}`} handle={auth.handle}>
    <ProfileProbe />
    {sessionForm ? <PaperProvider><SessionFormScreen navigation={navigation} /></PaperProvider> : null}
    {profile ? <PaperProvider><ProfileScreen navigation={{ navigate: jest.fn() }} /></PaperProvider> : null}
    {rosters ? <OfflineProvider><ChildrenProvider><ClassesProvider><Roster /></ClassesProvider></ChildrenProvider></OfflineProvider> : null}
  </SignedInEAProvider>}</>;
}
const signIn = async id => {
  await act(async () => { expect((await auth.signIn(`${id}@example.org`, 'secret')).error).toBeNull(); });
  await waitFor(() => expect(getCurrentHandle()?.userId).toBe(id));
};
beforeEach(async () => {
  // Held transports must never race the real request deadline under machine load.
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  await resetHandleRegistryForTests(); await engine.__resetMockDatabases(); await AsyncStorage.clear();
  revokeAuthSessionAdmission();
  mockNetwork = { isConnected: false };
  navigation.navigate.mockClear(); bootstrapStates.length = 0; roster = null;
  sqlite.__setDatabaseFactory(engine.openDatabaseAsync);
  transport = jest.fn(async (url, init) => {
    if (String(url).includes('/token')) return json(session(JSON.parse(init.body).email.split('@')[0]));
    if (String(url).includes('/logout')) return json({});
    if (String(url).includes('/user')) return json(session(A).user);
    return json([]);
  });
  jest.spyOn(global, 'fetch').mockImplementation((...args) => transport(...args));
  mockClient = createClient('https://example.supabase.co', 'test-key', {
    auth: { storage: createAuthSessionStorage('sb-example-auth-token'), persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: authRequestFetch },
  });
  await mockClient.auth.initialize();
});

test('offline first launch loads the profile on reconnect and coalesces concurrent profile refreshes', async () => {
  const entered = barrier(); const release = barrier();
  const originalTransport = transport.getMockImplementation();
  transport.mockImplementation(async (url, init) => {
    if (new URL(url).pathname === '/rest/v1/users') {
      entered.resolve(); await release.promise;
      return json({ id: A, job_title_lookup: { code: 'literacy_coach', name: 'Literacy Coach' } });
    }
    return originalTransport(url, init);
  });
  const view = render(<AuthProvider><Tree /></AuthProvider>);
  await signIn(A);
  expect(view.getByTestId('profile-role').props.children).toBe('missing');
  expect(transport.mock.calls.filter(([url]) => String(url).includes('/rest/v1/users'))).toHaveLength(0);
  try {
    await act(async () => {
      mockNetwork = { isConnected: true };
      for (const listener of mockNetListeners) listener(mockNetwork);
    });
    await waitFor(() => expect(transport.mock.calls.filter(([url]) => String(url).includes('/rest/v1/users'))).toHaveLength(1));
    await entered.promise;
    let retries;
    act(() => { retries = Promise.all([profileAuth.refreshProfile(), profileAuth.refreshProfile()]); });
    await act(async () => { release.resolve(); await retries; });
    await waitFor(() => expect(view.getByTestId('profile-role').props.children).toBe('literacy_coach'));
    expect(transport.mock.calls.filter(([url]) => String(url).includes('/rest/v1/users'))).toHaveLength(1);
    expect((await getCurrentHandle().services.deviceProfile.get()).jobTitleCode).toBe('literacy_coach');
  } finally { release.resolve(); }
});
afterEach(async () => { cleanup(); await mockClient.auth.stopAutoRefresh(); await resetHandleRegistryForTests(); await engine.__resetMockDatabases(); jest.restoreAllMocks(); jest.useRealTimers(); });

test.each([false, true])('SDK split-record initialization restores A and persists merged credentials; expired = %s', async expired => {
  await mockClient.auth.stopAutoRefresh();
  resetAuthSessionAdmissionForTests();
  const storageKey = mockClient.auth.storageKey;
  const { user, ...credentials } = session(A);
  await AsyncStorage.setItem(storageKey, JSON.stringify({ ...credentials, expires_at: expired ? 1 : credentials.expires_at }));
  await AsyncStorage.setItem(`${storageKey}-user`, JSON.stringify({ user }));
  transport.mockImplementation(async (url, init) => {
    if (expired && String(url).includes('grant_type=refresh_token')) {
      expect(JSON.parse(init.body).refresh_token).toBe(credentials.refresh_token);
      return json({ ...session(A), refresh_token: 'launch-rotated-A' });
    }
    throw new TypeError('Offline');
  });
  mockClient = createClient('https://example.supabase.co', 'test-key', {
    auth: { storage: createAuthSessionStorage(storageKey), persistSession: true, autoRefreshToken: expired, detectSessionInUrl: false },
    global: { fetch: authRequestFetch },
  });
  await mockClient.auth.initialize();
  await mockClient.auth.stopAutoRefresh();
  const view = render(<AuthProvider><Tree /></AuthProvider>);
  await waitFor(() => expect(auth.loading).toBe(false));
  expect(view.getByTestId('actor').props.children).toBe(A);
  expect(getCurrentHandle()?.userId).toBe(A);
  expect(await readPersistedSession()).toMatchObject({ user: { id: A }, refresh_token: expired ? 'launch-rotated-A' : credentials.refresh_token });
  expect(JSON.parse(await AsyncStorage.getItem(storageKey)).user.id).toBe(A);
  expect(await AsyncStorage.getItem(`${storageKey}-user`)).toBeNull();
  expect(transport).toHaveBeenCalledTimes(expired ? 1 : 0);
});

test.each([
  ['response', 'manual'], ['admitted storage write', 'manual'], ['admitted storage write', 'SIGNED_OUT'],
])('delayed password %s and logout 503 cannot restore A after provider remount (%s)', async (phase, mode) => {
  let view = render(<AuthProvider><Tree profile /></AuthProvider>);
  await signIn(A);
  const entered = barrier(); const release = barrier();
  const originalTransport = transport.getMockImplementation();
  const write = AsyncStorage.setItem.getMockImplementation();
  const storageKey = mockClient.auth.storageKey;
  transport.mockImplementation(async (url, init) => {
    if (String(url).includes('/user') && init.method === 'PUT' && phase === 'response') {
      entered.resolve(); await release.promise;
    }
    if (String(url).includes('/logout')) return new Response(JSON.stringify({ message: 'unavailable' }), { status: 503 });
    return originalTransport(url, init);
  });
  AsyncStorage.setItem.mockImplementation(async (key, value) => {
    if (key === storageKey && phase === 'admitted storage write') { entered.resolve(); await release.promise; }
    return write(key, value);
  });
  const inputs = view.UNSAFE_getAllByType(TextInput);
  ['secret', 'new-secret-123', 'new-secret-123'].forEach((value, i) => fireEvent.changeText(inputs[i], value));
  let change;
  act(() => { change = view.UNSAFE_getAllByType(Button).find(node => node.props.children === 'Change Password').props.onPress(); });
  await entered.promise;
  try {
    await act(async () => {
      if (mode === 'manual') await auth.signOut();
      else {
        await clearPersistedSession();
        await mockClient.auth._notifyAllSubscribers('SIGNED_OUT', null);
      }
    });
    await waitFor(() => expect(auth.user).toBeNull());
    expect(view.getByTestId('actor').props.children).toBe('signed-out');
    await act(async () => { release.resolve(); await change; await mockClient.auth.getSession(); });
    expect(await readPersistedSession()).toBeNull();
    expect(await AsyncStorage.getAllKeys()).not.toContain(storageKey);
    expect(view.queryByText('Password changed successfully')).toBeNull();
    if (phase === 'admitted storage write' && mode === 'manual') {
      expect(transport.mock.calls.some(([url, init]) => String(url).includes('/logout')
        && new Headers(init.headers).get('authorization') === `Bearer token-${A}`)).toBe(true);
    }
    view.unmount();
    view = render(<AuthProvider><Tree /></AuthProvider>);
    await waitFor(() => expect(auth.loading).toBe(false));
    expect(view.getByTestId('actor').props.children).toBe('signed-out');
    expect(getCurrentHandle()).toBeNull();
    expect(await readPersistedSession()).toBeNull();
  } finally { release.resolve(); await change; AsyncStorage.setItem.mockImplementation(write); }
});

test('Profile password change preserves the app session through revoke-others and token refresh', async () => {
  const sessions = new Map();
  let nextSessionId = 0;
  let password = 'secret';
  const issueSession = id => {
    const sessionId = `S${++nextSessionId}`;
    const value = { ...session(id), access_token: sessionId, refresh_token: `refresh-${sessionId}` };
    sessions.set(sessionId, value);
    return value;
  };
  transport.mockImplementation(async (url, init) => {
    const path = new URL(url);
    const body = init.body ? JSON.parse(init.body) : {};
    const sessionId = new Headers(init.headers).get('authorization')?.replace('Bearer ', '');
    if (path.pathname.endsWith('/token')) {
      if (path.searchParams.get('grant_type') === 'refresh_token') {
        const active = [...sessions.values()].find(value => value.refresh_token === body.refresh_token);
        return active ? json(active) : new Response(JSON.stringify({ code: 'refresh_token_not_found', message: 'Session revoked' }), { status: 400 });
      }
      if (body.password !== password) return new Response(JSON.stringify({ code: 'invalid_credentials', message: 'Invalid login credentials' }), { status: 400 });
      return json(issueSession(body.email.split('@')[0]));
    }
    if (path.pathname.endsWith('/user') && init.method === 'PUT') {
      const requester = sessions.get(sessionId);
      expect(requester).toBeDefined();
      password = body.password;
      // Supabase keeps the requesting session; every other session for this EA is revoked.
      for (const [id, value] of sessions) if (value.user.id === requester.user.id && id !== sessionId) sessions.delete(id);
      return json(requester.user);
    }
    if (path.pathname.endsWith('/logout')) { sessions.delete(sessionId); return json({}); }
    return json([]);
  });
  const view = render(<AuthProvider><Tree profile /></AuthProvider>);
  await signIn(A);
  const appHandle = getCurrentHandle();
  expect((await readPersistedSession()).access_token).toBe('S1');
  const inputs = view.UNSAFE_getAllByType(TextInput);
  ['secret', 'new-secret-123', 'new-secret-123'].forEach((value, i) => fireEvent.changeText(inputs[i], value));
  await act(async () => { await view.UNSAFE_getAllByType(Button).find(node => node.props.children === 'Change Password').props.onPress(); });
  expect(view.getByText('Password changed successfully')).toBeTruthy();
  expect(nextSessionId).toBe(2);
  let refreshed;
  await act(async () => { refreshed = await mockClient.auth.refreshSession(); });
  expect(refreshed.error).toBeNull();
  expect(refreshed.data.session.access_token).toBe('S1');
  expect([...sessions.keys()]).toEqual(['S1']);
  expect(getCurrentHandle()).toBe(appHandle);
  expect(view.getByTestId('actor').props.children).toBe(A);
  expect((await readPersistedSession()).access_token).toBe('S1');
});

test.each([B, A])('late Profile verification cannot replace the new handle for %s or update a password', async nextActor => {
  const view = render(<AuthProvider><Tree profile /></AuthProvider>);
  await signIn(A);
  const entered = barrier(); const release = barrier();
  transport.mockImplementation(async (url, init) => {
    if (String(url).includes('/token')) {
      const id = JSON.parse(init.body).email.split('@')[0];
      if (JSON.parse(init.body).password === 'current-secret') {
        entered.resolve(); await release.promise;
        return json({ ...session(A), access_token: 'isolated-verification-token', refresh_token: 'isolated-refresh-token' });
      }
      return json(session(id));
    }
    if (String(url).includes('/user')) return json(session(A).user);
    return json({});
  });
  const inputs = view.UNSAFE_getAllByType(TextInput);
  ['current-secret', 'new-secret-123', 'new-secret-123'].forEach((value, i) => fireEvent.changeText(inputs[i], value));
  let verification;
  act(() => { verification = view.UNSAFE_getAllByType(Button).find(node => node.props.children === 'Change Password').props.onPress(); });
  await entered.promise;
  await act(async () => { await auth.signOut(); await mockClient.auth.getSession(); });
  await signIn(nextActor);
  const newHandle = getCurrentHandle();
  await act(async () => { release.resolve(); await verification; });
  expect(view.getByTestId('actor').props.children).toBe(nextActor);
  expect(getCurrentHandle()).toBe(newHandle);
  expect(await readPersistedSession()).toMatchObject({ user: { id: nextActor }, access_token: `token-${nextActor}` });
  expect(transport.mock.calls.filter(([url, init]) => String(url).includes('/user') && init.method === 'PUT')).toEqual([]);
  expect(transport.mock.calls.some(([url, init]) => String(url).includes('/logout?scope=local')
    && new Headers(init.headers).get('authorization') === 'Bearer isolated-verification-token')).toBe(true);
  expect(view.queryByText('Password changed successfully')).toBeNull();
});

test('changePassword drops its result if the handle closes during isolated-session disposal', async () => {
  render(<AuthProvider><Tree /></AuthProvider>);
  await signIn(A);
  const entered = barrier(); const release = barrier();
  const originalTransport = transport.getMockImplementation();
  transport.mockImplementation(async (url, init) => {
    if (String(url).includes('/token') && JSON.parse(init.body).password === 'current-secret') {
      return json({ ...session(A), access_token: 'verification-S2', refresh_token: 'verification-refresh-S2' });
    }
    if (String(url).includes('/logout') && new Headers(init.headers).get('authorization') === 'Bearer verification-S2') {
      entered.resolve(); await release.promise;
    }
    return originalTransport(url, init);
  });
  let changing;
  act(() => { changing = auth.changePassword({ currentPassword: 'current-secret', newPassword: 'new-secret-123', handle: getCurrentHandle() }); });
  await entered.promise;
  try {
    await act(async () => { await auth.signOut(); });
    await signIn(B);
    let result;
    await act(async () => { release.resolve(); result = await changing; });
    expect(result.error).toMatchObject({ name: 'StaleActorError' });
    expect(auth.user.id).toBe(B);
    expect((await readPersistedSession()).user.id).toBe(B);
  } finally { release.resolve(); await changing; }
});

test('sign-in does not wait for a password update and its late A response cannot overwrite B', async () => {
  const view = render(<AuthProvider><Tree /></AuthProvider>);
  await signIn(A);
  const entered = barrier(); const release = barrier();
  const originalTransport = transport.getMockImplementation();
  transport.mockImplementation(async (url, init) => {
    if (String(url).includes('/user') && init.method === 'PUT') { entered.resolve(); await release.promise; }
    return originalTransport(url, init);
  });
  let change; let signingIn;
  act(() => { change = auth.changePassword({ currentPassword: 'secret', newPassword: 'new-secret-123', handle: getCurrentHandle() }); });
  await entered.promise;
  try {
    act(() => { signingIn = auth.signIn(`${B}@example.org`, 'secret'); });
    await waitFor(() => expect(getCurrentHandle()?.userId).toBe(B));
    expect((await readPersistedSession()).user.id).toBe(B);
    await act(async () => { release.resolve(); await change; await signingIn; });
    expect(view.getByTestId('actor').props.children).toBe(B);
    expect((await readPersistedSession()).user.id).toBe(B);
  } finally { release.resolve(); await Promise.allSettled([change, signingIn]); }
});

test('A password response between B storage commit and callback cannot replace persisted B', async () => {
  const view = render(<AuthProvider><Tree /></AuthProvider>);
  await signIn(A);
  const putEntered = barrier(); const releasePut = barrier();
  const bCommitted = barrier(); const releaseBCallback = barrier();
  const originalTransport = transport.getMockImplementation();
  const write = AsyncStorage.setItem.getMockImplementation();
  transport.mockImplementation(async (url, init) => {
    if (String(url).includes('/user') && init.method === 'PUT') { putEntered.resolve(); await releasePut.promise; }
    return originalTransport(url, init);
  });
  AsyncStorage.setItem.mockImplementation(async (key, value) => {
    await write(key, value);
    if (key === mockClient.auth.storageKey && JSON.parse(value).user?.id === B) {
      bCommitted.resolve(); await releaseBCallback.promise;
    }
  });
  let change; let signingIn;
  act(() => { change = auth.changePassword({ currentPassword: 'secret', newPassword: 'new-secret-123', handle: getCurrentHandle() }); });
  await putEntered.promise;
  try {
    act(() => { signingIn = auth.signIn(`${B}@example.org`, 'secret'); });
    await bCommitted.promise;
    expect((await readPersistedSession()).user.id).toBe(B);
    await act(async () => { releasePut.resolve(); await change; });
    await act(async () => { releaseBCallback.resolve(); expect((await signingIn).error).toBeNull(); });
    await waitFor(() => expect(getCurrentHandle()?.userId).toBe(B));
    expect(view.getByTestId('actor').props.children).toBe(B);
    expect(await readPersistedSession()).toMatchObject({ user: { id: B }, access_token: `token-${B}` });
  } finally {
    releasePut.resolve(); releaseBCallback.resolve();
    await Promise.allSettled([change, signingIn]);
    AsyncStorage.setItem.mockImplementation(write);
  }
});

test.each([false, true])('A refresh cannot take B pending login admission; failed login = %s', async fails => {
  const view = render(<AuthProvider><Tree /></AuthProvider>);
  await signIn(A);
  const bEntered = barrier(); const releaseB = barrier();
  const originalTransport = transport.getMockImplementation();
  transport.mockImplementation(async (url, init) => {
    if (String(url).includes('grant_type=refresh_token')) {
      return json({ ...session(A), access_token: 'rotated-A', refresh_token: 'rotated-refresh-A' });
    }
    if (String(url).includes('/token') && JSON.parse(init.body).email === `${B}@example.org`) {
      bEntered.resolve(); await releaseB.promise;
      if (fails) return new Response(JSON.stringify({ code: 'invalid_credentials', message: 'Invalid login credentials' }), { status: 400 });
    }
    return originalTransport(url, init);
  });
  let signingIn;
  act(() => { signingIn = auth.signIn(`  ${B}@EXAMPLE.ORG  `, 'secret'); });
  await bEntered.promise;
  try {
    await act(async () => { expect((await mockClient.auth.refreshSession()).error).toBeNull(); });
    // A's refresh is not allowed to persist while B owns admission.
    expect((await readPersistedSession()).access_token).toBe(`token-${A}`);
    let result;
    await act(async () => { releaseB.resolve(); result = await signingIn; });
    if (fails) {
      expect(result.error).toMatchObject({ message: 'Invalid login credentials', status: 400 });
      await act(async () => { expect((await mockClient.auth.refreshSession()).error).toBeNull(); });
      expect(await readPersistedSession()).toMatchObject({ user: { id: A }, access_token: 'rotated-A', refresh_token: 'rotated-refresh-A' });
    } else {
      expect(result.error).toBeNull();
      expect(await readPersistedSession()).toMatchObject({ user: { id: B }, access_token: `token-${B}` });
    }
    await waitFor(() => expect(getCurrentHandle()?.userId).toBe(fails ? A : B));
    expect(view.getByTestId('actor').props.children).toBe(fails ? A : B);
  } finally { releaseB.resolve(); await signingIn; }
});

test('failed sign-in from signed out restores revoked admission', async () => {
  const view = render(<AuthProvider><Tree /></AuthProvider>);
  await waitFor(() => expect(auth.loading).toBe(false));
  transport.mockImplementation(async () => new Response(JSON.stringify({ message: 'Invalid login credentials' }), { status: 400 }));
  await act(async () => { expect((await auth.signIn(`${B}@example.org`, 'wrong')).error).toMatchObject({ status: 400 }); });
  expect(view.getByTestId('actor').props.children).toBe('signed-out');
  expect(getCurrentHandle()).toBeNull();
  await mockClient.auth._saveSession(session(B));
  expect(await readPersistedSession()).toBeNull();
});

test('a late shared password update cannot publish A or show feedback after switching to B', async () => {
  const view = render(<AuthProvider><Tree profile /></AuthProvider>);
  await signIn(A);
  const entered = barrier(); const release = barrier();
  const originalTransport = transport.getMockImplementation();
  transport.mockImplementation(async (url, init) => {
    if (String(url).includes('/user') && init.method === 'PUT') { entered.resolve(); await release.promise; }
    return originalTransport(url, init);
  });
  const inputs = view.UNSAFE_getAllByType(TextInput);
  ['secret', 'new-secret-123', 'new-secret-123'].forEach((value, i) => fireEvent.changeText(inputs[i], value));
  let change;
  act(() => { change = view.UNSAFE_getAllByType(Button).find(node => node.props.children === 'Change Password').props.onPress(); });
  await entered.promise;
  let signingIn;
  try {
    await act(async () => { await auth.signOut(); });
    act(() => { signingIn = auth.signIn(`${B}@example.org`, 'secret'); });
    expect(getCurrentHandle()).toBeNull();
    expect(transport.mock.calls.filter(([url, init]) => String(url).includes('/token') && JSON.parse(init.body).email === `${B}@example.org`)).toHaveLength(0);
  } finally { release.resolve(); }
  await act(async () => { await change; await signingIn; });
  await waitFor(() => expect(getCurrentHandle()?.userId).toBe(B));
  expect(view.getByTestId('actor').props.children).toBe(B);
  expect(getCurrentHandle().userId).toBe(B);
  expect((await readPersistedSession()).user.id).toBe(B);
  expect(view.queryByText('Password changed successfully')).toBeNull();
  const updates = transport.mock.calls.filter(([url, init]) => String(url).includes('/user') && init.method === 'PUT');
  expect(updates).toHaveLength(1);
  expect(new Headers(updates[0][1].headers).get('authorization')).toBe(`Bearer token-${A}`);
});

test('a never-settling password PUT cannot block sign-out then B beyond the request bound', async () => {
  const view = render(<AuthProvider><Tree profile /></AuthProvider>);
  await signIn(A);
  const entered = barrier(); const release = barrier();
  let requestSignal;
  const originalTransport = transport.getMockImplementation();
  transport.mockImplementation(async (url, init) => {
    if (String(url).includes('/user') && init.method === 'PUT') {
      requestSignal = init.signal;
      entered.resolve(); await release.promise; // Deliberately ignore abort, like a stuck native transport.
    }
    return originalTransport(url, init);
  });
  const inputs = view.UNSAFE_getAllByType(TextInput);
  ['secret', 'new-secret-123', 'new-secret-123'].forEach((value, i) => fireEvent.changeText(inputs[i], value));
  let change; let signingIn;
  act(() => { change = view.UNSAFE_getAllByType(Button).find(node => node.props.children === 'Change Password').props.onPress(); });
  await entered.promise;
  const started = Date.now();
  try {
    await act(async () => { await auth.signOut(); });
    act(() => { signingIn = auth.signIn(`${B}@example.org`, 'secret'); });
    await act(async () => { await jest.advanceTimersByTimeAsync(AUTH_REQUEST_TIMEOUT_MS - 1); });
    expect(view.getByTestId('actor').props.children).toBe('signed-out');
    expect(transport.mock.calls.filter(([url, init]) => String(url).includes('/token') && JSON.parse(init.body).email === `${B}@example.org`)).toHaveLength(0);
    await act(async () => { await jest.advanceTimersByTimeAsync(1); });
    expect(view.getByTestId('actor').props.children).toBe(B);
    expect(getCurrentHandle()?.userId).toBe(B);
    expect((await readPersistedSession()).user.id).toBe(B);
    expect(Date.now() - started).toBe(AUTH_REQUEST_TIMEOUT_MS);
    expect(requestSignal.aborted).toBe(true);
    await act(async () => { release.resolve(); await change; await signingIn; });
    expect(view.getByTestId('actor').props.children).toBe(B);
    expect((await readPersistedSession()).user.id).toBe(B);
    expect(view.queryByText('Password changed successfully')).toBeNull();
  } finally {
    release.resolve(); await Promise.allSettled([change, signingIn]);
  }
});

test('grace-timeout sign-out also clears credentials and rejects a late refresh', async () => {
  const view = render(<AuthProvider><Tree /></AuthProvider>);
  await signIn(A);
  await act(async () => { await mockClient.auth._notifyAllSubscribers('USER_UPDATED', null); });
  await act(async () => { await jest.advanceTimersByTimeAsync(15_000); });
  expect(view.getByTestId('actor').props.children).toBe('signed-out');
  expect(await readPersistedSession()).toBeNull();
  await act(async () => { await mockClient.auth._notifyAllSubscribers('TOKEN_REFRESHED', session(A)); });
  await mockClient.auth._saveSession(session(A));
  expect(view.getByTestId('actor').props.children).toBe('signed-out');
  expect(await readPersistedSession()).toBeNull();
});

test.each([null, B])('a late SDK refresh cannot persist or publish A after switching to %s', async nextActor => {
  const view = render(<AuthProvider><Tree /></AuthProvider>);
  await signIn(A);
  const entered = barrier(); const release = barrier();
  const originalTransport = transport.getMockImplementation();
  transport.mockImplementation(async (url, init) => {
    if (String(url).includes('grant_type=refresh_token')) {
      entered.resolve(); await release.promise;
      return json({ ...session(A), access_token: 'late-refreshed-A' });
    }
    return originalTransport(url, init);
  });
  let refreshing;
  act(() => { refreshing = mockClient.auth.refreshSession(); });
  await entered.promise;
  try {
    if (nextActor) await signIn(nextActor);
    else await act(async () => { await auth.signOut(); });
    await act(async () => { release.resolve(); await refreshing; await mockClient.auth.getSession(); });
    expect(view.getByTestId('actor').props.children).toBe(nextActor || 'signed-out');
    const persisted = await readPersistedSession();
    if (nextActor) expect(persisted).toMatchObject({ user: { id: B }, access_token: `token-${B}` });
    else expect(persisted).toBeNull();
  } finally { release.resolve(); await refreshing; }
});

test.each(['storage removal', 'SDK sign-out'])('B sign-in waits for already-started %s cleanup before persisting', async phase => {
  render(<AuthProvider><Tree /></AuthProvider>);
  await signIn(A);
  const entered = barrier(); const release = barrier();
  const storageKey = mockClient.auth.storageKey;
  const remove = AsyncStorage.removeItem.getMockImplementation();
  const read = AsyncStorage.getItem.getMockImplementation();
  let cleared = false;
  let held = false;
  AsyncStorage.removeItem.mockImplementation(async key => {
    if (key === storageKey && phase === 'storage removal' && !held) { held = true; entered.resolve(); await release.promise; }
    await remove(key);
    if (key === storageKey) cleared = true;
  });
  AsyncStorage.getItem.mockImplementation(async key => {
    if (key === storageKey && phase === 'SDK sign-out' && cleared && !held) { held = true; entered.resolve(); await release.promise; }
    return read(key);
  });
  let closing; let signingIn;
  try {
    act(() => { closing = auth.signOut(); });
    await act(async () => { await entered.promise; });
    act(() => { signingIn = auth.signIn(`${B}@example.org`, 'secret'); });
    expect(transport.mock.calls.filter(([url, init]) => String(url).includes('/token') && JSON.parse(init.body).email === `${B}@example.org`)).toHaveLength(0);
    await act(async () => { release.resolve(); await closing; await signingIn; });
    await waitFor(() => expect(getCurrentHandle()?.userId).toBe(B));
    await act(async () => { await mockClient.auth.getSession(); });
    expect((await readPersistedSession()).user.id).toBe(B);
  } finally {
    release.resolve();
    AsyncStorage.removeItem.mockImplementation(remove);
    AsyncStorage.getItem.mockImplementation(read);
  }
});

test('manual sign-out and its SDK event are one cleanup even with delayed final token removal', async () => {
  const view = render(<AuthProvider><Tree /></AuthProvider>);
  await signIn(A);
  const sdkReadEntered = barrier(); const releaseSdkRead = barrier();
  const releaseFinalRemoval = barrier();
  const storageKey = mockClient.auth.storageKey;
  const remove = AsyncStorage.removeItem.getMockImplementation();
  const read = AsyncStorage.getItem.getMockImplementation();
  let tokenRemovals = 0; let heldRead = false; let heldFinalRemoval = false;
  let signedIn = false; let closing; let signingIn;
  AsyncStorage.removeItem.mockImplementation(async key => {
    if (key === storageKey) {
      tokenRemovals += 1;
      // Local clear, SDK clear, then the mandatory final clear; no reentrant cleanup.
      if (tokenRemovals === 3) { heldFinalRemoval = true; await releaseFinalRemoval.promise; }
    }
    return remove(key);
  });
  AsyncStorage.getItem.mockImplementation(async key => {
    if (key === storageKey && tokenRemovals === 1 && !heldRead) {
      heldRead = true; sdkReadEntered.resolve(); await releaseSdkRead.promise;
    }
    return read(key);
  });
  try {
    act(() => { closing = auth.signOut(); });
    await act(async () => { await sdkReadEntered.promise; });
    act(() => { signingIn = auth.signIn(`${B}@example.org`, 'secret').then(result => { signedIn = true; return result; }); });
    expect(transport.mock.calls.filter(([url, init]) => String(url).includes('/token') && JSON.parse(init.body).email === `${B}@example.org`)).toHaveLength(0);
    await act(async () => { releaseSdkRead.resolve(); });
    await waitFor(() => expect(heldFinalRemoval || signedIn).toBe(true));
    // B must remain behind the final durable clear, including the SDK event.
    await act(async () => { await Promise.resolve(); });
    expect(signedIn).toBe(false);
    await act(async () => { releaseFinalRemoval.resolve(); await closing; await signingIn; });
    await waitFor(() => expect(getCurrentHandle()?.userId).toBe(B));
    expect(view.getByTestId('actor').props.children).toBe(B);
    expect((await readPersistedSession())?.user.id).toBe(B);
    expect(tokenRemovals).toBe(3);
  } finally {
    releaseSdkRead.resolve(); releaseFinalRemoval.resolve();
    await Promise.allSettled([closing, signingIn]);
    AsyncStorage.removeItem.mockImplementation(remove);
    AsyncStorage.getItem.mockImplementation(read);
  }
});

test.each(['SIGNED_OUT', 'manual'])('%s cleanup while A opens finishes before B can persist a session', async mode => {
  const entered = barrier(); const release = barrier();
  sqlite.__setDatabaseFactory(async (name, options) => {
    if (name === `masi-${A}.db` && !options?.useNewConnection) { entered.resolve(); await release.promise; }
    return engine.openDatabaseAsync(name, options);
  });
  const view = render(<AuthProvider><Tree /></AuthProvider>);
  await act(async () => { await auth.signIn(`${A}@example.org`, 'secret'); });
  await entered.promise;
  let signOut;
  await act(async () => {
    if (mode === 'manual') signOut = auth.signOut();
    else {
      await clearPersistedSession();
      await mockClient.auth._notifyAllSubscribers('SIGNED_OUT', null);
    }
  });
  let signingIn;
  act(() => { signingIn = auth.signIn(`${B}@example.org`, 'secret'); });
  expect(transport.mock.calls.filter(([url, init]) => String(url).includes('/token') && JSON.parse(init.body).email === `${B}@example.org`)).toHaveLength(0);
  await act(async () => { release.resolve(); await signOut; await signingIn; });
  await waitFor(() => expect(getCurrentHandle()?.userId).toBe(B));
  // Drain the SDK lock too: a background signOut must not delete B later.
  await act(async () => { await mockClient.auth.getSession(); });
  expect((await readPersistedSession())?.user.id).toBe(B);
  expect(view.getByTestId('actor').props.children).toBe(B);
});

test('ignored stale SIGNED_OUT leaves queued data and a real sync pass authenticated as A', async () => {
  render(<AuthProvider><Tree /></AuthProvider>);
  await signIn(A);
  const a = getCurrentHandle();
  await a.repositories.timeEntries.saveTimeEntry({ id: 'entry-a', user_id: A, sign_in_time: '2026-10-15T08:00:00Z' });
  await act(async () => { await mockClient.auth._notifyAllSubscribers('SIGNED_OUT', null); });
  expect(auth.user.id).toBe(A);
  expect(await a.enqueueRequest(() => a.dataClient.from('children').select('id'))).toMatchObject({ error: null });
  expect(await a.services.syncEngine.syncAll()).toMatchObject({ success: true, totalSynced: 1 });
  const requests = transport.mock.calls.filter(([url]) => String(url).includes('/rest/v1/'));
  expect(requests.map(([url, init]) => ({ table: new URL(url).pathname.split('/').pop(), auth: new Headers(init.headers).get('authorization') }))).toEqual([
    { table: 'children', auth: `Bearer token-${A}` },
    { table: 'time_entries', auth: `Bearer token-${A}` },
  ]);
});

test('online warm-cache startup and reconnect refresh programme assignments and academic years without blocking readiness', async () => {
  const a = await requestOpen({ userId: A });
  await a.repositories.schools.replaceFromServer([{ id: 'school', name: 'School' }]);
  await a.repositories.programmes.replaceFromServer([{ id: 'old', code: 'old', name: 'Old' }]);
  await a.repositories.academicYears.replaceFromServer([{ id: 'year', label: '2025', starts_on: '2025-01-01', ends_on: '2025-12-31', is_active: true }]);
  await a.repositories.staffProgrammeAssignments.replaceFromServer([{ id: 'assignment', user_id: A, programme_id: 'old' }]);
  await requestClose({ reason: 'warm restart' });
  mockNetwork = { isConnected: true };
  const entered = barrier(); const release = barrier();
  let label = '2026';
  const referenceRows = table => ({
    schools: [{ id: 'school', name: 'School' }],
    programmes: [{ id: 'old', code: 'old', name: 'Old' }, { id: 'new', code: 'new', name: 'New' }],
    academic_years: [{ id: 'year', label, starts_on: '2026-01-01', ends_on: '2026-12-31', is_active: true }],
    staff_programme_assignments: [{ id: 'assignment', user_id: A, programme_id: 'new' }],
  }[table] || []);
  transport.mockImplementation(async (url, init) => {
    if (String(url).includes('/token')) return json(session(A));
    const table = new URL(url).pathname.split('/').pop();
    if (table === 'users') return json(session(A).user);
    if (table === 'schools') { entered.resolve(); await release.promise; }
    return json(referenceRows(table));
  });
  render(<AuthProvider><Tree /></AuthProvider>);
  await signIn(A);
  try {
    await waitFor(() => expect(transport.mock.calls.some(([url]) => String(url).includes('/schools'))).toBe(true));
    const handle = getCurrentHandle();
    let ready = false;
    const readiness = handle.services.referenceDataReady().then(() => { ready = true; });
    await waitFor(() => expect(ready).toBe(true));
    expect((await handle.repositories.academicYears.getAll())[0].label).toBe('2025');
    // Repeated online notifications must join the same refresh, not queue duplicates.
    await act(async () => { for (const listener of mockNetListeners) { listener(mockNetwork); listener(mockNetwork); } });
    release.resolve(); await readiness;
    await waitFor(async () => expect((await handle.repositories.staffProgrammeAssignments.getAll())[0].programme_id).toBe('new'));
    expect((await handle.repositories.academicYears.getAll())[0].label).toBe('2026');
    expect(transport.mock.calls.filter(([url]) => String(url).includes('/academic_years'))).toHaveLength(1);
    label = '2027';
    await act(async () => {
      for (const listener of mockNetListeners) listener({ isConnected: false });
      for (const listener of mockNetListeners) listener({ isConnected: true });
    });
    await waitFor(async () => expect((await handle.repositories.academicYears.getAll())[0].label).toBe('2027'));
    expect(transport.mock.calls.filter(([url]) => String(url).includes('/academic_years'))).toHaveLength(2);
  } finally { release.resolve(); }
});

test('reconnect during a failing reference refresh owes one fresh pass and updates the warm cache', async () => {
  const cached = await requestOpen({ userId: A });
  await cached.repositories.schools.replaceFromServer([{ id: 'school', name: 'School' }]);
  await cached.repositories.programmes.replaceFromServer([{ id: 'programme', code: 'literacy', name: 'Literacy' }]);
  await cached.repositories.academicYears.replaceFromServer([{ id: 'year', label: '2025', starts_on: '2025-01-01', ends_on: '2025-12-31', is_active: true }]);
  await requestClose({ reason: 'warm restart' });
  mockNetwork = { isConnected: true };
  const entered = barrier(); const release = barrier();
  let schoolRequests = 0;
  transport.mockImplementation(async (url, init) => {
    if (String(url).includes('/token')) return json(session(A));
    const table = new URL(url).pathname.split('/').pop();
    if (table === 'users') return json(session(A).user);
    if (table === 'schools') {
      schoolRequests += 1;
      if (schoolRequests === 1) { entered.resolve(); await release.promise; throw new TypeError('Network request failed'); }
    }
    return json({
      schools: [{ id: 'school', name: 'School' }],
      programmes: [{ id: 'programme', code: 'literacy', name: 'Literacy' }],
      academic_years: [{ id: 'year', label: '2026', starts_on: '2026-01-01', ends_on: '2026-12-31', is_active: true }],
      staff_programme_assignments: [{ id: 'assignment', user_id: A, programme_id: 'programme' }],
    }[table] || []);
  });
  render(<AuthProvider><Tree /></AuthProvider>);
  await signIn(A);
  const handle = getCurrentHandle();
  try {
    await entered.promise;
    await handle.services.referenceDataReady();
    expect((await handle.repositories.academicYears.getAll())[0].label).toBe('2025');
    await act(async () => {
      // Multiple new edges while the first request is held coalesce to one pass.
      for (let edge = 0; edge < 3; edge += 1) {
        for (const listener of mockNetListeners) listener({ isConnected: false });
        for (const listener of mockNetListeners) listener({ isConnected: true });
      }
      release.resolve();
    });
    await waitFor(async () => expect((await handle.repositories.academicYears.getAll())[0].label).toBe('2026'));
    await waitFor(async () => expect((await handle.repositories.staffProgrammeAssignments.getAll())[0]?.programme_id).toBe('programme'));
    expect(schoolRequests).toBe(2);
  } finally { release.resolve(); }
});

test.each(['no newer request', 'offline again', 'closed handle'])('failed reference refresh starts no follow-up with %s', async mode => {
  const entered = barrier(); const release = barrier();
  const failures = jest.spyOn(console, 'error').mockImplementation(() => {});
  mockNetwork = { isConnected: true };
  let schoolRequests = 0;
  transport.mockImplementation(async (url, init) => {
    if (String(url).includes('/token')) return json(session(A));
    const table = new URL(url).pathname.split('/').pop();
    if (table === 'users') return json(session(A).user);
    if (table === 'schools') {
      schoolRequests += 1;
      entered.resolve(); await release.promise;
      throw new TypeError('Network request failed');
    }
    return json([]);
  });
  render(<AuthProvider><Tree /></AuthProvider>);
  await signIn(A);
  await entered.promise;
  try {
    if (mode !== 'no newer request') {
      await act(async () => {
        for (const listener of mockNetListeners) listener({ isConnected: false });
        for (const listener of mockNetListeners) listener({ isConnected: true });
        if (mode === 'offline again') for (const listener of mockNetListeners) listener({ isConnected: false });
        if (mode === 'closed handle') await auth.signOut();
      });
    }
    await act(async () => { release.resolve(); });
    if (mode !== 'closed handle') {
      await waitFor(() => expect(failures).toHaveBeenCalledWith('Error refreshing reference data:', expect.anything()));
    }
    expect(schoolRequests).toBe(1);
  } finally { release.resolve(); }
});

test('online transition and reconnect nonce during initial SQLite reads run one server pass per roster and never route to ClassOnboarding', async () => {
  const view = render(<AuthProvider><Tree /></AuthProvider>);
  await signIn(A);
  const a = getCurrentHandle();
  const school = { id: 'school', name: 'School' };
  const programme = { id: 'programme', code: 'literacy', name: 'Literacy' };
  const year = { id: 'year', label: '2026', starts_on: '2026-01-01', ends_on: '2026-12-31', is_active: true };
  const assignment = { id: 'spa', user_id: A, programme_id: programme.id };
  await a.repositories.schools.replaceFromServer([school]);
  await a.repositories.programmes.replaceFromServer([programme]);
  await a.repositories.academicYears.replaceFromServer([year]);
  await a.repositories.staffProgrammeAssignments.replaceFromServer([assignment]);
  const child = { id: 'child', first_name: 'Server', last_name: 'Child', class_id: 'class', academic_year_id: year.id, created_by: A };
  const classroom = { id: 'class', name: 'Class', school_id: school.id, grade: '1', academic_year_id: year.id, created_by: A };
  const cea = { id: 'cea', user_id: A, child_id: child.id, assigned_at: '2026-01-01', created_by: A };
  const cpe = { id: 'cpe', child_id: child.id, programme_id: programme.id, enrolled_at: '2026-01-01', created_by: A };
  const ccm = { id: 'ccm', child_id: child.id, class_id: classroom.id, academic_year_id: year.id, entered_at: '2026-01-01', created_by: A };
  const classAssignment = { id: 'class-assignment', class_id: classroom.id, ea_user_id: A, programme_id: programme.id, assigned_at: '2026-01-01', created_by: A };
  const rows = { schools: [school], programmes: [programme], academic_years: [year], staff_programme_assignments: [assignment],
    children: [child], child_ea_assignments: [{ ...cea, children: child }], child_programme_enrollments: [cpe],
    child_class_memberships: [{ ...ccm, classes: classroom }], classes: [{ ...classroom, class_ea_assignments: [classAssignment] }] };
  const snapshot = { schema_version: 1, complete: true, user_id: A, active_programme_id: programme.id,
    child_ea_assignment_ids: [cea.id], assigned_child_ids: [child.id], visible_child_ids: [child.id],
    child_programme_enrollment_ids: [cpe.id], child_class_membership_ids: [ccm.id], class_ea_assignment_ids: [classAssignment.id],
    class_ids: [classroom.id], group_ea_assignment_ids: [], group_ids: [], child_group_membership_ids: [] };
  transport.mockImplementation(async (url, init) => {
    if (String(url).includes('/token')) return json(session(A));
    const table = new URL(url).pathname.split('/').pop();
    if (table === 'users') return json(session(A).user);
    if (table === 'get_reconcile_acknowledgments') return json(snapshot);
    return json(rows[table] || []);
  });
  const release = barrier(); const childEntered = barrier(); const classEntered = barrier();
  for (const [repository, method, entered] of [[a.repositories.children, 'getMyChildren', childEntered], [a.repositories.classes, 'getClasses', classEntered]]) {
    const read = repository[method];
    jest.spyOn(repository, method).mockImplementationOnce(async (...args) => {
      const cached = await read(...args); entered.resolve(); await release.promise; return cached;
    });
  }
  view.rerender(<AuthProvider><Tree rosters /></AuthProvider>);
  await act(async () => { await Promise.all([childEntered.promise, classEntered.promise]); });
  try {
    mockNetwork = { isConnected: true, isInternetReachable: true };
    await act(async () => { for (const listener of mockNetListeners) listener(mockNetwork); });
    await waitFor(() => expect(roster.offline.domainPullNonce).toBeGreaterThan(0));
    await act(async () => { release.resolve(); });
    await waitFor(() => expect(roster.children.children.map(row => row.id)).toEqual([child.id]));
    await waitFor(() => expect(roster.classes.classes.map(row => row.id)).toEqual([classroom.id]));
    await waitFor(() => expect(roster.classes.loading || roster.children.loading).toBe(false));
    expect(bootstrapStates).not.toContain('unconfirmed_empty');
    expect(bootstrapStates).not.toContain('confirmed_empty');
    expect(navigation.navigate).not.toHaveBeenCalledWith('ClassOnboarding');
    for (const table of ['children', 'classes']) {
      expect(transport.mock.calls.filter(([url]) => new URL(url).pathname === `/rest/v1/${table}`)).toHaveLength(1);
    }
  } finally { release.resolve(); }
});

test('a failed initial profile request leaves New Session retryable and Retry opens the literacy form', async () => {
  mockNetwork = { isConnected: true };
  const failures = jest.spyOn(console, 'error').mockImplementation(() => {});
  const originalTransport = transport.getMockImplementation();
  let fail = true;
  transport.mockImplementation(async (url, init) => {
    if (new URL(url).pathname === '/rest/v1/users') {
      if (fail) return new Response(JSON.stringify({ message: 'Profile unavailable' }), { status: 503 });
      return json({ id: A, job_title_lookup: { code: 'literacy_coach', name: 'Literacy Coach' } });
    }
    return originalTransport(url, init);
  });
  const view = render(<AuthProvider><Tree sessionForm /></AuthProvider>);
  await signIn(A);
  await waitFor(() => expect(failures).toHaveBeenCalledWith('Error loading profile:', expect.anything()));
  expect(view.queryByText(/coming soon/) === null).toBe(true);
  expect(view.getByText('Loading your profile...')).toBeTruthy();
  expect(transport.mock.calls.filter(([url]) => String(url).includes('/rest/v1/users'))).toHaveLength(1);
  fail = false;
  fireEvent.press(view.getByText('Retry'));
  await waitFor(() => expect(view.getByText('Literacy session form')).toBeTruthy());
  expect(view.queryByText('Loading your profile...')).toBeNull();
  expect(transport.mock.calls.filter(([url]) => String(url).includes('/rest/v1/users'))).toHaveLength(2);
});

test('ClassesContext never confirms an empty roster after a partial reference refresh fails', async () => {
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  const view = render(<AuthProvider><Tree /></AuthProvider>);
  await signIn(A);
  const handle = getCurrentHandle();
  const school = { id: 'school', name: 'School' };
  const programme = { id: 'programme', code: 'literacy', name: 'Literacy' };
  const year = { id: 'year', label: '2026', starts_on: '2026-01-01', ends_on: '2026-12-31', is_active: true };
  const classroom = { id: 'class', name: 'Class', school_id: school.id, grade: '1', academic_year_id: year.id, created_by: A };
  const assignment = { id: 'class-assignment', class_id: classroom.id, ea_user_id: A, programme_id: programme.id, assigned_at: '2026-01-01', created_by: A };
  let fail = true;
  transport.mockImplementation(async (url) => {
    const table = new URL(url).pathname.split('/').pop();
    if (table === 'teachers' && fail) return new Response(JSON.stringify({ message: 'Reference refresh failed' }), { status: 503 });
    if (table === 'users') return json(session(A).user);
    if (table === 'get_reconcile_acknowledgments') return json({ schema_version: 1, complete: true, user_id: A, active_programme_id: programme.id,
      child_ea_assignment_ids: [], assigned_child_ids: [], visible_child_ids: [], child_programme_enrollment_ids: [],
      child_class_membership_ids: [], class_ea_assignment_ids: [assignment.id], class_ids: [classroom.id],
      group_ea_assignment_ids: [], group_ids: [], child_group_membership_ids: [] });
    return json({ schools: [school], programmes: [programme], academic_years: [year],
      staff_programme_assignments: [{ id: 'staff', user_id: A, programme_id: programme.id }],
      classes: [{ ...classroom, class_ea_assignments: [assignment] }],
    }[table] || []);
  });
  await expect(handle.services.pullReferenceData()).rejects.toMatchObject({ message: 'Reference refresh failed' });
  expect(await handle.repositories.staffProgrammeAssignments.getAll()).toEqual([]);
  mockNetwork = { isConnected: true };
  view.rerender(<AuthProvider><Tree rosters /></AuthProvider>);
  await waitFor(() => expect(roster?.classes.loading).toBe(false));
  expect(bootstrapStates).not.toContain('confirmed_empty');
  expect(roster.classes.classBootstrapStatus).toBe('unconfirmed_empty');
  expect(errors).toHaveBeenCalledWith('Error in pullFromServer:', expect.anything());
  fail = false;
  await act(async () => { await roster.classes.loadClasses(); });
  await waitFor(() => expect(roster.classes.classes.map(row => row.id)).toEqual([classroom.id]));
  expect(roster.classes.classBootstrapStatus).toBe('available');
  expect(bootstrapStates).not.toContain('confirmed_empty');
});
