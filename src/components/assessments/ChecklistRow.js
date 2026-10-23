import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

export default function ChecklistRow({ label, checked, onToggle }) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label}
    accessibilityState={{ checked, ...(onToggle ? {} : { disabled: true }) }}
    disabled={!onToggle} onPress={onToggle} style={styles.row}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.box, checked && styles.checked]}>
      {checked && <Ionicons name="checkmark" size={16} color={colors.onDark} />}
    </View>
    <Text style={styles.label}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  row: { minHeight: 48, paddingVertical: spacing.ms, flexDirection: 'row', alignItems: 'center', gap: spacing.ms },
  box: { width: 22, height: 22, borderWidth: 1, borderRadius: borderRadius.sm,
    borderColor: colors.fieldEdge, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { ...typeRoles.textBodySemi, color: colors.text, flex: 1 },
});
