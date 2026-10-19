import { SignedInEAProvider } from '../src/context/SignedInEAContext';
import { resetHandleRegistryForTests } from '../src/session/signedInHandle';
import * as engine from '../test-support/expoSQLiteRealEngine';
import * as sqlite from 'expo-sqlite';
jest.mock('@react-native-community/netinfo', () => ({ fetch: async () => ({ isConnected: true }), addEventListener: () => () => {} }));
jest.mock('../src/session/handleDataClient', () => ({ createHandleDataClient: () => require('../src/services/supabaseClient').supabase }));
jest.mock('../src/session/handleServices', () => ({
  createHandleServices: (handle) => ({
    ...jest.requireActual('../src/session/handleServices').createHandleServices(handle),
    deviceProfile: { get: (...args) => mockDeviceProfile.getUserProfile(...args), save: (...args) => mockDeviceProfile.saveUserProfile(...args) },
    pullReferenceData: (...args) => mockPullReferenceData(...args),
  }),
}));
const ProfileTree = ({ children }) => {
  const { handle } = useAuth();
  return handle ? <SignedInEAProvider key={`${handle.userId}:${handle.epoch}`} handle={handle}>{children}</SignedInEAProvider> : children;
};
beforeEach(async () => { await resetHandleRegistryForTests(); await engine.__resetMockDatabases(); sqlite.__setDatabaseFactory(engine.openDatabaseAsync); });
afterEach(async () => { await resetHandleRegistryForTests(); await engine.__resetMockDatabases(); });
global.__MASI_NO_DEFAULT_HANDLE__ = true;
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { Pressable } from 'react-native';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { supabase } from '../src/services/supabaseClient';
import { createAuthSessionStorage, revokeAuthSessionAdmission } from '../src/services/authSessionStorage';
import { getAuthStorageKey, readPersistedSession } from '../src/services/persistedAuthSession';
import { createClient } from '@supabase/supabase-js';
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
const mockPullReferenceData = jest.fn();
const mockDeviceProfile = { getUserProfile: jest.fn(), saveUserProfile: jest.fn(), clearUserProfile: jest.fn() };

jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'),
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
    },
    from: jest.fn(),
  },
}));





const wrapper = ({ children }) => (
  <AuthProvider><ProfileTree>{children}</ProfileTree></AuthProvider>
);

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

const profileRow = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ea@example.org',
  first_name: 'Nomsa',
  last_name: 'Mbeki',
  school_id: 'school-1',
  job_title_id: 'job-1',
};

const mockProfileQuery = (result) => {
  const single = jest.fn(() => result);
  const eq = jest.fn(() => ({ single }));
  const select = jest.fn(() => ({ eq }));
  supabase.from.mockReturnValue({ select });
  return { select, eq, single };
};

