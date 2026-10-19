import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { Badge, ActivityIndicator, Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useOffline } from '../../context/OfflineContext';
import { useMotion } from '../../context/MotionContext';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { deriveSyncState, describeSyncState } from '../../utils/syncStatusPresenter';

const HERO_ICONS = {
  synced: 'cloud-done-outline',
  waiting: 'cloud-upload-outline',
  offline: 'cloud-offline-outline',
  needs_attention: 'cloud-outline',
  syncing: 'sync-outline',
};

function HeroSyncIndicator({ onPress, state, view }) {
  const attention = state === 'needs_attention';
  const spin = useRef(new Animated.Value(0)).current;
  const { reduceMotion, motionLevel } = useMotion();
  const rotates = state === 'syncing' && !reduceMotion && motionLevel !== 'still';

  useEffect(() => {
    if (!rotates) return undefined;
    const loop = Animated.loop(Animated.timing(spin, {
      toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true,
    }));
    loop.start();
    return () => { loop.stop(); spin.setValue(0); };
  }, [rotates, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const badge = state === 'syncing' ? 0 : view.badgeCount;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${view.accessibilityLabel}. Sync status`}
      style={[heroStyles.disc, attention ? heroStyles.discAttention : null]}
    >
      <Animated.View style={rotates ? { transform: [{ rotate }] } : null}>
        <Ionicons
          name={HERO_ICONS[state] || HERO_ICONS.synced}
          size={state === 'syncing' ? 22 : 24}
          color={attention ? colors.warningText : colors.onDark}
        />
      </Animated.View>
      {badge > 0 ? (
        <View style={[heroStyles.badge, attention ? heroStyles.badgeAttention : null]}>
          <RNText
            maxFontSizeMultiplier={1.2}
            style={[heroStyles.badgeText, attention ? heroStyles.badgeTextAttention : null]}
          >
            {badge > 99 ? '99+' : String(badge)}
          </RNText>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Header sync indicator, driven by the shared syncStatusPresenter:
 * - Green check: everything saved and synced (including offline with a drained outbox)
 * - Calm cloud: work saved on the phone, waiting to sync (online or offline)
 * - Amber alert: terminal items that need attention (never hidden behind green)
 * - Spinner: a sync pass is running
 */
export default function SyncIndicator({ onPress, showLabel = false, dark = false, variant = 'default' }) {
  const { isOnline, isSyncing, waitingCount, needsAttentionCount } = useOffline();

  const state = deriveSyncState({ isOnline, isSyncing, waitingCount, needsAttentionCount });
  const view = describeSyncState(state, { waitingCount, needsAttentionCount });

  if (variant === 'hero') {
    return <HeroSyncIndicator onPress={onPress} state={state} view={view} />;
  }

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

const heroStyles = StyleSheet.create({
  disc: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.red700,
  },
  discAttention: { backgroundColor: colors.warningBg },
  badge: {
    position: 'absolute', top: -4, right: -4, minWidth: 20, minHeight: 20, paddingHorizontal: 5,
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.red600,
  },
  badgeAttention: { backgroundColor: colors.warningText },
  badgeText: {
    ...typeRoles.textButton, fontSize: 12, lineHeight: 16, color: colors.red700, fontVariant: ['tabular-nums'],
  },
  badgeTextAttention: { color: colors.surface },
});
