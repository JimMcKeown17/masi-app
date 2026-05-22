import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { supabase } from '../src/services/supabaseClient';
import { pullReferenceData } from '../src/services/offlineSync';
import { storage } from '../src/utils/storage';

jest.mock('../src/services/supabaseClient', () => ({
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

jest.mock('../src/utils/storage', () => ({
  storage: {
    getUserProfile: jest.fn(),
    saveUserProfile: jest.fn(),
    clearUserProfile: jest.fn(),
  },
}));

jest.mock('../src/services/offlineSync', () => ({
  pullReferenceData: jest.fn(),
}));

const wrapper = ({ children }) => (
  <AuthProvider>{children}</AuthProvider>
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
  id: 'user-1',
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
    storage.getUserProfile.mockResolvedValue(null);
    storage.saveUserProfile.mockResolvedValue(true);
    storage.clearUserProfile.mockResolvedValue(true);
    pullReferenceData.mockResolvedValue({});
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
      authCallback('SIGNED_IN', { user: { id: 'user-1', email: 'ea@example.org' } });
    });

    expect(storage.getUserProfile).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();

    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    await waitFor(() => expect(pullReferenceData).toHaveBeenCalledWith({ userId: 'user-1' }));
    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith('users'));
  });

  test('authenticated startup pulls reference data before publishing user to child providers', async () => {
    const referencePull = deferred();
    pullReferenceData.mockReturnValue(referencePull.promise);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(authCallback).toEqual(expect.any(Function)));

    act(() => {
      authCallback('SIGNED_IN', { user: { id: 'user-1', email: 'ea@example.org' } });
    });

    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    expect(pullReferenceData).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(result.current.user).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();

    await act(async () => {
      referencePull.resolve({});
      await referencePull.promise;
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.user).toEqual(expect.objectContaining({ id: 'user-1' })));
    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith('users'));
  });

  test('auth startup relies on INITIAL_SESSION event instead of a duplicate getSession call', async () => {
    renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(authCallback).toEqual(expect.any(Function)));

    expect(supabase.auth.getSession).not.toHaveBeenCalled();

    act(() => {
      authCallback('INITIAL_SESSION', { user: { id: 'user-1', email: 'ea@example.org' } });
    });

    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    await waitFor(() => expect(pullReferenceData).toHaveBeenCalledWith({ userId: 'user-1' }));
    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith('users'));
  });

  test('token refresh for the current user does not re-run startup hydration', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(authCallback).toEqual(expect.any(Function)));

    act(() => {
      authCallback('INITIAL_SESSION', { user: { id: 'user-1', email: 'ea@example.org' }, access_token: 'old-token' });
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.user).toEqual(expect.objectContaining({ id: 'user-1' })));

    pullReferenceData.mockClear();
    storage.getUserProfile.mockClear();
    supabase.from.mockClear();

    act(() => {
      authCallback('TOKEN_REFRESHED', { user: { id: 'user-1', email: 'ea@example.org' }, access_token: 'new-token' });
    });

    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    expect(result.current.session).toEqual(expect.objectContaining({ access_token: 'new-token' }));
    expect(pullReferenceData).not.toHaveBeenCalled();
    expect(storage.getUserProfile).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('stale profile fetch cannot update state after sign-out', async () => {
    const profileFetch = deferred();
    mockProfileQuery(profileFetch.promise);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(authCallback).toEqual(expect.any(Function)));

    act(() => {
      authCallback('SIGNED_IN', { user: { id: 'user-1', email: 'ea@example.org' } });
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
    expect(storage.saveUserProfile).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }));
  });

  test('manual sign-out invalidates in-flight profile loads before Supabase emits SIGNED_OUT', async () => {
    const profileFetch = deferred();
    const signOutRequest = deferred();
    mockProfileQuery(profileFetch.promise);
    supabase.auth.signOut.mockReturnValue(signOutRequest.promise);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(authCallback).toEqual(expect.any(Function)));

    act(() => {
      authCallback('SIGNED_IN', { user: { id: 'user-1', email: 'ea@example.org' } });
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
    expect(storage.saveUserProfile).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }));

    await act(async () => {
      signOutRequest.resolve({ error: null });
      await signOutPromise;
    });
  });

  test('local cached profile is ignored when it belongs to another user', async () => {
    storage.getUserProfile.mockResolvedValueOnce({
      ...profileRow,
      id: 'other-user',
      first_name: 'Stale',
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(authCallback).toEqual(expect.any(Function)));

    act(() => {
      authCallback('SIGNED_IN', { user: { id: 'user-1', email: 'ea@example.org' } });
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    expect(result.current.profile).not.toEqual(expect.objectContaining({ id: 'other-user' }));
  });
});
