import { useAuth } from './AuthContext';
import { isStaleActorError } from '../session/staleActor';
import { subscribeToFirstCredentials } from '../session/subscribeToFirstCredentials';
import { useSignedInEA } from './SignedInEAContext';
import React, { createContext, useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

import { captureOperationalError, reportSyncResult, reportSyncStatus } from '../services/observability';

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
  authorizeReconcileBreaker: () => false,
  hasReconcileBreakerAuthorization: () => false,
  consumeReconcileBreakerAuthorization: () => false,
  triggerBackgroundSync: () => {},
  syncNow: async () => {},
  refreshSyncStatus: async () => {},
});

export const OfflineProvider = ({ children }) => {
  const { handle, repositories, services } = useSignedInEA();
  const { syncState: syncStateRepository } = repositories;

  const { subscribeToAuthEvents } = useAuth();
  const [isOnline, setIsOnline] = useState(false);
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
  const incidentReadyCountRef = useRef(0);
  const inFlightCountRef = useRef(0);
  const triggerBackgroundSyncRef = useRef(() => {});
  const reconcileBreakerAuthorizationsRef = useRef(new Set());

  // Domain rows and queued support incidents both need an upload pass. Incidents are never
  // shown to the EA and never count as unsent work; they only decide whether a pass runs.
  const hasUploadWork = () => (
    readyCountRef.current > 0 || inFlightCountRef.current > 0 || incidentReadyCountRef.current > 0
  );

  // Keep ref in sync with state so event-listener closures always read current value
  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  /**
   * Update sync status (unsynced count, last sync time, etc.)
   */
  const refreshSyncStatus = useCallback(async ({ autoTrigger = true } = {}) => {
    try {
      const [outboxStatus, reconcileBreakerNotes] = await Promise.all([
        services.syncEngine.getSyncStatus({ ownerUserId: handle.userId }),
        syncStateRepository.getReconcileBreakerNotes(),
      ]);
      if (!handle.isCurrent()) return null;
      const status = {
        ...outboxStatus,
        needsAttentionCount: (outboxStatus.needsAttentionCount || 0) + reconcileBreakerNotes.length,
        reconcileBreakerNotes,
      };
      setUnsyncedCount(status.unsyncedCount);
      setInFlightCount(status.inFlightCount || 0);
      readyCountRef.current = status.readyCount || 0;
      incidentReadyCountRef.current = status.incidentReadyCount || 0;
      inFlightCountRef.current = status.inFlightCount || 0;
      setSyncStatus(prev => (isSameSyncStatus(prev, status) ? prev : status));

      try {
        reportSyncStatus(status, {
          source: 'status_refresh',
          isOnline: isOnlineRef.current,
        });
      } catch (observabilityError) {
        console.warn('Could not report sync status:', observabilityError);
      }

      if (autoTrigger && hasUploadWork() && isOnlineRef.current) {
        triggerBackgroundSyncRef.current();
      }

      return status;
    } catch (error) {
      if (isStaleActorError(error)) return null;
      console.error('Error refreshing sync status:', error);
      captureOperationalError(error, {
        category: 'sync_status_refresh',
        context: { ownerUserId: handle.userId },
      });
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    handle.discovery?.then(() => { if (active && handle.isCurrent()) void refreshSyncStatus(); });
    return () => { active = false; };
  }, [handle, refreshSyncStatus]);

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

    if (!handle.isCurrent() || !isOnlineRef.current) {
      console.log('Cannot sync while offline');
      return Promise.resolve(null);
    }

    const syncPromise = (async () => {
      setIsSyncing(true);
      try {
        console.log('Starting sync...');
        const result = await services.syncEngine.syncAll({ force });
        setLastSyncResult(result);
        try {
          reportSyncResult(result, {
            source: 'sync_now',
            force,
            isOnline: isOnlineRef.current,
          });
        } catch (observabilityError) {
          console.warn('Could not report sync result:', observabilityError);
        }
        await refreshSyncStatus({ autoTrigger: false });
        console.log('Sync completed:', result);
        return result;
      } catch (error) {
        if (isStaleActorError(error)) return null;
        console.error('Sync failed:', error);
        captureOperationalError(error, {
          category: 'sync_pass_failed',
          context: { force },
        });
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
  }, [handle, services, refreshSyncStatus]);

  /**
   * Debounced, non-blocking background sync trigger for write paths and listeners.
   */
  const triggerBackgroundSync = useCallback(() => {
    if (!handle.isCurrent() || !isOnlineRef.current) return undefined;

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

  const requestDomainPull = useCallback(async (reason, { force = false } = {}) => {
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
      if (!force && !isStale(childDataState) && !isStale(classesState)) return false;

      console.log('Requesting domain pull:', reason);
      if (!handle.isCurrent()) return false;
      setDomainPullNonce((nonce) => nonce + 1);
      return true;
    } catch (error) {
      if (isStaleActorError(error)) return null;
      console.error('Error checking domain pull staleness:', error);
      return false;
    }
  }, []);

  const requestDomainPullOrResumeHistory = useCallback(async (reason) => {
    // The roster staleness check runs exactly as before (online or not); only the new
    // history resume is gated on connectivity.
    const userId = handle.userId;
    const rosterPullRequested = await requestDomainPull(reason);
    // A requested roster pull starts history after persisting delivery assignments.
    // Otherwise let history's own admission and single flight decide whether to run.
    if (!rosterPullRequested && userId && isOnlineRef.current && handle.isCurrent()) {
      void services.sessionHistory.start().catch((error) => { if (!isStaleActorError(error)) console.error('Session history failed:', error); });
    }
  }, [requestDomainPull]);

  useEffect(() => subscribeToFirstCredentials({
    // Mount pulls failed without credentials; recent stamps from an earlier launch must not skip the retry.
    handle, subscribeToAuthEvents, onCredentials: () => requestDomainPull('credentials', { force: true }),
  }), [handle, subscribeToAuthEvents, requestDomainPull]);

  const authorizeReconcileBreaker = useCallback((scope) => {
    if (!scope) return false;
    reconcileBreakerAuthorizationsRef.current.add(scope);
    setDomainPullNonce((nonce) => nonce + 1);
    return true;
  }, []);

  const consumeReconcileBreakerAuthorization = useCallback((scope) => {
    if (!reconcileBreakerAuthorizationsRef.current.has(scope)) return false;
    reconcileBreakerAuthorizationsRef.current.delete(scope);
    return true;
  }, []);

  const hasReconcileBreakerAuthorization = useCallback(
    (scope) => reconcileBreakerAuthorizationsRef.current.has(scope),
    []
  );

  /**
   * Network state listener
   * Triggers sync when connection is restored
   */
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (!handle.isCurrent()) return;
      const online = Boolean(state.isConnected) && state.isInternetReachable !== false;
      console.log('Network state changed:', {
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        online
      });

      const wasOffline = !isOnlineRef.current;
      setIsOnline(online);
      isOnlineRef.current = online;

      // Reconnect uploads ready domain work, stranded in-flight rows and due incidents.
      if (online && wasOffline && hasUploadWork()) {
        console.log('Connection restored, triggering sync...');
        triggerBackgroundSyncRef.current();
      }
      if (online && wasOffline) {
        requestDomainPullOrResumeHistory('reconnect');
      }
    });

    return () => unsubscribe();
  }, [requestDomainPullOrResumeHistory]);

  /**
   * App state listener
   * Triggers sync when app comes to foreground
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (!handle.isCurrent()) return;
      // App came to foreground
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('App came to foreground');
        refreshSyncStatus();
        requestDomainPullOrResumeHistory('foreground');

        // Auto-sync if online and any upload work is ready.
        if (isOnlineRef.current && hasUploadWork()) {
          triggerBackgroundSyncRef.current();
        }
      }

      // App going to background
      if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
        console.log('App going to background');
        // Try to sync before backgrounding
        if (isOnlineRef.current && hasUploadWork()) {
          triggerBackgroundSyncRef.current();
        }
      }

      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [refreshSyncStatus, requestDomainPullOrResumeHistory]);

  // A handle is already repaired before publication. Heal its RLS failures once
  // at mount and on same-user token restoration through AuthContext.
  useEffect(() => {
    const heal = async ({ scheduleSync = false } = {}) => {
      try {
        await services.syncEngine.requeueTerminalRlsFailures(handle.userId);
        if (!handle.isCurrent()) return;
        await refreshSyncStatus();
        if (scheduleSync) triggerBackgroundSyncRef.current();
      } catch (error) {
        if (isStaleActorError(error)) return null;
        if (!isStaleActorError(error)) console.error('Auth-restore requeue failed:', error);
      }
    };
    void heal();
    return subscribeToAuthEvents((event, session) => {
      if (session?.user?.id === handle.userId && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) void heal({ scheduleSync: true });
    });
  }, [handle, services, subscribeToAuthEvents, refreshSyncStatus]);

  /**
   * Initial load: check network state and sync status
   */
  useEffect(() => {
    const initialize = async () => {
      // Check initial network state
      const netInfoState = await NetInfo.fetch();
      if (!handle.isCurrent()) return;
      isOnlineRef.current = Boolean(netInfoState.isConnected) && netInfoState.isInternetReachable !== false;
      setIsOnline(isOnlineRef.current);

      // Load sync status. refreshSyncStatus schedules a background sync when
      // unsynced work exists, but does not block startup on upload.
      await refreshSyncStatus();
    };

    void initialize().catch((error) => { if (!isStaleActorError(error)) console.error('Offline initialization failed:', error); });
    return () => { clearTimeout(backgroundSyncTimer.current); backgroundSyncTimer.current = null; };
  }, [handle, refreshSyncStatus, triggerBackgroundSync]);

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
    authorizeReconcileBreaker,
    hasReconcileBreakerAuthorization,
    consumeReconcileBreakerAuthorization,
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
    authorizeReconcileBreaker,
    hasReconcileBreakerAuthorization,
    consumeReconcileBreakerAuthorization,
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
