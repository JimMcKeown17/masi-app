import React from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import BrandButton from '../src/components/common/BrandButton';
import { colors, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';
import { MotionProvider } from '../src/context/MotionContext';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
const flat = (node) => StyleSheet.flatten(node.props.style);

test('renders a solid accessible primary CTA and handles presses', () => {
  const onPress = jest.fn();
  const ui = render(<BrandButton label="Record Session" onPress={onPress} />);
  const button = ui.getByRole('button', { name: 'Record Session' });
  expect(flat(button)).toMatchObject({ minHeight: 56, backgroundColor: colors.primary });
  expect(flat(ui.getByText('Record Session'))).toMatchObject(typeRoles.textButtonL);
  expect(button.props.colors).toBeUndefined();
  expect(ui.UNSAFE_root.findAll((node) => Array.isArray(node.props.colors))).toHaveLength(0);
  fireEvent.press(button);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('loading keeps the fill and shows the loading label, and ignores presses', () => {
  const onPress = jest.fn();
  const ui = render(<BrandButton label="Save" loading loadingLabel="Saving…" onPress={onPress} />);
  const button = ui.getByRole('button', { name: 'Saving…' });
  expect(ui.getByText('Saving…')).toBeTruthy();
  expect(button.props.accessibilityState).toEqual({ busy: true, disabled: true });
  expect(flat(button).backgroundColor).toBe(colors.primary);
  expect(ui.UNSAFE_getByType(ActivityIndicator).props).toMatchObject({ size: 18, color: colors.onDark });
  fireEvent.press(button);
  expect(onPress).not.toHaveBeenCalled();
});

test.each([
  ['primary', 'canvas', 'accent', colors.primary, colors.onDark],
  ['secondary', 'canvas', 'accent', colors.surface, colors.text, tints.control],
  ['tertiary', 'canvas', 'accent', 'transparent', colors.primary],
  ['tertiary', 'canvas', 'ink', 'transparent', colors.text],
  ['tertiary', 'canvas', 'onRed', 'transparent', colors.onDark],
  ['destructive', 'canvas', 'accent', colors.error, colors.onDark],
  ['destructiveQuiet', 'canvas', 'accent', colors.surface, colors.error, tints.control],
  ['warning', 'canvas', 'accent', colors.warningBg, colors.warningText, tints.warningControl],
  ['success', 'canvas', 'accent', colors.successText, colors.onDark],
  ['primary', 'red', 'accent', colors.surface, colors.primary],
  ['secondary', 'red', 'accent', 'transparent', colors.onDark, tints.onRedOutline],
].map((row) => [...row, undefined].slice(0, 6)))('%s on %s (%s) uses its resolved tokens', (variant, surface, tone, fill, color, border) => {
  const ui = render(<BrandButton label="Action" {...{ variant, surface, tone }} />);
  const style = flat(ui.getByRole('button'));
  expect(style.backgroundColor).toBe(fill);
  expect(flat(ui.getByText('Action')).color).toBe(color);
  if (border) expect(style).toMatchObject({ borderColor: border, borderWidth: 1.5 });
});

test('md never sets a fixed height and labels wrap', () => {
  const ui = render(<BrandButton size="md" label="A long action label" />);
  expect(flat(ui.getByRole('button'))).toMatchObject({ minHeight: 44 });
  expect(flat(ui.getByRole('button')).height).toBeUndefined();
  expect(ui.getByText('A long action label').props.numberOfLines).toBeUndefined();
});

test.each([false, true])('pressed applies scale unless reduceMotion=%s', (reduceMotion) => {
  const ui = render(<MotionProvider value={{ tier: 'high', reduceMotion, motionLevel: reduceMotion ? 'still' : 'full' }}>
    <BrandButton label="Action" />
  </MotionProvider>);
  const style = StyleSheet.flatten(ui.UNSAFE_root.find((node) => typeof node.props.style === 'function').props.style({ pressed: true }));
  expect(style.backgroundColor).toBe(colors.primaryDark);
  expect(style.transform).toEqual(reduceMotion ? undefined : [{ scale: 0.98 }]);
  expect(style.elevation ?? 0).toBe(0);
});

test('disabled exposes disabled and ignores presses', () => {
  const onPress = jest.fn();
  const ui = render(<BrandButton label="Action" disabled onPress={onPress} />);
  expect(ui.getByRole('button').props.accessibilityState.disabled).toBe(true);
  expect(flat(ui.getByRole('button')).backgroundColor).toBe(colors.border);
  expect(flat(ui.getByText('Action')).color).toBe(colors.disabled);
  fireEvent.press(ui.getByRole('button'));
  expect(onPress).not.toHaveBeenCalled();
});

test('renders an icon before its label and applies caller style last', () => {
  const ui = render(<BrandButton label="Action" icon="add" style={{ minHeight: 64 }} testID="action" />);
  expect(ui.UNSAFE_getByType('Ionicons').props).toMatchObject({ name: 'add', size: 20, color: colors.onDark });
  expect(flat(ui.getByTestId('action')).minHeight).toBe(64);
  expect(ui.getByText('Action')).toBeTruthy();
});
