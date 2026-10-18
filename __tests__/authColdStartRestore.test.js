import { SignedInEAProvider } from '../src/context/SignedInEAContext';
import { resetHandleRegistryForTests } from '../src/session/signedInHandle';
import * as handleLifecycle from '../src/session/signedInHandle';
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
jest.mock('../test-support/handleServiceMocks', () => ({
enqueueSupabaseRequest: jest.fn()
}));
import React from 'react';
import { Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { supabase } from '../src/services/supabaseClient';
import {
  clearPersistedSession,
  readPersistedSession,
} from '../src/services/persistedAuthSession';
const mockDeviceProfile = { getUserProfile: jest.fn(), saveUserProfile: jest.fn(), clearUserProfile: jest.fn() };
const mockPullReferenceData = jest.fn();
import { enqueueSupabaseRequest } from '../test-support/handleServiceMocks';

let mockAuthStateCallback;

const mockGetSession = jest.fn();
const mockSignOut = jest.fn();
const mockOnAuthStateChange = jest.fn((callback) => {
  mockAuthStateCallback = callback;
  return {
    data: {
      subscription: {
        unsubscribe: jest.fn(),
      },
    },
  };
});
const mockSingle = jest.fn();
const mockEq = jest.fn(() => ({ single: mockSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));

jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'),
  supabase: {
    auth: {
      getSession: (...args) => mockGetSession(...args),
      onAuthStateChange: (...args) => mockOnAuthStateChange(...args),
      signInWithPassword: jest.fn(),
      signOut: (...args) => mockSignOut(...args),
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
    },
    from: (...args) => mockFrom(...args),
  },
}));

jest.mock('../src/services/persistedAuthSession', () => ({
  clearPersistedSession: jest.fn(),
  readPersistedSession: jest.fn(),
}));







const persistedSession = (userId = '11111111-1111-4111-8111-111111111111') => ({
  access_token: 'expired-access-token',
  refresh_token: 'refresh-token',
  token_type: 'bearer',
  expires_at: 1,
  user: { id: userId, email: `${userId}@example.org` },
});

const liveSession = (userId = '11111111-1111-4111-8111-111111111111') => ({
  access_token: 'live-token',
  refresh_token: 'live-refresh-token',
  user: { id: userId, email: `${userId}@example.org` },
});

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

const AuthStateProbe = () => {
  const auth = useAuth();
  AuthStateProbe.latestAuth = auth;
  return (
    <Text testID="auth-state">
      {`${auth.loading ? 'loading' : 'ready'}|${auth.user?.id ?? 'no-user'}|${auth.session ? 'session' : 'no-session'}`}
    </Text>
  );
};

const renderAuthProbe = async () => {
  const screen = render(
    <AuthProvider>
      <ProfileTree><AuthStateProbe /></ProfileTree>
    </AuthProvider>
  );
  await waitFor(() => expect(mockOnAuthStateChange).toHaveBeenCalled());
  return screen;
};

const emitAuthEvent = async (event, session) => {
  await act(async () => {
    await mockAuthStateCallback(event, session);
  });
};

const flushStartup = async () => {
  await act(async () => {
    jest.advanceTimersByTime(0);
    await Promise.resolve();
    await Promise.resolve();
  });
};

const expectAuthState = async (screen, state) => {
  await waitFor(() => {
    expect(screen.getByTestId('auth-state')).toHaveTextContent(state);
  });
};

