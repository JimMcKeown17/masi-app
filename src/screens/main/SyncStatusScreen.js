import React, { useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Card, Text, Button, List, Snackbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useOffline } from '../../context/OfflineContext';
import { retryFailedItem } from '../../services/offlineSync';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';

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
  const { isOnline, isSyncing, syncStatus, syncNow, refreshSyncStatus } = useOffline();
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  const breakdown = syncStatus.breakdown || {};
  const failedItems = syncStatus.failedItems || [];
  const lastSyncTime = syncStatus.lastSyncTime || null;

  const showSnackbar = (message) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const handleRetry = async (table, id) => {
    const displayName = TABLE_DISPLAY_NAMES[table] || table;
    showSnackbar(`Retrying ${displayName}...`);
    await retryFailedItem(table, id);
    await refreshSyncStatus();
    await syncNow();
  };

  // Only show rows where count > 0
  const unsyncedRows = Object.entries(breakdown).filter(([, count]) => count > 0);
  const allSynced = unsyncedRows.length === 0;

  return (
    <View style={styles.outerContainer}>
      <ScrollView style={styles.container}>
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
              {formatSyncTime(lastSyncTime)}
            </Text>
          </Card.Content>
        </Card>

        {/* Unsynced Items */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Unsynced Items</Text>
            {allSynced ? (
              <Text variant="bodyMedium" style={styles.allSyncedText}>
                Everything is up to date.
              </Text>
            ) : (
              unsyncedRows.map(([table, count]) => (
                <List.Item
                  key={table}
                  title={TABLE_DISPLAY_NAMES[table] || table}
                  description={`${count} pending`}
                  left={() => (
                    <Ionicons
                      name="cloud-upload-outline"
                      size={24}
                      color={colors.primary}
                      style={styles.listIcon}
                    />
                  )}
                  titleStyle={styles.listTitle}
                  descriptionStyle={styles.listDescription}
                />
              ))
            )}
          </Card.Content>
        </Card>

        {/* Sync Now Button */}
        <Button
          mode="contained"
          onPress={syncNow}
          disabled={!isOnline || isSyncing}
          loading={isSyncing}
          style={styles.syncButton}
        >
          Sync Now
        </Button>

        {/* Failed Items — only rendered when there are failures */}
        {failedItems.length > 0 && (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>Failed Items</Text>
              {failedItems.map((item, index) => (
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
    backgroundColor: '#D1FAE5',
  },
  badgeOffline: {
    backgroundColor: '#FEF3C7',
  },
  badgeText: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  badgeTextOnline: {
    color: colors.success,
  },
  badgeTextOffline: {
    color: '#B45309',
  },

  // Last synced
  syncTimeText: {
    color: colors.textSecondary,
  },

  // Unsynced list
  allSyncedText: {
    color: colors.success,
  },
  listIcon: {
    marginRight: spacing.sm,
  },
  listTitle: {
    color: colors.text,
  },
  listDescription: {
    color: colors.textSecondary,
  },

  // Sync Now button
  syncButton: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },

  // Failed items
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
