import React, { createContext, useState, useEffect, useContext, useRef, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { syncAll, getSyncStatus } from '../services/offlineSync';

const BACKGROUND_SYNC_DEBOUNCE_MS = 1000;

const OfflineContext = createContext({
  isOnline: true,
  isSyncing: false,
  unsyncedCount: 0,
  syncStatus: {},
  lastSyncResult: null,
  triggerBackgroundSync: () => {},
  syncNow: async () => {},
  refreshSyncStatus: async () => {},
});

export const OfflineProvider = ({ children }) => {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState({});
  const [lastSyncResult, setLastSyncResult] = useState(null);

  const appState = useRef(AppState.currentState);
  const activeSyncPromise = useRef(null);
  const activeSyncIsForced = useRef(false);
  const pendingForcedSync = useRef(null);
  const backgroundSyncTimer = useRef(null);
  const isOnlineRef = useRef(isOnline);
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
      const status = await getSyncStatus();
      setUnsyncedCount(status.unsyncedCount);
      setSyncStatus(status);

      if (autoTrigger && status.unsyncedCount > 0 && isOnlineRef.current) {
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

  /**
   * Network state listener
   * Triggers sync when connection is restored
   */
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = state.isConnected && state.isInternetReachable;
      console.log('Network state changed:', {
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        online
      });

      const wasOffline = !isOnline;
      setIsOnline(online);

      // If we just came online and have unsynced data, sync
      if (online && wasOffline && unsyncedCount > 0) {
        console.log('Connection restored, triggering sync...');
        triggerBackgroundSync();
      }
    });

    return () => unsubscribe();
  }, [isOnline, unsyncedCount]);

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

        // Auto-sync if online and have unsynced data
        if (isOnline && unsyncedCount > 0) {
          triggerBackgroundSync();
        }
      }

      // App going to background
      if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
        console.log('App going to background');
        // Try to sync before backgrounding
        if (isOnline && unsyncedCount > 0) {
          triggerBackgroundSync();
        }
      }

      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [isOnline, unsyncedCount, triggerBackgroundSync, refreshSyncStatus]);

  /**
   * Initial load: check network state and sync status
   */
  useEffect(() => {
    const initialize = async () => {
      // Check initial network state
      const netInfoState = await NetInfo.fetch();
      setIsOnline(netInfoState.isConnected && netInfoState.isInternetReachable);

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

  const value = {
    isOnline,
    isSyncing,
    unsyncedCount,
    syncStatus,
    lastSyncResult,
    triggerBackgroundSync,
    syncNow,
    refreshSyncStatus,
  };

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
