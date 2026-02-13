import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Card, Text, Button, ActivityIndicator, Divider, Snackbar } from 'react-native-paper';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';
import { formatCoordinates } from '../../services/locationService';
import { useTimeTracking } from '../../hooks/useTimeTracking';

export default function TimeTrackingScreen({ navigation }) {
  const {
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
  } = useTimeTracking();

  return (
    <View style={styles.outerContainer}>
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

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
  },
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
