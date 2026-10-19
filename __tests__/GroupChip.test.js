import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import GroupChip, { GroupDot } from '../src/components/children/GroupChip';
import { colors, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
const flat = (node) => StyleSheet.flatten(node.props.style);

test('an assigned group has a named 44dp button around its dot pill', () => {
  const onPress = jest.fn();
  const ui = render(<GroupChip groupName="Group 1" color="#1565C0" onPress={onPress} accessibilityLabel="Change group for Amahle, currently Group 1" />);
  const button = ui.getByRole('button', { name: 'Change group for Amahle, currently Group 1' });
  expect(ui.getAllByRole('button')).toHaveLength(1);
  expect(flat(button)).toMatchObject({ minHeight: 44, marginVertical: -8 });
  expect(flat(ui.getByTestId('group-chip-pill'))).toMatchObject({ minHeight: 28, borderRadius: 999, borderWidth: 1.5, borderColor: tints.control, backgroundColor: colors.surface });
  expect(flat(ui.getByTestId('group-dot'))).toMatchObject({ width: 8, height: 8, backgroundColor: '#1565C0' });
  expect(flat(ui.getByText('Group 1'))).toMatchObject({ ...typeRoles.textChip, color: colors.text });
  expect(ui.UNSAFE_getByType('Ionicons').props).toMatchObject({ name: 'chevron-down', size: 14, color: colors.textSecondary });
  fireEvent.press(button);
  expect(onPress).toHaveBeenCalledTimes(1);
});
test('an unassigned group uses the amber add pill with no dot', () => {
  const onPress = jest.fn();
  const ui = render(<GroupChip groupName={null} onPress={onPress} accessibilityLabel="Assign group to Amahle" />);
  expect(flat(ui.getByTestId('group-chip-pill'))).toMatchObject({ minHeight: 28, borderColor: tints.warningControl, backgroundColor: colors.warningBg });
  expect(flat(ui.getByText('Group'))).toMatchObject({ ...typeRoles.textChip, color: colors.warningText });
  expect(ui.queryByTestId('group-dot')).toBeNull();
  expect(ui.UNSAFE_getByType('Ionicons').props).toMatchObject({ name: 'add', size: 14, color: colors.warningText });
  fireEvent.press(ui.getByRole('button', { name: 'Assign group to Amahle' }));
  expect(onPress).toHaveBeenCalledTimes(1);
});
test('the shared group dot supports the picker size', () => {
  const ui = render(<GroupDot color="#1565C0" size={12} />);
  expect(flat(ui.getByTestId('group-dot'))).toMatchObject({ width: 12, height: 12, borderRadius: 6, backgroundColor: '#1565C0' });
});
