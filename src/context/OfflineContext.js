import React, { createContext, useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { supabase } from '../services/supabaseClient';
import { syncAll, getSyncStatus, requeueTerminalRlsFailures } from '../services/offlineSync';
import { syncStateRepository } from '../db/repositories/syncStateRepository';

const BACKGROUND_SYNC_DEBOUNCE_MS = 1000;
export const DOMAIN_PULL_STALENESS_MS = 15 * 60 * 1000;

// Cheap deep-compare for sync status snapshots. The object is small (a few
// counters, a per-table breakdown, and the usually-empty failedItems list),
// and both sides come from the same code path, so key order is stable.
const isSameSyncStatus = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const OfflineContext = createContext({
  isOnline: true,
  isSyncing: false,
  unsyncedCount: 0,
  inFlightCount: 0,
  waitingCount: 0,
  needsAttentionCount: 0,
  nextRetryAt: null,
  syncStatus: {},
  lastSyncResult: null,
  domainPullNonce: 0,
  requestDomainPull: async () => false,
  triggerBackgroundSync: () => {},
  syncNow: async () => {},
  refreshSyncStatus: async () => {},
});

export const OfflineProvider = ({ children }) => {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [inFlightCount, setInFlightCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState({});
  const [lastSyncResult, setLastSyncResult] = useState(null);
  const [domainPullNonce, setDomainPullNonce] = useState(0);

  const appState = useRef(AppState.currentState);
  const activeSyncPromise = useRef(null);
  const activeSyncIsForced = useRef(false);
  const pendingForcedSync = useRef(null);
  const backgroundSyncTimer = useRef(null);
  const isOnlineRef = useRef(isOnline);
  const readyCountRef = useRef(0);
  const inFlightCountRef = useRef(0);
  const currentUserIdRef = useRef(null);
  const triggerBackgroundSyncRef = useRef(() => {});

  // Keep ref in sync with state so event-listener closures always read current value
  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  /**
   * Update sync status (unsynced count, last sync time, etc.)
   */
  const refreshSyncStatus = useCallback(async ({ autoTrigger = true } = {}) => {
    try {
      const status = await getSyncStatus({ ownerUserId: currentUserIdRef.current });
      setUnsyncedCount(status.unsyncedCount);
      setInFlightCount(status.inFlightCount || 0);
      readyCountRef.current = status.readyCount || 0;
      inFlightCountRef.current = status.inFlightCount || 0;
      setSyncStatus(prev => (isSameSyncStatus(prev, status) ? prev : status));

      if (autoTrigger && ((status.readyCount || 0) > 0 || (status.inFlightCount || 0) > 0) && isOnlineRef.current) {
        triggerBackgroundSyncRef.current();
      }

      return status;
    } catch (error) {
      console.error('Error refreshing sync status:', error);
      return null;
    }
  }, []);

  /**
   * Perform a full sync
   * Includes lock to make concurrent callers share the same work
   */
  const syncNow = useCallback((options = {}) => {
    const force = options.force === true;
    if (activeSyncPromise.current) {
      if (force) {
        // The active pass is already forced — it already uploads backed-off rows; just join it.
        if (activeSyncIsForced.current) return activeSyncPromise.current;
        // Active pass is non-forced — coalesce a single forced rerun behind it.
        if (pendingForcedSync.current) return pendingForcedSync.current;
        const queued = activeSyncPromise.current.catch(() => {}).then(() => {
          pendingForcedSync.current = null;
          return syncNow({ force: true });
        });
        pendingForcedSync.current = queued;
        return queued;
      }
      return activeSyncPromise.current;
    }

    if (!isOnlineRef.current) {
      console.log('Cannot sync while offline');
      return Promise.resolve(null);
    }

    const syncPromise = (async () => {
      setIsSyncing(true);
      try {
        console.log('Starting sync...');
        const result = await syncAll({ force });
        setLastSyncResult(result);
        await refreshSyncStatus({ autoTrigger: false });
        console.log('Sync completed:', result);
        return result;
      } catch (error) {
        console.error('Sync failed:', error);
        return { success: false, error };
      } finally {
        activeSyncPromise.current = null;
        activeSyncIsForced.current = false;
        setIsSyncing(false);
      }
    })();

    activeSyncPromise.current = syncPromise;
    activeSyncIsForced.current = force;
    return syncPromise;
  }, [refreshSyncStatus]);

  /**
   * Debounced, non-blocking background sync trigger for write paths and listeners.
   */
  const triggerBackgroundSync = useCallback(() => {
    if (!isOnlineRef.current) return undefined;

    if (backgroundSyncTimer.current) {
      clearTimeout(backgroundSyncTimer.current);
    }

    backgroundSyncTimer.current = setTimeout(() => {
      backgroundSyncTimer.current = null;
      syncNow();
    }, BACKGROUND_SYNC_DEBOUNCE_MS);

    return undefined;
  }, [syncNow]);

  useEffect(() => {
    triggerBackgroundSyncRef.current = triggerBackgroundSync;
  }, [triggerBackgroundSync]);

  const requestDomainPull = useCallback(async (reason) => {
    try {
      const [childDataState, classesState] = await Promise.all([
        syncStateRepository.getPullState('child_data_pull'),
        syncStateRepository.getPullState('classes_pull'),
      ]);
      const staleBefore = Date.now() - DOMAIN_PULL_STALENESS_MS;
      const isStale = (state) => {
        const lastPulledAt = Date.parse(state?.lastPulledAt || '');
        return !Number.isFinite(lastPulledAt) || lastPulledAt < staleBefore;
      };
      if (!isStale(childDataState) && !isStale(classesState)) return false;

      console.log('Requesting domain pull:', reason);
      setDomainPullNonce((nonce) => nonce + 1);
      return true;
    } catch (error) {
      console.error('Error checking domain pull staleness:', error);
      return false;
    }
  }, []);

  /**
   * Network state listener
   * Triggers sync when connection is restored
   */
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = Boolean(state.isConnected) && state.isInternetReachable !== false;
      console.log('Network state changed:', {
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        online
      });

      const wasOffline = !isOnlineRef.current;
      setIsOnline(online);
      isOnlineRef.current = online;

      // If we just came online and have ready or in_flight data, sync
      if (online && wasOffline && (readyCountRef.current > 0 || inFlightCountRef.current > 0)) {
        console.log('Connection restored, triggering sync...');
        triggerBackgroundSyncRef.current();
      }
      if (online && wasOffline) {
        requestDomainPull('reconnect');
      }
    });

    return () => unsubscribe();
  }, [requestDomainPull]);

  /**
   * App state listener
   * Triggers sync when app comes to foreground
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      // App came to foreground
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('App came to foreground');
        refreshSyncStatus();
        requestDomainPull('foreground');

        // Auto-sync if online and have ready or in_flight data
        if (isOnlineRef.current && (readyCountRef.current > 0 || inFlightCountRef.current > 0)) {
          triggerBackgroundSyncRef.current();
        }
      }

      // App going to background
      if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
        console.log('App going to background');
        // Try to sync before backgrounding
        if (isOnlineRef.current && (readyCountRef.current > 0 || inFlightCountRef.current > 0)) {
          triggerBackgroundSyncRef.current();
        }
      }

      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [refreshSyncStatus, requestDomainPull]);

  /**
   * Auth-restore heal: rows RLS-quarantined while the session was dead requeue
   * when a real session returns (#44). Idempotent (healed rows leave the
   * candidate set) and user-scoped, so firing on every restore event is safe.
   * A null INITIAL_SESSION is AuthContext's cold-start concern, not ours.
   */
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const userId = session?.user?.id ?? null;
      currentUserIdRef.current = userId;
      const shouldHeal = event === 'SIGNED_IN'
        || event === 'TOKEN_REFRESHED'
        || (event === 'INITIAL_SESSION' && Boolean(session));
      if (shouldHeal && userId) {
        try {
          await requeueTerminalRlsFailures(userId);
        } catch (error) {
          console.error('Auth-restore requeue failed:', error);
        }
        triggerBackgroundSyncRef.current();
      }
      const shouldRefresh = event === 'SIGNED_IN'
        || event === 'TOKEN_REFRESHED'
        || event === 'SIGNED_OUT'
        || (event === 'INITIAL_SESSION' && Boolean(session));
      if (shouldRefresh) {
        await refreshSyncStatus();
      }
    });
    return () => subscription.unsubscribe();
  }, [refreshSyncStatus]);

  /**
   * Initial load: check network state and sync status
   */
  useEffect(() => {
    const initialize = async () => {
      // Check initial network state
      const netInfoState = await NetInfo.fetch();
      setIsOnline(Boolean(netInfoState.isConnected) && netInfoState.isInternetReachable !== false);

      // Load sync status. refreshSyncStatus schedules a background sync when
      // unsynced work exists, but does not block startup on upload.
      await refreshSyncStatus();
    };

    initialize();
  }, [refreshSyncStatus, triggerBackgroundSync]);

  /**
   * Periodically refresh sync status while app is active
   */
  useEffect(() => {
    const interval = setInterval(() => {
      if (appState.current === 'active') {
        refreshSyncStatus();
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [refreshSyncStatus]);

  const waitingCount = syncStatus.waitingCount ?? unsyncedCount;
  const needsAttentionCount = syncStatus.needsAttentionCount ?? 0;
  const nextRetryAt = syncStatus.nextRetryAt ?? null;

  const value = useMemo(() => ({
    isOnline,
    isSyncing,
    unsyncedCount,
    inFlightCount,
    waitingCount, needsAttentionCount, nextRetryAt,
    syncStatus,
    lastSyncResult,
    domainPullNonce,
    requestDomainPull,
    triggerBackgroundSync,
    syncNow,
    refreshSyncStatus,
  }), [
    isOnline,
    isSyncing,
    unsyncedCount,
    inFlightCount,
    waitingCount,
    needsAttentionCount,
    nextRetryAt,
    syncStatus,
    lastSyncResult,
    domainPullNonce,
    requestDomainPull,
    triggerBackgroundSync,
    syncNow,
    refreshSyncStatus,
  ]);

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
};

export const useOffline = () => {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
};
