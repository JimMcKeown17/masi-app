import React, { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import SurfaceCard from '../common/SurfaceCard';
import BrandButton from '../common/BrandButton';
import { lastSeenLabel, lessonRowDetail } from '../../utils/lessonDates';

export default React.memo(function UpNextCard({ row, today, onStart }) {
  const start = useCallback(() => onStart(row.groupId), [onStart, row.groupId]);
  const seen = row.lastSeenOn ? `Not seen since ${lastSeenLabel(row.lastSeenOn, today)}` : 'Not seen yet';
  return <SurfaceCard style={styles.card}>
    <Text accessibilityRole="header" style={styles.label}>Up next</Text>
    <View style={styles.namesRow}>
      <View accessible={false} style={[styles.dot, { backgroundColor: row.dotColor }]} />
      <Text style={styles.names}>{row.members.map(child => child.firstName).join(' & ')}</Text>
    </View>
    <Text style={styles.detail}>{lessonRowDetail(seen, row.nextLetters ?? [], { needsAppUpdate: row.lettersNeedUpdate })}</Text>
    <BrandButton label="Start lesson" onPress={start} />
  </SurfaceCard>;
});
const styles = StyleSheet.create({
  card: { gap: spacing.md, borderColor: colors.red100 },
  label: { ...typeRoles.textSectionLabel, color: colors.primary },
  namesRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms },
  dot: { width: 12, height: 12, borderRadius: 6 },
  names: { ...typeRoles.displaySheetTitle, color: colors.text, flex: 1 },
  detail: { ...typeRoles.textBody, color: colors.textSecondary },
});
