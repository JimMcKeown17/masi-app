import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, tints } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { classRowLabel, countLabel } from '../../utils/childrenPresentation';
import Avatar from '../common/Avatar';
import StatusBadge from '../common/StatusBadge';
import AvatarStack from './AvatarStack';

export default function ClassRow({
  monogram, name, schoolName, grade, teacher, language, childCount, groupCount, rosterInitials, unsynced, onPress,
}) {
  const { fontScale } = useWindowDimensions();
  const label = classRowLabel({ name, schoolName, grade, teacher, language, childCount, groupCount, unsynced });
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Avatar shape="tile" size={40} label={monogram} style={styles.monogram} />
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={fontScale > 1 ? undefined : 1}>{name}</Text>
          {unsynced ? <StatusBadge label="Unsynced" tone="warning" /> : null}
        </View>
        <Text style={styles.school}>{schoolName}</Text>
        <Text style={styles.meta}>{[grade, teacher, language].filter(part => part?.trim()).join(' • ')}</Text>
        <View style={styles.countRow}>
          <AvatarStack initials={rosterInitials} />
          <Text style={styles.countLine}>
            <Text style={styles.childCount}>{countLabel(childCount, 'child', 'children')}</Text>
            {groupCount > 0 ? <Text style={styles.groupCount}>{` · ${countLabel(groupCount, 'group', 'groups')}`}</Text> : null}
          </Text>
        </View>
      </View>
      <View accessible={false} style={styles.chevron}>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingTop: 12, paddingRight: 14, paddingBottom: 12, paddingLeft: 16, gap: 14 },
  pressed: { backgroundColor: tints.pressed },
  monogram: { alignSelf: 'flex-start' },
  content: { flex: 1, paddingRight: 30 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { ...typeRoles.textRowTitle, color: colors.text, flexShrink: 1 },
  school: { ...typeRoles.textCaption, color: colors.text, marginTop: 2 },
  meta: { ...typeRoles.textCaption, color: colors.textSecondary, marginTop: 2 },
  countRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 },
  countLine: { ...typeRoles.textCaption, fontVariant: ['tabular-nums'], flexShrink: 1 },
  childCount: { ...typeRoles.textChip, color: colors.text },
  groupCount: { ...typeRoles.textCaption, color: colors.textSecondary },
  chevron: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
});
