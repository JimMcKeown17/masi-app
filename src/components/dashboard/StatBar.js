import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';

/**
 * A horizontal row of stat "pills" for tab screen headers.
 *
 * @param {Array<{ label: string, value: string|number, color?: string, onPress?: () => void }>} items
 */
export default function StatBar({ items }) {
  return (
    <View style={styles.container}>
      {items.map((item, i) => {
        const pill = (
          <View key={i} style={[styles.pill, item.onPress && styles.pillTappable]}>
            <Text style={[styles.value, item.color && { color: item.color }]}>
              {item.value}
            </Text>
            <Text style={styles.label}>{item.label}</Text>
          </View>
        );
        if (item.onPress) {
          return (
            <Pressable key={i} onPress={item.onPress} style={styles.pillWrapper}>
              {pill}
            </Pressable>
          );
        }
        return pill;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  pillWrapper: {
    flex: 1,
  },
  pillTappable: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
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
