global.__MASI_NO_DEFAULT_HANDLE__ = true;
import React from 'react';
import { processColor, StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { Card, MD3LightTheme, PaperProvider, Snackbar } from 'react-native-paper';
import { DefaultTheme } from '@react-navigation/native';
import { paperTheme } from '../src/theme/paperTheme';
import { navigationTheme } from '../src/theme/navigationTheme';
import { colors, tints } from '../src/constants/colors';
import { fontFamilies } from '../src/constants/typography';

const TOKEN_VALUES = new Set([...Object.values(colors), ...Object.values(tints), 'transparent']);
const FACES = new Set(Object.values(fontFamilies));

test('every MD3 colour role is overridden with a token', () => {
  const { elevation: mdElevation, ...mdFlat } = MD3LightTheme.colors;
  const { elevation, ...flat } = paperTheme.colors;
  Object.keys(mdFlat).forEach((key) => {
    // MD3's on-colour roles are already pure white (#FFFFFF = colors.onDark), so "changed"
    // is required only where the MD3 default is not itself a token value.
    const changed = flat[key] !== mdFlat[key] || TOKEN_VALUES.has(mdFlat[key]);
    expect({ key, set: key in flat, changed, token: TOKEN_VALUES.has(flat[key]) })
      .toEqual({ key, set: true, changed: true, token: true });
  });
  expect(elevation.level0).toBe('transparent');
  ['level1', 'level2', 'level3', 'level4', 'level5'].forEach((level) => {
    expect(elevation[level]).toBe(colors.surface);
    expect(elevation[level]).not.toBe(mdElevation[level]);
  });
  expect(flat.success).toBe(colors.success);
});
test('the roles that leaked purple or amber map to the board', () => {
  expect(paperTheme.colors).toEqual(expect.objectContaining({
    primary: colors.primary, onPrimary: colors.onDark,
    primaryContainer: colors.red50, onPrimaryContainer: colors.red700,
    secondary: colors.text, secondaryContainer: colors.text, onSecondaryContainer: colors.onDark,
    tertiary: colors.warningText, onSurfaceVariant: colors.textSecondary,
    outline: tints.control, inverseSurface: colors.text, inverseOnSurface: colors.onDark, inversePrimary: colors.onDark,
    shadow: colors.shadowWarm, scrim: colors.heroDark, backdrop: tints.scrim,
  }));
});
test('every font variant, default included, has a Masi face, fontWeight undefined and board tracking', () => {
  // configureFonts merges each variant over MD3's typescale, so an omitted key keeps
  // MD3's weight ('400') or tracking (e.g. 0.25): both must be set explicitly.
  Object.entries(paperTheme.fonts).forEach(([variant, font]) => {
    expect({ variant, face: FACES.has(font.fontFamily), weight: font.fontWeight, hasWeightKey: 'fontWeight' in font })
      .toEqual({ variant, face: true, weight: undefined, hasWeightKey: true });
  });
  expect(paperTheme.fonts.bodyMedium.letterSpacing).toBe(0);
  expect(paperTheme.fonts.default.letterSpacing).toBe(0);
  expect(paperTheme.fonts.headlineMedium.letterSpacing).toBe(-0.56);
});
test('roundness is 6', () => { expect(paperTheme.roundness).toBe(6); });
test('the navigation theme replaces every DefaultTheme colour and uses Figtree faces', () => {
  Object.keys(DefaultTheme.colors).forEach((key) => {
    expect(navigationTheme.colors[key]).not.toBe(DefaultTheme.colors[key]);
  });
  expect(navigationTheme.colors).toEqual({
    primary: colors.primary, background: colors.background, card: colors.background,
    text: colors.text, border: colors.border, notification: colors.primary,
  });
  expect(navigationTheme.fonts).toEqual({
    regular: { fontFamily: fontFamilies.textMedium, fontWeight: 'normal' },
    medium: { fontFamily: fontFamilies.textSemi, fontWeight: 'normal' },
    bold: { fontFamily: fontFamilies.textBold, fontWeight: 'normal' },
    heavy: { fontFamily: fontFamilies.textHeavy, fontWeight: 'normal' },
  });
});

test('a Paper Card renders on the white surface', () => {
  const { getByTestId } = render(<PaperProvider theme={paperTheme}><Card testID="c" /></PaperProvider>);
  // Paper puts the testID on the content; its enclosing Surface owns the fill.
  // Animated elevation serializes that colour as rgba, so compare native colours.
  const backgroundColor = StyleSheet.flatten(getByTestId('c-container').props.style).backgroundColor;
  expect(processColor(backgroundColor)).toBe(processColor(colors.surface));
});

test('a visible Paper Snackbar renders on ink', () => {
  const { getByTestId } = render(
    <PaperProvider theme={paperTheme}>
      <Snackbar testID="s" visible onDismiss={() => {}}>Saved</Snackbar>
    </PaperProvider>
  );
  expect(StyleSheet.flatten(getByTestId('s').props.style).backgroundColor).toBe(colors.text);
});
