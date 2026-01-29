import * as Location from 'expo-location';
import { Alert } from 'react-native';

/**
 * Location Service
 *
 * Wrapper around expo-location for GPS access with:
 * - Permission handling with persistent prompts
 * - Medium accuracy (50-100m) for school vicinity verification
 * - Error handling with user-friendly messages
 * - Timeout handling (10 seconds max)
 */

// Medium accuracy (50-100m) - sufficient for school vicinity
const LOCATION_ACCURACY = Location.Accuracy.Balanced;
const LOCATION_TIMEOUT = 10000; // 10 seconds

/**
 * Request location permission with persistent prompts
 * Won't let user proceed without permission (required for time tracking)
 */
export const requestLocationPermission = async () => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== 'granted') {
      // Show explanation and prompt again
      return new Promise((resolve) => {
        Alert.alert(
          'Location Required',
          'Location permission is required to verify you are at the school when you sign in/out. This is necessary for time tracking.',
          [
            {
              text: 'Enable Location',
              onPress: async () => {
                const result = await requestLocationPermission();
                resolve(result);
              },
            },
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => resolve(false),
            },
          ]
        );
      });
    }

    return true;
  } catch (error) {
    console.error('Error requesting location permission:', error);
    return false;
  }
};

/**
 * Check if location services are enabled on the device
 */
export const checkLocationServicesEnabled = async () => {
  try {
    const enabled = await Location.hasServicesEnabledAsync();

    if (!enabled) {
      Alert.alert(
        'Enable GPS',
        'Please turn on Location Services in your device settings to use time tracking.',
        [{ text: 'OK' }]
      );
    }

    return enabled;
  } catch (error) {
    console.error('Error checking location services:', error);
    return false;
  }
};

/**
 * Get current GPS position with medium accuracy
 * Returns { latitude, longitude, accuracy } or null on error
 */
export const getCurrentPosition = async () => {
  try {
    // Check if location services are enabled
    const servicesEnabled = await checkLocationServicesEnabled();
    if (!servicesEnabled) {
      return { error: 'Location services are disabled', coords: null };
    }

    // Check/request permission
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      return { error: 'Location permission denied', coords: null };
    }

    // Get current position
    const location = await Location.getCurrentPositionAsync({
      accuracy: LOCATION_ACCURACY,
      timeInterval: LOCATION_TIMEOUT,
    });

    return {
      coords: {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
      },
      timestamp: location.timestamp,
      error: null,
    };
  } catch (error) {
    console.error('Error getting location:', error);

    let errorMessage = 'Unable to get your location';

    if (error.code === 'E_LOCATION_SERVICES_DISABLED') {
      errorMessage = 'Location services are disabled. Please enable them in your device settings.';
    } else if (error.code === 'E_LOCATION_TIMEOUT') {
      errorMessage = 'GPS timeout. Please move to an area with better GPS signal (outdoors or near a window) and try again.';
    } else if (error.code === 'E_LOCATION_UNAVAILABLE') {
      errorMessage = 'Unable to determine your location. Please make sure GPS is enabled and try again.';
    }

    return {
      error: errorMessage,
      coords: null,
    };
  }
};

/**
 * Format coordinates for display
 * Example: "Lat: -25.1234, Lon: 28.5678"
 */
export const formatCoordinates = (latitude, longitude) => {
  if (!latitude || !longitude) return 'No location';

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
