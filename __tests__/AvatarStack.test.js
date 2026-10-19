import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import AvatarStack from '../src/components/children/AvatarStack';
import Avatar from '../src/components/common/Avatar';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
const hidden = { includeHiddenElements: true };

test('shows only the first three initials in roster order, with later rings overlapping earlier ones', () => {
  const ui = render(<AvatarStack initials={['OT', 'ED', 'BS', 'ZZ']} />);
  expect(ui.UNSAFE_getAllByType(Avatar).map(({ props }) => props)).toEqual([
    expect.objectContaining({ label: 'OT', size: 28, ring: true }),
    expect.objectContaining({ label: 'ED', size: 28, ring: true }),
    expect.objectContaining({ label: 'BS', size: 28, ring: true }),
  ]);
  ['OT', 'ED', 'BS'].forEach((label) => expect(ui.getByText(label, hidden)).toBeTruthy());
  expect(ui.queryByText('ZZ', hidden)).toBeNull();
  const rings = ui.getAllByTestId('avatar-ring', hidden).map((node) => StyleSheet.flatten(node.props.style));
  rings.forEach((style) => expect(style.margin).toBe(-2));
  expect(rings[1].marginLeft).toBe(-6);
  expect(rings[2].marginLeft).toBe(-6);
  expect(ui.queryAllByLabelText(/./)).toHaveLength(0);
  expect(ui.queryByText('OT')).toBeNull();
});
test('an empty roster has no stack', () => {
  expect(render(<AvatarStack initials={[]} />).toJSON()).toBeNull();
});
