// __tests__/SegmentedSessionGauge.test.js
import React from 'react';
import { render } from '@testing-library/react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import SegmentedSessionGauge, { GaugeArcs } from '../src/components/sessions/SegmentedSessionGauge';
import { buildSkeletonGeometry, GAUGE_SIZES } from '../src/components/sessions/sessionGaugeGeometry';
import { colors } from '../src/constants/colors';

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

test('Home dots stay at 8.5 and 167.5 with radius 8 (pixel-identical)', () => {
  const screen = render(<SegmentedSessionGauge goal={{ target: 3, count: 2, ceiling: 5, state: 'below' }} />);
  const dots = screen.UNSAFE_getAllByType(Circle).map((c) => [c.props.cx, c.props.cy, c.props.r]);
  expect(dots).toEqual([[8.5, 88, 8], [167.5, 88, 8]]);
});

test('GaugeArcs draws at the celebration size with the overlay after the dots', () => {
  const size = GAUGE_SIZES.celebration;
  const screen = render(
    <GaugeArcs geometry={buildSkeletonGeometry(size)} size={size}>
      <Path testID="earned-overlay" d="M 0 0" stroke={colors.success} />
    </GaugeArcs>,
  );
  const svg = screen.UNSAFE_getByType(Svg);
  expect(svg.props).toEqual(expect.objectContaining({ width: 232, height: 128, viewBox: '0 0 232 128' }));
  expect(screen.UNSAFE_getAllByType(Path)[0].props).toEqual(expect.objectContaining({
    stroke: colors.border, strokeWidth: 22, fill: 'none',
  }));
  expect(screen.UNSAFE_getAllByType(Circle).map((c) => [c.props.cx, c.props.cy, c.props.r]))
    .toEqual([[11.5, 116, 11], [220.5, 116, 11]]);
  expect(React.Children.toArray(svg.props.children).map((child) => child.type))
    .toEqual([Path, Circle, Circle, Path]);
  expect(React.Children.toArray(svg.props.children).at(-1).props.testID).toBe('earned-overlay');
});
