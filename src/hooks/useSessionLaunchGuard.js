import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { CLOCK_IN_STATUS, getClockInStatusForUser } from '../utils/timeEntryStatus';
import { getActiveProgrammeGate } from '../services/activeProgrammeGate';

export const SESSION_CLOCK_WARNING =
  'You are not clocked in.';
export const SESSION_CLOCK_WARNING_COST =
  'If you record without clocking in, your hours for this session will not be counted. '
  + 'Only do this if your GPS will not lock.';

export const SESSION_NO_PROGRAMME_TITLE = 'No active programme';
export const SESSION_NO_PROGRAMME_MESSAGE =
  "You don't have a programme assigned yet. Contact your supervisor to be assigned before recording sessions.";

export const useSessionLaunchGuard = ({
  navigation,
  userId,
  sessionRouteName = 'SessionForm',
  clockInRouteName = 'TimeTracking',
}) => {
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
      const { hasActiveProgramme } = await getActiveProgrammeGate({ userId });
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
      const status = await getClockInStatusForUser(userId);
      if (status === CLOCK_IN_STATUS.CLOCKED_IN) {
        navigateToSession(params);
        return;
      }
    } catch (error) {
      console.error('Error checking clock-in status before session launch:', error);
    }

    setPendingSessionParams(params);
    setWarningVisible(true);
  }, [navigateToSession, userId]);

  const continueAnyway = useCallback(() => {
    const params = pendingSessionParams;
    setWarningVisible(false);
    setPendingSessionParams(undefined);
    navigateToSession(params);
  }, [navigateToSession, pendingSessionParams]);

  const clockInNow = useCallback(() => {
    setWarningVisible(false);
    setPendingSessionParams(undefined);
    navigation.navigate(clockInRouteName);
  }, [clockInRouteName, navigation]);

  const dismissWarning = useCallback(() => {
    setWarningVisible(false);
    setPendingSessionParams(undefined);
  }, []);

  return {
    warningVisible,
    requestSessionLaunch,
    continueAnyway,
    clockInNow,
    dismissWarning,
  };
};
