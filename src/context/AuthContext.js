import React, { createContext, useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { enqueueSupabaseRequest } from '../services/supabaseRequestQueue';
import { pullReferenceData } from '../services/offlineSync';
import { readPersistedSession, clearPersistedSession } from '../services/persistedAuthSession';
import { storage } from '../utils/storage';
import { normalizeProfile } from '../utils/profileNormalizer';

const AuthContext = createContext({});
const AUTH_SIGN_OUT_GRACE_PERIOD_MS = 15000;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const manualSignOutInProgressRef = useRef(false);
  const localSignOutCommittedRef = useRef(false);
  const pendingSignOutTimeoutRef = useRef(null);
  const currentUserIdRef = useRef(null);
  const profileLoadVersionRef = useRef(0);

  const clearPendingSignOutTimeout = () => {
    if (pendingSignOutTimeoutRef.current) {
      clearTimeout(pendingSignOutTimeoutRef.current);
      pendingSignOutTimeoutRef.current = null;
    }
  };

  const commitSignedOutState = (reason) => {
    clearPendingSignOutTimeout();
    currentUserIdRef.current = null;
    profileLoadVersionRef.current += 1;
    setSession(null);
    setUser(null);
    setProfile(null);
    setLoading(false);
    console.warn(`[Auth] Cleared local auth state (${reason})`);
  };

  const invalidateProfileLoads = () => {
    currentUserIdRef.current = null;
    profileLoadVersionRef.current += 1;
  };

  const restoreOfflineSession = (persistedSession, reason) => {
    clearPendingSignOutTimeout();
    currentUserIdRef.current = persistedSession.user.id;
    setSession(null);
    setLoading(true);
    scheduleAuthenticatedStartup(persistedSession.user);
    console.log(`[Auth] Restored persisted offline session (${reason})`);
  };

  const resolveColdStartGate = async (reason) => {
    if (localSignOutCommittedRef.current) {
      commitSignedOutState(`${reason}-after-local-sign-out`);
      return;
    }
    const persistedSession = await readPersistedSession();
    const persistedUserId = persistedSession?.user?.id ?? null;
    if (persistedUserId && persistedUserId === currentUserIdRef.current) {
      setLoading(false);
      return;
    }
    if (persistedUserId && !currentUserIdRef.current) {
      restoreOfflineSession(persistedSession, reason);
      return;
    }
    commitSignedOutState(reason);
  };

  useEffect(() => {
    // Supabase emits INITIAL_SESSION through this subscription after its own
    // storage recovery finishes; calling getSession here creates a second
    // startup lock contender on Android.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      console.log(`[Auth] Event=${event} hasSession=${Boolean(nextSession)}`);

      if (nextSession?.user) {
        if (localSignOutCommittedRef.current && event !== 'SIGNED_IN') return;
        if (event === 'SIGNED_IN') {
          localSignOutCommittedRef.current = false;
        }
        clearPendingSignOutTimeout();
        setSession(nextSession);
        if (event === 'TOKEN_REFRESHED' && currentUserIdRef.current === nextSession.user.id) {
          return;
        }
        currentUserIdRef.current = nextSession.user.id;
        setLoading(true);
        scheduleAuthenticatedStartup(nextSession.user);
        return;
      }

      if (event === 'SIGNED_OUT') {
        if (manualSignOutInProgressRef.current) {
          manualSignOutInProgressRef.current = false;
          commitSignedOutState('manual-sign-out');
          return;
        }
        const persisted = await readPersistedSession();
        if (persisted?.user?.id && persisted.user.id === currentUserIdRef.current) {
          console.warn('[Auth] Ignoring stale SIGNED_OUT; a valid session for the current user persists');
          return;
        }
        localSignOutCommittedRef.current = true;
        await storage.clearUserProfile();
        await clearPersistedSession();
        commitSignedOutState('signed-out');
        return;
      }

      if (event === 'INITIAL_SESSION') {
        resolveColdStartGate(`${event}-no-active-user`);
        return;
      }

      // Be forgiving of transient auth drops; only sign out after a short grace period.
      if (currentUserIdRef.current && !pendingSignOutTimeoutRef.current) {
        console.warn(
          `[Auth] ${event} with empty session, waiting ${AUTH_SIGN_OUT_GRACE_PERIOD_MS}ms before logout`
        );
        pendingSignOutTimeoutRef.current = setTimeout(() => {
          pendingSignOutTimeoutRef.current = null;
          commitSignedOutState(`${event}-grace-timeout`);
        }, AUTH_SIGN_OUT_GRACE_PERIOD_MS);
        setLoading(false);
        return;
      }

      resolveColdStartGate(`${event}-no-active-user`);
    });

    return () => {
      clearPendingSignOutTimeout();
      subscription.unsubscribe();
    };
  }, []);

  const isCurrentProfileLoad = (userId, version) => (
    currentUserIdRef.current === userId && profileLoadVersionRef.current === version
  );

  const scheduleAuthenticatedStartup = (authUser) => {
    profileLoadVersionRef.current += 1;
    const version = profileLoadVersionRef.current;
    setTimeout(() => {
      hydrateAuthenticatedUser(authUser, version);
    }, 0);
  };

  const hydrateAuthenticatedUser = async (authUser, version) => {
    try {
      try {
        await pullReferenceData({ userId: authUser.id });
      } catch (error) {
        console.error('Error pulling startup reference data:', error);
      }

      if (!isCurrentProfileLoad(authUser.id, version)) {
        return;
      }

      await loadUserProfile(authUser.id, version, { setLoadingOnComplete: false });
    } finally {
      if (isCurrentProfileLoad(authUser.id, version)) {
        setUser(authUser);
        setLoading(false);
      }
    }
  };

  const loadUserProfile = async (userId, version = null, { setLoadingOnComplete = true } = {}) => {
    const profileLoadVersion = version || profileLoadVersionRef.current + 1;
    if (!version) {
      profileLoadVersionRef.current = profileLoadVersion;
    }

    try {
      // Try to load from local storage first
      const localProfile = await storage.getUserProfile();
      if (!isCurrentProfileLoad(userId, profileLoadVersion)) {
        return;
      }

      if (localProfile) {
        if (localProfile.id === userId) {
          const normalizedLocalProfile = normalizeProfile(localProfile);
          setProfile(normalizedLocalProfile);
          if (setLoadingOnComplete) {
            setLoading(false);
          }
        } else {
          await storage.clearUserProfile();
        }
      }

      // Then fetch from Supabase
      const { data, error } = await enqueueSupabaseRequest(() => (
        supabase
          .from('users')
          .select('*, school_lookup:schools(id,name), job_title_lookup:job_titles(id,name,code)')
          .eq('id', userId)
          .single()
      ));

      if (!isCurrentProfileLoad(userId, profileLoadVersion)) {
        return;
      }

      if (error) {
        console.error('Error loading profile:', error);
      } else if (data) {
        const normalizedProfile = normalizeProfile(data);
        setProfile(normalizedProfile);
        await storage.saveUserProfile(normalizedProfile);
      }
    } catch (error) {
      console.error('Error in loadUserProfile:', error);
    } finally {
      if (setLoadingOnComplete && isCurrentProfileLoad(userId, profileLoadVersion)) {
        setLoading(false);
      }
    }
  };

  const signIn = useCallback(async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Sign in error:', error);
      return { data: null, error };
    }
  }, []);

  const signOut = useCallback(async () => {
    manualSignOutInProgressRef.current = true;
    clearPendingSignOutTimeout();
    invalidateProfileLoads();
    localSignOutCommittedRef.current = true;
    setSession(null);
    setUser(null);
    setProfile(null);
    setLoading(false);
    try {
      await storage.clearUserProfile();
      await clearPersistedSession();
    } catch (error) {
      console.error('Sign out local cleanup error:', error);
    }
    supabase.auth.signOut({ scope: 'local' }).catch((error) => {
      console.warn('[Auth] Background Supabase sign-out failed:', error?.message);
    });
    manualSignOutInProgressRef.current = false;
    return { error: null };
  }, []);

  const resetPassword = useCallback(async (email) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'masi-app://reset-password',
      });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('Reset password error:', error);
      return { error };
    }
  }, []);

  const updatePassword = useCallback(async (newPassword) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('Update password error:', error);
      return { error };
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await loadUserProfile(user.id);
    }
  }, [user?.id]);

  const value = useMemo(() => ({
    user,
    profile,
    session,
    loading,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    refreshProfile,
  }), [
    user, profile, session, loading, signIn, signOut,
    resetPassword, updatePassword, refreshProfile,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