describe('AuthContext offline cold-start restore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockAuthStateCallback = null;
    AuthStateProbe.latestAuth = null;
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSignOut.mockResolvedValue({ error: null });
    readPersistedSession.mockResolvedValue(null);
    clearPersistedSession.mockResolvedValue(undefined);
    mockPullReferenceData.mockResolvedValue(undefined);
    enqueueSupabaseRequest.mockImplementation(async (operation) => operation());
    mockDeviceProfile.getUserProfile.mockResolvedValue(null);
    mockDeviceProfile.clearUserProfile.mockResolvedValue(true);
    mockDeviceProfile.saveUserProfile.mockResolvedValue(true);
    mockSingle.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('opens the persisted offline session when the auth client never emits an event', async () => {
    readPersistedSession.mockResolvedValue(persistedSession());
    const screen = await renderAuthProbe();

    await expectAuthState(screen, 'ready|11111111-1111-4111-8111-111111111111|no-session');

    expect(AuthStateProbe.latestAuth.handle?.isOpen()).toBe(true);
    expect(AuthStateProbe.latestAuth.handle?.userId).toBe(persistedSession().user.id);
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('finishes signed out without a persisted session or any auth event', async () => {
    const screen = await renderAuthProbe();

    await expectAuthState(screen, 'ready|no-user|no-session');

    expect(AuthStateProbe.latestAuth.handle).toBeNull();
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(sqlite.openDatabaseAsync).not.toHaveBeenCalled();
  });

  it.each([['same user', liveSession()], ['null', null]])(
    'keeps the restored handle when a late INITIAL_SESSION arrives with %s',
    async (_, initialSession) => {
      readPersistedSession.mockResolvedValue(persistedSession());
      const open = jest.spyOn(handleLifecycle, 'requestOpen');
      const screen = await renderAuthProbe();
      await expectAuthState(screen, 'ready|11111111-1111-4111-8111-111111111111|no-session');
      const restored = AuthStateProbe.latestAuth.handle;

      await emitAuthEvent('INITIAL_SESSION', initialSession);
      await flushStartup();

      expect(AuthStateProbe.latestAuth.loading).toBe(false);
      expect(AuthStateProbe.latestAuth.user.id).toBe(restored.userId);
      expect(AuthStateProbe.latestAuth.handle).toBe(restored);
      expect(restored.isOpen()).toBe(true);
      expect(open).toHaveBeenCalledTimes(1);
      expect(mockPullReferenceData).toHaveBeenCalledTimes(1);
      expect(clearPersistedSession).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
    }
  );

  it('opens once when mount and an early null INITIAL_SESSION read persistence concurrently', async () => {
    const storageRead = deferred();
    readPersistedSession.mockReturnValue(storageRead.promise);
    const open = jest.spyOn(handleLifecycle, 'requestOpen');
    const screen = await renderAuthProbe();
    await emitAuthEvent('INITIAL_SESSION', null);
    expect(readPersistedSession).toHaveBeenCalledTimes(2);

    await act(async () => { storageRead.resolve(persistedSession()); });
    await expectAuthState(screen, 'ready|11111111-1111-4111-8111-111111111111|no-session');

    expect(AuthStateProbe.latestAuth.handle?.isOpen()).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(mockPullReferenceData).toHaveBeenCalledTimes(1);
  });

  it.each([['saved session', persistedSession()], ['no session', null]])(
    'ignores a delayed mount read of %s after explicit sign-in starts',
    async (_, storedSession) => {
      const storageRead = deferred();
      const login = deferred();
      readPersistedSession.mockReturnValue(storageRead.promise);
      supabase.auth.signInWithPassword.mockReturnValue(login.promise);
      const screen = await renderAuthProbe();
      const nextSession = liveSession('22222222-2222-4222-8222-222222222222');
      let signingIn;
      act(() => { signingIn = AuthStateProbe.latestAuth.signIn(nextSession.user.email, 'secret'); });

      await act(async () => { storageRead.resolve(storedSession); });

      expect(sqlite.openDatabaseAsync).not.toHaveBeenCalled();
      expect(AuthStateProbe.latestAuth.loading).toBe(true);
      await emitAuthEvent('SIGNED_IN', nextSession);
      await act(async () => {
        login.resolve({ data: { session: nextSession }, error: null });
        await signingIn;
      });
      await expectAuthState(screen, 'ready|22222222-2222-4222-8222-222222222222|session');
      expect(AuthStateProbe.latestAuth.handle?.userId).toBe(nextSession.user.id);
      expect(clearPersistedSession).not.toHaveBeenCalled();
    }
  );

  it('ignores a delayed mount restore after explicit sign-out starts', async () => {
    const storageRead = deferred();
    readPersistedSession.mockReturnValue(storageRead.promise);
    const screen = await renderAuthProbe();

    await act(async () => { await AuthStateProbe.latestAuth.signOut(); });
    await act(async () => { storageRead.resolve(persistedSession()); });

    await expectAuthState(screen, 'ready|no-user|no-session');
    expect(AuthStateProbe.latestAuth.handle).toBeNull();
    expect(sqlite.openDatabaseAsync).not.toHaveBeenCalled();
    expect(clearPersistedSession).toHaveBeenCalled();
  });

  it('does not interrupt explicit sign-out that starts before the mount gate', async () => {
    readPersistedSession.mockResolvedValue(persistedSession());
    let signingOut;
    const SignOutOnMount = () => {
      const { signOut } = useAuth();
      React.useEffect(() => { signingOut = signOut(); }, [signOut]);
      return null;
    };
    const screen = render(<AuthProvider><SignOutOnMount /><AuthStateProbe /></AuthProvider>);

    await act(async () => { await signingOut; });

    await expectAuthState(screen, 'ready|no-user|no-session');
    expect(readPersistedSession).not.toHaveBeenCalled();
    expect(sqlite.openDatabaseAsync).not.toHaveBeenCalled();
    expect(clearPersistedSession).toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('restores a persisted offline session idempotently when initial null events double-fire', async () => {
    readPersistedSession.mockResolvedValue(persistedSession('11111111-1111-4111-8111-111111111111'));
    const screen = await renderAuthProbe();

    await emitAuthEvent('INITIAL_SESSION', null);
    await flushStartup();
    await expectAuthState(screen, 'ready|11111111-1111-4111-8111-111111111111|no-session');

    await emitAuthEvent('INITIAL_SESSION', null);
    await flushStartup();
    await act(async () => {
      jest.advanceTimersByTime(15000);
    });

    expect(mockPullReferenceData).toHaveBeenCalledTimes(1);
    expect(mockDeviceProfile.clearUserProfile).not.toHaveBeenCalled();
    expect(screen.getByTestId('auth-state')).toHaveTextContent('ready|11111111-1111-4111-8111-111111111111|no-session');
  });

  it('stays signed out when no persisted auth-js session exists', async () => {
    const screen = await renderAuthProbe();

    await emitAuthEvent('INITIAL_SESSION', null);

    await expectAuthState(screen, 'ready|no-user|no-session');
  });

  it('clears restored auth immediately on a genuine SIGNED_OUT event', async () => {
    readPersistedSession.mockResolvedValue(persistedSession('11111111-1111-4111-8111-111111111111'));
    const screen = await renderAuthProbe();
    await flushStartup();
    await expectAuthState(screen, 'ready|11111111-1111-4111-8111-111111111111|no-session');
    const restored = AuthStateProbe.latestAuth.handle;

    readPersistedSession.mockResolvedValue(null);
    await emitAuthEvent('SIGNED_OUT', null);

    expect(screen.getByTestId('auth-state')).toHaveTextContent('ready|no-user|no-session');
    expect(AuthStateProbe.latestAuth.handle).toBeNull();
    expect(restored.isOpen()).toBe(false);
    expect(mockDeviceProfile.clearUserProfile).not.toHaveBeenCalled();
    expect(clearPersistedSession).toHaveBeenCalled();
  });

  it('ignores a stale SIGNED_OUT echo when the current user still has persisted auth', async () => {
    const screen = await renderAuthProbe();
    await emitAuthEvent('SIGNED_IN', liveSession('11111111-1111-4111-8111-111111111111'));
    await flushStartup();
    await expectAuthState(screen, 'ready|11111111-1111-4111-8111-111111111111|session');

    readPersistedSession.mockResolvedValue(persistedSession('11111111-1111-4111-8111-111111111111'));
    await emitAuthEvent('SIGNED_OUT', null);
    await act(async () => {
      jest.advanceTimersByTime(15000);
    });

    expect(screen.getByTestId('auth-state')).toHaveTextContent('ready|11111111-1111-4111-8111-111111111111|session');
    expect(mockDeviceProfile.clearUserProfile).not.toHaveBeenCalled();
  });

  it('signs out locally without waiting for Supabase network sign-out', async () => {
    const screen = await renderAuthProbe();
    await emitAuthEvent('SIGNED_IN', liveSession('11111111-1111-4111-8111-111111111111'));
    await flushStartup();
    await expectAuthState(screen, 'ready|11111111-1111-4111-8111-111111111111|session');
    mockSignOut.mockImplementation(() => new Promise(() => {}));

    let outcome = 'pending';
    await act(async () => {
      AuthStateProbe.latestAuth.signOut().then((result) => {
        outcome = result;
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(outcome).toEqual({ error: null });
    expect(screen.getByTestId('auth-state')).toHaveTextContent('ready|no-user|no-session');
    expect(clearPersistedSession).toHaveBeenCalled();
    expect(mockDeviceProfile.clearUserProfile).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('does not resurrect old auth after local sign-out and ignores a late sign-out echo after re-login', async () => {
    const screen = await renderAuthProbe();
    await emitAuthEvent('SIGNED_IN', liveSession('11111111-1111-4111-8111-111111111111'));
    await flushStartup();
    await expectAuthState(screen, 'ready|11111111-1111-4111-8111-111111111111|session');

    await act(async () => {
      await AuthStateProbe.latestAuth.signOut();
    });
    expect(screen.getByTestId('auth-state')).toHaveTextContent('ready|no-user|no-session');

    await emitAuthEvent('TOKEN_REFRESHED', liveSession('11111111-1111-4111-8111-111111111111'));
    expect(screen.getByTestId('auth-state')).toHaveTextContent('ready|no-user|no-session');

    await emitAuthEvent('SIGNED_IN', liveSession('22222222-2222-4222-8222-222222222222'));
    await flushStartup();
    expect(screen.getByTestId('auth-state')).toHaveTextContent('ready|22222222-2222-4222-8222-222222222222|session');

    readPersistedSession.mockResolvedValue(persistedSession('22222222-2222-4222-8222-222222222222'));
    await emitAuthEvent('SIGNED_OUT', null);
    expect(screen.getByTestId('auth-state')).toHaveTextContent('ready|22222222-2222-4222-8222-222222222222|session');
  });

  it('heals an offline-restored session when Supabase later refreshes the token', async () => {
    readPersistedSession.mockResolvedValue(persistedSession('11111111-1111-4111-8111-111111111111'));
    const screen = await renderAuthProbe();
    await emitAuthEvent('INITIAL_SESSION', null);
    await flushStartup();
    await expectAuthState(screen, 'ready|11111111-1111-4111-8111-111111111111|no-session');

    await emitAuthEvent('TOKEN_REFRESHED', liveSession('11111111-1111-4111-8111-111111111111'));

    expect(screen.getByTestId('auth-state')).toHaveTextContent('ready|11111111-1111-4111-8111-111111111111|session');
  });

  it('preserves the grace period for non-SIGNED_OUT null events while running', async () => {
    const screen = await renderAuthProbe();
    await emitAuthEvent('SIGNED_IN', liveSession('11111111-1111-4111-8111-111111111111'));
    await flushStartup();
    await expectAuthState(screen, 'ready|11111111-1111-4111-8111-111111111111|session');

    await emitAuthEvent('USER_UPDATED', null);
    expect(screen.getByTestId('auth-state')).toHaveTextContent('ready|11111111-1111-4111-8111-111111111111|session');

    await act(async () => {
      jest.advanceTimersByTime(14999);
    });
    expect(screen.getByTestId('auth-state')).toHaveTextContent('ready|11111111-1111-4111-8111-111111111111|session');

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.getByTestId('auth-state')).toHaveTextContent('ready|no-user|no-session');
  });
});
