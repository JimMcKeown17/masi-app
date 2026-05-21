import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { processLock } from '@supabase/supabase-js';
import { resolveSupabaseProjectConfig } from '../../config/supabaseProjectConfig';

// Local dev uses public env vars; EAS builds fall back to Expo config extra.
const { supabaseUrl, supabaseAnonKey } = resolveSupabaseProjectConfig({
  env: process.env,
  expoExtra: Constants.expoConfig?.extra || {},
});

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
});

// React Native apps should explicitly signal foreground/background for auth refresh.
if (Platform.OS !== 'web') {
  if (AppState.currentState === 'active') {
    supabase.auth.startAutoRefresh();
  }

  AppState.addEventListener('change', (appState) => {
    if (appState === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
