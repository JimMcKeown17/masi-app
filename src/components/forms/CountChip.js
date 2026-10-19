import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, tints } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

export default function CountChip({ label, active }) {
  return <View testID="count-chip" accessible={false} style={[styles.chip, active && styles.active]}>
    <Text style={[styles.label, active && styles.activeLabel]}>{label}</Text>
  </View>;
}
const styles = StyleSheet.create({
  chip: { minHeight: 32, borderRadius: borderRadius.pill, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1.5, borderColor: tints.rule },
  active: { backgroundColor: colors.text, borderColor: colors.text },
  label: { ...typeRoles.textChip, fontVariant: ['tabular-nums'], color: colors.textSecondary },
  activeLabel: { color: colors.onDark },
});
