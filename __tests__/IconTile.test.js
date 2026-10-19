import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import IconTile from '../src/components/common/IconTile';
import { colors } from '../src/constants/colors';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
test.each([
  ['canvas', colors.background, colors.text, 20], ['red', colors.red50, colors.red700, 22],
  ['warning', colors.warningBg, colors.warningText, 22],
])('%s tile is decorative and uses its resolved glyph', (tone, backgroundColor, color, size) => {
  const ui = render(<IconTile icon="school-outline" tone={tone} />);
  expect(StyleSheet.flatten(ui.toJSON().props.style)).toMatchObject({ width: 40, height: 40, borderRadius: 14, backgroundColor });
  expect(ui.toJSON().props).toMatchObject({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' });
  expect(ui.UNSAFE_getByType('Ionicons').props).toMatchObject({ name: 'school-outline', color, size });
});
test('iconSize overrides the default for the unchanged Home tile', () => {
  const ui = render(<IconTile icon="school-outline" iconSize={22} />);
  expect(ui.UNSAFE_getByType('Ionicons').props.size).toBe(22);
});
