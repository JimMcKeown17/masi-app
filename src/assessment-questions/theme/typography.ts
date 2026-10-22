import type { TextStyle } from 'react-native';
import type { AssessmentFonts } from './AssessmentTheme';
import { tokens } from './tokens';

export type TextRole = 'content' | 'body' | 'caption' | 'captionStrong' | 'label' | 'heading' | 'timer';

const roles: Record<TextRole, {
  family: keyof AssessmentFonts;
  weight: TextStyle['fontWeight'];
  style: TextStyle;
}> = {
  content: { family: 'content', weight: '400', style: {} },
  body: { family: 'text', weight: '400', style: { fontSize: tokens.font.body, lineHeight: 24 } },
  caption: { family: 'text', weight: '400', style: { fontSize: tokens.font.caption, lineHeight: 18 } },
  captionStrong: { family: 'textSemi', weight: '600', style: { fontSize: tokens.font.caption, lineHeight: 18 } },
  label: { family: 'textSemi', weight: '600', style: { fontSize: tokens.font.label, lineHeight: 22 } },
  heading: { family: 'textBold', weight: '700', style: { fontSize: tokens.font.heading, lineHeight: 26 } },
  timer: { family: 'textBold', weight: '700', style: { fontSize: tokens.font.heading, fontVariant: ['tabular-nums'] } },
};

export function textStyle(role: TextRole, fonts: AssessmentFonts): TextStyle {
  const { family, weight, style } = roles[role];
  const fontFamily = fonts[family];
  // Android must choose the weight through the registered family when one is supplied.
  return { ...style, ...(fontFamily ? { fontFamily } : { fontWeight: weight }) };
}
