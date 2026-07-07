import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';

const DEFAULT_AUTH_STORAGE_KEY = 'supabase.auth.token';

const deriveStorageKeyFromUrl = (supabaseUrl) => {
  if (typeof supabaseUrl !== 'string' || supabaseUrl.length === 0) return null;

  try {
    const host = new URL(supabaseUrl).hostname;
    const projectRef = host.split('.')[0];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
};

export const getAuthStorageKey = () => (
  typeof supabase?.auth?.storageKey === 'string' && supabase.auth.storageKey.length > 0
    ? supabase.auth.storageKey
    : deriveStorageKeyFromUrl(supabase?.supabaseUrl) ?? DEFAULT_AUTH_STORAGE_KEY
);

const parseStoredValue = (raw) => {
  if (!raw) return null;
  if (typeof raw !== 'string') return raw;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const unwrapSession = (value) => value?.currentSession ?? value?.session ?? value;

const readStoredValue = async (key) => parseStoredValue(await AsyncStorage.getItem(key));

const hasRefreshableUserSession = (session) => (
  Boolean(session?.refresh_token && session?.user?.id)
);

export const readPersistedSession = async () => {
  try {
    const storageKey = getAuthStorageKey();
    const session = unwrapSession(await readStoredValue(storageKey));

    if (hasRefreshableUserSession(session)) {
      return session;
    }

    if (session?.refresh_token && !session.user) {
      const userRecord = await readStoredValue(`${storageKey}-user`);
      const user = userRecord?.user ?? userRecord;
      if (user?.id) {
        return { ...session, user };
      }
    }

    return null;
  } catch {
    return null;
  }
};

export const clearPersistedSession = async () => {
  const storageKey = getAuthStorageKey();
  await Promise.all([
    AsyncStorage.removeItem(storageKey),
    AsyncStorage.removeItem(`${storageKey}-code-verifier`),
    AsyncStorage.removeItem(`${storageKey}-user`),
  ]);
};
