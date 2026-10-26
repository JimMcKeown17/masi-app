import React from 'react';
import { render } from '@testing-library/react-native';
import { AssessmentThemeProvider } from '../../theme/AssessmentTheme';
import { tokens } from '../../theme/tokens';
import { PositionLine } from '../PositionLine';

test('PositionLine renders strong parts bold and joins them for screen readers', () => {
  const parts = [{ text: 'Word ' }, { text: '2', strong: true }, { text: ' · letter ' }, { text: '3 of 4', strong: true }];
  const r = render(<AssessmentThemeProvider fonts={{}}><PositionLine parts={parts} testID="position" /></AssessmentThemeProvider>);
  expect(r.getByLabelText('Word 2 · letter 3 of 4')).toBe(r.getByTestId('position'));
  expect(r.getByTestId('position')).toHaveStyle({ color: tokens.color.muted, fontSize: tokens.font.caption, textAlign: 'center' });
  expect(r.getByText('2')).toHaveStyle({ fontWeight: '600', color: tokens.color.ink });
  r.rerender(<AssessmentThemeProvider fonts={{ text: 'Figtree_500Medium', textSemi: 'Figtree_600SemiBold' }}>
    <PositionLine parts={parts} />
  </AssessmentThemeProvider>);
  expect(r.getByText('2')).toHaveStyle({ fontFamily: 'Figtree_600SemiBold', color: tokens.color.ink });
});

test('PositionLine centres inside 16dp gutters on a container sized to the text', () => {
  const parts = [{ text: 'All 10 marked', strong: true }, { text: ' · 10 correct. Tap any word to change it.' }];
  const r = render(<AssessmentThemeProvider fonts={{}}><PositionLine parts={parts} testID="position" /></AssessmentThemeProvider>);
  // Android draws a stretched, centred Text with nested spans from its narrower measured layout,
  // so the line hugged the left edge on device; the Text must not be stretched.
  let wrapper = r.getByTestId('position').parent;
  while (wrapper && typeof wrapper.type !== 'string') wrapper = wrapper.parent;
  expect(wrapper).toHaveStyle({ paddingHorizontal: tokens.space.lg, alignItems: 'center' });
});
