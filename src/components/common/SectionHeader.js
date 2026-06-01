import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, spacing } from '../../constants/colors';

/**
 * Shared in-content section heading: a title with an optional subtitle, styled
 * consistently across screens. Replaces the ad-hoc `<Text variant="titleLarge">`
 * + description pairs each screen used to hand-roll, so headings look and space
 * the same app-wide.
 */
export default function SectionHeader({ title, subtitle, style }) {
  return (
    <View style={[styles.container, style]}>
      <Text variant="titleLarge" style={styles.title}>{title}</Text>
      {subtitle ? (
        <Text variant="bodyMedium" style={styles.subtitle}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
  },
});
