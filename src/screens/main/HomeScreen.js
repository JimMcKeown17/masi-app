import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { Card, Text, Button, ActivityIndicator, Snackbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useOffline } from '../../context/OfflineContext';
import { useTimeTracking } from '../../hooks/useTimeTracking';
import { storage } from '../../utils/storage';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';

const GRADIENT = ['#0984E3', '#E72D4D'];

export default function HomeScreen({ navigation }) {
  const { profile } = useAuth();
  const { isOnline, unsyncedCount, syncStatus } = useOffline();
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

  const [todaySessionCount, setTodaySessionCount] = useState(0);

  // Reload today's session count each time the screen comes into focus
  // (handles returning from SessionForm after recording a session)
  useFocusEffect(
    useCallback(() => {
      const loadTodaySessions = async () => {
        const sessions = await storage.getSessions();
        const today = new Date().toISOString().split('T')[0];
        const count = sessions.filter(s => s.session_date === today).length;
        setTodaySessionCount(count);
      };
      loadTodaySessions();
    }, [])
  );

  const failedCount = syncStatus?.failedItems?.length ?? 0;
  const showBanner = !isOnline || unsyncedCount > 0 || failedCount > 0;
  const bannerVariant = failedCount > 0 ? 'failed' : !isOnline ? 'offline' : 'unsynced';

  const bannerConfig = {
    failed: {
      icon: 'alert-circle-outline',
      text: `${failedCount} item${failedCount !== 1 ? 's' : ''} failed to sync — needs attention`,
      backgroundColor: colors.emphasis,
      textColor: '#FFFFFF',
      iconColor: '#FFFFFF',
    },
    offline: {
      icon: 'cloud-offline-outline',
      text: 'Offline — data will sync when connected',
      backgroundColor: colors.disabled,
      textColor: '#FFFFFF',
      iconColor: '#FFFFFF',
    },
    unsynced: {
      icon: 'cloud-upload-outline',
      text: `${unsyncedCount} item${unsyncedCount !== 1 ? 's' : ''} waiting to sync`,
      backgroundColor: colors.accent,
      textColor: colors.text,
      iconColor: colors.text,
    },
  };

  const banner = bannerConfig[bannerVariant];

  return (
    <View style={styles.outerContainer}>
      <ScrollView style={styles.container}>
        {/* Identity Header */}
        <LinearGradient
          colors={GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <Text variant="titleLarge" style={styles.welcomeText}>
            Welcome, {profile?.first_name || 'User'}!
          </Text>
          <Text variant="bodyMedium" style={styles.roleText}>
            {[profile?.job_title, profile?.assigned_school].filter(Boolean).join(' • ')}
          </Text>
        </LinearGradient>

        <View style={styles.content}>
          {/* Sync Banner */}
          {showBanner && (
            <TouchableOpacity
              style={[styles.syncBanner, { backgroundColor: banner.backgroundColor }]}
              onPress={() => navigation.navigate('SyncStatus')}
              activeOpacity={0.8}
            >
              <Ionicons name={banner.icon} size={18} color={banner.iconColor} style={styles.bannerIcon} />
              <Text variant="bodySmall" style={[styles.bannerText, { color: banner.textColor }]}>
                {banner.text}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={banner.iconColor} />
            </TouchableOpacity>
          )}

          {/* Work Status Card */}
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.cardTitle}>Today</Text>

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
                    <>
                      <Text variant="bodyMedium" style={styles.statusText}>
                        Not signed in
                      </Text>
                      <Pressable
                        onPress={handleSignIn}
                        style={styles.gradientButton}
                      >
                        <LinearGradient
                          colors={GRADIENT}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.gradientButtonInner}
                        >
                          <Text style={styles.gradientButtonText}>Sign In</Text>
                        </LinearGradient>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Text variant="bodyMedium" style={styles.signedInText}>
                        Signed in at {formatTime(activeEntry?.sign_in_time)}
                      </Text>
                      <Text variant="headlineSmall" style={styles.elapsedText}>
                        {formatElapsedTime(elapsedTime)}
                      </Text>
                      <Button
                        mode="contained"
                        onPress={handleSignOut}
                        style={styles.primaryButton}
                        contentStyle={styles.primaryButtonContent}
                        buttonColor={colors.emphasis}
                        icon="logout"
                      >
                        Sign Out
                      </Button>
                    </>
                  )}
                </>
              )}

              <Button
                mode="text"
                onPress={() => navigation.navigate('TimeEntriesList')}
                style={styles.historyButton}
                contentStyle={styles.historyButtonContent}
                textColor={colors.primary}
              >
                🕒  View Work History  ›
              </Button>
            </Card.Content>
          </Card>

          {/* Record a Session Card */}
          <Card style={[styles.card, styles.sessionCard]}>
            <Card.Content>
              <View style={styles.sessionCardHeader}>
                <Text variant="titleMedium" style={styles.cardTitle}>Sessions</Text>
                <View style={styles.sessionCountBadge}>
                  <Text variant="labelMedium" style={styles.sessionCountText}>
                    {todaySessionCount} today
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => navigation.navigate('SessionForm')}
                style={styles.gradientOutlineButton}
              >
                <LinearGradient
                  colors={GRADIENT}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.gradientOutlineBorder}
                >
                  <View style={styles.gradientOutlineInner}>
                    <Ionicons name="add-circle-outline" size={18} color="#0984E3" style={styles.sessionButtonIcon} />
                    <Text style={styles.gradientOutlineText}>Record a Session</Text>
                  </View>
                </LinearGradient>
              </Pressable>
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
  header: {
    padding: spacing.lg,
  },
  welcomeText: {
    color: '#FFFFFF',
    marginBottom: spacing.xs,
  },
  roleText: {
    color: '#FFFFFF',
    opacity: 0.9,
  },
  content: {
    padding: spacing.md,
  },
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  bannerIcon: {
    marginRight: spacing.sm,
  },
  bannerText: {
    flex: 1,
  },
  card: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    ...shadows.card,
  },
  sessionCard: {
    marginTop: spacing.sm,
  },
  cardTitle: {
    color: colors.text,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textSecondary,
  },
  statusText: {
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  signedInText: {
    color: colors.success,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  elapsedText: {
    color: colors.primary,
    fontWeight: 'bold',
    marginBottom: spacing.md,
  },
  primaryButton: {
    marginBottom: spacing.sm,
  },
  primaryButtonContent: {
    paddingVertical: spacing.sm,
  },
  gradientButton: {
    marginBottom: spacing.sm,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  gradientButtonInner: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  gradientButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  gradientOutlineButton: {
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  gradientOutlineBorder: {
    padding: 2,
    borderRadius: borderRadius.sm,
  },
  gradientOutlineInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm - 2,
    paddingVertical: 12,
    minHeight: 48,
  },
  sessionButtonIcon: {
    marginRight: spacing.xs,
  },
  gradientOutlineText: {
    color: '#0984E3',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  historyButton: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
  },
  historyButtonContent: {
    paddingVertical: 0,
  },
  sessionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sessionCountBadge: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  sessionCountText: {
    color: colors.textSecondary,
  },
});
