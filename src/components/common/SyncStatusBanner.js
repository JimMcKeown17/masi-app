import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useOffline } from '../../context/OfflineContext';
import { colors, spacing, borderRadius } from '../../constants/colors';
import { deriveSyncState, describeSyncState } from '../../utils/syncStatusPresenter';

// Banner chrome per state. The presenter owns the copy and the state; this owns the
// Home-surface treatment. Every pair is WCAG AA for normal text (R2, ratios verified):
// warningText on warningBg 6.40:1, white on info 5.25:1, text on disabled 7.38:1.
// (The obvious "solid amber with white text" fails at 4.24:1; do not revert to it.)
const BANNER_STYLES = {
  needs_attention: { backgroundColor: colors.warningBg, contentColor: colors.warningText },
  offline: { backgroundColor: colors.disabled, contentColor: colors.text },
  waiting: { backgroundColor: colors.info, contentColor: '#FFFFFF' },
};

export default function SyncStatusBanner({ onPress }) {
  const { isOnline, waitingCount, needsAttentionCount } = useOffline();

  // isSyncing is deliberately not consumed: a running pass is header-indicator feedback;
  // the banner reports the underlying backlog without flickering through "Syncing".
  const state = deriveSyncState({ isOnline, isSyncing: false, waitingCount, needsAttentionCount });
  if (state === 'synced') return null;

  const view = describeSyncState(state, { waitingCount, needsAttentionCount });
  const chrome = BANNER_STYLES[state];

  return (
    <TouchableOpacity
      style={[styles.banner, { backgroundColor: chrome.backgroundColor }]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Open sync status, ${view.accessibilityLabel}`}
    >
      <Ionicons name={view.icon} size={18} color={chrome.contentColor} style={styles.icon} />
      <Text variant="bodySmall" style={[styles.text, { color: chrome.contentColor }]}>
        {view.message}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={chrome.contentColor} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  icon: {
    marginRight: spacing.sm,
  },
  text: {
    flex: 1,
  },
});
