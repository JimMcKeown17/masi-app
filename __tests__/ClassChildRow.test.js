import React from 'react';
const ReactNative = require('react-native');
import { render, fireEvent, within } from '@testing-library/react-native';
import ClassChildRow from '../src/components/children/ClassChildRow';
import Avatar from '../src/components/common/Avatar';
import SpinnerArc from '../src/components/common/SpinnerArc';
import { MotionProvider } from '../src/context/MotionContext';
import { colors, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';

jest.mock('@expo/vector-icons', () => new Proxy({}, {
  get: (target, prop) => {
    if (prop === '__esModule') return true;
    if (!target[prop]) target[prop] = prop;
    return target[prop];
  },
}), { virtual: true });
const flat = (node) => ReactNative.StyleSheet.flatten(node.props.style);
const child = { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini', age: 7, synced: true };
const fullMotion = { tier: 'high', reduceMotion: false, motionLevel: 'full' };
const renderRow = (props = {}) => render(
  <MotionProvider value={fullMotion}>
    <ClassChildRow child={child} groupName="Group 1" groupColor="#1565C0" onPressResults={jest.fn()} onPressLetterTracker={jest.fn()} {...props} />
  </MotionProvider>
);
beforeEach(() => jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width: 390, height: 844, scale: 1, fontScale: 1 }));
afterEach(() => jest.restoreAllMocks());

