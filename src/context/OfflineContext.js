import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { syncAll, getSyncStatus } from '../services/offlineSync';

const OfflineContext = createContext({
  isOnline: true,
  isSyncing: false,
  unsyncedCount: 0,
  syncStatus: {},
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
  const syncInProgress = useRef(false);
  const isOnlineRef = useRef(isOnline);

  // Keep ref in sync with state so event-listener closures always read current value
  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  /**
   * Update sync status (unsynced count, last sync time, etc.)
   */
  const refreshSyncStatus = async () => {
    try {
      const status = await getSyncStatus();
      setUnsyncedCount(status.unsyncedCount);
      setSyncStatus(status);

      // If there are unsynced items and we're online, kick off sync.
      // syncNow has its own lock (syncInProgress) so this is safe to call
      // repeatedly. No loop risk: after sync completes it calls refreshSyncStatus
      // again, but by then unsyncedCount is 0.
      if (status.unsyncedCount > 0 && isOnlineRef.current && !syncInProgress.current) {
        syncNow();
      }
    } catch (error) {
      console.error('Error refreshing sync status:', error);
    }
  };

  /**
   * Perform a full sync
   * Includes lock to prevent multiple simultaneous syncs
   */
  const syncNow = async () => {
    // Prevent multiple syncs running at once
    if (syncInProgress.current) {
      console.log('Sync already in progress, skipping...');
      return lastSyncResult;
    }

    // Don't sync if offline
    if (!isOnlineRef.current) {
      console.log('Cannot sync while offline');
      return null;
    }

    try {
      syncInProgress.current = true;
      setIsSyncing(true);

      console.log('Starting sync...');
      const result = await syncAll();

      setLastSyncResult(result);
      await refreshSyncStatus();

      console.log('Sync completed:', result);
      return result;
    } catch (error) {
      console.error('Sync failed:', error);
      return { success: false, error };
    } finally {
      syncInProgress.current = false;
      setIsSyncing(false);
    }
  };

  /**
   * Auto-sync when conditions are met
   */
  const autoSync = async () => {
    if (isOnline && unsyncedCount > 0 && !syncInProgress.current) {
      console.log('Auto-syncing...');
      await syncNow();
    }
  };

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
        setTimeout(() => autoSync(), 1000); // Small delay to let network stabilize
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
          setTimeout(() => autoSync(), 500);
        }
      }

      // App going to background
      if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
        console.log('App going to background');
        // Try to sync before backgrounding
        if (isOnline && unsyncedCount > 0) {
          autoSync();
        }
      }

      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [isOnline, unsyncedCount]);

  /**
   * Initial load: check network state and sync status
   */
  useEffect(() => {
    const initialize = async () => {
      // Check initial network state
      const netInfoState = await NetInfo.fetch();
      setIsOnline(netInfoState.isConnected && netInfoState.isInternetReachable);

      // Load sync status
      await refreshSyncStatus();

      // Auto-sync if online and have unsynced data
      if (netInfoState.isConnected && netInfoState.isInternetReachable) {
        setTimeout(() => autoSync(), 2000); // Give app time to initialize
      }
    };

    initialize();
  }, []);

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
  }, []);

  const value = {
    isOnline,
    isSyncing,
    unsyncedCount,
    syncStatus,
    lastSyncResult,
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
