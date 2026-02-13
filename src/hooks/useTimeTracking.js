import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import { storage } from '../utils/storage';
import { getCurrentPosition } from '../services/locationService';
import { v4 as uuidv4 } from 'uuid';

/**
 * Shared hook for sign in/out time tracking logic.
 * Used by both HomeScreen and TimeTrackingScreen.
 */
export function useTimeTracking() {
  const { user } = useAuth();
  const { refreshSyncStatus } = useOffline();

  const [isSignedIn, setIsSignedIn] = useState(false);
  const [activeEntry, setActiveEntry] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  const elapsedInterval = useRef(null);

  const showSnackbar = (message) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  useEffect(() => {
    loadActiveEntry();
    return () => {
      if (elapsedInterval.current) {
        clearInterval(elapsedInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isSignedIn && activeEntry) {
      startElapsedTimer();
    } else {
      stopElapsedTimer();
    }
    return () => stopElapsedTimer();
  }, [isSignedIn, activeEntry]);

  const loadActiveEntry = async () => {
    try {
      const entries = await storage.getTimeEntries();
      const active = entries.find(entry => entry.sign_out_time === null);
      if (active) {
        setActiveEntry(active);
        setIsSignedIn(true);
      }
    } catch (error) {
      console.error('Error loading active entry:', error);
    }
  };

  const startElapsedTimer = () => {
    if (elapsedInterval.current) {
      clearInterval(elapsedInterval.current);
    }
    const updateElapsed = () => {
      if (activeEntry?.sign_in_time) {
        const elapsed = Date.now() - new Date(activeEntry.sign_in_time).getTime();
        setElapsedTime(elapsed);
      }
    };
    updateElapsed();
    elapsedInterval.current = setInterval(updateElapsed, 1000);
  };

  const stopElapsedTimer = () => {
    if (elapsedInterval.current) {
      clearInterval(elapsedInterval.current);
      elapsedInterval.current = null;
    }
  };

  const formatElapsedTime = (milliseconds) => {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  const formatTime = (isoString) => {
    if (!isoString) return '--';
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const handleSignIn = async () => {
    if (isSignedIn) {
      showSnackbar('Already signed in. Please sign out first.');
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
        user_id: user.id,
        sign_in_time: new Date().toISOString(),
        sign_in_lat: latitude,
        sign_in_lon: longitude,
        sign_out_time: null,
        sign_out_lat: null,
        sign_out_lon: null,
        synced: false,
      };

      await storage.saveTimeEntry(timeEntry);
      setActiveEntry(timeEntry);
      setIsSignedIn(true);
      await refreshSyncStatus();
      showSnackbar(`Signed in at ${formatTime(timeEntry.sign_in_time)}`);
    } catch (error) {
      console.error('Error signing in:', error);
      showSnackbar('Failed to sign in. Please try again.');
    } finally {
      setLoadingLocation(false);
    }
  };

  const handleSignOut = async () => {
    if (!isSignedIn || !activeEntry) {
      showSnackbar('You must sign in first before signing out.');
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
      const signOutTime = new Date().toISOString();
      const signInMs = new Date(activeEntry.sign_in_time).getTime();
      const signOutMs = new Date(signOutTime).getTime();
      const hoursWorked = ((signOutMs - signInMs) / (1000 * 60 * 60)).toFixed(2);

      const updatedEntry = {
        ...activeEntry,
        sign_out_time: signOutTime,
        sign_out_lat: latitude,
        sign_out_lon: longitude,
        synced: false,
      };

      await storage.updateTimeEntry(activeEntry.id, updatedEntry);
      setActiveEntry(null);
      setIsSignedIn(false);
      setElapsedTime(0);
      await refreshSyncStatus();
      showSnackbar(`Signed out. ${hoursWorked} hours worked.`);
    } catch (error) {
      console.error('Error signing out:', error);
      showSnackbar('Failed to sign out. Please try again.');
    } finally {
      setLoadingLocation(false);
    }
  };

  return {
    isSignedIn,
    activeEntry,
    loadingLocation,
    elapsedTime,
    snackbarMessage,
    snackbarVisible,
    setSnackbarVisible,
    handleSignIn,
    handleSignOut,
    formatElapsedTime,
    formatTime,
  };
}
