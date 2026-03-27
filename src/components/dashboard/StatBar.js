import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';

/**
 * A horizontal row of stat "pills" for tab screen headers.
 *
 * @param {Array<{ label: string, value: string|number, color?: string }>} items
 */
export default function StatBar({ items }) {
  return (
    <View style={styles.container}>
      {items.map((item, i) => (
        <View key={i} style={styles.pill}>
          <Text style={[styles.value, item.color && { color: item.color }]}>
            {item.value}
          </Text>
          <Text style={styles.label}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  pill: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    ...shadows.card,
  },
  value: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
  },
  label: {
    fontSize: 10,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: 2,
  },
});
