import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import ToastHost from '../components/common/Toast';

// Publishers do not subscribe to the message or obstruction state. Their stable
// identity keeps a toast from restarting domain effects in its publishers.
const ToastContext = createContext(null);
const ToastActorContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [obstructions, setObstructions] = useState(() => new Map());
  const currentActor = useRef(null);
  const nextId = useRef(0);

  const publish = useCallback((options, actorKey) => {
    if (currentActor.current !== null && currentActor.current !== actorKey) return;
    const { message, duration = 3000 } = options;
    let { tone } = options;
    if (!['neutral', 'success', 'error'].includes(tone)) {
      console.error('Toast tone must be neutral, success or error');
      tone = 'neutral';
    }
    setToast({ id: ++nextId.current, message, tone, duration, actorKey, dismissing: false });
  }, []);
  const hide = useCallback((actorKey) => {
    setToast((current) => current?.actorKey === actorKey ? { ...current, dismissing: true } : current);
  }, []);
  const dismiss = useCallback((id) => {
    setToast((current) => current?.id === id ? { ...current, dismissing: true } : current);
  }, []);
  const remove = useCallback((id) => {
    setToast((current) => current?.id === id ? null : current);
  }, []);
  const setActor = useCallback((key) => {
    if (currentActor.current === key) return;
    currentActor.current = key;
    setToast((current) => current?.actorKey === key ? current : null);
  }, []);
  const clearActor = useCallback((key) => {
    // An old scope's cleanup must never unregister the next EA.
    if (currentActor.current === key) setActor(null);
  }, [setActor]);
  const registerObstruction = useCallback((height) => {
    const key = {};
    setObstructions((current) => new Map(current).set(key, height));
    return () => setObstructions((current) => {
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  }, []);
  const api = useMemo(() => ({ publish, hide, setActor, clearActor, registerObstruction }), [publish, hide, setActor, clearActor, registerObstruction]);
  const maxObstruction = Math.max(0, ...obstructions.values());

  return (
    <ToastContext.Provider value={api}>
      <View testID="toast-root" style={styles.root}>
        {children}
        <ToastHost toast={toast} maxObstruction={maxObstruction} onDismiss={dismiss} onExited={remove} />
      </View>
    </ToastContext.Provider>
  );
}

function useToastContext() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}

export function ToastActorScope({ handle, children }) {
  const { setActor, clearActor } = useToastContext();
  const key = `${handle.userId}:${handle.epoch}`;
  useLayoutEffect(() => {
    setActor(key);
    return () => clearActor(key);
  }, [key, setActor, clearActor]);
  return <ToastActorContext.Provider value={handle}>{children}</ToastActorContext.Provider>;
}

export function useToast() {
  const { publish, hide } = useToastContext();
  const handle = useContext(ToastActorContext);
  return useMemo(() => {
    const actorKey = handle ? `${handle.userId}:${handle.epoch}` : null;
    return {
      show: (options) => { if (!handle || handle.isCurrent()) publish(options, actorKey); },
      hide: () => { if (!handle || handle.isCurrent()) hide(actorKey); },
    };
  }, [handle, publish, hide]);
}

export function useToastObstruction(height, active = true) {
  const context = useContext(ToastContext);
  const register = context?.registerObstruction;
  useLayoutEffect(() => {
    if (!register || !active || height <= 0) return undefined;
    return register(height);
  }, [register, height, active]);
}

const styles = StyleSheet.create({ root: { flex: 1 } });
