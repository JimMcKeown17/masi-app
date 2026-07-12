import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useOffline } from './OfflineContext';
import { timeEntriesRepository, OPEN_TIME_ENTRY_EXISTS } from '../db/repositories/timeEntriesRepository';
import { getCurrentPosition } from '../services/locationService';
import { v4 as uuidv4 } from 'uuid';

const MAX_SHIFT_HOURS = 10;
const MAX_SHIFT_MS = MAX_SHIFT_HOURS * 60 * 60 * 1000;

/**
 * Shared hook for sign in/out time tracking logic.
 * Used by both HomeScreen and TimeTrackingScreen.
 */
function useTimeTrackingState() {
  const { user } = useAuth();
  const { refreshSyncStatus, triggerBackgroundSync } = useOffline();

  const [isSignedIn, setIsSignedIn] = useState(false);
  const [activeEntry, setActiveEntry] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const isSignedInRef = useRef(isSignedIn);
  const activeEntryRef = useRef(activeEntry);
  const userRef = useRef(user);
  userRef.current = user;

  const setSignedInState = useCallback((value) => {
    isSignedInRef.current = value;
    setIsSignedIn(value);
  }, []);

  const setActiveEntryState = useCallback((value) => {
    activeEntryRef.current = value;
    setActiveEntry(value);
  }, []);

  const showSnackbar = useCallback((message) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  }, []);

  const autoClockOut = useCallback(async (entry) => {
    const signInMs = new Date(entry.sign_in_time).getTime();
    const signOutTime = new Date(signInMs + MAX_SHIFT_MS).toISOString();

    const updatedEntry = {
      ...entry,
      sign_out_time: signOutTime,
      sign_out_lat: null,
      sign_out_lon: null,
      auto_clocked_out: true,
      synced: false,
    };

    await timeEntriesRepository.updateTimeEntry(entry.id, updatedEntry);
    setActiveEntryState(null);
    setSignedInState(false);
    await refreshSyncStatus();
    triggerBackgroundSync?.();
    showSnackbar(`Auto clocked out after ${MAX_SHIFT_HOURS} hours.`);
  }, [refreshSyncStatus, triggerBackgroundSync, showSnackbar, setActiveEntryState, setSignedInState]);

  const loadActiveEntry = useCallback(async () => {
    try {
      if (!user?.id) {
        setActiveEntryState(null);
        setSignedInState(false);
        return;
      }

      const active = await timeEntriesRepository.getActiveTimeEntry(user.id);
      if (active) {
        const elapsed = Date.now() - new Date(active.sign_in_time).getTime();
        if (elapsed >= MAX_SHIFT_MS) {
          await autoClockOut(active);
        } else {
          setActiveEntryState(active);
          setSignedInState(true);
        }
      }
    } catch (error) {
      console.error('Error loading active entry:', error);
    }
  }, [user?.id, autoClockOut, setActiveEntryState, setSignedInState]);

  useEffect(() => {
    loadActiveEntry();
  }, [user?.id, loadActiveEntry]);

  useEffect(() => {
    if (!isSignedIn || !activeEntry) return undefined;

    // Low-frequency watchdog: no per-tick state (the 1Hz display lives in the
    // ElapsedTime leaf component); state only changes when the 10h limit trips.
    const checkAutoClockOut = () => {
      const elapsed = Date.now() - new Date(activeEntry.sign_in_time).getTime();
      if (elapsed >= MAX_SHIFT_MS) {
        autoClockOut(activeEntry);
      }
    };

    checkAutoClockOut();
    const interval = setInterval(checkAutoClockOut, 30 * 1000);
    return () => clearInterval(interval);
  }, [isSignedIn, activeEntry, autoClockOut]);

  const formatTime = useCallback((isoString) => {
    if (!isoString) return '--';
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }, []);

  const handleSignIn = useCallback(async () => {
    if (isSignedInRef.current) {
      showSnackbar('Already clocked in. Please clock out first.');
      return;
    }

    setLoadingLocation(true);
    try {
      const locationResult = await getCurrentPosition();
      if (locationResult.error) {
        showSnackbar(`Location error: ${locationResult.error}`);
        return;
      }

      const { latitude, longitude } = locationResult.coords;
      const timeEntry = {
        id: uuidv4(),
        user_id: userRef.current.id,
        sign_in_time: new Date().toISOString(),
        sign_in_lat: latitude,
        sign_in_lon: longitude,
        sign_out_time: null,
        sign_out_lat: null,
        sign_out_lon: null,
        synced: false,
      };

      await timeEntriesRepository.createOpenTimeEntry(timeEntry);
      setActiveEntryState(timeEntry);
      setSignedInState(true);
      await refreshSyncStatus();
      triggerBackgroundSync?.();
      showSnackbar(`Clocked in at ${formatTime(timeEntry.sign_in_time)}`);
    } catch (error) {
      if (error?.code === OPEN_TIME_ENTRY_EXISTS) {
        await loadActiveEntry();
        showSnackbar('Already clocked in. Please clock out first.');
        return;
      }
      console.error('Error signing in:', error);
      showSnackbar('Failed to clock in. Please try again.');
    } finally {
      setLoadingLocation(false);
    }
  }, [
    refreshSyncStatus, triggerBackgroundSync, showSnackbar, formatTime,
    loadActiveEntry, setActiveEntryState, setSignedInState,
  ]);

  const handleSignOut = useCallback(async () => {
    if (!isSignedInRef.current || !activeEntryRef.current) {
      showSnackbar('You must clock in first before clocking out.');
      return;
    }

    setLoadingLocation(true);
    try {
      // Re-resolve from the repository: the cached entry may have been closed
      // by auto-clock-out or another path. Never write a sign_out_time onto a
      // row that is no longer the open entry.
      const current = await timeEntriesRepository.getActiveTimeEntry(userRef.current.id);
      if (!current) {
        setActiveEntryState(null);
        setSignedInState(false);
        showSnackbar('You are not clocked in.');
        return;
      }

      const locationResult = await getCurrentPosition();
      if (locationResult.error) {
        showSnackbar(`Location error: ${locationResult.error}`);
        return;
      }

      const { latitude, longitude } = locationResult.coords;
      const signOutTime = new Date().toISOString();
      const signInMs = new Date(current.sign_in_time).getTime();
      const signOutMs = new Date(signOutTime).getTime();
      const hoursWorked = ((signOutMs - signInMs) / (1000 * 60 * 60)).toFixed(2);

      const updatedEntry = {
        ...current,
        sign_out_time: signOutTime,
        sign_out_lat: latitude,
        sign_out_lon: longitude,
        synced: false,
      };

      await timeEntriesRepository.updateTimeEntry(current.id, updatedEntry);
      setActiveEntryState(null);
      setSignedInState(false);
      await refreshSyncStatus();
      triggerBackgroundSync?.();
      showSnackbar(`Clocked out. ${hoursWorked} hours worked.`);
    } catch (error) {
      console.error('Error signing out:', error);
      showSnackbar('Failed to clock out. Please try again.');
    } finally {
      setLoadingLocation(false);
    }
  }, [
    refreshSyncStatus, triggerBackgroundSync, showSnackbar,
    setActiveEntryState, setSignedInState,
  ]);

  return useMemo(() => ({
    isSignedIn,
    activeEntry,
    loadingLocation,
    snackbarMessage,
    snackbarVisible,
    setSnackbarVisible,
    handleSignIn,
    handleSignOut,
    formatTime,
  }), [
    isSignedIn, activeEntry, loadingLocation, snackbarMessage, snackbarVisible,
    setSnackbarVisible, handleSignIn, handleSignOut, formatTime,
  ]);
}

const TimeTrackingContext = createContext(null);

export function TimeTrackingProvider({ children }) {
  const value = useTimeTrackingState();
  return (
    <TimeTrackingContext.Provider value={value}>
      {children}
    </TimeTrackingContext.Provider>
  );
}

export function useTimeTracking() {
  const context = useContext(TimeTrackingContext);
  if (!context) {
    throw new Error('useTimeTracking must be used within a TimeTrackingProvider');
  }
  return context;
}
