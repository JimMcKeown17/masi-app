import React from 'react';
import { StyleSheet, View } from 'react-native';
import { render } from '@testing-library/react-native';
import Svg, { Path } from 'react-native-svg';
import CapturedPill from '../src/components/sessions/CapturedPill';
import { colors } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';

test('the captured pill wraps its copy and draws the token-coloured check disc', () => {
  const screen = render(<CapturedPill text="Saved for 2 children · Tue 13 Oct" />);
  const text = screen.getByText('Saved for 2 children · Tue 13 Oct');
  expect(text.props.numberOfLines).toBeUndefined();
  expect(StyleSheet.flatten(text.props.style)).toMatchObject({
    ...typeRoles.textPill, color: colors.text, textAlign: 'center', flexShrink: 1,
  });
  expect(StyleSheet.flatten(screen.toJSON().props.style)).toMatchObject({
    backgroundColor: colors.surface, minHeight: 34, borderRadius: 17,
    paddingLeft: 7, paddingRight: 16, gap: 8,
    shadowColor: colors.red900, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18, shadowRadius: 8, elevation: 3,
  });
  const disc = screen.UNSAFE_getAllByType(View).find(node =>
    StyleSheet.flatten(node.props.style)?.backgroundColor === colors.success);
  expect(StyleSheet.flatten(disc.props.style)).toMatchObject({ width: 22, height: 22, borderRadius: 11 });
  expect(screen.UNSAFE_getByType(Svg).props).toMatchObject({ width: 14, height: 14, viewBox: '0 0 24 24' });
  expect(screen.UNSAFE_getByType(Path).props).toMatchObject({
    d: 'm5 12.5 4.5 4.5L19 7.5', stroke: colors.surface,
    strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none',
  });
});
