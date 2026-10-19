import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { fontFamilies, typeRoles } from '../../constants/typography';
import SurfaceCard from '../../components/common/SurfaceCard';
import BrandButton from '../../components/common/BrandButton';
import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, ActivityIndicator, Divider } from 'react-native-paper';
import { colors, spacing } from '../../constants/colors';
import { formatCoordinates } from '../../services/locationService';
import { useTimeTracking } from '../../hooks/useTimeTracking';
import ElapsedTime from '../../components/common/ElapsedTime';

export default function TimeTrackingScreen({ navigation }) {
  const onScroll = useHeaderHairline();
  const {
    isSignedIn,
    activeEntry,
    loadingLocation,
    handleSignIn,
    handleSignOut,
    formatTime,
  } = useTimeTracking();

  return (
    <View style={styles.outerContainer}>
      <ScrollView onScroll={onScroll} scrollEventThrottle={16} style={styles.container}>
        <View style={styles.content}>
        {/* Status Card */}
        <SurfaceCard style={styles.card}>
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
                  Clocked in at:
                </Text>
                <Text variant="bodyMedium" style={styles.value}>
                  {formatTime(activeEntry?.sign_in_time)}
                </Text>
              </View>

              <View style={styles.statusRow}>
                <Text variant="bodyMedium" style={styles.label}>
                  Elapsed time:
                </Text>
                <ElapsedTime signInTime={activeEntry?.sign_in_time} variant="bodyMedium" style={[styles.value, styles.elapsed]} />
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
        </SurfaceCard>

        {/* Action Buttons */}
        <SurfaceCard style={styles.card}>
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
                <BrandButton
                  variant="primary"
                  onPress={handleSignIn}
                  style={styles.button}
                  icon="log-in-outline"
                  label="Clock in"
                />
              ) : (
                <BrandButton
                  variant="secondary"
                  onPress={handleSignOut}
                  style={styles.button}
                  icon="log-out-outline"
                  label="Clock out"
                />
              )}

              <Text variant="bodySmall" style={styles.helperText}>
                {!isSignedIn
                  ? 'Tap "Clock In" when you arrive at work. Your location will be recorded.'
                  : 'Tap "Clock Out" when you leave work. Your hours will be calculated automatically.'}
              </Text>
            </>
          )}
        </SurfaceCard>

        {/* Info Card */}
        <SurfaceCard style={styles.card}>
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
        </SurfaceCard>

        {/* View History Button */}
        <SurfaceCard style={styles.card}>
          <BrandButton
            variant="secondary"
            onPress={() => navigation.navigate('TimeEntriesList')}
            icon="time-outline"
            label="View work history"
          />
        </SurfaceCard>
        </View>
      </ScrollView>

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
  },
  sectionTitle: {
    marginBottom: spacing.md,
    color: colors.primary,
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
    fontFamily: fontFamilies.textMedium,
  },
  statusValue: {
    ...typeRoles.textBodyLStrong,
  },
  elapsed: {
    color: colors.primary,
    fontFamily: fontFamilies.textBold,
  },
  coordsValue: {
    color: colors.textSecondary,
    ...typeRoles.textData,
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
  helperText: {
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  infoTitle: {
    marginBottom: spacing.sm,
    color: colors.text,
    fontFamily: fontFamilies.textSemi,
  },
  infoText: {
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    ...typeRoles.textSmall,
  },
});
