import React, { useCallback, useEffect, useRef, useState } from 'react';
import { openDatabaseAsync } from 'expo-sqlite';
import { captureOperationalError } from '../../services/observability';
import HandleOpenError from './HandleOpenError';
import LoadingScreen from './LoadingScreen';

export default function DatabaseBootstrapGate({ children }) {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const attemptRef = useRef(0);
  const attemptBootstrap = useCallback(async () => {
    const attempt = ++attemptRef.current;
    setStatus('loading'); setError(null);
    try {
      const probe = await openDatabaseAsync(':memory:');
      await probe.closeAsync();
      if (attemptRef.current === attempt) setStatus('ready');
    } catch (cause) {
      captureOperationalError(cause, { category: 'sqlite_bootstrap_failed', context: { attempt, code: cause?.code || 'SQLITE_BOOTSTRAP' } });
      if (attemptRef.current === attempt) { setError(cause); setStatus('failed'); }
    }
  }, []);
  useEffect(() => { void attemptBootstrap(); return () => { attemptRef.current += 1; }; }, [attemptBootstrap]);
  if (status === 'ready') return children;
  if (status === 'loading') return <LoadingScreen />;
  return <HandleOpenError error={error} onRetry={attemptBootstrap} />;
}
