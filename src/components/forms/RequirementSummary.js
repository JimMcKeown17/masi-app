import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

export default function RequirementSummary({ items }) {
  return <View style={styles.row}>
    {items.map(item => item.done ? (
      <View key={item.key} accessible accessibilityLabel={`${item.doneText}, done`} style={styles.item}>
        <View style={[styles.disc, styles.done]}>
          <Ionicons name="checkmark" size={11} color={colors.onDark} accessible={false} />
        </View>
        <Text style={styles.doneText}>{item.doneText}</Text>
      </View>
    ) : (
      <Pressable key={item.key} accessibilityRole="button"
        accessibilityLabel={`${item.missingText} missing. Go to step ${item.step}`}
        onPress={item.onPress} style={[styles.item, styles.missing]}>
        <View style={[styles.disc, styles.empty]} />
        <Text style={styles.missingText}>{item.missingText}</Text>
        <Ionicons name="arrow-forward" size={14} color={colors.primary} accessible={false} />
      </Pressable>
    ))}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, columnGap: 8, minHeight: 20 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  disc: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  done: { backgroundColor: colors.success },
  empty: { borderWidth: 2, borderColor: colors.textSecondary },
  doneText: { ...typeRoles.textSmallStrong, color: colors.text, fontVariant: ['tabular-nums'], flexShrink: 1 },
  missing: { minHeight: 44, marginVertical: -12 },
  missingText: { ...typeRoles.textLink, color: colors.primary, flexShrink: 1 },
});
