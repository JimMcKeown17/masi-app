import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { AssessmentThemeProvider } from '../../theme/AssessmentTheme';
import { textStyle } from '../../theme/typography';
import { tokens } from '../../theme/tokens';
import { ContentText, UiText, type Tone } from '../Text';

const fonts = { content: 'Andika_400Regular', text: 'Figtree_500Medium', textSemi: 'Figtree_600SemiBold', textBold: 'Figtree_700Bold' };

test.each(['tileLetter', 'tileWord', 'promptCard', 'markingWord', 'story'] as const)(
  'ContentText %s uses the content family, never a weight, and caps OS scaling at 1.2', size => {
    const r = render(<AssessmentThemeProvider fonts={fonts}><ContentText size={size} maxFontSizeMultiplier={3}>ibhulukhwe</ContentText></AssessmentThemeProvider>);
    const text = r.getByText('ibhulukhwe');
    const style = StyleSheet.flatten(text.props.style);
    expect(style).toMatchObject({ fontFamily: fonts.content, fontSize: tokens.font[size], color: tokens.color.ink });
    expect(style.fontWeight).toBeUndefined();
    expect(style.fontStyle).toBeUndefined();
    expect(text.props.maxFontSizeMultiplier).toBe(1.2);
    expect(text.props.size).toBeUndefined();
    expect(text.props.fit).toBeUndefined();
  },
);

test('ContentText fit shrinks to one line', () => {
  const r = render(<ContentText size="tileWord" fit numberOfLines={3} minimumFontScale={0.9}>ibhulukhwe</ContentText>);
  expect(r.getByText('ibhulukhwe').props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.6, maxFontSizeMultiplier: 1.2 });
});

test.each(['body', 'caption', 'label', 'heading', 'timer'] as const)(
  'UiText variant %s type-checks and leaves the accessibility role alone', variant => {
    const r = render(<AssessmentThemeProvider fonts={fonts}><UiText variant={variant} accessibilityRole="header">x</UiText></AssessmentThemeProvider>);
    const text = r.getByRole('header', { name: 'x' });
    expect(text).toHaveStyle(textStyle(variant, fonts));
    expect(text.props.role).toBeUndefined();
    expect(text.props.variant).toBeUndefined();
  },
);

test.each([
  ['ink', tokens.color.ink], ['muted', tokens.color.muted], ['onInk', tokens.color.onPrimary],
  ['danger', tokens.color.primary], ['marked', tokens.color.marked], ['warning', tokens.color.warning], ['notReached', tokens.color.notReached],
] satisfies [Tone, string][])('both text primitives map %s through the shared tone palette', (tone, color) => {
  const r = render(<><UiText tone={tone} align="center">control</UiText><ContentText size="story" tone={tone}>story</ContentText></>);
  expect(r.getByText('control')).toHaveStyle({ color, textAlign: 'center' });
  expect(r.getByText('story')).toHaveStyle({ color });
});

test('UiText defaults to body and ink; Text accessibility role passes through', () => {
  const r = render(<UiText role="heading">default</UiText>);
  expect(r.getByRole('heading')).toHaveStyle({ ...textStyle('body', {}), color: tokens.color.ink });
});
