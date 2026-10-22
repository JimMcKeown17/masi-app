import React from 'react';
const ReactNative = require('react-native');
import { render, fireEvent } from '@testing-library/react-native';
import ClassRow from '../src/components/children/ClassRow';
import Avatar from '../src/components/common/Avatar';
import AvatarStack from '../src/components/children/AvatarStack';
import StatusBadge from '../src/components/common/StatusBadge';
import { classRowLabel } from '../src/utils/childrenPresentation';
import { colors, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
const flat = (node) => ReactNative.StyleSheet.flatten(node.props.style);
const base = {
  monogram: '1A', name: 'Grade 1A', schoolName: 'Charles Duna Primary', grade: 'Grade 1',
  teacher: 'Ms Ndlovu', language: 'isiXhosa', childCount: 18, groupCount: 4,
  rosterInitials: ['OT', 'ED', 'BS'], unsynced: false,
};
beforeEach(() => jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width: 390, height: 844, scale: 1, fontScale: 1 }));
afterEach(() => jest.restoreAllMocks());

test('the class is one labelled button with a decorative monogram and the school/meta/count hierarchy', () => {
  const onPress = jest.fn();
  const ui = render(<ClassRow {...base} onPress={onPress} />);
  expect(ui.getAllByRole('button')).toHaveLength(1);
  fireEvent.press(ui.getByRole('button', { name: classRowLabel(base) }));
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(ui.getByText('1A', { includeHiddenElements: true })).toBeTruthy();
  expect(ui.UNSAFE_getAllByType(Avatar)[0].props).toMatchObject({ shape: 'tile', size: 40 });
  expect(flat(ui.getByText('Charles Duna Primary'))).toMatchObject({ ...typeRoles.textCaption, color: colors.text });
  expect(flat(ui.getByText('Grade 1 • Ms Ndlovu • isiXhosa'))).toMatchObject({ ...typeRoles.textCaption, color: colors.textSecondary });
  expect(flat(ui.getByText('18 children'))).toMatchObject({ ...typeRoles.textChip, color: colors.text });
  expect(flat(ui.getByText(' · 4 groups'))).toMatchObject({ ...typeRoles.textCaption, color: colors.textSecondary });
  expect(ui.UNSAFE_getByType(AvatarStack).props.initials).toEqual(base.rosterInitials);
  expect(ui.queryByText('Unsynced')).toBeNull();
});
test('zero groups omit the groups text and singular counts are grammatical', () => {
  const ui = render(<ClassRow {...base} childCount={1} groupCount={0} />);
  expect(ui.getByText('1 child')).toBeTruthy();
  expect(ui.queryByText(/ · .*group/)).toBeNull();
  ui.rerender(<ClassRow {...base} childCount={1} groupCount={1} />);
  expect(ui.getByText(' · 1 group')).toBeTruthy();
});
test('an empty class still shows its count and monogram, without roster avatars', () => {
  const ui = render(<ClassRow {...base} childCount={0} groupCount={0} rosterInitials={[]} />);
  expect(ui.getByText('0 children')).toBeTruthy();
  expect(ui.UNSAFE_getAllByType(Avatar)).toHaveLength(1);
  expect(ui.queryAllByTestId('avatar-ring', { includeHiddenElements: true })).toHaveLength(0);
});
test('only an unsynced class shows the warning badge', () => {
  const ui = render(<ClassRow {...base} unsynced />);
  expect(ui.UNSAFE_getByType(StatusBadge).props).toMatchObject({ label: 'Unsynced', tone: 'warning' });
  expect(ui.getByText('Unsynced')).toBeTruthy();
  ui.rerender(<ClassRow {...base} />);
  expect(ui.queryByText('Unsynced')).toBeNull();
});
test('the row uses the board padding and ink pressed fill', () => {
  const ui = render(<ClassRow {...base} />);
  const style = ui.UNSAFE_root.find((node) => typeof node.props.style === 'function').props.style;
  expect(ReactNative.StyleSheet.flatten(style({ pressed: false }))).toMatchObject({
    minHeight: 64, paddingTop: 12, paddingRight: 14, paddingBottom: 12, paddingLeft: 16, gap: 14, alignItems: 'center',
  });
  expect(ReactNative.StyleSheet.flatten(style({ pressed: true })).backgroundColor).toBe(tints.pressed);
});
test('the class name wraps when font scale grows', () => {
  const ui = render(<ClassRow {...base} />);
  expect(ui.getByText(base.name).props.numberOfLines).toBe(1);
  ReactNative.useWindowDimensions.mockReturnValue({ width: 390, height: 844, scale: 1, fontScale: 1.3 });
  ui.rerender(<ClassRow {...base} />);
  expect(ui.getByText(base.name).props.numberOfLines).toBeUndefined();
});

test.each([
  ...[null, undefined, '', '  \t '].flatMap(empty => [
    [{ grade: empty }, 'Ms Nolang • isiXhosa', 'Ms Nolang, isiXhosa'],
    [{ teacher: empty }, 'Grade 1 • isiXhosa', 'Grade 1, isiXhosa'],
    [{ language: empty }, 'Grade 1 • Ms Nolang', 'Grade 1, Ms Nolang'],
  ]),
  [{ grade: null, teacher: ' ', language: undefined }, '', ''],
])('empty metadata %p leaves no separator or accessibility slot', (missing, meta, spokenMeta) => {
  const props = { ...base, teacher: 'Ms Nolang', ...missing };
  const ui = render(<ClassRow {...props} />);
  if (meta) expect(ui.getByText(meta)).toBeTruthy();
  else expect(ui.queryByText(/•/)).toBeNull();
  const expectedLabel = ['Grade 1A', 'Charles Duna Primary', spokenMeta, '18 children', '4 groups']
    .filter(Boolean).join(', ') + '. Open class';
  expect(ui.getByRole('button', { name: expectedLabel })).toBeTruthy();
});
