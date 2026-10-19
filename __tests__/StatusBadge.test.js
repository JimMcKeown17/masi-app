import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { colors, tints } from '../src/constants/colors';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
const flat = (node) => StyleSheet.flatten(node.props.style);
import StatusBadge from '../src/components/common/StatusBadge';

test.each([
  ['warning', colors.warningBg, colors.warningText], ['success', colors.successBg, colors.successText],
  ['successStrong', colors.successText, colors.onDark], ['error', colors.errorBg, colors.error],
  ['neutral', colors.border, colors.text],
])('%s uses its tokens and grows with text', (tone, backgroundColor, color) => {
  const ui = render(<StatusBadge label="Status" tone={tone} />);
  expect(StyleSheet.flatten(ui.toJSON().props.style)).toMatchObject({ minHeight: 22, backgroundColor });
  expect(StyleSheet.flatten(ui.toJSON().props.style).height).toBeUndefined();
  expect(flat(ui.getByText('Status')).color).toBe(color);
});
