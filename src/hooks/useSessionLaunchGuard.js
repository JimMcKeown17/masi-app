import { useCallback, useState } from 'react';
import { CLOCK_IN_STATUS, getClockInStatusForUser } from '../utils/timeEntryStatus';

export const SESSION_CLOCK_WARNING =
  "You're not clocked in. Clock in now or continue anyway?";

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
