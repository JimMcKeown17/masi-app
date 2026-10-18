import React, { createContext, useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { readPersistedSession, clearPersistedSession } from '../services/persistedAuthSession';
import { admitAuthSessionUser, revokeAuthSessionAdmission, normalizeAuthEmail } from '../services/authSessionStorage';
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
  const signInPendingRef = useRef(null);
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
    signInPendingRef.current = null;
    revokeAuthSessionAdmission();
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
      if (!committed || generation !== generationRef.current || !mountedRef.current) return;
      try {
        // The SDK lock drains admitted update/refresh work, including storage
        // writes that had already started before admission was revoked.
        const { error } = signOutClient
          ? await supabase.auth.signOut({ scope: 'local' })
          : await supabase.auth.getSession();
        if (error) throw error;
      } finally {
        // Remote logout failures must not leave an admitted late write durable.
        await clearPersistedSession();
      }
    }).catch((error) => {
      console.warn('[Auth] Background Supabase sign-out failed:', error?.message);
    }).finally(() => {
      if (signOutOperationRef.current === operation) signOutOperationRef.current = null;
    });
    // The login UI can appear before the SDK finishes, but signIn waits for complete.
    return operation.local;
  };
  const resolveColdStartGate = async (reason) => {
    if (signInPendingRef.current || signOutOperationRef.current) return;
    const generation = generationRef.current;
    if (localSignOutCommittedRef.current) return commitSignedOutState(reason);
    const persisted = await readPersistedSession();
    if (generation !== generationRef.current || !mountedRef.current) return;
    if (persisted?.user?.id) {
      admitAuthSessionUser({ id: persisted.user.id });
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
      // The SDK delivers its initial storage read asynchronously. An explicit
      // login has already taken ownership of admission, even before its response.
      if (event === 'INITIAL_SESSION' && signInPendingRef.current) return;
      for (const listener of authListenersRef.current) listener(event, nextSession ?? null);
      if (nextSession?.user) {
        const pendingSignIn = signInPendingRef.current;
        if (event === 'SIGNED_IN' && pendingSignIn
          && normalizeAuthEmail(nextSession.user.email) !== pendingSignIn.email) return;
        if (localSignOutCommittedRef.current && event !== 'SIGNED_IN') return;
        if (event !== 'SIGNED_IN' && currentUserRef.current
          && currentUserRef.current.id !== nextSession.user.id) return;
        if ((event === 'SIGNED_IN' && pendingSignIn) || event === 'INITIAL_SESSION') {
          admitAuthSessionUser({ id: nextSession.user.id });
        }
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
          localSignOutCommittedRef.current = true;
          void finishSignOut(`${event}-grace-timeout`);
        }, AUTH_SIGN_OUT_GRACE_PERIOD_MS);
        return;
      }
      void resolveColdStartGate(`${event}-no-active-user`);
    });
    // Offline initialization can lose INITIAL_SESSION while the auth lock is held.
    void resolveColdStartGate('mount-persisted');
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      clearPendingSignOutTimeout();
      unsubscribe(); subscription.unsubscribe(); authListenersRef.current.clear();
    };
  }, [openForUser]);

  // Serialize password changes with each other. Session storage admission fences
  // their late results, so explicit sign-in need not join this queue.
  const runAuthMutation = useCallback((task) => {
    const operation = authMutationRef.current.catch(() => {}).then(task);
    authMutationRef.current = operation.catch(() => {});
    return operation;
  }, []);

  const signIn = useCallback(async (email, password) => {
    let attempt;
    try {
      while (signOutOperationRef.current) await signOutOperationRef.current.complete;
      ++generationRef.current;
      attempt = {
        email: normalizeAuthEmail(email),
        previousAdmission: null,
      };
      const previous = admitAuthSessionUser({ email: attempt.email });
      // Snapshot admission itself, which may already be restored before the UI.
      // A superseded login retains the last settled identity for failure rollback.
      attempt.previousAdmission = previous?.id ? previous : signInPendingRef.current?.previousAdmission ?? null;
      signInPendingRef.current = attempt;
      const { data, error } = await supabase.auth.signInWithPassword({
        email: attempt.email,
        password,
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      if (attempt && signInPendingRef.current === attempt) {
        admitAuthSessionUser(attempt.previousAdmission);
      }
      console.error('Sign in error:', error);
      return { data: null, error };
    } finally {
      if (signInPendingRef.current === attempt) signInPendingRef.current = null;
    }
  }, []);

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
