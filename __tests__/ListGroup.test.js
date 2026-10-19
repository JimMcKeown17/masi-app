import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { ListGroupDivider, listGroupItemFrame } from '../src/components/common/ListGroup';
import { borderRadius, colors, tints } from '../src/constants/colors';

test.each([
  [0, 1, 1, 1, borderRadius.lg, borderRadius.lg],
  [0, 3, 1, 0, borderRadius.lg, 0],
  [1, 3, 0, 0, 0, 0],
  [2, 3, 0, 1, 0, borderRadius.lg],
])('frame %s of %s draws only the group perimeter', (index, count, top, bottom, topRadius, bottomRadius) => {
  expect(StyleSheet.flatten(listGroupItemFrame(index, count))).toMatchObject({
    borderLeftWidth: 1, borderRightWidth: 1, borderTopWidth: top, borderBottomWidth: bottom,
    borderColor: tints.rule, borderTopLeftRadius: topRadius, borderTopRightRadius: topRadius,
    borderBottomLeftRadius: bottomRadius, borderBottomRightRadius: bottomRadius,
    overflow: 'hidden', backgroundColor: colors.surface,
  });
});
test('divider overlays the next row at the requested inset', () => {
  const ui = render(<ListGroupDivider inset={68} />);
  expect(StyleSheet.flatten(ui.getByTestId('list-group-divider').props.style)).toMatchObject({
    height: 1, backgroundColor: colors.border, position: 'absolute', top: 0, left: 68, right: 0,
  });
});
