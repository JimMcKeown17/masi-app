import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from './supabaseClient';
import { StaleActorError } from '../session/staleActor';
import { authRequestFetch } from './authRequestFetch';

// A credential check must never persist a session or notify the shared auth client.
// Only credential verification uses this session. AuthContext updates the shared
// session and disposes this one, including after the originating handle closes.
// Password changes are queued per actor (AuthContext), so a private request that never
// settles would block every later change for that EA. Share the shared client's bound:
// the request aborts, and a late response cannot reach this session.
export const createPasswordVerificationFetch = (handle) => (url, options) => {
  const isLocalSignOut = new URL(url).pathname.endsWith('/logout')
    && new URL(url).searchParams.get('scope') === 'local' && options?.method === 'POST';
  if (!isLocalSignOut && !handle.isCurrent()) throw new StaleActorError();
  return authRequestFetch(url, options);
};

export const createPasswordVerificationClient = (handle) => {
  const storage = new Map();
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `masi:password-verification:${handle.userId}:${handle.epoch}`,
      storage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => { storage.set(key, value); },
        removeItem: key => { storage.delete(key); },
      },
    },
    global: { fetch: createPasswordVerificationFetch(handle) },
  });
};
