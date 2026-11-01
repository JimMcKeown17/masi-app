import { useSignedInEA } from '../../context/SignedInEAContext';
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding';
import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useToast } from '../../context/ToastContext';
import { useOffline } from '../../context/OfflineContext';
import { useAuth } from '../../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { useAssessmentHistoryStatus } from '../../services/assessmentHistoryStatus';
import { useSessionHistoryStatus } from '../../services/sessionHistoryStatus';
import { colors, spacing, borderRadius } from '../../constants/colors';
import {
  deriveSyncState,
  describeReconcileBreakerNote,
  describeSyncState,
  describeWaitingDetail,
  describeCombinedHistoryState,
} from '../../utils/syncStatusPresenter';

import BrandButton from '../../components/common/BrandButton';
import SurfaceCard from '../../components/common/SurfaceCard';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { typeRoles } from '../../constants/typography';

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
  const onScroll = useHeaderHairline();
  const paddingBottom = useScrollBottomPadding();
  const { services } = useSignedInEA();

  const { user } = useAuth();
  const { running, pageVersion, runVersion } = useSessionHistoryStatus();
  const assessmentHistory = useAssessmentHistoryStatus();
  const [pullStates, setPullStates] = useState([null, null, null, null, null]);
  const history = describeCombinedHistoryState({ running: running || assessmentHistory.running, pullStates });
  useFocusEffect(useCallback(() => {
    let active = true;
    Promise.all([
      services.sessionHistory.store.getPullState(user?.id),
      services.assessmentHistory.store.getPullStates(user?.id),
    ]).then(([session, states]) => {
      if (active) setPullStates([session, states.batteryRuns, states.assessments, states.mastery, states.skillMastery]);
    }).catch((error) => {
      console.error('Error loading history status:', error);
    });
    return () => { active = false; };
  }, [user?.id, services, pageVersion, runVersion, assessmentHistory.pageVersion, assessmentHistory.runVersion]));
  const {
    isOnline, isSyncing, syncStatus, syncNow, refreshSyncStatus,
    waitingCount, needsAttentionCount, authorizeReconcileBreaker,
  } = useOffline();
  const toast = useToast();

  const needsAttentionItems = syncStatus.needsAttentionItems || [];
  const reconcileBreakerCards = (syncStatus.reconcileBreakerNotes || [])
    .map(describeReconcileBreakerNote);
  const backedOffCount = syncStatus.backedOffCount || 0;
  const nextRetryAt = syncStatus.nextRetryAt || null;
  const lastSyncTime = syncStatus.lastSyncTime || null;
  const lastSuccessfulSyncTime = syncStatus.lastSuccessfulSyncTime || null;

  const state = deriveSyncState({ isOnline, isSyncing, waitingCount, needsAttentionCount });
  const summary = describeSyncState(state, { waitingCount, needsAttentionCount });
  const waitingDetail = describeWaitingDetail({ waitingCount, backedOffCount, nextRetryAt });

  const handleRetry = async (table, id) => {
    if (!isOnline) return;
    const displayName = TABLE_DISPLAY_NAMES[table] || table;
    toast.show({ message: `Retrying ${displayName}...`, tone: 'neutral', duration: 3000 });
    await services.syncEngine.retryFailedItem(table, id);
    await refreshSyncStatus();
    await syncNow({ force: true });
  };

  return (
    <View style={styles.outerContainer}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom }} onScroll={onScroll} scrollEventThrottle={16}>
        {/* Summary: the same voice as the Home banner and the header indicator */}
        <SurfaceCard style={styles.card}>
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
        </SurfaceCard>

        <SurfaceCard style={styles.card}>
          <Text variant="titleMedium" style={styles.sectionTitle}>History</Text>
          <Text variant="bodyMedium" style={styles.syncTimeText}>{history.label}</Text>
          {history.detail && <Text variant="bodySmall" style={styles.waitingText}>{history.detail}</Text>}
        </SurfaceCard>

        {reconcileBreakerCards.map((card) => (
          <SurfaceCard key={card.scope} style={styles.card}>
            <Text variant="titleMedium" style={styles.breakerTitle}>
              {card.title}
            </Text>
            <BrandButton
              onPress={() => authorizeReconcileBreaker(card.scope)}
              accessibilityLabel={card.accessibilityLabel}
              disabled={!isOnline || isSyncing}
              style={styles.applyButton}
              variant="primary" size="md" label={card.actionLabel}
            />
          </SurfaceCard>
        ))}

        {/* Network Status */}
        <SurfaceCard style={styles.card}>
          <Text variant="titleMedium" style={styles.sectionTitle}>Network Status</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, isOnline ? styles.badgeOnline : styles.badgeOffline]}>
              <Text style={[styles.badgeText, isOnline ? styles.badgeTextOnline : styles.badgeTextOffline]}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>
        </SurfaceCard>

        {/* Last Synced */}
        <SurfaceCard style={styles.card}>
          <Text variant="titleMedium" style={styles.sectionTitle}>Last Synced</Text>
          <Text variant="bodyMedium" style={styles.syncTimeText}>
            {formatSyncTime(lastSuccessfulSyncTime)}
          </Text>
          {lastSyncTime && lastSyncTime !== lastSuccessfulSyncTime && (
            <Text variant="bodySmall" style={styles.lastAttemptText}>
              Last attempt: {formatSyncTime(lastSyncTime)}
            </Text>
          )}
        </SurfaceCard>

        {/* Sync Now Button */}
        <BrandButton
          onPress={() => syncNow({ force: true })}
          disabled={!isOnline || isSyncing}
          loading={isSyncing}
          style={styles.syncButton}
          variant="primary" size="md" label="Sync now"
        />

        {/* Needs Attention: the only itemized list; terminal rows with per-row Retry */}
        {needsAttentionItems.length > 0 && (
          <SurfaceCard style={styles.card}>
            <Text variant="titleMedium" style={styles.sectionTitle}>Needs Attention</Text>
            {!isOnline && (
              <Text variant="bodySmall" style={styles.reconnectHint}>
                Reconnect to retry these items.
              </Text>
            )}
            {needsAttentionItems.map((item) => (
              <SurfaceCard key={`${item.table}_${item.id}`} style={styles.failedItemCard}>
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
                <BrandButton
                  onPress={() => handleRetry(item.table, item.id)}
                  style={styles.retryButton}
                  disabled={!isOnline}
                  variant="secondary" size="md" label="Retry"
                />
              </SurfaceCard>
            ))}
          </SurfaceCard>
        )}
      </ScrollView>
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
  breakerTitle: {
    color: colors.warningText,
  },
  applyButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
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
    ...typeRoles.textSmallStrong,
  },
  badgeTextOnline: {
    color: colors.successText,
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
  },
  failedItemTable: {
    color: colors.text,
    ...typeRoles.textRowTitle,
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
