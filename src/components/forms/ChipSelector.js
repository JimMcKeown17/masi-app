import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip } from 'react-native-paper';
import { colors, spacing } from '../../constants/colors';

export default function ChipSelector({
  options,
  value,
  onChange,
  testID,
}) {
  return (
    <View style={styles.row} testID={testID}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Chip
            key={option.value}
            selected={selected}
            onPress={() => onChange(option.value)}
            style={[styles.chip, selected && styles.selectedChip]}
            textStyle={selected ? styles.selectedChipText : styles.chipText}
            accessibilityState={{ selected }}
            testID={testID ? `${testID}-${option.value}` : undefined}
          >
            {option.label}
          </Chip>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    backgroundColor: colors.surface,
  },
  selectedChip: {
    backgroundColor: colors.primary,
  },
  chipText: {
    color: colors.text,
  },
  selectedChipText: {
    color: colors.surface,
  },
});
