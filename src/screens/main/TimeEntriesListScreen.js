import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding';
import { fontFamilies, typeRoles } from '../../constants/typography';
import SurfaceCard from '../../components/common/SurfaceCard';
import StatusBadge from '../../components/common/StatusBadge';
import SectionHeader from '../../components/common/SectionHeader';
import { useToast } from '../../context/ToastContext';
import { useSignedInEA } from '../../context/SignedInEAContext';
import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, SectionList, RefreshControl } from 'react-native';
import { Text, Divider } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useOffline } from '../../context/OfflineContext';
import { colors, spacing } from '../../constants/colors';

import { formatCoordinates } from '../../services/locationService';
import { describeSyncState } from '../../utils/syncStatusPresenter';
import { formatDisplayDate, toLocalDateString } from '../../utils/localDate';

export default function TimeEntriesListScreen() {
  const onScroll = useHeaderHairline();
  const paddingBottom = useScrollBottomPadding(spacing.md);
  const emptyPaddingBottom = useScrollBottomPadding(spacing.xl);
  const toast = useToast();
  const { repositories } = useSignedInEA();
  const { timeEntries: timeEntriesRepository } = repositories;

  const { user } = useAuth();
  const { syncNow } = useOffline();

  const [timeEntries, setTimeEntries] = useState([]);
  const [sections, setSections] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  /**
   * Load completed time entries from the local SQLite cache. Network sync runs
   * through the outbox engine; this screen only displays the local result.
   */
  const loadTimeEntries = useCallback(async () => {
    try {
      if (!user?.id) {
        setTimeEntries([]);
        groupEntriesByDate([]);
        return;
      }
      setLoading(true);
      const cutoffDate = toLocalDateString(new Date(Date.now() - (60 * 24 * 60 * 60 * 1000)));
      const sinceIso = new Date(`${cutoffDate}T00:00:00+02:00`).toISOString();
      const cached = await timeEntriesRepository.getTimeEntries({ userId: user.id, sinceIso });
      const cachedUserEntries = cached
        .filter(entry => entry.sign_out_time !== null)
        .sort((a, b) => new Date(b.sign_in_time) - new Date(a.sign_in_time));
      setTimeEntries(cachedUserEntries);
      groupEntriesByDate(cachedUserEntries);
    } catch (error) {
      console.error('Error loading time entries:', error);
      toast.show({ message: 'Failed to load entries', tone: 'error', duration: 3000 });
    } finally {
      setLoading(false);
    }
  }, [user?.id, toast]);

  useFocusEffect(
    useCallback(() => {
      loadTimeEntries();
    }, [loadTimeEntries])
  );

  /**
   * Group time entries by date (YYYY-MM-DD)
   */
  const groupEntriesByDate = (entries) => {
    const grouped = entries.reduce((acc, entry) => {
      const date = toLocalDateString(entry.sign_in_time);
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(entry);
      return acc;
    }, {});

    setSections(Object.entries(grouped).map(([title, data]) => ({ title, data })));
  };

  /**
   * Pull to refresh handler
   */
  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    // Trigger sync
    try {
      const syncResult = await syncNow({ force: true });

      if (syncResult) {
        console.log('Sync result:', syncResult);

        if (syncResult.totalSynced > 0) {
          // Pass-level count (syncNow uploads every table), so "items", not "entries".
          toast.show({ message: `${syncResult.totalSynced} ${syncResult.totalSynced === 1 ? 'item' : 'items'} synced`, tone: 'success', duration: 3000 });
        }

        // Trust voice (Finding 6): retriable items are safe and waiting, not "failed";
        // only terminal items are called out. The presenter owns the wording.
        if (syncResult.totalTerminal > 0) {
          toast.show({ message: describeSyncState('needs_attention', { needsAttentionCount: syncResult.totalTerminal }).message, tone: 'error', duration: 3000 });
        } else if (syncResult.totalRetriable > 0) {
          toast.show({ message: describeSyncState('waiting', { waitingCount: syncResult.totalRetriable }).message, tone: 'neutral', duration: 3000 });
        }
      }

      await loadTimeEntries();
    } catch (error) {
      console.error('Refresh error:', error);
      toast.show({ message: 'Sync failed', tone: 'error', duration: 3000 });
    }

    setRefreshing(false);
  }, [loadTimeEntries, syncNow, toast]);

  /**
   * Format date as "Monday, Jan 27, 2026"
   */
  const formatDateHeader = (dateString) => {
    return formatDisplayDate(dateString, {
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
    const today = toLocalDateString(new Date());
    return dateString === today;
  };

  /**
   * Empty state
   */
  if (!loading && timeEntries.length === 0) {
    return (
      <View style={styles.outerContainer}>
        <ScrollView onScroll={onScroll} scrollEventThrottle={16}
          style={styles.container}
          contentContainerStyle={[styles.emptyContainer, { paddingBottom: emptyPaddingBottom }]}
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
      </View>
    );
  }

  return (
    <View style={styles.outerContainer}>
      <SectionList onScroll={onScroll} scrollEventThrottle={16}
        style={styles.container}
        testID="time-entries-scroll"
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.content, { paddingBottom }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={(
          <View>
            <Text variant="titleLarge" style={styles.pageTitle}>
              Work History
            </Text>
            <Text variant="bodySmall" style={styles.subtitle}>
              Your completed time entries
            </Text>
          </View>
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.dateGroup}>
            <View style={styles.dateHeader}>
              <SectionHeader title={formatDateHeader(section.title)} />
              {isToday(section.title) && (
                <StatusBadge label="Today" tone="neutral" />
              )}
            </View>
          </View>
        )}
        renderItem={({ item: entry }) => (
          <SurfaceCard style={styles.entryCard}>
            <View style={styles.entryHeader}>
              <View style={styles.hoursContainer}>
                <Text variant="headlineMedium" style={styles.hoursText}>
                  {calculateHours(entry.sign_in_time, entry.sign_out_time)}
                </Text>
                <Text variant="bodySmall" style={styles.hoursLabel}>hours</Text>
              </View>
              {!entry.synced && (
                <StatusBadge label="Unsynced" tone="warning" />
              )}
            </View>
            <Divider style={styles.divider} />
            <View style={styles.detailsRow}>
              <View style={styles.detailColumn}>
                <Text variant="labelSmall" style={styles.detailLabel}>Clock In</Text>
                <Text variant="bodyMedium" style={styles.detailValue}>
                  {formatTime(entry.sign_in_time)}
                </Text>
                <Text variant="bodySmall" style={styles.coordsText}>
                  {formatCoordinates(entry.sign_in_lat, entry.sign_in_lon)}
                </Text>
              </View>
              <View style={styles.detailColumn}>
                <Text variant="labelSmall" style={styles.detailLabel}>Clock Out</Text>
                <Text variant="bodyMedium" style={styles.detailValue}>
                  {formatTime(entry.sign_out_time)}
                </Text>
                <Text variant="bodySmall" style={styles.coordsText}>
                  {formatCoordinates(entry.sign_out_lat, entry.sign_out_lon)}
                </Text>
              </View>
            </View>
          </SurfaceCard>
        )}
        ListFooterComponent={(
          <View style={styles.footer}>
            <Text variant="bodySmall" style={styles.footerText}>Showing last 60 days</Text>
            <Text variant="bodySmall" style={styles.footerText}>
              Pull down to refresh and sync with server
            </Text>
          </View>
        )}
      />
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
  entryCard: {
    marginBottom: spacing.sm,
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
    marginRight: spacing.xs,
  },
  hoursLabel: {
    color: colors.textSecondary,
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
    fontFamily: fontFamilies.textMedium,
    marginBottom: spacing.xs,
  },
  coordsText: {
    color: colors.textSecondary,
    ...typeRoles.textData,
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
