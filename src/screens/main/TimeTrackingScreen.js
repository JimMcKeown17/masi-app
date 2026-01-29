import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Card, Text, Button, ActivityIndicator, Divider } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { useOffline } from '../../context/OfflineContext';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';
import { storage } from '../../utils/storage';
import { getCurrentPosition, formatCoordinates } from '../../services/locationService';

export default function TimeTrackingScreen({ navigation }) {
  const { user, profile } = useAuth();
  const { refreshSyncStatus } = useOffline();

  const [isSignedIn, setIsSignedIn] = useState(false);
  const [activeEntry, setActiveEntry] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  const elapsedInterval = useRef(null);

  /**
   * Load active time entry on mount
   */
  useEffect(() => {
    loadActiveEntry();

    return () => {
      // Cleanup elapsed time interval
      if (elapsedInterval.current) {
        clearInterval(elapsedInterval.current);
      }
    };
  }, []);

  /**
   * Start elapsed time counter when signed in
   */
  useEffect(() => {
    if (isSignedIn && activeEntry) {
      startElapsedTimer();
    } else {
      stopElapsedTimer();
    }

    return () => stopElapsedTimer();
  }, [isSignedIn, activeEntry]);

  /**
   * Check AsyncStorage for active time entry
   */
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

  /**
   * Start interval to update elapsed time every second
   */
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

    updateElapsed(); // Initial update
    elapsedInterval.current = setInterval(updateElapsed, 1000);
  };

  /**
   * Stop elapsed time counter
   */
  const stopElapsedTimer = () => {
    if (elapsedInterval.current) {
      clearInterval(elapsedInterval.current);
      elapsedInterval.current = null;
    }
  };

  /**
   * Format elapsed time as "8h 42m 15s"
   */
  const formatElapsedTime = (milliseconds) => {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);

    return `${hours}h ${minutes}m ${seconds}s`;
  };

  /**
   * Format time for display (e.g., "8:00 AM")
   */
  const formatTime = (isoString) => {
    if (!isoString) return '--';

    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  /**
   * Handle sign in
   */
  const handleSignIn = async () => {
    // Check if already signed in
    if (isSignedIn) {
      Alert.alert('Already Signed In', 'You are already signed in. Please sign out first.');
      return;
    }

    setLoadingLocation(true);

    try {
      // Get GPS coordinates
      const locationResult = await getCurrentPosition();

      if (locationResult.error) {
        Alert.alert('Location Error', locationResult.error);
        setLoadingLocation(false);
        return;
      }

      const { latitude, longitude } = locationResult.coords;

      // Create time entry
      const timeEntry = {
        id: generateUUID(),
        user_id: user.id,
        sign_in_time: new Date().toISOString(),
        sign_in_lat: latitude,
        sign_in_lon: longitude,
        sign_out_time: null,
        sign_out_lat: null,
        sign_out_lon: null,
        synced: false,
      };

      // Save to AsyncStorage
      await storage.saveTimeEntry(timeEntry);

      // Update state
      setActiveEntry(timeEntry);
      setIsSignedIn(true);

      // Refresh sync status
      await refreshSyncStatus();

      Alert.alert('Signed In', `Successfully signed in at ${formatTime(timeEntry.sign_in_time)}`);
    } catch (error) {
      console.error('Error signing in:', error);
      Alert.alert('Error', 'Failed to sign in. Please try again.');
    } finally {
      setLoadingLocation(false);
    }
  };

  /**
   * Handle sign out
   */
  const handleSignOut = async () => {
    if (!isSignedIn || !activeEntry) {
      Alert.alert('Not Signed In', 'You must sign in first before signing out.');
      return;
    }

    setLoadingLocation(true);

    try {
      // Get GPS coordinates
      const locationResult = await getCurrentPosition();

      if (locationResult.error) {
        Alert.alert('Location Error', locationResult.error);
        setLoadingLocation(false);
        return;
      }

      const { latitude, longitude } = locationResult.coords;
      const signOutTime = new Date().toISOString();

      // Calculate hours worked
      const signInMs = new Date(activeEntry.sign_in_time).getTime();
      const signOutMs = new Date(signOutTime).getTime();
      const hoursWorked = ((signOutMs - signInMs) / (1000 * 60 * 60)).toFixed(2);

      // Update time entry
      const updatedEntry = {
        ...activeEntry,
        sign_out_time: signOutTime,
        sign_out_lat: latitude,
        sign_out_lon: longitude,
        synced: false,
      };

      // Save to AsyncStorage
      await storage.updateTimeEntry(activeEntry.id, updatedEntry);

      // Update state
      setActiveEntry(null);
      setIsSignedIn(false);
      setElapsedTime(0);

      // Refresh sync status (triggers background sync if online)
      await refreshSyncStatus();

      Alert.alert(
        'Signed Out',
        `Successfully signed out at ${formatTime(signOutTime)}.\n\nHours worked: ${hoursWorked}`
      );
    } catch (error) {
      console.error('Error signing out:', error);
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    } finally {
      setLoadingLocation(false);
    }
  };

  /**
   * Generate a simple UUID for local time entries
   */
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Status Card */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.sectionTitle}>
              Current Status
            </Text>

            <View style={styles.statusRow}>
              <Text variant="bodyLarge" style={styles.label}>
                Status:
              </Text>
              <Text
                variant="bodyLarge"
                style={[
                  styles.statusValue,
                  { color: isSignedIn ? colors.success : colors.textSecondary },
                ]}
              >
                {isSignedIn ? 'Signed In' : 'Signed Out'}
              </Text>
            </View>

            {isSignedIn && (
              <>
                <Divider style={styles.divider} />

                <View style={styles.statusRow}>
                  <Text variant="bodyMedium" style={styles.label}>
                    Signed in at:
                  </Text>
                  <Text variant="bodyMedium" style={styles.value}>
                    {formatTime(activeEntry?.sign_in_time)}
                  </Text>
                </View>

                <View style={styles.statusRow}>
                  <Text variant="bodyMedium" style={styles.label}>
                    Elapsed time:
                  </Text>
                  <Text variant="bodyMedium" style={[styles.value, styles.elapsed]}>
                    {formatElapsedTime(elapsedTime)}
                  </Text>
                </View>

                <View style={styles.statusRow}>
                  <Text variant="bodySmall" style={styles.label}>
                    Location:
                  </Text>
                  <Text variant="bodySmall" style={styles.coordsValue}>
                    {formatCoordinates(activeEntry?.sign_in_lat, activeEntry?.sign_in_lon)}
                  </Text>
                </View>
              </>
            )}
          </Card.Content>
        </Card>

        {/* Action Buttons */}
        <Card style={styles.card}>
          <Card.Content>
            {loadingLocation ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text variant="bodyMedium" style={styles.loadingText}>
                  Getting your location...
                </Text>
              </View>
            ) : (
              <>
                {!isSignedIn ? (
                  <Button
                    mode="contained"
                    onPress={handleSignIn}
                    style={styles.button}
                    contentStyle={styles.buttonContent}
                    icon="login"
                  >
                    Sign In
                  </Button>
                ) : (
                  <Button
                    mode="contained"
                    onPress={handleSignOut}
                    style={[styles.button, styles.signOutButton]}
                    contentStyle={styles.buttonContent}
                    buttonColor={colors.emphasis}
                    icon="logout"
                  >
                    Sign Out
                  </Button>
                )}

                <Text variant="bodySmall" style={styles.helperText}>
                  {!isSignedIn
                    ? 'Tap "Sign In" when you arrive at work. Your location will be recorded.'
                    : 'Tap "Sign Out" when you leave work. Your hours will be calculated automatically.'}
                </Text>
              </>
            )}
          </Card.Content>
        </Card>

        {/* Info Card */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.infoTitle}>
              How Time Tracking Works
            </Text>
            <Text variant="bodySmall" style={styles.infoText}>
              • Your GPS location is recorded when you sign in and sign out
            </Text>
            <Text variant="bodySmall" style={styles.infoText}>
              • This verifies you are at the school during work hours
            </Text>
            <Text variant="bodySmall" style={styles.infoText}>
              • Your hours are calculated automatically
            </Text>
            <Text variant="bodySmall" style={styles.infoText}>
              • All data syncs to the server when you have internet
            </Text>
          </Card.Content>
        </Card>

        {/* View History Button */}
        <Card style={styles.card}>
          <Card.Content>
            <Button
              mode="outlined"
              onPress={() => navigation.navigate('TimeEntriesList')}
              style={styles.historyButton}
              contentStyle={styles.buttonContent}
              icon="history"
            >
              View Work History
            </Button>
          </Card.Content>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
  },
  card: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    ...shadows.card,
  },
  sectionTitle: {
    marginBottom: spacing.md,
    color: colors.primary,
    fontWeight: 'bold',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.textSecondary,
  },
  value: {
    color: colors.text,
    fontWeight: '500',
  },
  statusValue: {
    fontWeight: 'bold',
    fontSize: 18,
  },
  elapsed: {
    color: colors.primary,
    fontWeight: 'bold',
  },
  coordsValue: {
    color: colors.textSecondary,
    fontFamily: 'monospace',
  },
  divider: {
    marginVertical: spacing.md,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textSecondary,
  },
  button: {
    marginBottom: spacing.md,
  },
  buttonContent: {
    paddingVertical: spacing.sm,
  },
  signOutButton: {
    backgroundColor: colors.emphasis,
  },
  helperText: {
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  historyButton: {
    borderColor: colors.primary,
  },
  infoTitle: {
    marginBottom: spacing.sm,
    color: colors.text,
    fontWeight: '600',
  },
  infoText: {
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    lineHeight: 20,
  },
});
