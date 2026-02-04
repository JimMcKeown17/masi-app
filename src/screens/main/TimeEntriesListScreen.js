import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Card, Text, Divider, Chip, Snackbar } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { useOffline } from '../../context/OfflineContext';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';
import { storage } from '../../utils/storage';
import { formatCoordinates } from '../../services/locationService';

export default function TimeEntriesListScreen() {
  const { user } = useAuth();
  const { syncNow, refreshSyncStatus } = useOffline();

  const [timeEntries, setTimeEntries] = useState([]);
  const [groupedEntries, setGroupedEntries] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  const showSnackbar = (message) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  /**
   * Load time entries on mount
   */
  useEffect(() => {
    loadTimeEntries();
  }, []);

  /**
   * Load all time entries from AsyncStorage
   */
  const loadTimeEntries = async () => {
    try {
      const entries = await storage.getTimeEntries();

      // Filter to current user and completed entries (has sign_out_time)
      const userEntries = entries
        .filter(entry => entry.user_id === user.id && entry.sign_out_time !== null)
        .sort((a, b) => new Date(b.sign_in_time) - new Date(a.sign_in_time)); // Newest first

      setTimeEntries(userEntries);
      groupEntriesByDate(userEntries);
    } catch (error) {
      console.error('Error loading time entries:', error);
      showSnackbar('Failed to load entries');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Group time entries by date (YYYY-MM-DD)
   */
  const groupEntriesByDate = (entries) => {
    const grouped = entries.reduce((acc, entry) => {
      const date = new Date(entry.sign_in_time).toISOString().split('T')[0]; // YYYY-MM-DD
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(entry);
      return acc;
    }, {});

    setGroupedEntries(grouped);
  };

  /**
   * Pull to refresh handler
   */
  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    // Trigger sync
    try {
      const syncResult = await syncNow();

      if (syncResult) {
        console.log('Sync result:', syncResult);

        if (syncResult.totalSynced > 0) {
          showSnackbar(`${syncResult.totalSynced} ${syncResult.totalSynced === 1 ? 'entry' : 'entries'} synced`);
        }

        if (syncResult.totalFailed > 0) {
          showSnackbar(`${syncResult.totalFailed} ${syncResult.totalFailed === 1 ? 'entry' : 'entries'} failed — will retry`);
        }
      }

      await loadTimeEntries();
    } catch (error) {
      console.error('Refresh error:', error);
      showSnackbar('Sync failed');
    }

    setRefreshing(false);
  }, [syncNow]);

  /**
   * Format date as "Monday, Jan 27, 2026"
   */
  const formatDateHeader = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
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
   * Calculate hours worked
   */
  const calculateHours = (signIn, signOut) => {
    if (!signIn || !signOut) return '--';
    const signInMs = new Date(signIn).getTime();
    const signOutMs = new Date(signOut).getTime();
    const hours = ((signOutMs - signInMs) / (1000 * 60 * 60)).toFixed(2);
    return hours;
  };

  /**
   * Check if entry is from today
   */
  const isToday = (dateString) => {
    const today = new Date().toISOString().split('T')[0];
    return dateString === today;
  };

  /**
   * Empty state
   */
  if (!loading && timeEntries.length === 0) {
    return (
      <View style={styles.outerContainer}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.emptyContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <Text variant="titleMedium" style={styles.emptyTitle}>
            No Time Entries Yet
          </Text>
          <Text variant="bodyMedium" style={styles.emptyText}>
            Your completed work sessions will appear here after you sign in and sign out.
          </Text>
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

  return (
    <View style={styles.outerContainer}>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.content}>
        <Text variant="titleLarge" style={styles.pageTitle}>
          Work History
        </Text>
        <Text variant="bodySmall" style={styles.subtitle}>
          Your completed time entries
        </Text>

        {Object.keys(groupedEntries).map((dateKey) => (
          <View key={dateKey} style={styles.dateGroup}>
            {/* Date Header */}
            <View style={styles.dateHeader}>
              <Text variant="titleMedium" style={styles.dateHeaderText}>
                {formatDateHeader(dateKey)}
              </Text>
              {isToday(dateKey) && (
                <Chip
                  mode="flat"
                  style={styles.todayChip}
                  textStyle={styles.todayChipText}
                >
                  Today
                </Chip>
              )}
            </View>

            {/* Time Entries for this date */}
            {groupedEntries[dateKey].map((entry, index) => (
              <Card key={entry.id} style={styles.entryCard}>
                <Card.Content>
                  <View style={styles.entryHeader}>
                    <View style={styles.hoursContainer}>
                      <Text variant="headlineMedium" style={styles.hoursText}>
                        {calculateHours(entry.sign_in_time, entry.sign_out_time)}
                      </Text>
                      <Text variant="bodySmall" style={styles.hoursLabel}>
                        hours
                      </Text>
                    </View>

                    {!entry.synced && (
                      <Chip
                        mode="outlined"
                        icon="cloud-upload-outline"
                        style={styles.unsyncedChip}
                        textStyle={styles.unsyncedChipText}
                      >
                        Unsynced
                      </Chip>
                    )}
                  </View>

                  <Divider style={styles.divider} />

                  <View style={styles.detailsRow}>
                    <View style={styles.detailColumn}>
                      <Text variant="labelSmall" style={styles.detailLabel}>
                        Sign In
                      </Text>
                      <Text variant="bodyMedium" style={styles.detailValue}>
                        {formatTime(entry.sign_in_time)}
                      </Text>
                      <Text variant="bodySmall" style={styles.coordsText}>
                        {formatCoordinates(entry.sign_in_lat, entry.sign_in_lon)}
                      </Text>
                    </View>

                    <View style={styles.detailColumn}>
                      <Text variant="labelSmall" style={styles.detailLabel}>
                        Sign Out
                      </Text>
                      <Text variant="bodyMedium" style={styles.detailValue}>
                        {formatTime(entry.sign_out_time)}
                      </Text>
                      <Text variant="bodySmall" style={styles.coordsText}>
                        {formatCoordinates(entry.sign_out_lat, entry.sign_out_lon)}
                      </Text>
                    </View>
                  </View>
                </Card.Content>
              </Card>
            ))}
          </View>
        ))}

        {/* Footer info */}
        <View style={styles.footer}>
          <Text variant="bodySmall" style={styles.footerText}>
            Pull down to refresh and sync with server
          </Text>
        </View>
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  pageTitle: {
    color: colors.primary,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  dateGroup: {
    marginBottom: spacing.lg,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  dateHeaderText: {
    color: colors.text,
    fontWeight: '600',
  },
  todayChip: {
    backgroundColor: colors.primary + '20',
    height: 28,
  },
  todayChipText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  entryCard: {
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    ...shadows.card,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  hoursContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  hoursText: {
    color: colors.primary,
    fontWeight: 'bold',
    marginRight: spacing.xs,
  },
  hoursLabel: {
    color: colors.textSecondary,
  },
  unsyncedChip: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + '10',
  },
  unsyncedChipText: {
    color: colors.accent,
    fontSize: 11,
  },
  divider: {
    marginVertical: spacing.sm,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailColumn: {
    flex: 1,
  },
  detailLabel: {
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  detailValue: {
    color: colors.text,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  coordsText: {
    color: colors.textSecondary,
    fontFamily: 'monospace',
    fontSize: 11,
  },
  footer: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  footerText: {
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
});
