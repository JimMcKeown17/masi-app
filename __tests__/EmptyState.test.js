import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import EmptyState from '../src/components/common/EmptyState';
import SurfaceCard from '../src/components/common/SurfaceCard';
import { colors, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
test('renders a heading, body, optional footnote and working action', () => {
  const onPress = jest.fn();
  const ui = render(<EmptyState title="No children" body="Add a child to begin." footnote="Ask your supervisor for help." action={{ label: 'Add child', onPress }} />);
  expect(StyleSheet.flatten(ui.getByRole('header').props.style)).toMatchObject(typeRoles.displaySheetTitle);
  expect(ui.getByText('Add a child to begin.')).toBeTruthy();
  expect(ui.getByText('Ask your supervisor for help.')).toBeTruthy();
  fireEvent.press(ui.getByRole('button', { name: 'Add child' }));
  expect(onPress).toHaveBeenCalledTimes(1);
});
test('omits optional content and has no illustration', () => {
  const ui = render(<EmptyState title="No children" body="Add a child to begin." />);
  expect(ui.queryByRole('button')).toBeNull();
  expect(ui.UNSAFE_queryByType('Ionicons')).toBeNull();
});
test('SurfaceCard is a flat token surface and accepts caller styles', () => {
  const ui = render(<SurfaceCard testID="card" style={{ marginTop: 8 }}><Text>Content</Text></SurfaceCard>);
  expect(StyleSheet.flatten(ui.getByTestId('card').props.style)).toMatchObject({ backgroundColor: colors.surface, borderWidth: 1, borderColor: tints.rule, borderRadius: 18, padding: 16, marginTop: 8 });
  expect(StyleSheet.flatten(ui.getByTestId('card').props.style).elevation).toBeUndefined();
});
