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
