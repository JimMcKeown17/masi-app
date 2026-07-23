import React from 'react';
import { render } from '@testing-library/react-native';
import { Path } from 'react-native-svg';
import SessionsTodayGauge from '../src/components/sessions/SessionsTodayGauge';

describe('SessionsTodayGauge', () => {
  test('shows locked R3 progress and announces the complete daily status', () => {
    const screen = render(
      <SessionsTodayGauge goal={{ target: 3, ceiling: 5, count: 2, state: 'below' }} />
    );

    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('/3')).toBeTruthy();
    expect(screen.getByLabelText('2 of 3 sessions today. Below target.')).toBeTruthy();
    const paths = screen.UNSAFE_getAllByType(Path);
    expect(paths[0].props.d).toBe('M 12 74 A 58 58 0 0 1 128 74');
    expect(paths[1].props.strokeDasharray).toBe('121.46666666666665 182.2');
  });

  test.each([
    [
      { target: 3, ceiling: 5, count: 0, state: 'below' },
      '0 of 3 sessions today. Below target.',
      '/3',
    ],
    [
      { target: 3, ceiling: 5, count: 3, state: 'met' },
      '3 of 3 sessions today. Goal met.',
      '/3',
    ],
    [
      { target: 3, ceiling: 5, count: 6, state: 'exceeded' },
      '6 sessions today. Above the usual maximum of 5.',
      '/3',
    ],
    [
      { target: null, ceiling: null, count: 2, state: 'no_target' },
      '2 sessions today.',
      ' today',
    ],
  ])('preserves the goal service semantics for %o', (goal, label, denominator) => {
    const screen = render(<SessionsTodayGauge goal={goal} />);

    expect(screen.getByLabelText(label)).toBeTruthy();
    expect(screen.getByText(denominator)).toBeTruthy();
  });
});
