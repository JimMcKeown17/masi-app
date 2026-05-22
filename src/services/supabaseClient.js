import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { processLock } from '@supabase/supabase-js';
import { resolveSupabaseProjectConfig } from '../../config/supabaseProjectConfig';

const CLIENT_STATE_KEY = '__MASI_SUPABASE_CLIENT_STATE__';

// Local dev uses public env vars; EAS builds fall back to Expo config extra.
const { supabaseUrl, supabaseAnonKey } = resolveSupabaseProjectConfig({
  env: process.env,
  expoExtra: Constants.expoConfig?.extra || {},
});

const createSupabaseClient = () => createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
});

const enqueueAuthAutoRefreshOperation = (state, operation, onError) => {
  state.autoRefreshOperation = (state.autoRefreshOperation || Promise.resolve())
    .catch(() => {})
    .then(operation)
    .catch(onError);

  return state.autoRefreshOperation;
};

const cleanupSupabaseClientState = (state) => {
  if (!state) return;

  if (state.appStateSubscription) {
    state.appStateSubscription.remove();
    state.appStateSubscription = null;
  }

  state.autoRefreshRequested = false;
  enqueueAuthAutoRefreshOperation(
    state,
    () => state.client.auth.stopAutoRefresh(),
    (error) => {
      console.warn('[Supabase] Failed to stop auth auto-refresh:', error);
    }
  );
};

const getSupabaseClientState = () => {
  const existingState = globalThis[CLIENT_STATE_KEY];
  if (
    existingState
    && existingState.supabaseUrl === supabaseUrl
    && existingState.supabaseAnonKey === supabaseAnonKey
  ) {
    return existingState;
  }

  cleanupSupabaseClientState(existingState);

  const state = {
    client: createSupabaseClient(),
    supabaseUrl,
    supabaseAnonKey,
    appStateSubscription: null,
    autoRefreshRequested: false,
    autoRefreshOperation: Promise.resolve(),
  };

  globalThis[CLIENT_STATE_KEY] = state;
  return state;
};

const supabaseState = getSupabaseClientState();

export const supabase = supabaseState.client;

const startAuthAutoRefresh = () => {
  if (supabaseState.autoRefreshRequested) return;

  supabaseState.autoRefreshRequested = true;
  enqueueAuthAutoRefreshOperation(
    supabaseState,
    () => supabase.auth.startAutoRefresh(),
    (error) => {
      if (supabaseState.autoRefreshRequested) {
        supabaseState.autoRefreshRequested = false;
      }
      console.warn('[Supabase] Failed to start auth auto-refresh:', error);
    }
  );
};

const stopAuthAutoRefresh = () => {
  supabaseState.autoRefreshRequested = false;
  enqueueAuthAutoRefreshOperation(
    supabaseState,
    () => supabase.auth.stopAutoRefresh(),
    (error) => {
      console.warn('[Supabase] Failed to stop auth auto-refresh:', error);
    }
  );
};

// React Native apps should explicitly signal foreground/background for auth refresh.
if (Platform.OS !== 'web' && !supabaseState.appStateSubscription) {
  if (AppState.currentState === 'active') {
    startAuthAutoRefresh();
  }

  supabaseState.appStateSubscription = AppState.addEventListener('change', (appState) => {
    if (appState === 'active') {
      startAuthAutoRefresh();
    } else {
      stopAuthAutoRefresh();
    }
  });
}

if (typeof module !== 'undefined' && module.hot) {
  module.hot.dispose(() => {
    cleanupSupabaseClientState(globalThis[CLIENT_STATE_KEY]);
    delete globalThis[CLIENT_STATE_KEY];
  });
}
