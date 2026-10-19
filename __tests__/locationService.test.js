global.__MASI_NO_DEFAULT_HANDLE__ = true;
import * as Location from 'expo-location';
import { Alert, Linking } from 'react-native';

import {
  getCurrentPosition,
  requestLocationPermission,
  formatCoordinates,
} from '../src/services/locationService';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 'balanced' },
  requestForegroundPermissionsAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
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
    Object.values(Location).forEach(value => value?.mockReset?.());
    Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
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
        status: 'fix',
        cancelled: false,
      });
      expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: 'balanced' });
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
        status: 'fix',
        cancelled: false,
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

  test('native errors fall back to a fresh cached fix', async () => {
    Location.getCurrentPositionAsync.mockRejectedValue({ code: 'E_LOCATION_UNAVAILABLE' });
    Location.getLastKnownPositionAsync.mockResolvedValue(LAST_KNOWN_POSITION);
    await expect(getCurrentPosition()).resolves.toMatchObject({ status: 'fix', coords: LAST_KNOWN_POSITION.coords, error: null, cancelled: false });
  });

  test.each(['hang', 'error'])('hung cache cannot extend the 10 second deadline after live %s', async mode => {
    Location.getCurrentPositionAsync.mockImplementation(() => mode === 'hang' ? new Promise(() => {}) : Promise.reject({ code: 'E_LOCATION_UNAVAILABLE' }));
    Location.getLastKnownPositionAsync.mockReturnValue(new Promise(() => {}));
    let result;
    const pending = getCurrentPosition().then(value => { result = value; });
    await waitForMockCall(Location.getCurrentPositionAsync);
    await jest.advanceTimersByTimeAsync(10000);
    expect(result).toMatchObject({ status: mode === 'hang' ? 'timeout' : 'unavailable', coords: null, cancelled: false });
    await pending;
    expect(jest.getTimerCount()).toBe(0);
  });

  test('missing coordinates render No location and zero coordinates remain valid', () => {
    expect(formatCoordinates(null, null)).toBe('No location');
    expect(formatCoordinates(null, 25)).toBe('No location');
    expect(formatCoordinates(0, 0)).toBe('0.0000, 0.0000');
  });

  describe('requestLocationPermission', () => {
    test('permanently denied permission does not re-prompt and offers settings', async () => {
      Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });

      const permissionPromise = requestLocationPermission();
      await waitForMockCall(Alert.alert);
      const buttons = Alert.alert.mock.calls[0][2];
      const openSettingsButton = buttons.find((button) => button.text === 'Open Settings');

      expect(openSettingsButton).toBeDefined();
      await openSettingsButton.onPress();
      await expect(permissionPromise).resolves.toBe(null);
      expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
      expect(Linking.openSettings).toHaveBeenCalledTimes(1);
    });

    test('deniable permission still re-prompts', async () => {
      Location.requestForegroundPermissionsAsync
        .mockResolvedValueOnce({ status: 'denied', canAskAgain: true })
        .mockResolvedValueOnce({ status: 'granted' });

      const permissionPromise = requestLocationPermission();
      await waitForMockCall(Alert.alert);
      const buttons = Alert.alert.mock.calls[0][2];
      const enableLocationButton = buttons.find((button) => button.text === 'Try again');

      await enableLocationButton.onPress();
      await expect(permissionPromise).resolves.toBe(true);
      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(2);
    });
  });
});

describe('bounded permission recovery through the public location service', () => {
  const flush = async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); };
  const choose = (label, index = Alert.alert.mock.calls.length - 1) => {
    const action = Alert.alert.mock.calls[index][2].find(item => item.text === label);
    expect(action).toBeDefined();
    action.onPress();
  };
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(Location).forEach(value => value?.mockReset?.());
    Location.hasServicesEnabledAsync.mockResolvedValue(true);
    Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });
    Location.getCurrentPositionAsync.mockResolvedValue(LIVE_POSITION);
    Location.getLastKnownPositionAsync.mockResolvedValue(null);
    Linking.openSettings.mockResolvedValue();
  });

  test('repeated denial offers one explicit retry, then Settings or Continue without location', async () => {
    const pending = getCurrentPosition();
    await flush();
    choose('Try again');
    choose('Try again');
    await flush();
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(2);
    expect(Alert.alert).toHaveBeenCalledTimes(2);
    expect(Alert.alert.mock.calls[1][2].map(item => item.text)).toEqual(['Open Settings', 'Continue without location']);
    choose('Continue without location');
    await expect(pending).resolves.toMatchObject({ status: 'denied', coords: null, cancelled: false });
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  test('failed Settings launch still allows continuing without location', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });
    Linking.openSettings.mockRejectedValue(new Error('cannot open settings'));
    const pending = getCurrentPosition();
    await flush();
    choose('Open Settings');
    await flush();
    expect(Alert.alert.mock.calls[1][0]).toBe('Could not open Settings');
    choose('Continue without location');
    await expect(pending).resolves.toMatchObject({ status: 'denied', coords: null, cancelled: false });
  });

  test('existing permission avoids a native ask', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    await expect(getCurrentPosition()).resolves.toMatchObject({ status: 'fix' });
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  test('services-off alert is informational and immediately returns a no-fix result', async () => {
    Location.hasServicesEnabledAsync.mockResolvedValue(false);
    await expect(getCurrentPosition()).resolves.toMatchObject({ status: 'services_off', coords: null, cancelled: false });
    expect(Alert.alert.mock.calls[0][1]).toMatch(/shift will still start or end without location/);
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  test.each(['getForegroundPermissionsAsync', 'requestForegroundPermissionsAsync', 'hasServicesEnabledAsync'])('a rejected %s continues without location', async method => {
    Location[method].mockRejectedValue(new Error('native error'));
    await expect(getCurrentPosition()).resolves.toMatchObject({ status: 'unavailable', coords: null, cancelled: false });
  });
});
