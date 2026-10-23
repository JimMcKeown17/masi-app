import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

export default function MaterialsBlock({ firstName, materials }) {
  if (!materials) return <Text style={styles.oral}>No materials, oral</Text>;
  return <View style={styles.block}>
    <Text style={styles.eyebrow}>Hand {firstName}</Text>
    <Text style={styles.item}>{[materials.item, materials.side].filter(Boolean).join(' · ')}</Text>
    <Text style={styles.footer}>Footer: {materials.footer}</Text>
  </View>;
}

const styles = StyleSheet.create({
  block: { marginHorizontal: spacing.md, marginBottom: spacing.sm, padding: spacing.md,
    gap: spacing.xs, borderRadius: borderRadius.lg, backgroundColor: colors.heroDark },
  eyebrow: { ...typeRoles.textSectionLabel, color: colors.onDarkMuted },
  item: { ...typeRoles.displayHeading, color: colors.onDark },
  footer: { ...typeRoles.textCaption, color: colors.onDarkMuted },
  oral: { ...typeRoles.textCaption, color: colors.textSecondary,
    marginHorizontal: spacing.md, marginBottom: spacing.sm },
});
