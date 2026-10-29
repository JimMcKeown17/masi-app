import { useSignedInEA } from '../context/SignedInEAContext';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTimeTracking } from '../context/TimeTrackingContext';
import { Alert } from 'react-native';
import { CLOCK_IN_STATUS, getClockInStatusForUser } from '../utils/timeEntryStatus';
import { getActiveProgrammeGate } from '../services/activeProgrammeGate';

export const SESSION_CLOCK_WARNING =
  'You are not clocked in.';
export const SESSION_NO_PROGRAMME_TITLE = 'No active programme';
export const SESSION_NO_PROGRAMME_MESSAGE =
  "You don't have a programme assigned yet. Contact your supervisor to be assigned before recording sessions.";

export const useSessionLaunchGuard = ({
  navigation,
  userId,
  sessionRouteName = 'SessionForm',
}) => {
  const { handle, repositories } = useSignedInEA();
  const { handleSignIn } = useTimeTracking();
  const [clockingIn, setClockingIn] = useState(false);
  const clockingInRef = useRef(false);
  const attempt = useRef(0);
  const isLive = (mine) => attempt.current === mine;
  useEffect(() => () => { attempt.current += 1; }, []);

  const [warningVisible, setWarningVisible] = useState(false);
  const [pendingSessionParams, setPendingSessionParams] = useState(undefined);

  const navigateToSession = useCallback((params) => {
    if (params === undefined) {
      navigation.navigate(sessionRouteName);
    } else {
      navigation.navigate(sessionRouteName, params);
    }
  }, [navigation, sessionRouteName]);

  const requestSessionLaunch = useCallback(async (params) => {
    // Programme gate first — covers every launch entry point (Home CTA, Sessions
    // tab) at the shared chokepoint, so an unassigned EA never opens a session
    // form the data layer will reject at save.
    try {
      const { hasActiveProgramme } = await getActiveProgrammeGate({ handle, userId });
      if (!hasActiveProgramme) {
        Alert.alert(SESSION_NO_PROGRAMME_TITLE, SESSION_NO_PROGRAMME_MESSAGE);
        return;
      }
    } catch (error) {
      console.error('Error checking active programme before session launch:', error);
      // Fall through: the data layer still guards the write, so mirror the
      // clock-in check's resilience rather than hard-blocking on a transient error.
    }

    try {
      const status = await getClockInStatusForUser(userId, repositories.timeEntries);
      if (status === CLOCK_IN_STATUS.CLOCKED_IN) {
        navigateToSession(params);
        return;
      }
    } catch (error) {
      console.error('Error checking clock-in status before session launch:', error);
    }

    setPendingSessionParams(params);
    setWarningVisible(true);
  }, [handle, repositories, navigateToSession, userId]);

  const continueAnyway = useCallback(() => {
    if (clockingInRef.current) return;
    const params = pendingSessionParams;
    setWarningVisible(false);
    setPendingSessionParams(undefined);
    navigateToSession(params);
  }, [navigateToSession, pendingSessionParams]);

  const clockInNow = useCallback(async () => {
    if (clockingInRef.current) return;
    const mine = ++attempt.current;
    clockingInRef.current = true;
    setClockingIn(true);
    const params = pendingSessionParams;
    try {
      const clockedIn = await handleSignIn();
      if (!isLive(mine)) return;
      if (clockedIn) {
        setWarningVisible(false);
        setPendingSessionParams(undefined);
        navigateToSession(params);
      }
    } finally {
      if (isLive(mine)) {
        clockingInRef.current = false;
        setClockingIn(false);
      }
    }
  }, [handleSignIn, navigateToSession, pendingSessionParams]);

  const dismissWarning = useCallback(() => {
    // The clock-in can finish, but dismissal ends its permission to continue.
    attempt.current += 1;
    clockingInRef.current = false;
    setClockingIn(false);
    setWarningVisible(false);
    setPendingSessionParams(undefined);
  }, []);

  return {
    warningVisible,
    clockingIn,
    requestSessionLaunch,
    continueAnyway,
    clockInNow,
    dismissWarning,
  };
};
