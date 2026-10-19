import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, tints } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

export default function ToggleChip({ label, selected, onPress, testID }) {
  return <Pressable testID={testID} accessibilityRole="checkbox" accessibilityLabel={label}
    accessibilityState={{ checked: selected }} onPress={onPress} hitSlop={4}
    style={[styles.chip, selected ? styles.selected : styles.unselected]}>
    {selected ? <Ionicons name="checkmark" size={16} color={colors.onDark} /> : null}
    <Text style={[styles.label, { color: selected ? colors.onDark : colors.text }]}>{label}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  chip: { minHeight: 36, borderRadius: borderRadius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
  selected: { backgroundColor: colors.text, paddingLeft: 10, paddingRight: 14 },
  unselected: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: tints.control, paddingHorizontal: 16 },
  label: { ...typeRoles.textLink, flexShrink: 1 },
});
