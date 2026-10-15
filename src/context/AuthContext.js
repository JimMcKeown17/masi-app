import React, { createContext, useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { readPersistedSession, clearPersistedSession } from '../services/persistedAuthSession';
import { requestOpen, requestClose, getCurrentHandle, subscribeToHandle, setLatestAuthSession } from '../session/signedInHandle';

export const AuthContext = createContext(null);
const AUTH_SIGN_OUT_GRACE_PERIOD_MS = 15000;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [handle, setHandle] = useState(getCurrentHandle);
  const [handleStatus, setHandleStatus] = useState('signed_out');
  const [handleError, setHandleError] = useState(null);
  const currentUserRef = useRef(null);
  const generationRef = useRef(0);
  const authCleanupRef = useRef(Promise.resolve());
  const localSignOutCommittedRef = useRef(false);
  const pendingSignOutTimeoutRef = useRef(null);
  const authListenersRef = useRef(new Set());
  const mountedRef = useRef(true);

  const clearPendingSignOutTimeout = () => {
    clearTimeout(pendingSignOutTimeoutRef.current);
    pendingSignOutTimeoutRef.current = null;
  };
  const subscribeToAuthEvents = useCallback((listener) => {
    authListenersRef.current.add(listener);
    return () => authListenersRef.current.delete(listener);
  }, []);
  const openForUser = useCallback(async (authUser) => {
    const generation = ++generationRef.current;
    currentUserRef.current = authUser;
    setUser(authUser);
    setLoading(true);
    setHandleError(null);
    setHandleStatus('opening');
    try {
      const opened = await requestOpen({ userId: authUser.id });
      if (!mountedRef.current || generation !== generationRef.current) return;
      setHandle(opened);
      if (opened) { setHandleStatus('open'); setLoading(false); }
    } catch (error) {
      if (!mountedRef.current || generation !== generationRef.current) return;
      setHandle(null); setHandleError(error); setHandleStatus('failed'); setLoading(false);
    }
  }, []);
  const retryOpenHandle = useCallback(() => {
    if (currentUserRef.current) return openForUser(currentUserRef.current);
  }, [openForUser]);
  const commitSignedOutState = async (reason) => {
    const generation = ++generationRef.current;
    clearPendingSignOutTimeout();
    currentUserRef.current = null;
    setLatestAuthSession(null);
    await requestClose({ reason });
    if (!mountedRef.current || generation !== generationRef.current) return false;
    setSession(null); setUser(null); setHandle(null); setHandleError(null);
    setHandleStatus('signed_out'); setLoading(false);
    return true;
  };
  const finishSignOut = async (reason, signOutClient = false) => {
    const closing = commitSignedOutState(reason);
    const generation = generationRef.current;
    if (!await closing || generation !== generationRef.current) return;
    // Reserve cleanup before yielding. New sign-ins invalidate pending cleanup,
    // and wait for any already-started storage/SDK operation before saving a session.
    const cleanup = authCleanupRef.current.catch(() => {}).then(async () => {
      if (generation !== generationRef.current || !mountedRef.current) return;
      try { await clearPersistedSession(); } catch (error) { console.error('Sign out local cleanup error:', error); }
      if (!signOutClient || generation !== generationRef.current || !mountedRef.current) return;
      authCleanupRef.current = supabase.auth.signOut({ scope: 'local' }).catch((error) => {
        console.warn('[Auth] Background Supabase sign-out failed:', error?.message);
      });
    });
    authCleanupRef.current = cleanup;
    await cleanup;
  };
  const resolveColdStartGate = async (reason) => {
    const generation = generationRef.current;
    if (localSignOutCommittedRef.current) return commitSignedOutState(reason);
    const persisted = await readPersistedSession();
    if (generation !== generationRef.current || !mountedRef.current) return;
    if (persisted?.user?.id) {
      if (currentUserRef.current?.id !== persisted.user.id) {
        setSession(null);
        return openForUser(persisted.user);
      }
      return;
    }
    return commitSignedOutState(reason);
  };

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = subscribeToHandle((next) => {
      if (!mountedRef.current) return;
      setHandle(next);
      if (next) { setHandleStatus('open'); setHandleError(null); setLoading(false); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      for (const listener of authListenersRef.current) listener(event, nextSession ?? null);
      if (nextSession?.user) {
        if (localSignOutCommittedRef.current && event !== 'SIGNED_IN') return;
        ++generationRef.current;
        setLatestAuthSession(nextSession);
        if (event === 'SIGNED_IN') localSignOutCommittedRef.current = false;
        clearPendingSignOutTimeout();
        setSession(nextSession);
        if (currentUserRef.current?.id === nextSession.user.id && getCurrentHandle()?.isOpen()) return;
        // Do not await data work inside the auth client's lock.
        void openForUser(nextSession.user);
        return;
      }
      if (event === 'SIGNED_OUT') {
        const generation = generationRef.current;
        void (async () => {
          const persisted = await readPersistedSession();
          if (generation !== generationRef.current || !mountedRef.current) return;
          if (!localSignOutCommittedRef.current && persisted?.user?.id === currentUserRef.current?.id && persisted?.user?.id) {
            setLatestAuthSession(persisted);
            return;
          }
          localSignOutCommittedRef.current = true;
          await finishSignOut('signed-out');
        })();
        return;
      }
      setLatestAuthSession(null);
      if (event === 'INITIAL_SESSION') { void resolveColdStartGate('initial-session'); return; }
      if (currentUserRef.current && !pendingSignOutTimeoutRef.current) {
        pendingSignOutTimeoutRef.current = setTimeout(() => {
          pendingSignOutTimeoutRef.current = null;
          void commitSignedOutState(`${event}-grace-timeout`);
        }, AUTH_SIGN_OUT_GRACE_PERIOD_MS);
        return;
      }
      void resolveColdStartGate(`${event}-no-active-user`);
    });
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      clearPendingSignOutTimeout();
      unsubscribe(); subscription.unsubscribe(); authListenersRef.current.clear();
    };
  }, [openForUser]);

  const signIn = useCallback(async (email, password) => {
    try {
      ++generationRef.current;
      await authCleanupRef.current;
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
    localSignOutCommittedRef.current = true;
    setLatestAuthSession(null);
    await finishSignOut('manual-sign-out', true);
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

  const value = useMemo(() => ({
    user, profile: null, session, loading, handle, handleStatus, handleError, retryOpenHandle,
    signIn, signOut, resetPassword, updatePassword, subscribeToAuthEvents,
  }), [user, session, loading, handle, handleStatus, handleError, retryOpenHandle,
    signIn, signOut, resetPassword, updatePassword, subscribeToAuthEvents]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
