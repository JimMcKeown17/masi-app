import React, { createContext, useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { readPersistedSession, clearPersistedSession } from '../services/persistedAuthSession';
import { requestOpen, requestClose, getCurrentHandle, subscribeToHandle, setLatestAuthSession } from '../session/signedInHandle';
import { createPasswordVerificationClient } from '../services/passwordVerificationClient';
import { StaleActorError } from '../session/staleActor';

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
  const signOutOperationRef = useRef(null);
  const authMutationRef = useRef(Promise.resolve());
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
  const finishSignOut = (reason, signOutClient = false) => {
    if (signOutOperationRef.current) return signOutOperationRef.current.local;
    // Reserve the entire transition before requestClose can yield. The SDK's
    // SIGNED_OUT notification belongs to this operation, never a second cleanup.
    const operation = {};
    signOutOperationRef.current = operation;
    const closing = commitSignedOutState(reason);
    const generation = generationRef.current;
    operation.local = closing.then(async (committed) => {
      if (!committed || generation !== generationRef.current || !mountedRef.current) return false;
      try { await clearPersistedSession(); } catch (error) { console.error('Sign out local cleanup error:', error); }
      return true;
    });
    operation.complete = operation.local.then(async (committed) => {
      if (!committed || !signOutClient || generation !== generationRef.current || !mountedRef.current) return;
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    }).catch((error) => {
      console.warn('[Auth] Background Supabase sign-out failed:', error?.message);
    }).finally(() => {
      if (signOutOperationRef.current === operation) signOutOperationRef.current = null;
    });
    // The login UI can appear before the SDK finishes, but signIn waits for complete.
    return operation.local;
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
        if (signOutOperationRef.current || (localSignOutCommittedRef.current && !currentUserRef.current)) return;
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

  // Password sign-in does not take the SDK's updateUser lock. Serialize these
  // session-writing calls so an admitted update cannot persist over a new sign-in.
  const runAuthMutation = useCallback((task) => {
    const operation = authMutationRef.current.catch(() => {}).then(task);
    authMutationRef.current = operation.catch(() => {});
    return operation;
  }, []);

  const signIn = useCallback(async (email, password) => {
    try {
      return await runAuthMutation(async () => {
        while (signOutOperationRef.current) await signOutOperationRef.current.complete;
        ++generationRef.current;
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        return { data, error: null };
      });
    } catch (error) {
      console.error('Sign in error:', error);
      return { data: null, error };
    }
  }, [runAuthMutation]);

  const changePassword = useCallback(async ({ currentPassword, newPassword, handle: origin }) => {
    let verificationClient;
    let outcome;
    let phase = 'verification';
    const assertCurrent = () => {
      if (!mountedRef.current || !origin.isCurrent() || localSignOutCommittedRef.current
        || currentUserRef.current?.id !== origin.userId) throw new StaleActorError();
    };
    try {
      assertCurrent();
      verificationClient = createPasswordVerificationClient(origin);
      const { data, error } = await verificationClient.auth.signInWithPassword({
        email: currentUserRef.current.email, password: currentPassword,
      });
      assertCurrent();
      if (error) throw error;
      if (data.user?.id !== origin.userId) throw new StaleActorError();
      phase = 'update';
      outcome = await runAuthMutation(async () => {
        assertCurrent();
        const { data: current, error: sessionError } = await supabase.auth.getSession();
        assertCurrent();
        if (sessionError) throw sessionError;
        if (current.session?.user?.id !== origin.userId) throw new StaleActorError();
        // The server retains the requesting session on password change. Use S1,
        // the app's persisted session, rather than the verification session S2.
        const result = await supabase.auth.updateUser({ password: newPassword });
        assertCurrent();
        return { error: result.error, phase };
      });
    } catch (error) {
      outcome = { error, phase };
    } finally {
      if (verificationClient) {
        try { await verificationClient.auth.signOut({ scope: 'local' }); }
        catch (error) { console.warn('[Auth] Password verification cleanup failed:', error?.message); }
      }
    }
    // Disposing the private session can itself yield across an account switch.
    try { assertCurrent(); } catch (error) { return { error, phase }; }
    return outcome;
  }, [runAuthMutation]);

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
    signIn, signOut, resetPassword, updatePassword, changePassword, subscribeToAuthEvents,
  }), [user, session, loading, handle, handleStatus, handleError, retryOpenHandle,
    signIn, signOut, resetPassword, updatePassword, changePassword, subscribeToAuthEvents]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
