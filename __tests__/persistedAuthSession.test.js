import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import {
  createAuthSessionStorage, admitAuthSessionUser, revokeAuthSessionAdmission, resetAuthSessionAdmissionForTests,
} from '../src/services/authSessionStorage';
import {
  clearPersistedSession,
  getAuthStorageKey,
  readPersistedSession,
} from '../src/services/persistedAuthSession';

let mockStorageKey = 'test-auth-token';
let mockSupabaseUrl = 'https://segygjzpujphwvrubusm.supabase.co';

jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'),
  supabase: {
    auth: {
      get storageKey() {
        return mockStorageKey;
      },
    },
    get supabaseUrl() {
      return mockSupabaseUrl;
    },
  },
}));

const authJsSession = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  token_type: 'bearer',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  user: {
    id: 'user-1',
    email: 'ea@example.org',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-07-07T00:00:00.000Z',
  },
};

describe('persistedAuthSession', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    revokeAuthSessionAdmission();
    mockStorageKey = 'test-auth-token';
    mockSupabaseUrl = 'https://segygjzpujphwvrubusm.supabase.co';
  });

  it('drops session and companion writes after admission is revoked, preserving reads', async () => {
    const storage = createAuthSessionStorage('test-auth-token');
    await AsyncStorage.setItem('test-auth-token', JSON.stringify(authJsSession));
    revokeAuthSessionAdmission();
    await storage.setItem('test-auth-token', JSON.stringify({ ...authJsSession, access_token: 'late' }));
    await storage.setItem('test-auth-token-user', JSON.stringify({ user: authJsSession.user }));
    expect(JSON.parse(await storage.getItem('test-auth-token')).access_token).toBe('access-token');
    expect(await storage.getItem('test-auth-token-user')).toBeNull();
    expect(await readPersistedSession()).toEqual(authJsSession);
  });

  it.each(['*', 'user-1'])('admits session and companion writes for %s', async admission => {
    const storage = createAuthSessionStorage('test-auth-token');
    admitAuthSessionUser(admission);
    await storage.setItem('test-auth-token', JSON.stringify(authJsSession));
    await storage.setItem('test-auth-token-user', JSON.stringify({ user: authJsSession.user }));
    expect(await readPersistedSession()).toEqual(authJsSession);
    expect(JSON.parse(await storage.getItem('test-auth-token-user')).user.id).toBe('user-1');
  });

  it('narrowed admission rejects other users and malformed values for both session keys', async () => {
    const storage = createAuthSessionStorage('test-auth-token');
    admitAuthSessionUser('user-2');
    for (const key of ['test-auth-token', 'test-auth-token-user']) {
      await storage.setItem(key, JSON.stringify(authJsSession));
      await storage.setItem(key, '{not-json');
      await storage.setItem(key, JSON.stringify({ refresh_token: 'missing-user' }));
      expect(await storage.getItem(key)).toBeNull();
    }
  });

  it('always permits removal and leaves unrelated storage writes unchanged', async () => {
    const storage = createAuthSessionStorage('test-auth-token');
    await AsyncStorage.setItem('test-auth-token', JSON.stringify(authJsSession));
    revokeAuthSessionAdmission();
    await storage.removeItem('test-auth-token');
    await storage.setItem('test-auth-token-code-verifier', 'verifier');
    expect(await storage.getItem('test-auth-token')).toBeNull();
    expect(await storage.getItem('test-auth-token-code-verifier')).toBe('verifier');
  });

  it('reads a session written by auth-js using its real persisted storage format', async () => {
    const client = createClient('https://segygjzpujphwvrubusm.supabase.co', 'anon-key', {
      auth: {
        storage: AsyncStorage,
        storageKey: 'test-auth-token',
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    await client.auth._saveSession(authJsSession);

    await expect(readPersistedSession()).resolves.toEqual(
      expect.objectContaining({
        refresh_token: 'refresh-token',
        user: expect.objectContaining({ id: 'user-1' }),
      })
    );
  });

  it('returns null when the stored value is absent, malformed, or not refreshable', async () => {
    await expect(readPersistedSession()).resolves.toBeNull();

    await AsyncStorage.setItem('test-auth-token', '{not-json');
    await expect(readPersistedSession()).resolves.toBeNull();

    await AsyncStorage.setItem('test-auth-token', JSON.stringify({ user: { id: 'user-1' } }));
    await expect(readPersistedSession()).resolves.toBeNull();

    await AsyncStorage.setItem('test-auth-token', JSON.stringify({ refresh_token: 'refresh-token' }));
    await expect(readPersistedSession()).resolves.toBeNull();
  });

  it('combines auth-js split session and user records', async () => {
    await AsyncStorage.setItem(
      'test-auth-token',
      JSON.stringify({ access_token: 'token', refresh_token: 'refresh-token' })
    );
    await AsyncStorage.setItem('test-auth-token-user', JSON.stringify({ user: { id: 'user-1' } }));

    await expect(readPersistedSession()).resolves.toEqual(
      expect.objectContaining({
        refresh_token: 'refresh-token',
        user: { id: 'user-1' },
      })
    );
  });

  it('falls back to the project-ref auth-js key when storageKey is unavailable', async () => {
    mockStorageKey = undefined;
    await AsyncStorage.setItem('sb-segygjzpujphwvrubusm-auth-token', JSON.stringify(authJsSession));

    await expect(readPersistedSession()).resolves.toEqual(
      expect.objectContaining({
        refresh_token: 'refresh-token',
        user: expect.objectContaining({ id: 'user-1' }),
      })
    );
  });

  it('derives a storage key containing the active SQLite project ref', () => {
    mockStorageKey = undefined;
    mockSupabaseUrl = 'https://segygjzpujphwvrubusm.supabase.co';

    expect(getAuthStorageKey()).toBe('sb-segygjzpujphwvrubusm-auth-token');
  });

  it('clears the persisted session records', async () => {
    await AsyncStorage.setItem('test-auth-token', JSON.stringify(authJsSession));
    await AsyncStorage.setItem('test-auth-token-user', JSON.stringify({ user: authJsSession.user }));
    await AsyncStorage.setItem('test-auth-token-code-verifier', 'verifier');

    await clearPersistedSession();

    await expect(AsyncStorage.getItem('test-auth-token')).resolves.toBeNull();
    await expect(AsyncStorage.getItem('test-auth-token-user')).resolves.toBeNull();
    await expect(AsyncStorage.getItem('test-auth-token-code-verifier')).resolves.toBeNull();
    await expect(readPersistedSession()).resolves.toBeNull();
  });
});

describe('auth session storage before AuthContext decides admission (app launch)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    resetAuthSessionAdmissionForTests();
  });

  it('persists the SDK startup refresh of the session already stored, so the rotated refresh token survives', async () => {
    const storage = createAuthSessionStorage('test-auth-token');
    await AsyncStorage.setItem('test-auth-token', JSON.stringify(authJsSession));
    await storage.setItem('test-auth-token', JSON.stringify({ ...authJsSession, refresh_token: 'rotated' }));
    expect(JSON.parse(await AsyncStorage.getItem('test-auth-token')).refresh_token).toBe('rotated');
  });

  it('still drops a write for a different user than the one stored', async () => {
    const storage = createAuthSessionStorage('test-auth-token');
    await AsyncStorage.setItem('test-auth-token', JSON.stringify(authJsSession));
    const other = { ...authJsSession, user: { ...authJsSession.user, id: 'user-2' } };
    await storage.setItem('test-auth-token', JSON.stringify(other));
    expect(JSON.parse(await AsyncStorage.getItem('test-auth-token')).user.id).toBe('user-1');
  });

  it('drops a write when nothing is stored (a sign-in admits explicitly)', async () => {
    const storage = createAuthSessionStorage('test-auth-token');
    await storage.setItem('test-auth-token', JSON.stringify(authJsSession));
    expect(await AsyncStorage.getItem('test-auth-token')).toBeNull();
  });
});
