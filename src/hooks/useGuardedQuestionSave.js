import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreventRemove } from '@react-navigation/native';

const NO_FATAL_CODES = [];

export function useGuardedQuestionSave({ navigation, persist, onSaved, fatalCodes = NO_FATAL_CODES }) {
  const allowLeave = useRef(false);
  const inFlight = useRef(false);
  const saved = useRef(false);
  const discarded = useRef(false);
  const mounted = useRef(true);
  const capturedResult = useRef(null);
  const pendingNavigation = useRef(null);
  const [preventLeave, setPreventLeave] = useState(false);
  const [result, setResult] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const [fatalError, setFatalError] = useState(null);
  const [leaveAction, setLeaveAction] = useState(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  usePreventRemove(preventLeave, ({ data }) => {
    if (allowLeave.current) return;
    setSaveError(false);
    setLeaveAction(data.action);
  });

  // Native-stack dismissal must also be released before dispatching a replacement.
  // Keep this effect after usePreventRemove so its committed state releases first.
  useEffect(() => {
    if (preventLeave || !pendingNavigation.current) return;
    const next = pendingNavigation.current;
    pendingNavigation.current = null;
    if (next.kind === 'discard') {
      navigation.dispatch(next.action);
      return;
    }
    onSaved();
  }, [preventLeave, navigation, onSaved]);

  const save = useCallback(async nextResult => {
    if (inFlight.current || saved.current || discarded.current || allowLeave.current) return;
    inFlight.current = true;
    setSaveError(false);
    try {
      await persist(nextResult);
    } catch (error) {
      if (mounted.current && !discarded.current) {
        if (fatalCodes.includes(error?.code)) {
          allowLeave.current = true;
          setFatalError(error.code);
          setSaveError(false);
          setLeaveAction(null);
          setPreventLeave(false);
        } else {
          setSaveError(true);
        }
      }
      return;
    } finally {
      inFlight.current = false;
    }
    saved.current = true;
    allowLeave.current = true;
    if (!mounted.current || discarded.current) return;
    setLeaveAction(null);
    pendingNavigation.current = { kind: 'saved' };
    setPreventLeave(false);
  }, [persist, fatalCodes]);

  const onComplete = useCallback(nextResult => {
    // Capture once, before React commits: queued completions cannot replace this result.
    if (capturedResult.current || allowLeave.current) return;
    capturedResult.current = nextResult;
    setResult(nextResult);
    void save(nextResult);
  }, [save]);

  const onStart = useCallback(() => {
    setPreventLeave(true);
  }, []);

  const dismissSaveError = useCallback(() => setSaveError(false), []);
  const retry = useCallback(() => {
    if (capturedResult.current) return save(capturedResult.current);
  }, [save]);
  const discard = () => {
    discarded.current = true;
    allowLeave.current = true;
    pendingNavigation.current = { kind: 'discard', action: leaveAction };
    setLeaveAction(null);
    setPreventLeave(false);
  };
  const keepTesting = () => {
    setLeaveAction(null);
    if (capturedResult.current && !inFlight.current) setSaveError(true);
  };

  return {
    onStart,
    onComplete,
    result,
    saveError,
    dismissSaveError,
    fatalError,
    retry,
    leaveSheet: {
      visible: leaveAction !== null,
      hasResult: Boolean(result),
      onConfirm: discard,
      onCancel: keepTesting,
    },
  };
}
