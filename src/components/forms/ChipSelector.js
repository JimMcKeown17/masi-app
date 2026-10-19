import React from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '../../constants/colors';
import ToggleChip from '../common/ToggleChip';

export default function ChipSelector({ options, value, onChange, testID }) {
  return <View style={styles.row} testID={testID}>
    {options.map((option) => <ToggleChip key={option.value} label={option.label}
      selected={option.value === value} onPress={() => onChange(option.value)}
      testID={testID ? `${testID}-${option.value}` : undefined} />)}
  </View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
});
