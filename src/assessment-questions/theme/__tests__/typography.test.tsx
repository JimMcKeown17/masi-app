import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { AssessmentThemeProvider, type AssessmentFonts } from '../../index';
import { useAssessmentFonts } from '../AssessmentTheme';
import { textStyle, type TextRole } from '../typography';
import { tokens } from '../tokens';

const FULL = { content: 'Andika_400Regular', text: 'Figtree_500Medium', textSemi: 'Figtree_600SemiBold', textBold: 'Figtree_700Bold' };
const ROLES: TextRole[] = ['content', 'body', 'caption', 'captionStrong', 'label', 'heading', 'timer'];

test.each(ROLES)('%s uses a family and never a weight when fonts are provided', (role) => {
  const s = textStyle(role, FULL);
  expect(typeof s.fontFamily).toBe('string');
  expect(s.fontWeight).toBeUndefined();
  expect(s.fontStyle).toBeUndefined();
});

test.each([
  ['content', FULL.content, undefined, undefined],
  ['body', FULL.text, 16, 24],
  ['caption', FULL.text, 13, 18],
  ['captionStrong', FULL.textSemi, 13, 18],
  ['label', FULL.textSemi, 17, 22],
  ['heading', FULL.textBold, 20, 26],
  ['timer', FULL.textBold, 20, undefined],
] as const)('%s maps to its family and geometry', (role, family, size, lineHeight) => {
  const s = textStyle(role, FULL);
  expect(s.fontFamily).toBe(family);
  expect(s.fontSize).toBe(size);
  expect(s.lineHeight).toBe(lineHeight);
});

test('timer uses tabular figures', () => {
  expect(textStyle('timer', FULL).fontVariant).toEqual(['tabular-nums']);
});

test('without fonts every role falls back to the system face and its role weight', () => {
  for (const role of ROLES) {
    const s = textStyle(role, {});
    expect(s.fontFamily).toBeUndefined();
    expect(s.fontWeight).toBe({ content: '400', body: '400', caption: '400', captionStrong: '600', label: '600', heading: '700', timer: '700' }[role]);
    expect(s.fontStyle).toBeUndefined();
  }
});

test('partial fonts fall back only for roles whose family is absent', () => {
  expect(textStyle('content', { content: FULL.content })).toEqual({ fontFamily: FULL.content });
  expect(textStyle('heading', { content: FULL.content })).toEqual(textStyle('heading', {}));
});

test('useAssessmentFonts is empty without a provider and returns the provider value inside one', () => {
  expect(renderHook(() => useAssessmentFonts()).result.current).toEqual({});
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AssessmentThemeProvider fonts={FULL}>{children}</AssessmentThemeProvider>
  );
  const fonts: AssessmentFonts = renderHook(() => useAssessmentFonts(), { wrapper }).result.current;
  expect(fonts).toBe(FULL);
});

test('capture geometry tokens are pinned', () => {
  expect(tokens.radius.tile).toBe(10);
  expect(tokens.font).toEqual(expect.objectContaining({ tileLetter: 30, tileWord: 21, promptCard: 28, label: 17, story: 18 }));
  expect(tokens.color).not.toHaveProperty('primaryPressed');
});
