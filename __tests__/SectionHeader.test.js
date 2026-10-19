import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { colors, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
const flat = (node) => StyleSheet.flatten(node.props.style);
import SectionHeader from '../src/components/common/SectionHeader';

test('renders its title as a section label and accessible header', () => {
  const ui = render(<SectionHeader title="Assessments" />);
  expect(flat(ui.getByRole('header', { name: 'Assessments' }))).toMatchObject({ ...typeRoles.textSectionLabel, color: colors.textSecondary });
});
test('renders the hint when provided, omits it otherwise', () => {
  const ui = render(<SectionHeader title="Sessions" hint="Record new sessions." />);
  expect(ui.getByText('Record new sessions.')).toBeTruthy();
  ui.rerender(<SectionHeader title="Sessions" />);
  expect(ui.queryByText('Record new sessions.')).toBeNull();
});
test('the optional action fires as a tertiary button', () => {
  const onPress = jest.fn();
  const ui = render(<SectionHeader title="Children" action={{ label: 'Add child', onPress }} />);
  fireEvent.press(ui.getByRole('button', { name: 'Add child' }));
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(flat(ui.getByRole('button'))).toMatchObject({ marginVertical: -12, backgroundColor: 'transparent' });
});
