import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Badge, ActivityIndicator, Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useOffline } from '../../context/OfflineContext';
import { colors, spacing } from '../../constants/colors';
import { deriveSyncState, describeSyncState } from '../../utils/syncStatusPresenter';

/**
 * Header sync indicator, driven by the shared syncStatusPresenter:
 * - Green check: everything saved and synced (including offline with a drained outbox)
 * - Calm cloud: work saved on the phone, waiting to sync (online or offline)
 * - Amber alert: terminal items that need attention (never hidden behind green)
 * - Spinner: a sync pass is running
 */
export default function SyncIndicator({ onPress, showLabel = false, dark = false }) {
  const { isOnline, isSyncing, waitingCount, needsAttentionCount } = useOffline();

  const state = deriveSyncState({ isOnline, isSyncing, waitingCount, needsAttentionCount });
  const view = describeSyncState(state, { waitingCount, needsAttentionCount });

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.container,
        showLabel ? styles.labelContainer : null,
        dark ? styles.darkContainer : { backgroundColor: view.backgroundColor },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open sync status, ${view.accessibilityLabel}`}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      {state === 'syncing' ? (
        <ActivityIndicator size={20} color={view.color} />
      ) : (
        <Ionicons name={view.icon} size={20} color={view.color} />
      )}

      {showLabel ? (
        <Text style={[styles.message, { color: view.color }]}>{view.message}</Text>
      ) : null}

      {!showLabel && view.badgeCount > 0 ? (
        <Badge style={[styles.badge, { backgroundColor: view.color }]} size={16}>
          {view.badgeCount > 99 ? '99+' : view.badgeCount}
        </Badge>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    minWidth: 40,
    height: 32,
    position: 'relative',
  },
  labelContainer: {
    gap: spacing.xs + 2,
    minWidth: 0,
    height: 34,
    paddingHorizontal: spacing.sm + 3,
  },
  darkContainer: {
    borderWidth: 1,
    borderColor: colors.heroBorder,
    backgroundColor: colors.heroSurface,
  },
  message: {
    fontSize: 11,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    fontSize: 10,
    fontWeight: 'bold',
  },
});
