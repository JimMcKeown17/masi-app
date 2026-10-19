import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, tints } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { getInitials } from '../../utils/initials';
import Avatar from '../common/Avatar';
import SpinnerArc from '../common/SpinnerArc';
import GroupChip from './GroupChip';

export default function ClassChildRow({
  child, groupName, groupColor, onPressResults, onPressGroup, onPressLetterTracker, onPressEdit,
}) {
  const { fontScale } = useWindowDimensions();
  const name = [child.first_name, child.last_name].map((part) => String(part ?? '').trim()).filter(Boolean).join(' ');
  const groupLabel = groupName != null ? `Change group for ${name}, currently ${groupName}` : `Assign group to ${name}`;
  return (
    <View style={styles.row}>
      <View style={styles.content}>
        <Pressable accessibilityRole="button" accessibilityLabel={`View results for ${name}`} onPress={onPressResults} style={({ pressed }) => [styles.results, pressed && styles.pressed]}>
          <Avatar label={getInitials(child.first_name, child.last_name)} size={40} />
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={fontScale > 1 ? undefined : 1}>{name}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </View>
        </Pressable>
        <View testID="child-row-meta" style={styles.meta}>
          {child.age ? <Text style={styles.age}>{`Age ${child.age}`}</Text> : null}
          <GroupChip groupName={groupName} color={groupColor} onPress={onPressGroup} accessibilityLabel={groupLabel} />
        </View>
        {!child.synced ? (
          <View testID="child-row-sync" style={styles.sync}>
            <SpinnerArc size={16} color={colors.textSecondary} />
            <Text style={styles.syncText}>Syncing…</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Letter tracker for ${name}`} onPress={onPressLetterTracker} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="format-letter-case" size={22} color={colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${name}`} onPress={onPressEdit} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Ionicons name="create-outline" size={24} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 72, paddingTop: 6, paddingRight: 6, paddingBottom: 10, paddingLeft: 16, gap: 4 },
  content: { flex: 1 },
  results: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressed: { backgroundColor: tints.pressed },
  nameRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2 },
  name: { ...typeRoles.textRowTitle, color: colors.text, flexShrink: 1 },
  // Absorbs GroupChip's -8 margin so its 44dp target cannot overlap results.
  meta: { marginTop: 8, paddingLeft: 52, flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  age: { ...typeRoles.textCaption, color: colors.textSecondary, fontVariant: ['tabular-nums'], flexShrink: 1 },
  sync: { marginTop: 8, paddingLeft: 52, flexDirection: 'row', alignItems: 'center', gap: 6 },
  syncText: { ...typeRoles.textNote, color: colors.textSecondary, flexShrink: 1 },
  actions: { alignItems: 'center' },
  iconButton: { minWidth: 44, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
