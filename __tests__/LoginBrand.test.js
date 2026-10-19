import React from 'react';
import { Image, StyleSheet } from 'react-native';
import { render, within } from '@testing-library/react-native';
import Svg, { Circle, G } from 'react-native-svg';
import BrandLockup from '../src/components/auth/BrandLockup';
import LoginHeroArt from '../src/components/auth/LoginHeroArt';
import { colors, tints } from '../src/constants/colors';
import { logoType } from '../src/constants/typography';

const flat = (node) => StyleSheet.flatten(node.props.style);

test('the lockup is one accessible brand image with the supplied mark and logo type', () => {
  const ui = render(<BrandLockup style={{ marginTop: 12 }} />);
  expect(ui.getAllByRole('image')).toHaveLength(1);
  expect(ui.getByRole('image', { name: 'Masinyusane' })).toBe(ui.getByTestId('brand-lockup'));
  expect(flat(ui.getByTestId('brand-lockup'))).toMatchObject({
    flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 12,
  });
  expect(flat(ui.getByText('MASI'))).toMatchObject({ ...logoType.wordmark, color: colors.onDark });
  expect(flat(ui.getByText('NYUSANE'))).toMatchObject({ ...logoType.wordmarkSub, color: colors.onDark, marginTop: 2 });
  expect(ui.getByText('MASI').props.maxFontSizeMultiplier).toBe(1);
  expect(ui.getByText('NYUSANE').props.maxFontSizeMultiplier).toBe(1);
  const mark = ui.UNSAFE_getByType(Image);
  expect(mark.props.source).toBe(require('../assets/brand/masi-mark-white.png'));
  expect(mark.props.accessible).toBe(false);
  expect(flat(mark)).toMatchObject({ width: 48, height: 41 });
});

test('hero art is decorative and draws the charcoal arc and keyline in one transformed group', () => {
  const ui = render(<LoginHeroArt windowWidth={360} windowHeight={640} scale={0.74} offsetX={71.4} offsetY={-11.388} />);
  const art = ui.getByTestId('login-hero-art', { includeHiddenElements: true });
  expect(art.props).toMatchObject({
    pointerEvents: 'none', accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  });
  expect(flat(art)).toMatchObject(StyleSheet.absoluteFillObject);
  expect(within(art).queryAllByRole('image')).toEqual([]);
  const svg = ui.UNSAFE_getByType(Svg);
  expect(svg.props).toMatchObject({ width: 360, height: 640 });
  // Svg renders its own outer G; inspect the artwork group supplied as its child.
  expect(svg.props.children.type).toBe(G);
  expect(svg.props.children.props.transform).toBe('translate(71.4 -11.388) scale(0.74)');
  const circles = ui.UNSAFE_getAllByType(Circle);
  expect(circles).toHaveLength(2);
  expect(circles[0].props).toMatchObject({ cx: 486, cy: 412, r: 400, stroke: colors.heroDark, strokeWidth: 54, fill: 'none' });
  expect(circles[1].props).toMatchObject({ cx: 486, cy: 412, r: 436, stroke: tints.onRedKeyline, strokeWidth: 2, fill: 'none' });
});

test.each([
  [390, 844, 1, 0, 0, { left: 74, top: 110, width: 296, height: 430 }],
  [360, 640, 0.74, 71.4, -11.388, { left: 126.16, top: 70.012, width: 219.04, height: 318.2 }],
])('learner follows the art transform at %ix%i', (windowWidth, windowHeight, scale, offsetX, offsetY, expected) => {
  const ui = render(<LoginHeroArt {...{ windowWidth, windowHeight, scale, offsetX, offsetY }} />);
  const learner = ui.getByTestId('login-hero-learner', { includeHiddenElements: true });
  expect(learner.props).toMatchObject({ accessible: false, resizeMode: 'contain' });
  expect(learner.props.source).toBe(require('../assets/login/learner-artwork.webp'));
  expect(learner.props.accessibilityLabel).toBeUndefined();
  expect(flat(learner).position).toBe('absolute');
  for (const [key, value] of Object.entries(expected)) {
    expect(flat(learner)[key]).toBeCloseTo(value, 3);
  }
});
