// __tests__/SegmentedSessionGauge.test.js
import React from 'react';
import { render } from '@testing-library/react-native';
import SegmentedSessionGauge from '../src/components/home/SegmentedSessionGauge';

describe('SegmentedSessionGauge', () => {
  test('is one accessible image with the shared label and shows the suffix below target', () => {
    const screen = render(<SegmentedSessionGauge goal={{ target: 3, count: 2, ceiling: 5, state: 'below' }} />);
    expect(screen.getByLabelText('2 of 3 sessions today. Below target.')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('/3')).toBeTruthy();
  });

  test('no suffix when exceeded or without a target', () => {
    const exceeded = render(<SegmentedSessionGauge goal={{ target: 3, count: 6, ceiling: 5, state: 'exceeded' }} />);
    expect(exceeded.queryByText('/3')).toBeNull();
    const none = render(<SegmentedSessionGauge goal={{ target: null, count: 2, state: 'no_target' }} />);
    expect(none.queryByText(/\//)).toBeNull();
  });
});
