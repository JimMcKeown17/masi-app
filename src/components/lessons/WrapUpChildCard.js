import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, spacing, tints } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { getInitials } from '../../utils/initials';
import Avatar from '../common/Avatar';

// One child on Wrap up (literacy and numeracy). The card keeps each child's controls together;
// `rows` are the child's trackers, drawn as matching WrapUpTrackerRows under the controls.
export default function WrapUpChildCard({ child, testID, rows, children }) {
  return <View testID={testID} style={styles.card}>
    <View style={styles.top}>
      <View style={styles.header}>
        <Avatar label={getInitials(child.first_name)} size={40} />
        <Text style={styles.name}>{child.first_name}</Text>
      </View>
      {children}
    </View>
    {React.Children.toArray(rows)}
  </View>;
}

// Where the child is now (a label and its value) and the way to change it.
export function WrapUpTrackerRow({ label, value, accessibilityLabel, onPress }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}
    style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{value}</Text>
    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: tints.rule, borderRadius: borderRadius.lg, overflow: 'hidden' },
  top: { padding: spacing.md, gap: spacing.ms },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms },
  name: { ...typeRoles.displayM, color: colors.text, flexShrink: 1 },
  row: { minHeight: 52, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center',
    gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  pressed: { backgroundColor: tints.pressed },
  label: { ...typeRoles.textRowTitle, color: colors.text, flex: 1 },
  value: { ...typeRoles.textRowTitle, color: colors.primary, flexShrink: 1, textAlign: 'right' },
});
