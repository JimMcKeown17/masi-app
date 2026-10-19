import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import EmptyState from '../src/components/common/EmptyState';
import SurfaceCard from '../src/components/common/SurfaceCard';
import { colors, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
test('supports a node footnote and an action icon and style while retaining the object API', () => {
  const ui = render(<EmptyState title="No classes" body="Create a class"
    footnote={<View testID="footnote-row"><Text>Then pull down to refresh.</Text></View>}
    action={{ label: 'Start setup', onPress: jest.fn(), icon: 'add', style: { marginTop: 12 } }} />);
  expect(ui.getByTestId('footnote-row').parent.type).not.toBe(Text);
  expect(ui.UNSAFE_getByType('Ionicons').props.name).toBe('add');
  expect(StyleSheet.flatten(ui.getByRole('button', { name: 'Start setup' }).props.style).marginTop).toBe(12);
});
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
