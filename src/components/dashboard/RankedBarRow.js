import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, spacing, borderRadius } from '../../constants/colors';

/**
 * Get bar color based on percentage thresholds.
 * Green (70%+), Yellow (40-69%), Red (under 40%).
 */
export function getBarColor(percent) {
  if (percent >= 70) return colors.success;    // #3FA535
  if (percent >= 40) return '#FFBB00';         // warm yellow
  return colors.emphasis;                       // #E72D4D
}

/**
 * A single row in a ranking list with a horizontal bar chart.
 *
 * @param {number} rank - 1-based rank number
 * @param {string} name - Child name
 * @param {number} value - The metric value
 * @param {number} maxValue - Maximum possible value (for bar width scaling)
 * @param {string} barColor - Color of the filled bar
 * @param {string} label - Text label shown at end (e.g. "23/26" or "85%")
 */
export default function RankedBarRow({ rank, name, value, maxValue, barColor, label, onPress }) {
  const widthPercent = maxValue > 0 ? Math.max(2, (value / maxValue) * 100) : 2;

  const content = (
    <View style={[styles.row, { borderLeftColor: barColor }]}>
      <Text style={styles.rank}>{rank}</Text>
      <Text style={styles.name} numberOfLines={1}>{name}</Text>
      <View style={styles.barContainer}>
        <View style={[styles.barFill, { width: `${widthPercent}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }
  return content;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.sm + 2,
    borderLeftWidth: 3,
    marginBottom: spacing.xs + 2,
  },
  rank: {
    fontSize: 11,
    color: colors.textSecondary,
    width: 16,
    textAlign: 'center',
  },
  name: {
    fontSize: 12,
    fontWeight: '600',
    width: 80,
    color: colors.text,
  },
  barContainer: {
    flex: 1,
    backgroundColor: '#E8F0FE',
    borderRadius: 3,
    height: 16,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    width: 48,
    textAlign: 'right',
    color: colors.text,
  },
});
