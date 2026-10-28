import React from 'react';
import { Text, type TextProps } from 'react-native';
import { useAssessmentFonts } from '../theme/AssessmentTheme';
import { textStyle, type TextRole } from '../theme/typography';
import { tokens } from '../theme/tokens';

export type Tone = 'ink' | 'muted' | 'onInk' | 'danger' | 'marked' | 'warning' | 'notReached';

export function toneColor(tone: Tone): string {
  return {
    ink: tokens.color.ink,
    muted: tokens.color.muted,
    onInk: tokens.color.onPrimary,
    danger: tokens.color.primary,
    marked: tokens.color.marked,
    warning: tokens.color.warning,
    notReached: tokens.color.notReached,
  }[tone];
}

export const UiText = React.forwardRef<Text, TextProps & {
  variant?: Exclude<TextRole, 'content'>;
  tone?: Tone;
  align?: 'left' | 'center';
}>(function UiText({ variant = 'body', tone = 'ink', align = 'left', style, ...props }, ref) {
  const fonts = useAssessmentFonts();
  return <Text ref={ref} {...props} style={[{ ...textStyle(variant, fonts), color: toneColor(tone), textAlign: align }, style]} />;
});

export function ContentText({ size, tone = 'ink', fit = false, style, ...props }: TextProps & {
  size: 'tileLetter' | 'tileWord' | 'promptCard' | 'markingWord' | 'story';
  tone?: Tone;
  fit?: boolean;
}) {
  const fonts = useAssessmentFonts();
  return (
    <Text
      {...props}
      {...(fit ? { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.6 } : {})}
      maxFontSizeMultiplier={1.2}
      style={[{ ...textStyle('content', fonts), fontSize: tokens.font[size], color: toneColor(tone) }, style]}
    />
  );
}
