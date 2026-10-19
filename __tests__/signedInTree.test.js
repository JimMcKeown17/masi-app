import React from 'react';
import { Text, AppState } from 'react-native';
import { act, render, waitFor, cleanup, fireEvent } from '@testing-library/react-native';
import NetInfo from '@react-native-community/netinfo';
import { App } from '../App';
import { useAuth } from '../src/context/AuthContext';
import { useChildren } from '../src/context/ChildrenContext';
import { getCurrentHandle, requestOpen, requestClose, resetHandleRegistryForTests, getLatestAuthSession, whenDisposed } from '../src/session/signedInHandle';
import * as engine from '../test-support/expoSQLiteRealEngine';
import * as sqlite from 'expo-sqlite';
import { CURRENT_SCHEMA_VERSION, runMigrations } from '../src/db/migrations';

jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

global.__MASI_NO_DEFAULT_HANDLE__ = true;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const mockAuthListeners = new Set();
const mockNetListeners = new Set();
const mockAppListeners = new Set();
let mockAuth;
let mockPersisted = null;
const mockChildRenders = [];
const barrier = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: { auth: {
  onAuthStateChange: (fn) => { mockAuthListeners.add(fn); return { data: { subscription: { unsubscribe: () => mockAuthListeners.delete(fn) } } }; },
  signOut: jest.fn(async () => ({})),
} } }));
jest.mock('../src/services/persistedAuthSession', () => ({
  readPersistedSession: async () => mockPersisted,
  clearPersistedSession: async () => { mockPersisted = null; },
}));
jest.mock('../src/session/handleDataClient', () => ({ createHandleDataClient: () => {
  const query = new Proxy({}, { get: (_, key) => key === 'then'
    ? (resolve) => Promise.resolve({ error: { message: 'offline', code: '' }, data: null }).then(resolve)
    : () => query });
  return { from: () => query, rpc: () => query };
} }));
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(async () => ({ isConnected: false, isInternetReachable: false })),
  addEventListener: (fn) => { mockNetListeners.add(fn); fn({ isConnected: false }); return () => mockNetListeners.delete(fn); },
}));
jest.mock('../src/services/locationService', () => ({ getCurrentPosition: jest.fn() }));
jest.mock('../src/services/observability', () => ({
  initializeObservability: jest.fn(), wrapAppWithObservability: (c) => c,
  captureOperationalError: jest.fn(), flushObservability: jest.fn(), reportSyncStatus: jest.fn(), reportSyncResult: jest.fn(),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
jest.mock('react-native-paper', () => ({ ...jest.requireActual('react-native-paper'), PaperProvider: ({ children }) => children }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: ({ children }) => children, SafeAreaView: ({ children }) => children, useSafeAreaInsets: () => ({ top: 0 }) }));
jest.mock('../src/navigation/AppNavigator', () => {
  const React = require('react'); const { Text } = require('react-native');
  const { useAuth } = require('../src/context/AuthContext');
  const { useChildren } = require('../src/context/ChildrenContext');
  function Roster() {
    const { children, loading } = useChildren();
    const label = loading ? 'Roster loading' : children.length ? children.map((c) => c.first_name).join(',') : 'No children';
    mockChildRenders.push(label);
    return <Text>{label}</Text>;
  }
  return ({ signedIn }) => { mockAuth = useAuth(); return signedIn ? <><Text>{mockAuth.user.id}</Text><Roster /></> : <Text>Login</Text>; };
});
const emit = async (event, userId) => {
  await act(async () => {
    await Promise.all([...mockAuthListeners].map((fn) => fn(event, userId ? { user: { id: userId }, access_token: `token-${userId}` } : null)));
  });
};
beforeEach(async () => {
  await resetHandleRegistryForTests(); await engine.__resetMockDatabases();
  sqlite.__setDatabaseFactory(engine.openDatabaseAsync);
  mockPersisted = null; mockChildRenders.length = 0;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, fn) => {
    mockAppListeners.add(fn); return { remove: () => mockAppListeners.delete(fn) };
  });
});
afterEach(async () => { cleanup(); await resetHandleRegistryForTests(); await engine.__resetMockDatabases(); jest.restoreAllMocks(); });

