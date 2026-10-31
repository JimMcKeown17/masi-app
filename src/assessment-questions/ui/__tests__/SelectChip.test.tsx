import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { tokens } from '../../theme/tokens';
import { SelectChip } from '../SelectChip';

test('selected chip is ink and reports selected state', () => {
  const onPress = jest.fn();
  const r = render(<SelectChip label="Fingers" selected onPress={onPress} testID="chip" />);
  expect(r.getByRole('button', { name: 'Fingers' })).toBe(r.getByTestId('chip'));
  expect(r.getByTestId('chip').props.accessibilityState.selected).toBe(true);
  expect(r.getByTestId('chip')).toHaveStyle({ backgroundColor: tokens.color.ink, borderColor: tokens.color.ink,
    borderWidth: 1, borderRadius: tokens.radius.tile, minHeight: 48 });
  expect(r.getByText('Fingers')).toHaveStyle({ color: tokens.color.onPrimary, fontSize: tokens.font.label });
  fireEvent.press(r.getByTestId('chip'));
  expect(onPress).toHaveBeenCalledTimes(1);
  const style = r.UNSAFE_root.find((node: { props: { style?: unknown } }) => typeof node.props.style === 'function').props.style;
  expect(StyleSheet.flatten(style({ pressed: true })).opacity).toBe(0.85);
  r.rerender(<SelectChip label="Fingers" selected={false} accessibilityLabel="Observed fingers" onPress={onPress} testID="chip" />);
  expect(r.getByRole('button', { name: 'Observed fingers' }).props.accessibilityState.selected).toBe(false);
  expect(r.getByTestId('chip')).toHaveStyle({ backgroundColor: tokens.color.surface, borderColor: tokens.color.line });
  expect(r.getByText('Fingers')).toHaveStyle({ color: tokens.color.ink });
  expect(r.getByText('Fingers').props.numberOfLines).toBeUndefined();
});
