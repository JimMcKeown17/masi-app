import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Badge, Text, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useOffline } from '../../context/OfflineContext';
import { colors, spacing } from '../../constants/colors';

/**
 * SyncIndicator Component
 *
 * Shows network and sync status in the header:
 * - Green checkmark: Online, all synced
 * - Yellow cloud: Offline or has unsynced items
 * - Blue spinner: Currently syncing
 * - Badge count: Number of unsynced items
 */
export default function SyncIndicator({ onPress }) {
  const { isOnline, isSyncing, unsyncedCount } = useOffline();

  // Determine icon and color based on state
  const getIconConfig = () => {
    if (isSyncing) {
      return {
        icon: null, // Will show spinner instead
        color: colors.primary,
        backgroundColor: colors.info + '20', // 20% opacity
      };
    }

    if (!isOnline) {
      return {
        icon: 'cloud-offline-outline',
        color: colors.accent, // Yellow
        backgroundColor: colors.warning + '20',
      };
    }

    if (unsyncedCount > 0) {
      return {
        icon: 'cloud-upload-outline',
        color: colors.accent, // Yellow
        backgroundColor: colors.warning + '20',
      };
    }

    return {
      icon: 'checkmark-circle-outline',
      color: colors.success, // Green
      backgroundColor: colors.success + '20',
    };
  };

  const iconConfig = getIconConfig();

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.container, { backgroundColor: iconConfig.backgroundColor }]}
      activeOpacity={0.7}
    >
      {isSyncing ? (
        <ActivityIndicator size={20} color={iconConfig.color} />
      ) : (
        <Ionicons name={iconConfig.icon} size={20} color={iconConfig.color} />
      )}

      {unsyncedCount > 0 && !isSyncing && (
        <Badge
          style={[styles.badge, { backgroundColor: colors.emphasis }]}
          size={16}
        >
          {unsyncedCount > 99 ? '99+' : unsyncedCount}
        </Badge>
      )}
    </TouchableOpacity>
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
