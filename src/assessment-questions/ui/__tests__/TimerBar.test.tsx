import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { AssessmentThemeProvider } from '../../theme/AssessmentTheme';
import { tokens } from '../../theme/tokens';
import { TimerBar } from '../TimerBar';

test('owns the full-width row gutter, rounded track and right-aligned seconds label', () => {
  const screen = render(<TimerBar remainingMs={30000} durationMs={60000} />);
  expect(screen.getByLabelText('Time left, 30 seconds')).toHaveStyle({
    flexDirection: 'row', alignItems: 'center', width: '100%', flexShrink: 0,
    paddingHorizontal: tokens.space.lg, paddingVertical: tokens.space.sm,
  });
  expect(screen.getByTestId('countdown-track')).toHaveStyle({
    flex: 1, height: 12, borderRadius: 6, backgroundColor: tokens.color.line, overflow: 'hidden',
  });
  expect(screen.getByTestId('countdown-fill')).toHaveStyle({
    height: 12, borderRadius: 6, width: '50%', backgroundColor: tokens.color.marked,
  });
  expect(screen.getByText('30s')).toHaveStyle({
    minWidth: 44, textAlign: 'right', color: tokens.color.marked, fontVariant: ['tabular-nums'],
  });
});

test('exposes exactly one unchanged accessibility label on the root and decorative track/fill', () => {
  const screen = render(<TimerBar remainingMs={60000} durationMs={60000} />);
  const labels = screen.getAllByLabelText('Time left, 60 seconds');
  expect(labels).toHaveLength(1);
  expect(labels[0].props.accessible).toBe(true);
  expect(labels[0].props.accessibilityRole).toBeUndefined();
  expect(screen.getByTestId('countdown-track').props.accessible).toBe(false);
  expect(screen.getByTestId('countdown-fill').props.accessible).toBe(false);
});

test.each([
  [10001, '11s', tokens.color.marked],
  [10000, '10s', tokens.color.warning],
  [1, '1s', tokens.color.warning],
  [0, '0s', tokens.color.warning],
  [-1, '0s', tokens.color.warning],
])('rounds and colours %s ms as %s without changing the seconds meaning', (remainingMs, label, color) => {
  const screen = render(<TimerBar remainingMs={remainingMs} durationMs={60000} />);
  expect(screen.getByText(label)).toHaveStyle({ color });
  expect(screen.getByTestId('countdown-fill')).toHaveStyle({ backgroundColor: color });
  expect(screen.getByLabelText(`Time left, ${label.slice(0, -1)} seconds`)).toBeTruthy();
});

test.each([
  [90000, 60000, 100], [60000, 60000, 100], [10000, 60000, 100 / 6],
  [0, 60000, 0], [-1000, 60000, 0], [10000, 0, 0], [0, 0, 0], [10000, -1000, 0],
])('clamps the fill for %s / %s ms to %s percent', (remainingMs, durationMs, percent) => {
  const screen = render(<TimerBar remainingMs={remainingMs} durationMs={durationMs} />);
  const width = StyleSheet.flatten(screen.getByTestId('countdown-fill').props.style).width;
  expect(width).toMatch(/%$/);
  expect(parseFloat(width)).toBeCloseTo(percent, 5);
});

test('uses the theme timer face without a custom font weight', () => {
  const screen = render(
    <AssessmentThemeProvider fonts={{ textBold: 'Figtree_700Bold' }}>
      <TimerBar remainingMs={60000} durationMs={60000} />
    </AssessmentThemeProvider>,
  );
  const style = StyleSheet.flatten(screen.getByText('60s').props.style);
  expect(style).toMatchObject({ fontFamily: 'Figtree_700Bold', fontVariant: ['tabular-nums'] });
  expect(style.fontWeight).toBeUndefined();
});

test('updates directly from props with no clock of its own', () => {
  const screen = render(<TimerBar remainingMs={50000} durationMs={60000} />);
  expect(screen.getByText('50s')).toBeTruthy();
  screen.rerender(<TimerBar remainingMs={10000} durationMs={20000} />);
  expect(screen.getByText('10s')).toHaveStyle({ color: tokens.color.warning });
  expect(screen.getByTestId('countdown-fill')).toHaveStyle({ width: '50%' });
});
