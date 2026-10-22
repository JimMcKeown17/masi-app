import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { tokens } from '../../theme/tokens';
import { AssessmentThemeProvider } from '../../theme/AssessmentTheme';
import { PageIndicator } from '../PageIndicator';
import { LETTER_PAGE_LAYOUT, paginate, rowsFromLengths } from '../paginate';

const pages = () => paginate(rowsFromLengths([10,10,10,10,10,10]), LETTER_PAGE_LAYOUT);

test('hidden for zero or a single page', () => {
  const r = render(<PageIndicator pages={[]} current={0} />);
  expect(r.toJSON()).toBeNull();
  r.rerender(<PageIndicator pages={paginate([[0]], LETTER_PAGE_LAYOUT)} current={0} />);
  expect(r.toJSON()).toBeNull();
});

test('shows the full accessible label, N decorative 8dp dots and disabled Previous on page 1', () => {
  const previous = jest.fn();
  const next = jest.fn();
  const r = render(<PageIndicator pages={pages()} current={0} onPrevious={previous} onNext={next} />);
  expect(r.getByTestId('page-indicator')).toBeTruthy();
  const label = r.getByLabelText('Card rows 1–2 · page 1 of 3');
  expect(label).toBe(r.getByTestId('page-label'));
  expect(label).toHaveStyle({ color: tokens.color.muted, fontSize: tokens.font.caption });
  expect(r.getByText('Card rows 1–2')).toHaveStyle({ color: tokens.color.ink });
  const dots = r.getAllByTestId('page-dot');
  expect(dots).toHaveLength(3);
  dots.forEach((dot, index) => {
    expect(dot.props.accessible).toBe(false);
    expect(dot).toHaveStyle({ width: 8, height: 8, borderRadius: tokens.radius.pill, backgroundColor: index === 0 ? tokens.color.ink : tokens.color.line });
  });
  expect(r.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  expect(r.getByRole('button', { name: 'Next page' })).toBeEnabled();
  fireEvent.press(r.getByRole('button', { name: 'Previous page' }));
  expect(previous).not.toHaveBeenCalled();
  fireEvent.press(r.getByRole('button', { name: 'Next page' }));
  expect(next).toHaveBeenCalledTimes(1);
});

test('current page updates the label and dots; controls fire once and disable Next at the end', () => {
  const previous = jest.fn();
  const next = jest.fn();
  const p = pages();
  const r = render(<PageIndicator pages={p} current={1} onPrevious={previous} onNext={next} />);
  expect(r.getByLabelText('Card rows 3–4 · page 2 of 3')).toBeTruthy();
  expect(r.getAllByTestId('page-dot')[1]).toHaveStyle({ backgroundColor: tokens.color.ink });
  fireEvent.press(r.getByRole('button', { name: 'Previous page' }));
  fireEvent.press(r.getByRole('button', { name: 'Next page' }));
  expect(previous).toHaveBeenCalledTimes(1);
  expect(next).toHaveBeenCalledTimes(1);
  r.rerender(<PageIndicator pages={p} current={2} onPrevious={previous} onNext={next} />);
  expect(r.getByLabelText('Card rows 5–6 · page 3 of 3')).toBeTruthy();
  expect(r.getAllByTestId('page-dot').map(dot => dot.props.style.backgroundColor)).toEqual([tokens.color.line, tokens.color.line, tokens.color.ink]);
  expect(r.getByRole('button', { name: 'Next page' })).toBeDisabled();
  fireEvent.press(r.getByRole('button', { name: 'Next page' }));
  expect(next).toHaveBeenCalledTimes(1);
});

test('each navigation control is only rendered when its callback is supplied', () => {
  const p = pages();
  const r = render(<PageIndicator pages={p} current={0} />);
  expect(r.queryAllByRole('button')).toHaveLength(0);
  r.rerender(<PageIndicator pages={p} current={0} onNext={jest.fn()} />);
  expect(r.queryByLabelText('Previous page')).toBeNull();
  expect(r.getByRole('button', { name: 'Next page' })).toBeTruthy();
  r.rerender(<PageIndicator pages={p} current={1} onPrevious={jest.fn()} />);
  expect(r.queryByLabelText('Next page')).toBeNull();
  expect(r.getByRole('button', { name: 'Previous page' })).toBeTruthy();
});

test('single-card-row pages use the singular accessible label', () => {
  const p = paginate(rowsFromLengths([12,12,12]), LETTER_PAGE_LAYOUT);
  const r = render(<PageIndicator pages={p} current={2} />);
  expect(r.getByLabelText('Card row 3 · page 3 of 3')).toBeTruthy();
});

test.each([
  [-1, 0], [3, 2], [1.9, 1], [-0.5, 0], [Infinity, 0], [-Infinity, 0], [NaN, 0],
])('normalises current %s to page index %s for label, dots and controls', (current, expected) => {
  const p = pages();
  const r = render(<PageIndicator pages={p} current={current} onPrevious={jest.fn()} onNext={jest.fn()} />);
  expect(r.getByLabelText(`Card rows ${expected * 2 + 1}–${expected * 2 + 2} · page ${expected + 1} of 3`)).toBeTruthy();
  expect(r.getAllByTestId('page-dot').map(dot => dot.props.style.backgroundColor)).toEqual(
    p.map((_, index) => index === expected ? tokens.color.ink : tokens.color.line),
  );
  expect(r.getByRole('button', { name: 'Previous page' }).props.accessibilityState.disabled).toBe(expected === 0);
  expect(r.getByRole('button', { name: 'Next page' }).props.accessibilityState.disabled).toBe(expected === p.length - 1);
});

test('shrinking from three pages to two clamps a stale current index to the last page', () => {
  const p = pages();
  const r = render(<PageIndicator pages={p} current={2} onPrevious={jest.fn()} onNext={jest.fn()} />);
  r.rerender(<PageIndicator pages={p.slice(0, 2)} current={2} onPrevious={jest.fn()} onNext={jest.fn()} />);
  expect(r.getByLabelText('Card rows 3–4 · page 2 of 2')).toBeTruthy();
  expect(r.getAllByTestId('page-dot').map(dot => dot.props.style.backgroundColor)).toEqual([tokens.color.line, tokens.color.ink]);
  expect(r.getByRole('button', { name: 'Previous page' })).toBeEnabled();
  expect(r.getByRole('button', { name: 'Next page' })).toBeDisabled();
});

test('card rows use semibold ink while the page suffix stays regular muted, with system fallback', () => {
  const p = pages();
  const r = render(<AssessmentThemeProvider fonts={{}}><PageIndicator pages={p} current={0} /></AssessmentThemeProvider>);
  expect(r.getByText('Card rows 1–2')).toHaveStyle({ fontWeight: '600', fontSize: tokens.font.caption, lineHeight: 18, color: tokens.color.ink });
  expect(r.getByTestId('page-label')).toHaveStyle({ fontWeight: '400', color: tokens.color.muted });
  r.rerender(
    <AssessmentThemeProvider fonts={{ text: 'Figtree_500Medium', textSemi: 'Figtree_600SemiBold' }}>
      <PageIndicator pages={p} current={0} />
    </AssessmentThemeProvider>,
  );
  expect(r.getByText('Card rows 1–2')).toHaveStyle({ fontFamily: 'Figtree_600SemiBold', color: tokens.color.ink });
  expect(r.getByTestId('page-label')).toHaveStyle({ fontFamily: 'Figtree_500Medium', color: tokens.color.muted });
});
