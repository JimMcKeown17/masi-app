import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from './supabaseClient';
import { StaleActorError } from '../session/staleActor';

// A credential check must never persist a session or notify the shared auth client.
// Keep the subsequent update on this same private session, fenced at every send.
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
    global: { fetch: (...args) => {
      if (!handle.isCurrent()) throw new StaleActorError();
      return fetch(...args);
    } },
  });
};
