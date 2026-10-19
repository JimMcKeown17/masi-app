import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOffline } from '../../context/OfflineContext';
import { useMotion } from '../../context/MotionContext';
import { colors, tints } from '../../constants/colors';
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

function CanvasSyncIndicator({ onPress, state, view }) {
  const attention = state === 'needs_attention';
  const waiting = state === 'waiting' || state === 'offline';
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
  const count = view.badgeCount > 99 ? '99+' : String(view.badgeCount);
  const icon = attention ? 'warning-outline' : HERO_ICONS[state];
  const iconColor = attention ? colors.warning : state === 'synced' ? colors.success : colors.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      style={styles.container}
      accessibilityRole="button"
      accessibilityLabel={`Open sync status, ${view.accessibilityLabel}`}
    >
      <View testID="sync-pill" style={[styles.pill, waiting ? styles.waiting : null, attention ? styles.attention : null]}>
        {state === 'syncing' ? (
          <Animated.View testID="sync-spinner" style={[styles.spinner, rotates ? { transform: [{ rotate }] } : null]} />
        ) : <Ionicons name={icon} size={18} color={iconColor} />}
        {waiting || attention ? (
          <RNText maxFontSizeMultiplier={1.2} style={[styles.message, attention ? styles.attentionText : null]}>
            {waiting ? `${count} waiting` : count}
          </RNText>
        ) : null}
        {attention ? <Ionicons name="chevron-forward" size={14} color={colors.warningText} /> : null}
      </View>
    </Pressable>
  );
}

// Both presentations share state, counts and spoken copy; only their chrome differs.
export default function SyncIndicator({ onPress, variant = 'default' }) {
  const { isOnline, isSyncing, waitingCount, needsAttentionCount } = useOffline();
  const state = deriveSyncState({ isOnline, isSyncing, waitingCount, needsAttentionCount });
  const view = describeSyncState(state, { waitingCount, needsAttentionCount });
  return variant === 'hero'
    ? <HeroSyncIndicator onPress={onPress} state={state} view={view} />
    : <CanvasSyncIndicator onPress={onPress} state={state} view={view} />;
}

const styles = StyleSheet.create({
  container: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  pill: {
    minHeight: 32, minWidth: 36, padding: 0, borderRadius: 16,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: tints.rule,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  waiting: { paddingLeft: 9, paddingRight: 12 },
  attention: { paddingLeft: 9, paddingRight: 6, backgroundColor: colors.warningBg, borderColor: tints.warningEdge },
  message: { ...typeRoles.textPill, color: colors.text },
  attentionText: { color: colors.warningText },
  spinner: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2,
    borderColor: tints.spinnerTrack, borderTopColor: colors.textSecondary,
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
    ...typeRoles.textBadge, color: colors.red700,
  },
  badgeTextAttention: { color: colors.surface },
});