describe('AuthContext concurrent sign-in persistence', () => {
  let authCallback;

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    revokeAuthSessionAdmission();
    supabase.auth.onAuthStateChange.mockImplementation((callback) => {
      authCallback = callback;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });
    supabase.auth.signInWithPassword.mockReset();
  });

  afterEach(async () => {
    await AsyncStorage.clear();
    revokeAuthSessionAdmission();
  });

  test.each(['signed out', 'signed in as C'])(
    'a rejected different-email success cannot suppress failure rollback from %s', async (initialState) => {
      const storageKey = getAuthStorageKey();
      const storage = createAuthSessionStorage(storageKey);
      const previousSession = initialState === 'signed in as C' ? {
        user: { ...profileRow, id: '33333333-3333-4333-8333-333333333333', email: 'c@example.org' },
        access_token: 'c-token', refresh_token: 'c-refresh',
      } : null;
      if (previousSession) await AsyncStorage.setItem(storageKey, JSON.stringify(previousSession));
      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await act(async () => {}); // Settle the persisted mount read before either attempt.
      if (previousSession) await act(async () => { authCallback('INITIAL_SESSION', previousSession); });

      const aSession = {
        user: { ...profileRow, email: 'a@example.org' },
        access_token: 'a-token', refresh_token: 'a-refresh',
      };
      const bSession = {
        user: { ...profileRow, id: '22222222-2222-4222-8222-222222222222', email: 'b@example.org' },
        access_token: 'b-token', refresh_token: 'b-refresh',
      };
      const aResponse = deferred();
      const bResponse = deferred();
      supabase.auth.signInWithPassword
        .mockReturnValueOnce(aResponse.promise)
        .mockReturnValueOnce(bResponse.promise);
      let first;
      let second;
      act(() => {
        first = result.current.signIn('  A@EXAMPLE.ORG  ', 'secret');
        second = result.current.signIn('  B@EXAMPLE.ORG  ', 'wrong');
      });
      expect(supabase.auth.signInWithPassword).toHaveBeenNthCalledWith(1, { email: 'a@example.org', password: 'secret' });
      expect(supabase.auth.signInWithPassword).toHaveBeenNthCalledWith(2, { email: 'b@example.org', password: 'wrong' });

      await act(async () => {
        // Match the SDK order: storage write, SIGNED_IN, then successful response.
        await storage.setItem(storageKey, JSON.stringify(aSession));
        authCallback('SIGNED_IN', aSession);
        const data = { user: aSession.user, session: aSession };
        aResponse.resolve({ data, error: null });
        expect(await first).toEqual({ data, error: null });
      });
      // B still owns the pending attempt: A must neither persist nor switch the EA.
      expect(await readPersistedSession()).toEqual(previousSession);
      expect(result.current.user?.id).toBe(previousSession?.user.id);
      expect(result.current.handle?.userId).toBe(previousSession?.user.id);

      const failure = { message: 'Invalid login credentials', status: 400 };
      await act(async () => {
        bResponse.resolve({ data: null, error: failure });
        expect(await second).toEqual({ data: null, error: failure });
      });
      expect(result.current.user?.id).toBe(previousSession?.user.id);
      expect(result.current.handle?.userId).toBe(previousSession?.user.id);

      let expectedSession = previousSession;
      if (previousSession) {
        expectedSession = { ...previousSession, access_token: 'c-rotated-token', refresh_token: 'c-rotated-refresh' };
        await act(async () => {
          await storage.setItem(storageKey, JSON.stringify(expectedSession));
          authCallback('TOKEN_REFRESHED', expectedSession);
        });
        expect(result.current.session).toEqual(expectedSession);
        expect(await readPersistedSession()).toEqual(expectedSession);
      }
      await storage.setItem(storageKey, JSON.stringify(bSession));
      expect(await readPersistedSession()).toEqual(expectedSession);
    },
  );

  test.each(['TOKEN_REFRESHED', 'USER_UPDATED'])(
    'a later failed attempt preserves the earlier success and persists %s', async (event) => {
      const firstResponse = deferred();
      const secondResponse = deferred();
      supabase.auth.signInWithPassword
        .mockReturnValueOnce(firstResponse.promise)
        .mockReturnValueOnce(secondResponse.promise);
      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await act(async () => {}); // Let the empty mount read settle before sign-in.
      const storageKey = getAuthStorageKey();
      const storage = createAuthSessionStorage(storageKey);
      const signedIn = { user: profileRow, access_token: 'first-token', refresh_token: 'first-refresh' };
      const data = { user: profileRow, session: signedIn };
      const failure = { message: 'Service unavailable', status: 503 };
      let first;
      let second;
      act(() => {
        first = result.current.signIn(profileRow.email, 'secret');
        second = result.current.signIn(profileRow.email, 'secret');
      });
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledTimes(2);

      await act(async () => {
        // The SDK saves the successful session and emits SIGNED_IN before returning.
        await storage.setItem(storageKey, JSON.stringify(signedIn));
        authCallback('SIGNED_IN', signedIn);
        firstResponse.resolve({ data, error: null });
        expect(await first).toEqual({ data, error: null });
      });
      await act(async () => {
        secondResponse.resolve({ data: null, error: failure });
        expect(await second).toEqual({ data: null, error: failure });
      });
      expect(result.current.user.id).toBe(profileRow.id);
      expect(result.current.handle?.userId).toBe(profileRow.id);
      expect(await readPersistedSession()).toEqual(signedIn);

      const refreshed = { ...signedIn, access_token: 'rotated-token', refresh_token: 'rotated-refresh' };
      await act(async () => {
        await storage.setItem(storageKey, JSON.stringify(refreshed));
        authCallback(event, refreshed);
      });
      expect(result.current.session).toEqual(refreshed);
      expect(await readPersistedSession()).toEqual(refreshed);
    },
  );
});

