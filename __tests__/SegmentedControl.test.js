import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { colors, tints } from '../src/constants/colors';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
const flat = (node) => StyleSheet.flatten(node.props.style);
import SegmentedControl from '../src/components/common/SegmentedControl';

const options = [{ value: 'children', label: 'Children' }, { value: 'groups', label: 'Groups' }];
test.each([['radio', 'radiogroup', 'checked'], ['tab', 'tablist', 'selected']])('%s exposes its group and state', (role, groupRole, state) => {
  const onChange = jest.fn();
  const ui = render(<SegmentedControl options={options} value="children" onChange={onChange} role={role} accessibilityLabel="Roster" />);
  const group = ui.getByTestId('segmented-control');
  expect(group.props.accessibilityRole).toBe(groupRole);
  expect(group.props.accessibilityLabel).toBe('Roster');
  expect(ui.getByRole(role, { name: 'Children' }).props.accessibilityState).toEqual({ [state]: true });
  expect(ui.getByRole(role, { name: 'Groups' }).props.accessibilityState).toEqual({ [state]: false });
  expect(flat(ui.getByText('Children')).color).toBe(colors.onDark);
  expect(ui.getByText('Children').props.numberOfLines).toBeUndefined();
  fireEvent.press(ui.getByRole(role, { name: 'Groups' }));
  expect(onChange).toHaveBeenCalledWith('groups');
});

test.each(['radio', 'tab'])('the %s group container is not itself an accessibility element, so VoiceOver reaches each segment', (role) => {
  const ui = render(<SegmentedControl options={options} value="children" onChange={jest.fn()} role={role} accessibilityLabel="Roster" />);
  expect(ui.queryByRole(role === 'tab' ? 'tablist' : 'radiogroup')).toBeNull();
  expect(ui.getByTestId('segmented-control').props.accessible).not.toBe(true);
  for (const name of ['Children', 'Groups']) expect(ui.getByRole(role, { name }).props.accessible).not.toBe(false);
});
