import * as Location from 'expo-location';
import { Alert, Linking } from 'react-native';

import {
  getCurrentPosition,
  requestLocationPermission,
} from '../src/services/locationService';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 'balanced' },
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
}));

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Linking: { openSettings: jest.fn() },
}));

const LIVE_POSITION = {
  coords: {
    latitude: -33.96,
    longitude: 25.6,
    accuracy: 42,
  },
  timestamp: 1000,
};

const LAST_KNOWN_POSITION = {
  coords: {
    latitude: -33.961,
    longitude: 25.601,
    accuracy: 75,
  },
  timestamp: 2000,
};

const waitForMockCall = async (mockFn) => {
  for (let attempt = 0; attempt < 10 && mockFn.mock.calls.length === 0; attempt += 1) {
    await Promise.resolve();
  }
  expect(mockFn).toHaveBeenCalled();
};

describe('locationService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    Location.hasServicesEnabledAsync.mockResolvedValue(true);
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.getLastKnownPositionAsync.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getCurrentPosition', () => {
    test('resolves with coords when the live fix arrives in time', async () => {
      Location.getCurrentPositionAsync.mockResolvedValue(LIVE_POSITION);

      await expect(getCurrentPosition()).resolves.toEqual({
        coords: LIVE_POSITION.coords,
        timestamp: LIVE_POSITION.timestamp,
        error: null,
      });
      expect(Location.getLastKnownPositionAsync).not.toHaveBeenCalled();
    });

    test('falls back to the last known position when the live fix hangs', async () => {
      Location.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}));
      Location.getLastKnownPositionAsync.mockResolvedValue(LAST_KNOWN_POSITION);
      let result;
      let resolved = false;

      const resultPromise = getCurrentPosition().then((value) => {
        result = value;
        resolved = true;
      });
      await waitForMockCall(Location.getCurrentPositionAsync);
      await jest.advanceTimersByTimeAsync(10000);

      expect(resolved).toBe(true);
      await resultPromise;
      expect(Location.getLastKnownPositionAsync).toHaveBeenCalledWith({ maxAge: 900000 });
      expect(result).toEqual({
        coords: LAST_KNOWN_POSITION.coords,
        timestamp: LAST_KNOWN_POSITION.timestamp,
        error: null,
      });
    });

    test('returns the timeout error when the live fix hangs and no last-known position exists', async () => {
      Location.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}));
      Location.getLastKnownPositionAsync.mockResolvedValue(null);
      let result;
      let resolved = false;

      const resultPromise = getCurrentPosition().then((value) => {
        result = value;
        resolved = true;
      });
      await waitForMockCall(Location.getCurrentPositionAsync);
      await jest.advanceTimersByTimeAsync(10000);

      expect(resolved).toBe(true);
      await resultPromise;
      expect(result.coords).toBeNull();
      expect(result.error).toMatch(/GPS timeout/);
    });

    test('returns the timeout error when the last-known lookup throws', async () => {
      Location.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}));
      Location.getLastKnownPositionAsync.mockRejectedValue(new Error('cache unavailable'));
      let result;
      let resolved = false;

      const resultPromise = getCurrentPosition().then((value) => {
        result = value;
        resolved = true;
      });
      await waitForMockCall(Location.getCurrentPositionAsync);
      await jest.advanceTimersByTimeAsync(10000);

      expect(resolved).toBe(true);
      await resultPromise;
      expect(result.coords).toBeNull();
      expect(result.error).toMatch(/GPS timeout/);
    });

    test('does not leave a pending timer after a fast fix', async () => {
      Location.getCurrentPositionAsync.mockResolvedValue(LIVE_POSITION);

      await getCurrentPosition();

      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('requestLocationPermission', () => {
    test('permanently denied permission does not re-prompt and offers settings', async () => {
      Location.requestForegroundPermissionsAsync.mockResolvedValue({
        status: 'denied',
        canAskAgain: false,
      });

      const permissionPromise = requestLocationPermission();
      await waitForMockCall(Alert.alert);
      const buttons = Alert.alert.mock.calls[0][2];
      const openSettingsButton = buttons.find((button) => button.text === 'Open Settings');

      expect(openSettingsButton).toBeDefined();
      await openSettingsButton.onPress();
      await expect(permissionPromise).resolves.toBe(false);
      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(Linking.openSettings).toHaveBeenCalledTimes(1);
    });

    test('deniable permission still re-prompts', async () => {
      Location.requestForegroundPermissionsAsync
        .mockResolvedValueOnce({ status: 'denied', canAskAgain: true })
        .mockResolvedValueOnce({ status: 'granted' });

      const permissionPromise = requestLocationPermission();
      await waitForMockCall(Alert.alert);
      const buttons = Alert.alert.mock.calls[0][2];
      const enableLocationButton = buttons.find((button) => button.text === 'Enable Location');

      await enableLocationButton.onPress();
      await expect(permissionPromise).resolves.toBe(true);
      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(2);
    });
  });
});
