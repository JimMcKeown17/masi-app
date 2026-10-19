import * as Location from 'expo-location';
import { Alert, Linking } from 'react-native';

const LOCATION_ACCURACY = Location.Accuracy.Balanced;
const LOCATION_TIMEOUT = 10000;
const LAST_KNOWN_MAX_AGE_MS = 15 * 60 * 1000;

// Resolve the choice before doing any native work. A duplicate button callback
// only settles this promise again; it cannot start another request or launch.
const choosePermissionRecovery = (canRetry) => new Promise((resolve) => {
  Alert.alert(
    'Location Permission',
    canRetry
      ? 'Location helps verify you are at the school. You can try the permission request again, or clock in or out without location.'
      : 'Open Settings to allow location while using this app. Then return and tap Clock In or Clock Out again. You can also continue without location.',
    [
      { text: canRetry ? 'Try again' : 'Open Settings', onPress: () => resolve(canRetry ? 'retry' : 'settings') },
      { text: 'Continue without location', style: 'cancel', onPress: () => resolve('continue') },
    ],
    { cancelable: false }
  );
});

/**
 * True permits GPS, false explicitly continues without it, and null hands off
 * to Settings without completing this clock action. Never cache this result:
 * the next explicit attempt must read permission again after Settings/expiry.
 */
export const requestLocationPermission = async () => {
  let permission = await Location.getForegroundPermissionsAsync();
  if (permission.status === 'granted') return true;
  if (permission.canAskAgain === true) {
    permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status === 'granted') return true;
  }

  let choice = await choosePermissionRecovery(permission.canAskAgain === true);
  if (choice === 'retry') {
    permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status === 'granted') return true;
    // One explicit retry is enough. Even a still-requestable denial must have
    // a finite recovery path instead of recreating the same request dialog.
    choice = await choosePermissionRecovery(false);
  }
  if (choice === 'settings') {
    try {
      await Linking.openSettings();
      return null;
    } catch {
      await new Promise((resolve) => {
        Alert.alert(
          'Could not open Settings',
          'You can allow location later in your phone settings. You can still clock in or out without location.',
          [{ text: 'Continue without location', onPress: resolve }],
          { cancelable: false }
        );
      });
    }
  }
  return false;
};

/**
 * Check if location services are enabled on the device
 */
export const checkLocationServicesEnabled = async () => {
  const enabled = await Location.hasServicesEnabledAsync();

  if (!enabled) {
    Alert.alert(
      'Location Services Are Off',
      'You can turn on Location Services in device settings. Your shift will still start or end without location.',
      [{ text: 'OK' }]
    );
  }

  return enabled;
};

const noFix = (status) => ({
  coords: null,
  status,
  error: {
    timeout: 'GPS timeout',
    denied: 'Location permission denied',
    services_off: 'Location services are disabled',
    unavailable: 'Unable to get your location',
  }[status],
  cancelled: false,
});

const failureStatus = (error) => {
  if (error?.code === 'E_LOCATION_TIMEOUT') return 'timeout';
  if (error?.code === 'E_LOCATION_SERVICES_DISABLED') return 'services_off';
  if (error?.code === 'E_LOCATION_UNAUTHORIZED') return 'denied';
  return 'unavailable';
};

const hasFix = (position) => Number.isFinite(position?.coords?.latitude)
  && Number.isFinite(position?.coords?.longitude);
const withFix = (position) => ({
  coords: {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
  },
  timestamp: position.timestamp,
  status: 'fix',
  error: null,
  cancelled: false,
});

/**
 * Native GPS and the cache share ONE deadline. Warm the cache alongside GPS:
 * starting an awaited cache read after a 10s timeout would extend that deadline
 * indefinitely if the native cache also hangs. A cached fix never beats a live
 * fix; it is used only on a native error or at the deadline.
 * Permission dialogs wait for an explicit user choice, outside the GPS budget.
 */
export const getCurrentPosition = async () => {
  try {
    if (!await checkLocationServicesEnabled()) return noFix('services_off');
    const permission = await requestLocationPermission();
    if (permission === null) return { coords: null, status: null, error: null, cancelled: true };
    if (!permission) return noFix('denied');

    let cached = null;
    let status = 'timeout';
    let timeoutId;
    const lastKnown = Promise.resolve()
      .then(() => Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS }))
      .then(position => { cached = hasFix(position) ? position : null; return cached; })
      .catch(() => null);
    const live = Promise.resolve()
      .then(() => Location.getCurrentPositionAsync({ accuracy: LOCATION_ACCURACY }))
      .then(position => {
        if (!hasFix(position)) throw new Error('No coordinate pair');
        return withFix(position);
      })
      .catch(async error => {
        status = failureStatus(error);
        // Denied/services-off are permission facts, not reasons to reuse a fix.
        if (status === 'denied' || status === 'services_off') return noFix(status);
        const fallback = await lastKnown;
        return fallback ? withFix(fallback) : noFix(status);
      });
    return await Promise.race([
      live,
      new Promise(resolve => {
        timeoutId = setTimeout(() => resolve(cached ? withFix(cached) : noFix(status)), LOCATION_TIMEOUT);
      }),
    ]).finally(() => clearTimeout(timeoutId));
  } catch (error) {
    return noFix(failureStatus(error));
  }
};

/**
 * Format coordinates for display
 * Example: "Lat: -25.1234, Lon: 28.5678"
 */
export const formatCoordinates = (latitude, longitude) => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return 'No location';

  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
};

/**
 * Calculate distance between two coordinates in meters
 * Uses Haversine formula
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

/**
 * Check if two locations are within threshold (for verification)
 * Returns true if locations are within 200m of each other
 */
export const areLocationsNearby = (lat1, lon1, lat2, lon2, thresholdMeters = 200) => {
  const distance = calculateDistance(lat1, lon1, lat2, lon2);
  return distance <= thresholdMeters;
};
