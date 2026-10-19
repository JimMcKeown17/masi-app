import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, tints } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { useOffline } from '../../context/OfflineContext';
import { describeSyncBanner } from '../../utils/syncStatusPresenter';
import BrandButton from './BrandButton';

export default function SyncBanner({ onSyncNow }) {
  const view = describeSyncBanner(useOffline());
  if (!view) return null;
  return (
    <View testID="sync-banner" style={styles.banner}>
      <Ionicons name="cloud-upload-outline" size={22} color={colors.text} />
      <Text style={styles.message}>{view.message}</Text>
      {view.showSyncNow ? <BrandButton variant="tertiary" size="sm" label="Sync now" onPress={onSyncNow} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', minHeight: 56,
    borderRadius: borderRadius.lg, borderWidth: 1, borderColor: tints.rule, backgroundColor: colors.surface,
    paddingTop: 8, paddingRight: 16, paddingBottom: 8, paddingLeft: 14, gap: 12,
  },
  message: { ...typeRoles.textBodyStrong, color: colors.text, flex: 1 },
});
