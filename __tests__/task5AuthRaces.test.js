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
import { OfflineProvider, useOffline } from '../src/context/OfflineContext';
import { ChildrenProvider, useChildren } from '../src/context/ChildrenContext';
import { ClassesProvider, useClasses } from '../src/context/ClassesContext';
import { readPersistedSession, clearPersistedSession } from '../src/services/persistedAuthSession';
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
const bootstrapStates = [];
jest.mock('../src/services/supabaseClient', () => ({ ...require('../test-support/supabaseTestConfig'), supabase: { get auth() { return mockClient.auth; } } }));
jest.mock('@react-native-community/netinfo', () => ({ fetch: async () => mockNetwork, addEventListener: fn => { mockNetListeners.add(fn); return () => mockNetListeners.delete(fn); } }));
jest.mock('@react-navigation/native', () => ({ NavigationContext: require('react').createContext(null), useFocusEffect: fn => require('react').useEffect(fn, [fn]) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
jest.mock('../src/hooks/useTimeTracking', () => ({ useTimeTracking: () => ({ isSignedIn: false }) }));

function Roster() {
  roster = { children: useChildren(), classes: useClasses(), offline: useOffline() };
  bootstrapStates.push(roster.classes.classBootstrapStatus);
  return <PaperProvider><HomeScreen navigation={navigation} /></PaperProvider>;
}

function Tree({ profile = false, rosters = false }) {
  auth = useAuth();
  return <><Text testID="actor">{auth.user?.id || 'signed-out'}</Text>{auth.user && auth.handle && <SignedInEAProvider key={`${auth.handle.userId}:${auth.handle.epoch}`} handle={auth.handle}>
    {profile ? <PaperProvider><ProfileScreen navigation={{ navigate: jest.fn() }} /></PaperProvider> : null}
    {rosters ? <OfflineProvider><ChildrenProvider><ClassesProvider><Roster /></ClassesProvider></ChildrenProvider></OfflineProvider> : null}
  </SignedInEAProvider>}</>;
}
const signIn = async id => {
  await act(async () => { expect((await auth.signIn(`${id}@example.org`, 'secret')).error).toBeNull(); });
  await waitFor(() => expect(getCurrentHandle()?.userId).toBe(id));
};
beforeEach(async () => {
  await resetHandleRegistryForTests(); await engine.__resetMockDatabases(); await AsyncStorage.clear();
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
    auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (...args) => transport(...args) },
  });
  await mockClient.auth.initialize();
});
afterEach(async () => { cleanup(); await mockClient.auth.stopAutoRefresh(); await resetHandleRegistryForTests(); await engine.__resetMockDatabases(); jest.restoreAllMocks(); });

test.each([B, A])('late Profile verification cannot replace the new handle for %s or update a password', async nextActor => {
  const view = render(<AuthProvider><Tree profile /></AuthProvider>);
  await signIn(A);
  const entered = barrier(); const release = barrier();
  transport.mockImplementation(async (url, init) => {
    if (String(url).includes('/token')) {
      const id = JSON.parse(init.body).email.split('@')[0];
      if (JSON.parse(init.body).password === 'current-secret') {
        entered.resolve(); await release.promise;
        return json({ ...session(A), access_token: 'isolated-verification-token' });
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
  expect(view.queryByText('Password changed successfully')).toBeNull();
});

test('a late isolated password update cannot publish A or show feedback after switching to B', async () => {
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
  try {
    await act(async () => { await auth.signOut(); });
    await signIn(B);
  } finally { release.resolve(); }
  await act(async () => { await change; });
  expect(view.getByTestId('actor').props.children).toBe(B);
  expect(getCurrentHandle().userId).toBe(B);
  expect((await readPersistedSession()).user.id).toBe(B);
  expect(view.queryByText('Password changed successfully')).toBeNull();
  const updates = transport.mock.calls.filter(([url, init]) => String(url).includes('/user') && init.method === 'PUT');
  expect(updates).toHaveLength(1);
  expect(new Headers(updates[0][1].headers).get('authorization')).toBe(`Bearer token-${A}`);
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

test.each(['SIGNED_OUT', 'manual'])('%s cleanup superseded while A opens preserves B persisted session', async mode => {
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
  await act(async () => { await auth.signIn(`${B}@example.org`, 'secret'); });
  expect((await readPersistedSession()).user.id).toBe(B);
  await act(async () => { release.resolve(); await signOut; });
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