describe('AuthContext password change ordering', () => {
  let authCallback;
  let result;
  const verified = { data: { user: profileRow }, error: null };

  beforeEach(async () => {
    jest.clearAllMocks();
    createClient.mockReset();
    supabase.auth.onAuthStateChange.mockImplementation((callback) => {
      authCallback = callback;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: profileRow } }, error: null });
    supabase.auth.updateUser.mockReset().mockResolvedValue({ error: null });
    supabase.auth.signOut.mockResolvedValue({ error: null });
    ({ result } = renderHook(() => useAuth(), { wrapper: AuthProvider }));
    await act(async () => { authCallback('SIGNED_IN', { user: profileRow }); });
    await waitFor(() => expect(result.current.handle?.userId).toBe(profileRow.id));
  });

  const privateClient = (verification, cleanup = Promise.resolve({ error: null })) => ({ auth: {
    signInWithPassword: jest.fn(() => verification),
    signOut: jest.fn(() => cleanup),
  } });
  const change = (currentPassword, newPassword, handle = result.current.handle) =>
    result.current.changePassword({ currentPassword, newPassword, handle });

  test('reverse verification responses cannot reorder updates or skip private-session cleanup', async () => {
    const firstVerification = deferred();
    const secondVerification = deferred();
    const firstCleanup = deferred();
    const firstClient = privateClient(firstVerification.promise, firstCleanup.promise);
    const secondClient = privateClient(secondVerification.promise);
    createClient.mockReturnValueOnce(firstClient).mockReturnValueOnce(secondClient);
    const first = change('original', 'first-new');
    const second = change('first-new', 'second-new');
    try {
      await act(async () => { secondVerification.resolve(verified); });
      expect(firstClient.auth.signInWithPassword).toHaveBeenCalledTimes(1);
      expect(secondClient.auth.signInWithPassword).not.toHaveBeenCalled();
      expect(supabase.auth.updateUser).not.toHaveBeenCalled();

      await act(async () => { firstVerification.resolve(verified); });
      expect(supabase.auth.updateUser.mock.calls).toEqual([[{ password: 'first-new' }]]);
      expect(firstClient.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(secondClient.auth.signInWithPassword).not.toHaveBeenCalled();

      await act(async () => { firstCleanup.resolve({ error: null }); });
      expect(await first).toEqual({ error: null, phase: 'update' });
      expect(await second).toEqual({ error: null, phase: 'update' });
      expect(secondClient.auth.signInWithPassword).toHaveBeenCalledWith({ email: profileRow.email, password: 'first-new' });
      expect(supabase.auth.updateUser.mock.calls).toEqual([[{ password: 'first-new' }], [{ password: 'second-new' }]]);
      expect(secondClient.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    } finally {
      firstVerification.resolve(verified); secondVerification.resolve(verified); firstCleanup.resolve({ error: null });
      await Promise.allSettled([first, second]);
    }
  });

  test.each(['original', 'first-new'])('the next verification checks the updated password store with %s', async (secondCurrent) => {
    let storedPassword = 'original';
    const checkedPasswords = [];
    const invalid = { code: 'invalid_credentials' };
    createClient.mockImplementation(() => ({ auth: {
      signInWithPassword: jest.fn(async ({ password }) => {
        checkedPasswords.push({ supplied: password, stored: storedPassword });
        return password === storedPassword ? verified : { data: {}, error: invalid };
      }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    } }));
    supabase.auth.updateUser.mockImplementation(async ({ password }) => {
      storedPassword = password;
      return { error: null };
    });
    const first = change('original', 'first-new');
    const second = change(secondCurrent, 'second-new');
    expect(await first).toEqual({ error: null, phase: 'update' });
    expect(await second).toEqual(secondCurrent === 'original'
      ? { error: invalid, phase: 'verification' }
      : { error: null, phase: 'update' });
    expect(checkedPasswords).toEqual([
      { supplied: 'original', stored: 'original' },
      { supplied: secondCurrent, stored: 'first-new' },
    ]);
    expect(storedPassword).toBe(secondCurrent === 'original' ? 'first-new' : 'second-new');
    expect(supabase.auth.updateUser.mock.calls.map(([input]) => input.password)).toEqual(
      secondCurrent === 'original' ? ['first-new'] : ['first-new', 'second-new'],
    );
  });

  test.each(['verification', 'update'])('a rejected %s does not block the next attempt', async (phase) => {
    const failure = new Error('Request failed');
    const firstClient = privateClient(Promise.resolve(verified));
    const secondClient = privateClient(Promise.resolve(verified));
    if (phase === 'verification') firstClient.auth.signInWithPassword.mockRejectedValueOnce(failure);
    else supabase.auth.updateUser.mockRejectedValueOnce(failure);
    createClient.mockReturnValueOnce(firstClient).mockReturnValueOnce(secondClient);
    const first = change('original', 'first-new');
    const second = change('original', 'second-new');
    expect(await first).toEqual({ error: failure, phase });
    expect(await second).toEqual({ error: null, phase: 'update' });
    expect(firstClient.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(secondClient.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(supabase.auth.updateUser).toHaveBeenLastCalledWith({ password: 'second-new' });
  });

  test.each(['another EA', 'same EA, new handle'])('%s can change password before the old chain settles', async (mode) => {
    const oldVerification = deferred();
    const oldClient = privateClient(oldVerification.promise);
    createClient.mockReturnValueOnce(oldClient);
    const origin = result.current.handle;
    const first = change('original', 'old-new', origin);
    const queued = change('old-new', 'old-queued-new', origin);
    let next;
    try {
      await act(async () => {});
      expect(oldClient.auth.signInWithPassword).toHaveBeenCalledTimes(1);
      await act(async () => { await result.current.signOut(); });
      const nextUser = mode === 'another EA'
        ? { id: '22222222-2222-4222-8222-222222222222', email: 'next@example.org' }
        : profileRow;
      await act(async () => { authCallback('SIGNED_IN', { user: nextUser }); });
      await waitFor(() => expect(result.current.handle?.userId).toBe(nextUser.id));
      expect(result.current.handle).not.toBe(origin);
      supabase.auth.getSession.mockResolvedValue({ data: { session: { user: nextUser } }, error: null });
      const nextClient = privateClient(Promise.resolve({ data: { user: nextUser }, error: null }));
      createClient.mockReturnValueOnce(nextClient);
      let nextOutcome;
      next = change('next-original', 'next-new').then((outcome) => { nextOutcome = outcome; });
      await waitFor(() => expect(nextOutcome).toEqual({ error: null, phase: 'update' }));
      expect(nextClient.auth.signInWithPassword).toHaveBeenCalledWith({ email: nextUser.email, password: 'next-original' });
      expect(supabase.auth.updateUser.mock.calls).toEqual([[{ password: 'next-new' }]]);
      oldVerification.resolve(verified);
      expect(await first).toMatchObject({ error: { name: 'StaleActorError' }, phase: 'verification' });
      expect(await queued).toMatchObject({ error: { name: 'StaleActorError' }, phase: 'verification' });
      expect(createClient).toHaveBeenCalledTimes(2);
      expect(supabase.auth.updateUser.mock.calls).toEqual([[{ password: 'next-new' }]]);
    } finally {
      oldVerification.resolve(verified);
      await Promise.allSettled([first, queued, next]);
    }
  });
});

describe('AuthContext Plan 5 startup discipline', () => {
  let authCallback;
  let unsubscribe;

  beforeEach(() => {
    jest.useFakeTimers();
    unsubscribe = jest.fn();
    authCallback = null;
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    supabase.auth.onAuthStateChange.mockImplementation((callback) => {
      authCallback = callback;
      return { data: { subscription: { unsubscribe } } };
    });
    supabase.auth.signOut.mockResolvedValue({ error: null });
    mockDeviceProfile.getUserProfile.mockResolvedValue(null);
    mockDeviceProfile.saveUserProfile.mockResolvedValue(true);
    mockDeviceProfile.clearUserProfile.mockResolvedValue(true);
    mockPullReferenceData.mockResolvedValue({});
    mockProfileQuery(Promise.resolve({ data: profileRow, error: null }));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('profile database reads are deferred outside onAuthStateChange', async () => {
    renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(authCallback).toEqual(expect.any(Function)));

    act(() => {
      authCallback('SIGNED_IN', { user: { id: '11111111-1111-4111-8111-111111111111', email: 'ea@example.org' } });
    });

    expect(mockDeviceProfile.getUserProfile).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();

    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    await waitFor(() => expect(mockPullReferenceData).toHaveBeenCalledWith());
    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith('users'));
  });

  test('a parent-only rerender does not re-render Auth consumers', async () => {
    let authConsumerRenders = 0;
    const AuthProbe = React.memo(() => {
      useAuth();
      authConsumerRenders += 1;
      return null;
    });
    const Harness = () => {
      const [, setParentTick] = React.useState(0);
      return (
        <>
          <Pressable testID="parent-rerender" onPress={() => setParentTick(value => value + 1)} />
          <AuthProvider>
            <AuthProbe />
          </AuthProvider>
        </>
      );
    };

    const { getByTestId } = render(<Harness />);
    await waitFor(() => expect(authCallback).toEqual(expect.any(Function)));
    const rendersAfterMount = authConsumerRenders;

    fireEvent.press(getByTestId('parent-rerender'));

    expect(authConsumerRenders).toBe(rendersAfterMount);
  });

  test('authenticated startup publishes the user without waiting for reference data', async () => {
    const referencePull = deferred();
    mockPullReferenceData.mockReturnValue(referencePull.promise);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(authCallback).toEqual(expect.any(Function)));

    act(() => {
      authCallback('SIGNED_IN', { user: { id: '11111111-1111-4111-8111-111111111111', email: 'ea@example.org' } });
    });

    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    expect(mockPullReferenceData).toHaveBeenCalledWith();
    expect(mockPullReferenceData).toHaveBeenCalledTimes(1);
    expect(result.current.user).toEqual(expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111' }));
    expect(result.current.loading).toBe(false);
  });

  test('authenticated startup publishes a cached profile while background requests are pending', async () => {
    const referencePull = deferred();
    const profileFetch = deferred();
    const cachedProfile = {
      ...profileRow,
      first_name: 'Cached Nomsa',
    };
    mockDeviceProfile.getUserProfile.mockResolvedValue(cachedProfile);
    mockPullReferenceData.mockReturnValue(referencePull.promise);
    mockProfileQuery(profileFetch.promise);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(authCallback).toEqual(expect.any(Function)));

    act(() => {
      authCallback('SIGNED_IN', { user: { id: '11111111-1111-4111-8111-111111111111', email: 'ea@example.org' } });
    });

    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPullReferenceData).toHaveBeenCalledWith();
    expect(supabase.from).toHaveBeenCalledWith('users');
    expect(result.current.profile).toEqual(expect.objectContaining({
      id: '11111111-1111-4111-8111-111111111111',
      first_name: 'Cached Nomsa',
    }));

    await act(async () => {
      profileFetch.resolve({ data: profileRow, error: null });
      await profileFetch.promise;
      await Promise.resolve();
    });
  });

  test('auth startup accepts INITIAL_SESSION without a duplicate getSession call', async () => {
    renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(authCallback).toEqual(expect.any(Function)));

    expect(supabase.auth.getSession).not.toHaveBeenCalled();

    act(() => {
      authCallback('INITIAL_SESSION', { user: { id: '11111111-1111-4111-8111-111111111111', email: 'ea@example.org' } });
    });

    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    await waitFor(() => expect(mockPullReferenceData).toHaveBeenCalledWith());
    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith('users'));
  });

  test('token refresh for the current user does not re-run startup hydration', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(authCallback).toEqual(expect.any(Function)));

    act(() => {
      authCallback('INITIAL_SESSION', { user: { id: '11111111-1111-4111-8111-111111111111', email: 'ea@example.org' }, access_token: 'old-token' });
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.user).toEqual(expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111' })));

    mockPullReferenceData.mockClear();
    mockDeviceProfile.getUserProfile.mockClear();
    supabase.from.mockClear();

    act(() => {
      authCallback('TOKEN_REFRESHED', { user: { id: '11111111-1111-4111-8111-111111111111', email: 'ea@example.org' }, access_token: 'new-token' });
    });

    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    expect(result.current.session).toEqual(expect.objectContaining({ access_token: 'new-token' }));
    expect(mockPullReferenceData).not.toHaveBeenCalled();
    expect(mockDeviceProfile.getUserProfile).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('stale profile fetch cannot update state after sign-out', async () => {
    const profileFetch = deferred();
    mockProfileQuery(profileFetch.promise);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(authCallback).toEqual(expect.any(Function)));

    act(() => {
      authCallback('SIGNED_IN', { user: { id: '11111111-1111-4111-8111-111111111111', email: 'ea@example.org' } });
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });
    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith('users'));

    await act(async () => {
      await result.current.signOut();
      authCallback('SIGNED_OUT', null);
    });

    await act(async () => {
      profileFetch.resolve({ data: profileRow, error: null });
      await profileFetch.promise;
      await Promise.resolve();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(mockDeviceProfile.saveUserProfile).not.toHaveBeenCalledWith(expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111' }));
  });

  test('manual sign-out invalidates in-flight profile loads before Supabase emits SIGNED_OUT', async () => {
    const profileFetch = deferred();
    const signOutRequest = deferred();
    mockProfileQuery(profileFetch.promise);
    supabase.auth.signOut.mockReturnValue(signOutRequest.promise);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(authCallback).toEqual(expect.any(Function)));

    act(() => {
      authCallback('SIGNED_IN', { user: { id: '11111111-1111-4111-8111-111111111111', email: 'ea@example.org' } });
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });
    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith('users'));

    let signOutPromise;
    await act(async () => {
      signOutPromise = result.current.signOut();
      await Promise.resolve();
    });

    await act(async () => {
      profileFetch.resolve({ data: profileRow, error: null });
      await profileFetch.promise;
      await Promise.resolve();
    });

    expect(result.current.profile).toBeNull();
    expect(mockDeviceProfile.saveUserProfile).not.toHaveBeenCalledWith(expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111' }));

    await act(async () => {
      signOutRequest.resolve({ error: null });
      await signOutPromise;
    });
  });

  test('local cached profile is ignored when it belongs to another user', async () => {
    mockDeviceProfile.getUserProfile.mockResolvedValueOnce({
      ...profileRow,
      id: 'other-user',
      first_name: 'Stale',
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(authCallback).toEqual(expect.any(Function)));

    act(() => {
      authCallback('SIGNED_IN', { user: { id: '11111111-1111-4111-8111-111111111111', email: 'ea@example.org' } });
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    expect(result.current.profile).not.toEqual(expect.objectContaining({ id: 'other-user' }));
  });
});