test('T1 signed out opens no domain database; A and B open their own files', async () => {
  const view = render(<App />);
  await waitFor(() => expect(mockAuthListeners.size).toBe(1));
  await emit('INITIAL_SESSION');
  expect(view.getByText('Login')).toBeTruthy();
  expect(engine.openDatabaseAsync.mock.calls.filter(([name]) => name !== ':memory:')).toEqual([]);
  await emit('SIGNED_IN', A);
  await waitFor(() => expect(view.getByText(A)).toBeTruthy());
  await act(async () => { await mockAuth.signOut(); });
  expect(view.getByText('Login')).toBeTruthy();
  await emit('SIGNED_IN', B);
  await waitFor(() => expect(view.getByText(B)).toBeTruthy());
  expect(engine.openDatabaseAsync.mock.calls.map(([name]) => name)).toEqual(expect.arrayContaining([`masi-${A}.db`, `masi-${B}.db`]));
  expect(engine.openDatabaseAsync.mock.calls.map(([name]) => name)).not.toContain('masi.db');
});

test('T2 offline persisted A sees loading then cached children, never empty', async () => {
  const a = await requestOpen({ userId: A });
  await a.withTransaction(async (tx) => {
    await tx.runAsync("insert into programmes(id,code,name) values ('literacy','literacy','Literacy')");
    await tx.runAsync("insert into academic_years(id,label,starts_on,ends_on,is_active) values ('year','2026','2026-01-01','2026-12-31',1)");
    await tx.runAsync("insert into schools(id,name) values ('school','School')");
    await tx.runAsync("insert into classes(id,name,school_id,grade,academic_year_id) values ('class','Class','school','1','year')");
    await tx.runAsync("insert into staff_programme_assignments(id,user_id,programme_id,assigned_at) values ('assignment',?,'literacy','2026-01-01')", A);
  });
  await a.repositories.children.save({ id: 'child', first_name: 'Cached child', last_name: 'A', class_id: 'class', academic_year_id: 'year', programme_id: 'literacy', created_by: A }, { actorUserId: A });
  await requestClose({ reason: 'cold start' });
  mockPersisted = { user: { id: A }, refresh_token: 'persisted' };
  const view = render(<App />);
  expect(view.getByText('Preparing your offline data')).toBeTruthy();
  await waitFor(() => expect(mockAuthListeners.size).toBe(1));
  await emit('INITIAL_SESSION');
  await waitFor(() => expect(view.getByText('Cached child')).toBeTruthy());
  expect(mockChildRenders).not.toContain('No children');
  expect(getLatestAuthSession()).toBeNull();
});

test('T14 closing A removes all its timers and listeners before B mounts', async () => {
  const timers = new Set(); const intervals = new Set();
  const originalTimeout = global.setTimeout; const originalClear = global.clearTimeout;
  const originalInterval = global.setInterval; const originalClearInterval = global.clearInterval;
  jest.spyOn(global, 'setTimeout').mockImplementation((fn, ms, ...args) => {
    let id; id = originalTimeout(() => { timers.delete(id); fn(...args); }, ms); timers.add(id); return id;
  });
  jest.spyOn(global, 'clearTimeout').mockImplementation((id) => { timers.delete(id); return originalClear(id); });
  jest.spyOn(global, 'setInterval').mockImplementation((...args) => { const id = originalInterval(...args); intervals.add(id); return id; });
  jest.spyOn(global, 'clearInterval').mockImplementation((id) => { intervals.delete(id); return originalClearInterval(id); });
  global.setTimeout._isMockFunction = false;
  const view = render(<App />);
  await waitFor(() => expect(mockAuthListeners.size).toBe(1)); await emit('INITIAL_SESSION');
  const baseline = { net: mockNetListeners.size, app: mockAppListeners.size, timers: timers.size, intervals: intervals.size };
  await emit('SIGNED_IN', A); await waitFor(() => expect(view.getByText(A)).toBeTruthy());
  expect(mockNetListeners.size).toBeGreaterThan(baseline.net);
  await act(async () => { await mockAuth.signOut(); });
  // Assert outside waitFor: its own polling interval is not part of the app tree.
  expect({ net: mockNetListeners.size, app: mockAppListeners.size, timers: timers.size, intervals: intervals.size }).toEqual(baseline);
  await emit('SIGNED_IN', B); await waitFor(() => expect(view.getByText(B)).toBeTruthy());
});

