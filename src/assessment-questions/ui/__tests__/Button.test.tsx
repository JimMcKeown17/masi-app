import React from 'react';
import { StyleSheet, Text } from 'react-native';
import Svg from 'react-native-svg';
import { fireEvent, render } from '@testing-library/react-native';
import { tokens } from '../../theme/tokens';
import { Icon, type IconName } from '../Icon';
import { IconButton, PrimaryButton, SecondaryButton, TextLink } from '../Button';

test('PrimaryButton is a pill button with its label as separate text and its icon beside it', () => {
  const r = render(<PrimaryButton label="Correct" icon="check" tone="marked" onPress={jest.fn()} />);
  const button = r.getByRole('button', { name: 'Correct' });
  expect(button).toHaveStyle({ minHeight: 52, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.marked, flexDirection: 'row' });
  expect(r.getByText('Correct')).toHaveStyle({ color: tokens.color.onPrimary });
  expect(r.UNSAFE_getByType(Svg).findAllByType(Text)).toHaveLength(0);
  expect(r.getByText('Correct').findAllByType(Svg)).toHaveLength(0);
});

test.each([
  ['ink', tokens.color.ink], ['marked', tokens.color.marked], ['error', tokens.color.error], ['danger', tokens.color.primary],
] as const)('PrimaryButton %s uses the required fill even when disabled', (tone, backgroundColor) => {
  const r = render(<PrimaryButton tone={tone} label="Action" onPress={jest.fn()} disabled />);
  expect(r.getByRole('button')).toHaveStyle({ backgroundColor, opacity: 0.4 });
});

test('SecondaryButton is an outlined surface pill and supports flex', () => {
  const r = render(<SecondaryButton label="Back" icon="back" onPress={jest.fn()} flex />);
  expect(r.getByRole('button', { name: 'Back' })).toHaveStyle({ minHeight: 52, borderRadius: tokens.radius.pill, borderWidth: 1.5, borderColor: tokens.color.ink, backgroundColor: tokens.color.surface, flex: 1 });
  expect(r.getByText('Back')).toHaveStyle({ color: tokens.color.ink });
});

const controls = [
  { name: 'primary', element: (onPress: () => void, disabled: boolean) => <PrimaryButton testID="control" label="Action" onPress={onPress} disabled={disabled} /> },
  { name: 'secondary', element: (onPress: () => void, disabled: boolean) => <SecondaryButton testID="control" label="Action" onPress={onPress} disabled={disabled} /> },
  { name: 'link', element: (onPress: () => void, disabled: boolean) => <TextLink testID="control" label="Action" onPress={onPress} disabled={disabled} /> },
  { name: 'icon', element: (onPress: () => void, disabled: boolean) => <IconButton testID="control" icon="cross" accessibilityLabel="Action" onPress={onPress} disabled={disabled} /> },
];

test.each(controls)('$name disabled buttons report disabled and do not fire', ({ element }) => {
  const onPress = jest.fn();
  const r = render(element(onPress, true));
  expect(r.getByRole('button', { name: 'Action' })).toBeDisabled();
  fireEvent.press(r.getByTestId('control'));
  // Guard the callback as well as native disabled handling.
  r.UNSAFE_root.find((node: { props: { style?: unknown } }) => typeof node.props.style === 'function').props.onPress();
  expect(onPress).not.toHaveBeenCalled();
  r.rerender(element(onPress, false));
  fireEvent.press(r.getByRole('button', { name: 'Action' }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test.each(controls)('$name uses a Pressable with pressed opacity 0.85', ({ element }) => {
  const r = render(element(jest.fn(), false));
  const style = r.UNSAFE_root.find((node: { props: { style?: unknown } }) => typeof node.props.style === 'function').props.style;
  expect(StyleSheet.flatten(style({ pressed: true }))).toMatchObject({ opacity: 0.85 });
  expect(StyleSheet.flatten(style({ pressed: false })).opacity).toBe(1);
});

test('text links use label typography and 44dp targets; icon buttons are 44dp circles', () => {
  const r = render(<><TextLink label="End test" tone="danger" onPress={jest.fn()} /><IconButton icon="back" accessibilityLabel="Go back" onPress={jest.fn()} /></>);
  expect(r.getByRole('button', { name: 'End test' })).toHaveStyle({ minHeight: 44 });
  expect(r.getByText('End test')).toHaveStyle({ fontSize: tokens.font.label, color: tokens.color.primary });
  expect(r.getByRole('button', { name: 'Go back' })).toHaveStyle({ width: 44, height: 44, borderRadius: tokens.radius.pill, borderColor: tokens.color.line, borderWidth: 1 });
});

test('labelled buttons preserve explicit accessibility labels', () => {
  const r = render(<PrimaryButton label="Finish" accessibilityLabel="Finish this question" onPress={jest.fn()} />);
  expect(r.getByRole('button', { name: 'Finish this question' })).toBeTruthy();
});

test.each(['check', 'cross', 'back', 'chevronLeft', 'chevronRight'] as IconName[])('Icon %s is a decorative inline SVG', name => {
  const r = render(<Icon name={name} size={28} tone="warning" />);
  expect(r.UNSAFE_getByType(Svg).props).toMatchObject({ accessible: false, width: 28, height: 28 });
  expect(r.toJSON()).toBeTruthy();
});


test('TextLink labels can shrink and wrap without capping OS font scaling or the touch target', () => {
  const label = 'A long navigation label that must remain readable at large OS text sizes';
  const r = render(<TextLink label={label} onPress={jest.fn()} />);
  const text = r.getByText(label);
  expect(text).toHaveStyle({ flexShrink: 1 });
  expect(text.props.allowFontScaling).not.toBe(false);
  expect(text.props.maxFontSizeMultiplier).toBeUndefined();
  expect(text.props.numberOfLines ?? 0).toBe(0);
  expect(text.props.adjustsFontSizeToFit).not.toBe(true);
  expect(r.getByRole('button', { name: label })).toHaveStyle({ minHeight: 44 });
});
