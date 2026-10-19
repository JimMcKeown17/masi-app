import React from 'react';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { colors, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
const flat = (node) => StyleSheet.flatten(node.props.style);
import InlineNote from '../src/components/common/InlineNote';
beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

test.each(['polite', 'assertive'])('error is an alert with %s announcements', (live) => {
  const ui = render(<InlineNote live={live}>Required</InlineNote>);
  expect(ui.getByRole('alert').props.accessibilityLiveRegion).toBe(live);
  expect(flat(ui.getByRole('alert')).backgroundColor).toBe(colors.errorBg);
});
test('defaults to polite and announces on iOS only when its text changes', () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  const ui = render(<InlineNote>Required</InlineNote>);
  expect(ui.getByRole('alert').props.accessibilityLiveRegion).toBe('polite');
  expect(announce).toHaveBeenCalledTimes(1);
  ui.rerender(<InlineNote size="md">Required</InlineNote>);
  expect(announce).toHaveBeenCalledTimes(1);
  ui.rerender(<InlineNote>Try again</InlineNote>);
  expect(announce).toHaveBeenCalledTimes(2);
  expect(announce).toHaveBeenLastCalledWith('Try again');
  jest.restoreAllMocks();
});
test('warning is not live and md uses radius 14', () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  const ui = render(<InlineNote tone="warning" size="md">Check this</InlineNote>);
  expect(ui.queryByRole('alert')).toBeNull();
  const row = ui.toJSON();
  expect(row.props.accessibilityLiveRegion).toBeUndefined();
  expect(flat(row)).toMatchObject({ borderRadius: 14, backgroundColor: colors.warningBg });
  expect(announce).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});
test('Android uses the live region without an iOS announcement', () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  render(<InlineNote>Required</InlineNote>);
  expect(announce).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});