test('logical sign-out and B publication do not wait for A native disposal', async () => {
  const entered = barrier(); const release = barrier();
  let aWriter;
  sqlite.__setDatabaseFactory(async (name, options) => {
    const db = await engine.openDatabaseAsync(name, options);
    if (name === `masi-${A}.db` && !options?.useNewConnection) {
      aWriter = db;
      const run = db.runAsync.bind(db);
      jest.spyOn(db, 'runAsync').mockImplementation(async (sql, ...args) => {
        if (sql.includes("'held'")) { entered.resolve(); await release.promise; }
        return run(sql, ...args);
      });
      jest.spyOn(db, 'closeAsync');
    }
    return db;
  });
  const view = render(<App />); await waitFor(() => expect(mockAuthListeners.size).toBe(1));
  await emit('SIGNED_IN', A); await waitFor(() => expect(view.getByText(A)).toBeTruthy());
  const a = getCurrentHandle();
  const pending = a.withTransaction((tx) => tx.runAsync("insert into local_state(key,value,updated_at) values ('held','1','now')"));
  const rejected = expect(pending).rejects.toMatchObject({ name: 'StaleActorError' });
  await entered.promise;
  try {
    await act(async () => { await mockAuth.signOut(); });
    expect(view.getByText('Login')).toBeTruthy();
    expect(aWriter.closeAsync).not.toHaveBeenCalled();
    await emit('SIGNED_IN', B); await waitFor(() => expect(view.getByText(B)).toBeTruthy());
    expect(aWriter.closeAsync).not.toHaveBeenCalled();
  } finally { release.resolve(); }
  await rejected; await whenDisposed(`masi-${A}.db`);
  expect(aWriter.closeAsync).toHaveBeenCalledTimes(1);
  expect(view.getByText(B)).toBeTruthy(); expect(getCurrentHandle().userId).toBe(B);
});

test('a failed handle open shows the extracted failure UI and Retry opens again', async () => {
  const view = render(<App />); await waitFor(() => expect(mockAuthListeners.size).toBe(1));
  sqlite.__setDatabaseFactory(async (name, options) => { if (name !== ':memory:') throw new Error('open failed'); return engine.openDatabaseAsync(name, options); });
  await emit('SIGNED_IN', A);
  await waitFor(() => expect(view.getByText('We could not open your offline data')).toBeTruthy());
  sqlite.__setDatabaseFactory(engine.openDatabaseAsync);
  fireEvent.press(view.getByText('Try again'));
  await waitFor(() => expect(view.getByText(A)).toBeTruthy());
});

test('a newer EA database reaches the update screen and Sign out returns to login', async () => {
  const db = await engine.openDatabaseAsync(`masi-${A}.db`);
  await runMigrations(db);
  await db.execAsync(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION + 86}`);
  await db.closeAsync();
  const view = render(<App />);
  await waitFor(() => expect(mockAuthListeners.size).toBe(1));
  await emit('SIGNED_IN', A);

  expect(await view.findByText('Update Masi to continue')).toBeTruthy();
  expect(view.getByText('Support code: SCHEMA_TOO_NEW')).toBeTruthy();
  expect(view.queryByText(/try again/i)).toBeNull();
  expect(getCurrentHandle()).toBeNull();
  expect(mockChildRenders).toEqual([]);
  await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Sign out' })); });
  expect(await view.findByText('Login')).toBeTruthy();
  expect(view.queryByText('Update Masi to continue')).toBeNull();
});
