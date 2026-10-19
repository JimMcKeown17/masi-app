import React from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, tints } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

export default function StatBar({ items }) {
  return <View style={styles.container}>
    {items.map((item, index) => {
      const Column = item.onPress ? Pressable : View;
      return <Column key={item.label} onPress={item.onPress}
        accessibilityRole={item.onPress ? 'button' : undefined}
        accessibilityLabel={item.onPress ? item.accessibilityLabel ?? `View ${item.label}: ${item.value}` : undefined}
        style={[styles.column, index > 0 && styles.divider]}>
        <View style={styles.numeralRow}>
          <Text maxFontSizeMultiplier={1.2} style={[styles.value, { color: item.color ?? (item.onPress ? colors.primary : colors.text) }]}>{item.value}</Text>
          {item.onPress ? <Ionicons name="chevron-forward" size={18} color={colors.primary} /> : null}
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} maxFontSizeMultiplier={1.2}
          style={[styles.label, { color: item.onPress ? colors.primary : colors.textSecondary }]}>{item.label}</Text>
      </Column>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  container: { flexDirection: 'row', marginBottom: 16 },
  column: { flex: 1, minHeight: 56, gap: 2 },
  divider: { paddingLeft: 16, borderLeftWidth: 1, borderLeftColor: tints.rule },
  numeralRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  value: { ...typeRoles.displayTitle, fontVariant: ['tabular-nums'] },
  label: { ...typeRoles.textLabel },
});
