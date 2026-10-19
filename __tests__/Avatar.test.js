import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import Avatar from '../src/components/common/Avatar';
import { borderRadius, colors, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';

jest.mock('@expo/vector-icons', () => new Proxy({}, {
  get: (target, prop) => {
    if (prop === '__esModule') return true;
    if (!target[prop]) target[prop] = prop;
    return target[prop];
  },
}), { virtual: true });
const flat = (node) => StyleSheet.flatten(node.props.style);
const hidden = { includeHiddenElements: true };

// The 28dp stack disc is a fixed graphic and its neighbour covers 6dp of it, so its initials do not
// scale with the system font (A03s at 360dp, font 1.3: 1.2x initials ran into the next disc).
test.each([[28, 'textInitialsSm', 1], [40, 'textInitialsMd', 1.2], [64, 'textInitialsLg', 1.2]])('size %s uses %s in a decorative red disc, one line, capped at %sx', (size, role, cap) => {
  const ui = render(<Avatar label="AD" size={size} />);
  const disc = ui.getByTestId('avatar', hidden);
  expect(flat(disc)).toMatchObject({ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.red50 });
  const label = ui.getByText('AD', hidden);
  expect(flat(label)).toMatchObject({ ...typeRoles[role], color: colors.red700 });
  expect(label.props.maxFontSizeMultiplier).toBe(cap);
  expect(label.props.numberOfLines).toBe(1);
  expect(disc.props).toMatchObject({ importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true });
  expect(ui.queryByLabelText(/AD/)).toBeNull();
});
test('the tile monogram fits on one line using the button role', () => {
  const ui = render(<Avatar label="ECD" shape="tile" testID="monogram" />);
  expect(flat(ui.getByTestId('monogram', hidden))).toMatchObject({ borderRadius: borderRadius.md });
  const label = ui.getByText('ECD', hidden);
  expect(flat(label)).toMatchObject(typeRoles.textButton);
  expect(label.props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true });
});
test('a ring adds a white surround without changing the layout footprint', () => {
  const ui = render(<Avatar label="AD" size={28} ring />);
  expect(flat(ui.getByTestId('avatar-ring', hidden))).toMatchObject({ width: 32, height: 32, margin: -2, backgroundColor: colors.surface });
  expect(flat(ui.getByTestId('avatar', hidden))).toMatchObject({ borderWidth: 1, borderColor: tints.avatarEdge });
});
test.each([[28, 14], [40, 18], [64, 28]])('the icon wins over the label at size %s', (size, glyphSize) => {
  const ui = render(<Avatar label="AD" icon="person-outline" size={size} />);
  expect(ui.UNSAFE_getByType('Ionicons').props).toMatchObject({ name: 'person-outline', size: glyphSize, color: colors.red700 });
  expect(ui.UNSAFE_queryByType(Text)).toBeNull();
});

test('optional style controls the outer layout for plain and ringed avatars', () => {
  const ui = render(<Avatar label="AD" style={{ alignSelf: 'flex-start' }} />);
  expect(flat(ui.getByTestId('avatar', hidden)).alignSelf).toBe('flex-start');
  ui.rerender(<Avatar label="AD" ring style={{ marginLeft: -6 }} />);
  expect(flat(ui.getByTestId('avatar-ring', hidden))).toMatchObject({ margin: -2, marginLeft: -6 });
  expect(flat(ui.getByTestId('avatar', hidden)).marginLeft).toBeUndefined();
});
