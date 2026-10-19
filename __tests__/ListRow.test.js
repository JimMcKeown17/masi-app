import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { colors, spacing, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
const flat = (node) => StyleSheet.flatten(node.props.style);
import ListRow from '../src/components/common/ListRow';
import ListGroup from '../src/components/common/ListGroup';

test('passes optional row style, checked state and title line limit through', () => {
  const ui = render(<ListRow title="Child" style={{ height: 74 }} accessibilityRole="checkbox"
    accessibilityState={{ checked: true }} titleNumberOfLines={1} />);
  expect(flat(ui.getByRole('checkbox')).height).toBe(74);
  expect(ui.getByRole('checkbox').props.accessibilityState).toMatchObject({ checked: true });
  expect(ui.getByText('Child').props.numberOfLines).toBe(1);
  ui.rerender(<ListRow title="Child" />);
  expect(ui.getByText('Child').props.numberOfLines).toBeUndefined();
  expect(flat(ui.getByRole('button')).height).toBeUndefined();
});

test('combines its title and subtitle into a button and supports a role override', () => {
  const onPress = jest.fn();
  const ui = render(<ListRow title="Help" subtitle="Contact your supervisor" onPress={onPress} />);
  fireEvent.press(ui.getByRole('button', { name: 'Help, Contact your supervisor' }));
  expect(onPress).toHaveBeenCalledTimes(1);
  const style = ui.UNSAFE_root.find((node) => typeof node.props.style === 'function').props.style({ pressed: true });
  expect(StyleSheet.flatten(style).backgroundColor).toBe(tints.pressed);
  ui.rerender(<ListRow title="Help" accessibilityRole="link" accessibilityLabel="Get help" />);
  expect(ui.getByRole('link', { name: 'Get help' })).toBeTruthy();
});
test('busy replaces the trailing glyph with a spinner and blocks presses', () => {
  const onPress = jest.fn();
  const ui = render(<ListRow title="Export" trailing="share" busy onPress={onPress} />);
  const row = ui.getByRole('button');
  expect(row.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  expect(ui.UNSAFE_getByType(ActivityIndicator).props).toMatchObject({ size: 20, color: colors.textSecondary });
  expect(ui.UNSAFE_queryByType('Ionicons')).toBeNull();
  fireEvent.press(row);
  expect(onPress).not.toHaveBeenCalled();
});
test.each([false, true])('disclosure exposes expanded=%s and the matching glyph', (expanded) => {
  const ui = render(<ListRow title="Support" trailing="disclosure" expanded={expanded} />);
  expect(ui.getByRole('button').props.accessibilityState.expanded).toBe(expanded);
  expect(ui.UNSAFE_getByType('Ionicons').props).toMatchObject({ name: expanded ? 'chevron-up' : 'chevron-down', color: expanded ? colors.text : colors.textSecondary });
});
test('disclosure reflects expanded state after rerender', () => {
  const onPress = jest.fn();
  const row = (expanded) => <ListRow title="Support tools" trailing="disclosure"
    expanded={expanded} onPress={onPress} accessibilityLabel="Support tools" />;
  const ui = render(row(false));
  expect(ui.getByRole('button', { name: 'Support tools' }).props.accessibilityState.expanded).toBe(false);
  ui.rerender(row(true));
  expect(ui.getByRole('button', { name: 'Support tools' }).props.accessibilityState.expanded).toBe(true);
});
test.each(['action', 'nested'])('%s titleAccessory renders beside the title and wraps', (variant) => {
  const ui = render(<ListRow title="Share database" variant={variant}
    titleAccessory={<Text>Sensitive</Text>} />);
  const title = ui.getByText('Share database');
  const accessory = ui.getByText('Sensitive');
  // RN Text has a composite wrapper; inspect its nearest native View.
  let line = accessory.parent;
  while (line.type !== 'View') line = line.parent;
  expect(line.findAllByType('Text').map(node => node.props.children)).toEqual(['Share database', 'Sensitive']);
  expect(flat(line)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm });
  expect(title.props.numberOfLines).toBeUndefined();
});
test('readOnly is one accessible element and has no button or trailing glyph', () => {
  const ui = render(<ListRow variant="readOnly" title="Email" subtitle="ea@masi.org" trailing="chevron" />);
  expect(ui.getByLabelText('Email, ea@masi.org').props.accessible).toBe(true);
  expect(ui.queryByRole('button')).toBeNull();
  expect(ui.UNSAFE_queryByType('Ionicons')).toBeNull();
  expect(flat(ui.getByText('Email'))).toMatchObject(typeRoles.textLabel);
  expect(flat(ui.getByText('ea@masi.org'))).toMatchObject(typeRoles.textRowTitle);
});
test.each([['action', true, 68], ['action', false, 16], ['nested', true, 104]])('%s divider with lead=%s starts at %s', (variant, withLead, left) => {
  const ui = render(<ListRow title="Row" variant={variant} lead={withLead ? <View /> : undefined} showDivider />);
  expect(flat(ui.getByTestId('list-row-divider'))).toMatchObject({ left, height: 1, backgroundColor: colors.border });
  ui.rerender(<ListRow title="Row" />);
  expect(ui.queryByTestId('list-row-divider')).toBeNull();
});
test('ListGroup adds dividers only between its valid rows', () => {
  const ui = render(<ListGroup><ListRow title="One" />{null}<ListRow title="Two" /><ListRow title="Three" /></ListGroup>);
  expect(ui.getAllByTestId('list-row-divider')).toHaveLength(2);
  expect(StyleSheet.flatten(ui.toJSON().props.style)).toMatchObject({ backgroundColor: colors.surface, borderColor: tints.rule, borderRadius: 18, overflow: 'hidden' });
});

test('readOnly renders its leading tile within the single accessible row', () => {
  const ui = render(<ListRow variant="readOnly" title="Email" subtitle="ea@masi.org"
    lead={<View testID="mail-tile" />} showDivider />);
  expect(ui.getByLabelText('Email, ea@masi.org').props.accessible).toBe(true);
  expect(ui.getByTestId('mail-tile')).toBeTruthy();
  expect(flat(ui.getByTestId('list-row-divider')).left).toBe(68);
  expect(ui.queryByRole('button')).toBeNull();
});