test('results, group, letter tracker and edit are separate buttons and call only their own handlers', () => {
  const handlers = { onPressResults: jest.fn(), onPressGroup: jest.fn(), onPressLetterTracker: jest.fn(), onPressEdit: jest.fn() };
  const ui = renderRow(handlers);
  const labels = [
    'View results for Amahle Dlamini', 'Change group for Amahle Dlamini, currently Group 1',
    'Letter tracker for Amahle Dlamini', 'Edit Amahle Dlamini',
  ];
  expect(ui.getAllByRole('button')).toHaveLength(4);
  labels.forEach((label, index) => {
    Object.values(handlers).forEach((handler) => handler.mockClear());
    const button = ui.getByRole('button', { name: label });
    for (let parent = button.parent; parent; parent = parent.parent) {
      if (parent.type === 'View') expect(parent.props.accessibilityRole).not.toBe('button');
    }
    fireEvent.press(button);
    Object.values(handlers).forEach((handler, handlerIndex) => expect(handler).toHaveBeenCalledTimes(handlerIndex === index ? 1 : 0));
  });
});
test('the results button contains the avatar, name and 18dp chevron', () => {
  const ui = renderRow();
  const results = ui.getByRole('button', { name: 'View results for Amahle Dlamini' });
  expect(within(results).getByText('AD', { includeHiddenElements: true })).toBeTruthy();
  expect(ui.UNSAFE_getByType(Avatar).props).toMatchObject({ label: 'AD', size: 40 });
  expect(flat(ui.getByText('Amahle Dlamini'))).toMatchObject({ ...typeRoles.textRowTitle, color: colors.text });
  const chevron = ui.UNSAFE_getAllByType('Ionicons').find((node) => node.props.name === 'chevron-forward');
  expect(chevron.props).toMatchObject({ size: 18, color: colors.textSecondary });
  expect(flat(results).minHeight).toBe(44);
});
test('age is optional and has no separator', () => {
  const ui = renderRow();
  expect(ui.getByText('Age 7')).toBeTruthy();
  ui.rerender(<MotionProvider value={fullMotion}><ClassChildRow child={{ ...child, age: null }} groupName="Group 1" /></MotionProvider>);
  expect(ui.queryByText(/Age/)).toBeNull();
  expect(ui.queryByText(/[·•]/)).toBeNull();
});
test.each(['Group 1', null])('the %p chip target stays off the results button', (groupName) => {
  const ui = renderRow({ groupName });
  const meta = flat(ui.getByTestId('child-row-meta'));
  const chip = ui.getByRole('button', { name: groupName ? 'Change group for Amahle Dlamini, currently Group 1' : 'Assign group to Amahle Dlamini' });
  expect(meta).toMatchObject({ marginTop: 8, paddingLeft: 52, gap: 8, flexWrap: 'wrap' });
  expect(flat(chip)).toMatchObject({ minHeight: 44, marginVertical: -8 });
  expect(meta.marginTop + flat(chip).marginVertical).toBeGreaterThanOrEqual(0);
});
test('an unassigned child gets the amber Group action', () => {
  const ui = renderRow({ groupName: null });
  expect(ui.getByRole('button', { name: 'Assign group to Amahle Dlamini' })).toBeTruthy();
  expect(ui.getByText('Group')).toBeTruthy();
});
test('only unsynced children show the muted status line, without a live region', () => {
  const ui = renderRow({ child: { ...child, synced: false } });
  expect(flat(ui.getByText('Syncing…'))).toMatchObject({ ...typeRoles.textNote, color: colors.textSecondary });
  expect(ui.UNSAFE_getByType(SpinnerArc).props).toMatchObject({ size: 16, color: colors.textSecondary });
  expect(ui.getByTestId('child-row-sync').props.accessibilityLiveRegion).toBeUndefined();
  expect(ui.getByText('Syncing…').props.accessibilityLiveRegion).toBeUndefined();
  ui.rerender(<MotionProvider value={fullMotion}><ClassChildRow child={child} groupName="Group 1" /></MotionProvider>);
  expect(ui.queryByText('Syncing…')).toBeNull();
  expect(ui.UNSAFE_queryByType(SpinnerArc)).toBeNull();
});
test('the right actions have 44dp minimum targets and ink glyphs', () => {
  const ui = renderRow();
  ['Letter tracker for Amahle Dlamini', 'Edit Amahle Dlamini'].forEach((name) => {
    expect(flat(ui.getByRole('button', { name }))).toMatchObject({ minWidth: 44, minHeight: 44, borderRadius: 22 });
  });
  expect(ui.UNSAFE_getByType('MaterialCommunityIcons').props).toMatchObject({ name: 'format-letter-case', size: 22, color: colors.text });
  expect(ui.UNSAFE_getAllByType('Ionicons').find((node) => node.props.name === 'create-outline').props).toMatchObject({ size: 24, color: colors.text });
  const pressables = ui.UNSAFE_root.findAll((node) => typeof node.props.style === 'function');
  expect(pressables).toHaveLength(3);
  pressables.forEach((node) => expect(ReactNative.StyleSheet.flatten(node.props.style({ pressed: true })).backgroundColor).toBe(tints.pressed));
});
test('the child name wraps at enlarged system font size', () => {
  const ui = renderRow();
  expect(ui.getByText('Amahle Dlamini').props.numberOfLines).toBe(1);
  ReactNative.useWindowDimensions.mockReturnValue({ width: 390, height: 844, scale: 1, fontScale: 1.3 });
  ui.rerender(<MotionProvider value={fullMotion}><ClassChildRow child={child} groupName="Group 1" /></MotionProvider>);
  expect(ui.getByText('Amahle Dlamini').props.numberOfLines).toBeUndefined();
});

test('without tracker or results handlers the row has 2 buttons and a plain name', () => {
  const onPressGroup = jest.fn();
  const onPressEdit = jest.fn();
  const ui = renderRow({ onPressResults: undefined, onPressLetterTracker: undefined, onPressGroup, onPressEdit });
  expect(ui.getAllByRole('button')).toHaveLength(2);
  expect(ui.queryByRole('button', { name: /View results|Letter tracker/ })).toBeNull();
  const name = ui.getByText('Amahle Dlamini');
  for (let parent = name.parent; parent; parent = parent.parent) {
    expect(parent.props.accessibilityRole).not.toBe('button');
    expect(parent.props.onPress).toBeUndefined();
  }
  expect(ui.UNSAFE_getAllByType('Ionicons').some(node => node.props.name === 'chevron-forward')).toBe(false);
  fireEvent.press(ui.getByRole('button', { name: 'Change group for Amahle Dlamini, currently Group 1' }));
  fireEvent.press(ui.getByRole('button', { name: 'Edit Amahle Dlamini' }));
  expect(onPressGroup).toHaveBeenCalledTimes(1);
  expect(onPressEdit).toHaveBeenCalledTimes(1);
});
