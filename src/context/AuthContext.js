import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { enqueueSupabaseRequest } from '../services/supabaseRequestQueue';
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

  useEffect(() => {
    const initializeAuthState = async () => {
      try {
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('[Auth] Initial session load failed:', error);
        }

        console.log(`[Auth] INITIAL_SESSION hasSession=${Boolean(initialSession)}`);

        if (initialSession?.user) {
          clearPendingSignOutTimeout();
          currentUserIdRef.current = initialSession.user.id;
          setSession(initialSession);
          setUser(initialSession.user);
          scheduleUserProfileLoad(initialSession.user.id);
          return;
        }

        commitSignedOutState('initial-session-null');
      } catch (error) {
        console.error('[Auth] Unexpected initial session error:', error);
        commitSignedOutState('initial-session-error');
      }
    };

    initializeAuthState();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      console.log(`[Auth] Event=${event} hasSession=${Boolean(nextSession)}`);

      if (nextSession?.user) {
        clearPendingSignOutTimeout();
        currentUserIdRef.current = nextSession.user.id;
        setSession(nextSession);
        setUser(nextSession.user);
        scheduleUserProfileLoad(nextSession.user.id);
        return;
      }

      if (event === 'SIGNED_OUT' && manualSignOutInProgressRef.current) {
        manualSignOutInProgressRef.current = false;
        commitSignedOutState('manual-sign-out');
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

      commitSignedOutState(`${event}-no-active-user`);
    });

    return () => {
      clearPendingSignOutTimeout();
      subscription.unsubscribe();
    };
  }, []);

  const isCurrentProfileLoad = (userId, version) => (
    currentUserIdRef.current === userId && profileLoadVersionRef.current === version
  );

  const scheduleUserProfileLoad = (userId) => {
    profileLoadVersionRef.current += 1;
    const version = profileLoadVersionRef.current;
    setTimeout(() => {
      loadUserProfile(userId, version);
    }, 0);
  };

  const loadUserProfile = async (userId, version = null) => {
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
        const normalizedLocalProfile = normalizeProfile(localProfile);
        setProfile(normalizedLocalProfile);
        setLoading(false);
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
      if (isCurrentProfileLoad(userId, profileLoadVersion)) {
        setLoading(false);
      }
    }
  };

  const signIn = async (email, password) => {
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
  };

  const signOut = async () => {
    try {
      manualSignOutInProgressRef.current = true;
      clearPendingSignOutTimeout();
      await storage.clearUserProfile();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setProfile(null);
      return { error: null };
    } catch (error) {
      manualSignOutInProgressRef.current = false;
      console.error('Sign out error:', error);
      return { error };
    }
  };

  const resetPassword = async (email) => {
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
  };

  const updatePassword = async (newPassword) => {
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
  };

  const refreshProfile = async () => {
    if (user?.id) {
      await loadUserProfile(user.id);
    }
  };

  const value = {
    user,
    profile,
    session,
    loading,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
