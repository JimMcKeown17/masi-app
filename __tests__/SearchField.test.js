import React from 'react';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { colors, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
const flat = (node) => StyleSheet.flatten(node.props.style);
import SearchField from '../src/components/common/SearchField';

test('clear appears only with text, empties the value and keeps focus', () => {
  const onChangeText = jest.fn();
  const ui = render(<SearchField value="" onChangeText={onChangeText} placeholder="Search" />);
  expect(ui.queryByRole('button', { name: 'Clear search' })).toBeNull();
  ui.rerender(<SearchField value="abc" onChangeText={onChangeText} placeholder="Search" />);
  const input = ui.getByLabelText('Search');
  fireEvent(input, 'focus');
  fireEvent.press(ui.getByRole('button', { name: 'Clear search' }));
  expect(onChangeText).toHaveBeenCalledWith('');
  expect(ui.getByTestId('search-field-halo')).toBeTruthy();
});
test('disables text suggestions and forwards autoFocus and the accessible name', () => {
  const ui = render(<SearchField value="" placeholder="Search" accessibilityLabel="Search options" autoFocus />);
  expect(ui.getByLabelText('Search options').props).toMatchObject({ autoCorrect: false, autoFocus: true });
});
