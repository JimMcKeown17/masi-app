import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';
import LetterToggleGrid, { letterTileSize } from '../src/components/sessions/LetterToggleGrid';
import LetterToggleTile from '../src/components/sessions/LetterToggleTile';
import { LETTER_ORDER } from '../src/constants/literacyConstants';
import { MotionProvider } from '../src/context/MotionContext';
import { colors } from '../src/constants/colors';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
const flat = (node) => StyleSheet.flatten(node.props.style);
const tileFor = (letter) => ({ tone: 'rest', accessibilityLabel: `${letter.toUpperCase()}, not selected`, accessibilityState: { selected: false } });

test.each([[342, 50], [312, 45], [363, 53], [304, 44]])('tile width at %s is %s', (width, size) => {
  expect(letterTileSize(width)).toBe(size);
});

test('the grid stays six columns when its tiles reach their maximum size', () => {
  const screen = render(<LetterToggleGrid letters={LETTER_ORDER} tileFor={tileFor} onPressLetter={jest.fn()} />);
  const gridStyle = flat(screen.getByTestId('letter-toggle-grid'));
  expect(letterTileSize(700)).toBe(56);
  expect(gridStyle.maxWidth).toBe(6 * 56 + 5 * 8);
});

test('grid keeps the 26-letter teaching order, lowercase and capped text', () => {
  const screen = render(<LetterToggleGrid letters={LETTER_ORDER} tileFor={tileFor} onPressLetter={jest.fn()} />);
  const tiles = screen.getAllByRole('button');
  expect(tiles).toHaveLength(26);
  expect(tiles.slice(0, 6).map((tile) => within(tile).getByText(/^[a-z]$/).props.children)).toEqual(['a', 'e', 'i', 'o', 'u', 'm']);
  tiles.forEach((tile, index) => {
    expect(within(tile).getByText(LETTER_ORDER[index].toLowerCase()).props.maxFontSizeMultiplier).toBe(1.2);
  });
});

test('measured grid width sets all tile sizes and presses return the original letter', () => {
  const onPressLetter = jest.fn();
  const screen = render(<LetterToggleGrid letters={LETTER_ORDER} tileFor={tileFor} onPressLetter={onPressLetter} />);
  fireEvent(screen.getByTestId('letter-toggle-grid'), 'layout', { nativeEvent: { layout: { width: 312, height: 0, x: 0, y: 0 } } });
  screen.getAllByRole('button').forEach((tile) => expect(flat(tile)).toMatchObject({ width: 45, height: 45 }));
  fireEvent.press(screen.getByLabelText('M, not selected'));
  expect(onPressLetter).toHaveBeenCalledWith('m');
});

test('disabled tile ignores presses', () => {
  const onPress = jest.fn();
  const screen = render(<LetterToggleTile letter="M" tone="locked" size={50} disabled accessibilityLabel="m, locked" onPress={onPress} />);
  fireEvent.press(screen.getByRole('button'));
  expect(onPress).not.toHaveBeenCalled();
  expect(screen.getByRole('button').props.accessibilityState.disabled).toBe(true);
});

test.each([true, false])('press scale respects reduceMotion=%s', (reduceMotion) => {
  const timing = jest.spyOn(Animated, 'timing');
  const screen = render(<MotionProvider value={{ motionLevel: reduceMotion ? 'still' : 'full', reduceMotion, tier: reduceMotion ? 'static' : 'high' }}>
    <LetterToggleTile letter="m" tone="rest" size={50} onPress={jest.fn()} />
  </MotionProvider>);
  fireEvent(screen.getByRole('button'), 'pressIn');
  if (reduceMotion) expect(timing).not.toHaveBeenCalled();
  else expect(timing).toHaveBeenLastCalledWith(expect.anything(), { toValue: 0.96, duration: 90, useNativeDriver: true });
  fireEvent(screen.getByRole('button'), 'pressOut');
  if (reduceMotion) expect(timing).not.toHaveBeenCalled();
  else expect(timing).toHaveBeenLastCalledWith(expect.anything(), { toValue: 1, duration: 140, useNativeDriver: true });
  screen.unmount();
  timing.mockRestore();
});

test.each(['rest', 'selected'])('%s tile has the prescribed pressed fill', (tone) => {
  const screen = render(<LetterToggleTile letter="m" tone={tone} size={50} onPress={jest.fn()} />);
  const pressable = screen.UNSAFE_root.find((node) => typeof node.props.style === 'function');
  expect(StyleSheet.flatten(pressable.props.style({ pressed: true })).backgroundColor).toBe(colors.border);
});
