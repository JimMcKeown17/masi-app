import React from 'react';
import { Animated } from 'react-native';
import { act, render } from '@testing-library/react-native';
import Svg, { Circle } from 'react-native-svg';
import SessionCompleteHero from '../src/components/sessions/SessionCompleteHero';
import { placeConfetti } from '../src/components/sessions/confettiPieces';
import { colors } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';

const props = {
  width: 390, insetTop: 47, pill: { text: 'Saved for 2 children' },
  headline: 'Session\ncaptured.', showHalo: true,
};
const hidden = { includeHiddenElements: true };

test('390dp hero uses the board halo and safe-area geometry', () => {
  const screen = render(<SessionCompleteHero {...props} />);
  expect(screen.getByTestId('session-complete-hero')).toHaveStyle({
    backgroundColor: colors.red600, overflow: 'hidden', paddingTop: 58,
    paddingHorizontal: 24, paddingBottom: 220,
  });
  expect(screen.UNSAFE_getByType(Circle).props).toEqual(expect.objectContaining({
    cx: 195, cy: 231, r: 214, strokeWidth: 32, stroke: colors.red500, fill: 'none',
  }));
  const halo = screen.UNSAFE_getAllByType(Svg).find((svg) => svg.props.testID === 'session-complete-halo');
  expect(halo.props).toEqual(expect.objectContaining({
    height: 205, width: 390, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants',
  }));
});

test('no-card hero has no halo and ends 32dp below the headline', () => {
  const screen = render(<SessionCompleteHero {...props} showHalo={false} />);
  expect(screen.queryByTestId('session-complete-halo', hidden)).toBeNull();
  expect(screen.getByTestId('session-complete-hero')).toHaveStyle({ paddingBottom: 32 });
});

test('the headline is a wrapping header and the captured pill renders', () => {
  const screen = render(<SessionCompleteHero {...props} />);
  const headline = screen.getByRole('header', { name: 'Session captured.' });
  expect(headline).toHaveTextContent('Session captured.');
  expect(screen.getByText('Session\ncaptured.', { normalizer: (text) => text })).toBe(headline);
  expect(headline).toHaveStyle({ ...typeRoles.display3XL, color: colors.onDark, marginTop: 16, textAlign: 'center' });
  expect(headline.props.maxFontSizeMultiplier).toBe(1.2);
  expect(headline.props.numberOfLines).toBeUndefined();
  expect(screen.getByText('Saved for 2 children')).toBeTruthy();
  expect(screen.queryByTestId('confetti-layer', hidden)).toBeNull();
});

test('confetti is a silent, non-interactive 22-piece layer at the card top with shared travel and fade', () => {
  const confetti = { layer: new Animated.Value(0), travel: new Animated.Value(0), fade: new Animated.Value(0) };
  const screen = render(<SessionCompleteHero {...props} confetti={confetti} />);
  const layer = screen.getByTestId('confetti-layer', hidden);
  expect(layer.props).toEqual(expect.objectContaining({
    pointerEvents: 'none', accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants',
  }));
  expect(layer).toHaveStyle({ position: 'absolute', bottom: 108, height: 0, left: 0, overflow: 'visible', opacity: 0 });
  expect(layer.children).toHaveLength(22);
  placeConfetti(props.width).forEach((p, index) => {
    expect(layer.children[index].findByType('View')).toHaveStyle({
      position: 'absolute', left: p.x - p.w / 2, top: p.y - p.h / 2,
      width: p.w, height: p.h, borderRadius: p.radius, backgroundColor: p.color, opacity: 1,
      transform: [{ translateX: -36 * p.ux }, { translateY: -36 * p.uy }, { rotate: p.rot + 'deg' }],
    });
  });
  act(() => { confetti.layer.setValue(1); confetti.travel.setValue(1); confetti.fade.setValue(1); });
  expect(layer).toHaveStyle({ opacity: 1 });
  layer.children.forEach((piece) => {
    expect(piece.findByType('View')).toHaveStyle({ opacity: 0 });
  });
});

test('loading headline retains its two lines but is invisible and hidden on both platforms', () => {
  const screen = render(<SessionCompleteHero {...props} headlineHidden headlineStyle={{ opacity: 1 }} />);
  expect(screen.queryByRole('header')).toBeNull();
  const headline = screen.getByText('Session\ncaptured.', { ...hidden, normalizer: (text) => text });
  expect(headline).toHaveStyle({ opacity: 0 });
  expect(headline.props.accessibilityElementsHidden).toBe(true);
  expect(headline.props.importantForAccessibility).toBe('no-hide-descendants');
});

test('caller animation styles reach the pill and headline', () => {
  const screen = render(<SessionCompleteHero {...props}
    pillStyle={{ opacity: 0.5, transform: [{ translateY: -4 }] }}
    headlineStyle={{ opacity: 0.25, transform: [{ translateY: 6 }] }} />);
  expect(screen.getByTestId('session-complete-pill')).toHaveStyle({ opacity: 0.5, transform: [{ translateY: -4 }] });
  expect(screen.getByRole('header')).toHaveStyle({ opacity: 0.25, transform: [{ translateY: 6 }] });
});
