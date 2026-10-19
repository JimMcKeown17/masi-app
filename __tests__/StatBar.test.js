import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { colors, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
const flat = (node) => StyleSheet.flatten(node.props.style);
import StatBar from '../src/components/dashboard/StatBar';

test('numerals use ink, action red or an explicit semantic colour', () => {
  const ui = render(<StatBar items={[{ label: 'Total', value: 8 }, { label: 'Unassessed', value: 3, onPress: jest.fn() }, { label: 'Known', value: 5, color: colors.successText }]} />);
  expect(flat(ui.getByText('8')).color).toBe(colors.text);
  expect(flat(ui.getByText('3')).color).toBe(colors.primary);
  expect(flat(ui.getByText('5')).color).toBe(colors.successText);
  expect(ui.UNSAFE_getAllByType('Ionicons')).toHaveLength(1);
  expect(ui.UNSAFE_getByType('Ionicons').props).toMatchObject({ name: 'chevron-forward', size: 18, color: colors.primary });
});
test('action exposes the default label, fires and supports a custom name', () => {
  const onPress = jest.fn();
  const ui = render(<StatBar items={[{ label: 'Unassessed', value: 3, onPress }]} />);
  fireEvent.press(ui.getByRole('button', { name: 'View Unassessed: 3' }));
  expect(onPress).toHaveBeenCalledTimes(1);
  ui.rerender(<StatBar items={[{ label: 'Unassessed', value: 3, onPress, accessibilityLabel: 'Review children' }]} />);
  expect(ui.getByRole('button', { name: 'Review children' })).toBeTruthy();
});
test('columns after the first have a rule and labels use the permitted size caps', () => {
  const ui = render(<StatBar items={[{ label: 'Total', value: 8 }, { label: 'Known', value: 5 }]} />);
  const columns = ui.toJSON().children;
  expect(StyleSheet.flatten(columns[0].props.style).borderLeftWidth).toBeUndefined();
  expect(StyleSheet.flatten(columns[1].props.style)).toMatchObject({ paddingLeft: 16, borderLeftWidth: 1, borderLeftColor: tints.rule, minHeight: 56 });
  expect(ui.getByText('Known').props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.85, maxFontSizeMultiplier: 1.2 });
  expect(ui.getByText('5').props.maxFontSizeMultiplier).toBe(1.2);
});
