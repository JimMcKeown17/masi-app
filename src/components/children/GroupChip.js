import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, tints } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

export function GroupDot({ color, size = 8 }) {
  return <View accessible={false} testID="group-dot" style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, flexShrink: 0 }} />;
}

export default function GroupChip({ groupName, color, onPress, accessibilityLabel }) {
  const assigned = groupName != null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={styles.button}>
      <View testID="group-chip-pill" style={[styles.pill, assigned ? styles.assigned : styles.unassigned]}>
        {assigned ? <GroupDot color={color} /> : <Ionicons name="add" size={14} color={colors.warningText} />}
        <Text style={[styles.label, !assigned && styles.warningLabel]}>{assigned ? groupName : 'Group'}</Text>
        {assigned ? <Ionicons name="chevron-down" size={14} color={colors.textSecondary} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 44, minWidth: 44, marginVertical: -8, justifyContent: 'center', maxWidth: '100%' },
  pill: { minHeight: 28, borderRadius: borderRadius.pill, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center' },
  assigned: { paddingLeft: 9, paddingRight: 8, gap: 6, borderColor: tints.control, backgroundColor: colors.surface },
  unassigned: { paddingLeft: 7, paddingRight: 10, gap: 4, borderColor: tints.warningControl, backgroundColor: colors.warningBg },
  label: { ...typeRoles.textChip, color: colors.text, flexShrink: 1 },
  warningLabel: { color: colors.warningText },
});
