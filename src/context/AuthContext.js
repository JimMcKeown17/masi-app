import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { storage } from '../utils/storage';

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

  const clearPendingSignOutTimeout = () => {
    if (pendingSignOutTimeoutRef.current) {
      clearTimeout(pendingSignOutTimeoutRef.current);
      pendingSignOutTimeoutRef.current = null;
    }
  };

  const commitSignedOutState = (reason) => {
    clearPendingSignOutTimeout();
    currentUserIdRef.current = null;
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
          loadUserProfile(initialSession.user.id);
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
        loadUserProfile(nextSession.user.id);
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

  const loadUserProfile = async (userId) => {
    try {
      // Try to load from local storage first
      const localProfile = await storage.getUserProfile();
      if (localProfile) {
        setProfile(localProfile);
        setLoading(false);
      }

      // Then fetch from Supabase
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error loading profile:', error);
      } else if (data) {
        setProfile(data);
        await storage.saveUserProfile(data);
      }
    } catch (error) {
      console.error('Error in loadUserProfile:', error);
    } finally {
      setLoading(false);
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
