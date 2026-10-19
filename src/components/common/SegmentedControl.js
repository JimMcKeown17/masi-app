import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, tints } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

export default function SegmentedControl({ options, value, onChange, role = 'radio', accessibilityLabel }) {
  const tabs = role === 'tab';
  return <View accessible accessibilityRole={tabs ? 'tablist' : 'radiogroup'} accessibilityLabel={accessibilityLabel} style={styles.track}>
    {options.map((option) => {
      const selected = option.value === value;
      return <Pressable key={option.value} accessibilityRole={role} accessibilityLabel={option.label}
        accessibilityState={tabs ? { selected } : { checked: selected }} onPress={() => onChange(option.value)}
        style={[styles.segment, selected && styles.selected]}>
        <Text style={[styles.label, selected ? styles.selectedLabel : styles.unselectedLabel]}>{option.label}</Text>
      </Pressable>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  track: { minHeight: 44, borderRadius: borderRadius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: tints.control, flexDirection: 'row' },
  segment: { flex: 1, margin: 4.5, paddingVertical: 4, paddingHorizontal: 8, borderRadius: borderRadius.pill, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.text },
  label: { textAlign: 'center' },
  selectedLabel: { ...typeRoles.textButton, color: colors.onDark },
  unselectedLabel: { ...typeRoles.textBodyStrong, color: colors.text },
});
