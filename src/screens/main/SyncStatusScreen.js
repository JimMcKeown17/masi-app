import React, { useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Card, Text, Button, Snackbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useOffline } from '../../context/OfflineContext';
import { retryFailedItem } from '../../services/offlineSync';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';
import { deriveSyncState, describeSyncState, describeWaitingDetail } from '../../utils/syncStatusPresenter';

const TABLE_DISPLAY_NAMES = {
  TIME_ENTRIES: 'Time Entries',
  SESSIONS: 'Sessions',
  CHILDREN: 'Children',
  STAFF_CHILDREN: 'Staff Assignments',
  GROUPS: 'Groups',
  CHILDREN_GROUPS: 'Group Memberships',
};

/**
 * Format a timestamp for the "Last Synced" card.
 * Today → "Today at 2:30 PM"
 * Other → "Jan 30 at 9:15 AM"
 * Null  → "Never"
 */
const formatSyncTime = (isoString) => {
  if (!isoString) return 'Never';

  const date = new Date(isoString);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (isToday) {
    return `Today at ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${dateStr} at ${timeStr}`;
};

export default function SyncStatusScreen() {
  const {
    isOnline, isSyncing, syncStatus, syncNow, refreshSyncStatus,
    waitingCount, needsAttentionCount,
  } = useOffline();
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  const needsAttentionItems = syncStatus.needsAttentionItems || [];
  const backedOffCount = syncStatus.backedOffCount || 0;
  const nextRetryAt = syncStatus.nextRetryAt || null;
  const lastSyncTime = syncStatus.lastSyncTime || null;
  const lastSuccessfulSyncTime = syncStatus.lastSuccessfulSyncTime || null;

  const state = deriveSyncState({ isOnline, isSyncing, waitingCount, needsAttentionCount });
  const summary = describeSyncState(state, { waitingCount, needsAttentionCount });
  const waitingDetail = describeWaitingDetail({ waitingCount, backedOffCount, nextRetryAt });

  const showSnackbar = (message) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const handleRetry = async (table, id) => {
    if (!isOnline) return;
    const displayName = TABLE_DISPLAY_NAMES[table] || table;
    showSnackbar(`Retrying ${displayName}...`);
    await retryFailedItem(table, id);
    await refreshSyncStatus();
    await syncNow({ force: true });
  };

  return (
    <View style={styles.outerContainer}>
      <ScrollView style={styles.container}>
        {/* Summary: the same voice as the Home banner and the header indicator */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.summaryRow}>
              {summary.icon && (
                <Ionicons name={summary.icon} size={22} color={summary.color} style={styles.summaryIcon} />
              )}
              <Text variant="titleMedium" style={[styles.summaryText, { color: summary.color }]}>
                {summary.message}
              </Text>
            </View>
            {waitingDetail && (
              <>
                <Text variant="bodyMedium" style={styles.waitingText}>
                  {waitingDetail.title}
                </Text>
                {waitingDetail.detail && (
                  <Text variant="bodySmall" style={styles.waitingHint}>
                    {waitingDetail.detail}
                  </Text>
                )}
              </>
            )}
          </Card.Content>
        </Card>

        {/* Network Status */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Network Status</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, isOnline ? styles.badgeOnline : styles.badgeOffline]}>
                <Text style={[styles.badgeText, isOnline ? styles.badgeTextOnline : styles.badgeTextOffline]}>
                  {isOnline ? 'Online' : 'Offline'}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Last Synced */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Last Synced</Text>
            <Text variant="bodyMedium" style={styles.syncTimeText}>
              {formatSyncTime(lastSuccessfulSyncTime)}
            </Text>
            {lastSyncTime && lastSyncTime !== lastSuccessfulSyncTime && (
              <Text variant="bodySmall" style={styles.lastAttemptText}>
                Last attempt: {formatSyncTime(lastSyncTime)}
              </Text>
            )}
          </Card.Content>
        </Card>

        {/* Sync Now Button */}
        <Button
          mode="contained"
          onPress={() => syncNow({ force: true })}
          disabled={!isOnline || isSyncing}
          loading={isSyncing}
          style={styles.syncButton}
        >
          Sync Now
        </Button>

        {/* Needs Attention: the only itemized list; terminal rows with per-row Retry */}
        {needsAttentionItems.length > 0 && (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>Needs Attention</Text>
              {!isOnline && (
                <Text variant="bodySmall" style={styles.reconnectHint}>
                  Reconnect to retry these items.
                </Text>
              )}
              {needsAttentionItems.map((item) => (
                <Card key={`${item.table}_${item.id}`} style={styles.failedItemCard}>
                  <Card.Content>
                    <Text variant="bodyLarge" style={styles.failedItemTable}>
                      {TABLE_DISPLAY_NAMES[item.table] || item.table}
                    </Text>
                    <Text variant="bodySmall" style={styles.failedItemId}>
                      ID: {item.id.substring(0, 8)}...
                    </Text>
                    <Text variant="bodySmall" style={styles.failedItemReason}>
                      {item.reason}
                    </Text>
                    <Text variant="bodySmall" style={styles.failedItemTime}>
                      Failed: {formatSyncTime(item.failedAt)}
                    </Text>
                    <Button
                      mode="outlined"
                      onPress={() => handleRetry(item.table, item.id)}
                      style={styles.retryButton}
                      compact
                      disabled={!isOnline}
                    >
                      Retry
                    </Button>
                  </Card.Content>
                </Card>
              ))}
            </Card.Content>
          </Card>
        )}
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
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  card: {
    margin: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    ...shadows.card,
  },
  sectionTitle: {
    color: colors.primary,
    marginBottom: spacing.sm,
  },

  // Summary
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryIcon: {
    marginRight: spacing.sm,
  },
  summaryText: {
    flex: 1,
  },
  waitingText: {
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  waitingHint: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },

  // Network badge
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  badgeOnline: {
    backgroundColor: colors.successBg,
  },
  badgeOffline: {
    backgroundColor: colors.warningBg,
  },
  badgeText: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  badgeTextOnline: {
    color: colors.success,
  },
  badgeTextOffline: {
    color: colors.warningText,
  },

  // Last synced
  syncTimeText: {
    color: colors.textSecondary,
  },
  lastAttemptText: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },

  // Sync Now button
  syncButton: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },

  // Needs Attention
  reconnectHint: {
    color: colors.warningText,
    marginBottom: spacing.sm,
  },
  failedItemCard: {
    backgroundColor: colors.cardBackground,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  failedItemTable: {
    color: colors.text,
    fontWeight: 'bold',
  },
  failedItemId: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  failedItemReason: {
    color: colors.error,
    marginTop: spacing.xs,
  },
  failedItemTime: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  retryButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
});
