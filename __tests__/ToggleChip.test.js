import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { colors, tints } from '../src/constants/colors';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
const flat = (node) => StyleSheet.flatten(node.props.style);
import ToggleChip from '../src/components/common/ToggleChip';

test.each([true, false])('checkbox exposes checked=%s and uses ink selection', (selected) => {
  const onPress = jest.fn();
  const ui = render(<ToggleChip label="Female" selected={selected} onPress={onPress} />);
  const chip = ui.getByRole('checkbox', { name: 'Female' });
  expect(chip.props.accessibilityState).toEqual({ checked: selected });
  expect(flat(chip)).toMatchObject({ minHeight: 36, backgroundColor: selected ? colors.text : colors.surface });
  expect(flat(ui.getByText('Female')).color).toBe(selected ? colors.onDark : colors.text);
  expect(ui.UNSAFE_queryByType('Ionicons')?.props.name).toBe(selected ? 'checkmark' : undefined);
  fireEvent.press(chip);
  expect(onPress).toHaveBeenCalledTimes(1);
});
