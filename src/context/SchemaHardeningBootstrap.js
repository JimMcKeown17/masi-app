import { useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useLookupsContext } from './LookupsContext';
import { useOffline } from './OfflineContext';
import { runSanitizer } from '../services/asyncStorageSanitizer';

export const SchemaHardeningBootstrap = ({ children }) => {
  const { user } = useAuth();
  const { jobTitles } = useLookupsContext();
  const { isOnline, refreshSyncStatus } = useOffline();
  const runningRef = useRef(false);
  const prevOnlineRef = useRef(isOnline);

  const maybeRunSanitizer = async () => {
    if (!user?.id || jobTitles.length === 0 || runningRef.current) return;

    try {
      runningRef.current = true;
      const result = await runSanitizer({
        userId: user.id,
        jobTitlesCache: jobTitles,
      });

      if (
        result.childrenLegacyKeysStripped?.mutated > 0 ||
        result.sessionsEnriched?.mutated > 0
      ) {
        await refreshSyncStatus();
      }
    } catch (error) {
      console.error('Schema hardening sanitizer failed:', error);
    } finally {
      runningRef.current = false;
    }
  };

  useEffect(() => {
    maybeRunSanitizer();
  }, [user?.id, jobTitles.length]);

  useEffect(() => {
    if (!prevOnlineRef.current && isOnline) {
      maybeRunSanitizer();
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline]);

  return children;
};
