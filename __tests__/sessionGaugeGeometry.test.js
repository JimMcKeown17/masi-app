// __tests__/sessionGaugeGeometry.test.js
import { buildGaugeGeometry, buildEarnedArc, buildSkeletonGeometry, GAUGE_SIZES } from '../src/components/sessions/sessionGaugeGeometry';
import { colors } from '../src/constants/colors';

describe('buildGaugeGeometry', () => {
  test('three segments with 5 degree gaps match the canvas paths', () => {
    const g = buildGaugeGeometry({ target: 3, count: 2, ceiling: 5, state: 'below' });
    expect(g.arcs.map((arc) => arc.d)).toEqual([
      'M 8.50 88.00 A 79.5 79.5 0 0 1 44.31 21.58',
      'M 50.27 18.02 A 79.5 79.5 0 0 1 125.73 18.02',
      'M 131.69 21.58 A 79.5 79.5 0 0 1 167.50 88.00',
    ]);
    expect(g.arcs.map((arc) => arc.color)).toEqual([colors.red500, colors.red500, colors.border]);
    expect(g.startDot.color).toBe(colors.red500);
    expect(g.endDot.color).toBe(colors.border);
  });

  test('zero sessions: all track, neutral start dot', () => {
    const g = buildGaugeGeometry({ target: 3, count: 0, state: 'below' });
    expect(g.arcs.map((arc) => arc.color)).toEqual([colors.border, colors.border, colors.border]);
    expect(g.startDot.color).toBe(colors.ringNeutral);
  });

  test('one session uses ringStart', () => {
    const g = buildGaugeGeometry({ target: 3, count: 1, state: 'below' });
    expect(g.arcs[0].color).toBe(colors.ringStart);
  });

  test('met is all green, exceeded all amber', () => {
    expect(new Set(buildGaugeGeometry({ target: 3, count: 3, state: 'met' }).arcs.map((a) => a.color)))
      .toEqual(new Set([colors.success]));
    const ex = buildGaugeGeometry({ target: 3, count: 6, ceiling: 5, state: 'exceeded' });
    expect(new Set(ex.arcs.map((a) => a.color))).toEqual(new Set([colors.accent]));
    expect(ex.endDot.color).toBe(colors.accent);
  });

  test('no target is one continuous neutral arc', () => {
    const g = buildGaugeGeometry({ target: null, count: 2, state: 'no_target' });
    expect(g.arcs).toEqual([{ d: 'M 8.50 88.00 A 79.5 79.5 0 0 1 167.50 88.00', color: colors.ringNeutral }]);
    expect(g.startDot.color).toBe(colors.ringNeutral);
    expect(g.endDot.color).toBe(colors.ringNeutral);
  });

  test('targets above 6 fall back to a continuous filled arc', () => {
    const g = buildGaugeGeometry({ target: 8, count: 4, state: 'below' });
    expect(g.arcs).toHaveLength(2);
    expect(g.arcs[0]).toEqual({ d: 'M 8.50 88.00 A 79.5 79.5 0 0 1 167.50 88.00', color: colors.border });
    expect(g.arcs[1].color).toBe(colors.red500);
    expect(g.arcs[1].d).toBe('M 8.50 88.00 A 79.5 79.5 0 0 1 88.00 8.50');
  });
});

describe('gauge sizes', () => {
  test('home is unchanged and celebration scales by the same formulas', () => {
    expect(GAUGE_SIZES.home).toEqual({ width: 176, height: 97, cx: 88, cy: 88, r: 79.5, stroke: 16, gapDeg: 5, maxSegments: 6 });
    expect(GAUGE_SIZES.celebration).toEqual({ width: 232, height: 128, cx: 116, cy: 116, r: 104.5, stroke: 22, gapDeg: 5, maxSegments: 6 });
  });

  test('celebration segments use the celebration radius', () => {
    const g = buildGaugeGeometry({ target: 3, count: 2, ceiling: 5, state: 'below' }, GAUGE_SIZES.celebration);
    expect(g.arcs[0].d).toBe('M 11.50 116.00 A 104.5 104.5 0 0 1 58.58 28.69');
    expect(g.arcs[2].d).toBe('M 173.42 28.69 A 104.5 104.5 0 0 1 220.50 116.00');
  });
});

describe('buildEarnedArc', () => {
  test('is the segment this session filled, with its arc length', () => {
    const earned = buildEarnedArc({ target: 3, count: 3, state: 'met' }, GAUGE_SIZES.celebration);
    expect(earned.d).toBe('M 173.42 28.69 A 104.5 104.5 0 0 1 220.50 116.00');
    expect(earned.length).toBeCloseTo(103.35, 2);
  });

  test('first session is segment 0', () => {
    expect(buildEarnedArc({ target: 3, count: 1, state: 'below' }, GAUGE_SIZES.celebration).d)
      .toBe('M 11.50 116.00 A 104.5 104.5 0 0 1 58.58 28.69');
  });

  test('targets above 6 use the continuous slice', () => {
    const earned = buildEarnedArc({ target: 8, count: 4, state: 'below' }, GAUGE_SIZES.celebration);
    expect(earned.d).toBe('M 76.01 19.45 A 104.5 104.5 0 0 1 116.00 11.50');
    expect(earned.length).toBeCloseTo(41.04, 2);
  });

  test.each([
    [{ target: null, count: 2, state: 'no_target' }],
    [{ target: 3, count: 0, state: 'below' }],
    [{ target: 3, count: 4, state: 'met' }],
    [{ target: 3, count: 6, state: 'exceeded' }],
  ])('none for %o', (goal) => {
    expect(buildEarnedArc(goal, GAUGE_SIZES.celebration)).toBeNull();
  });
});

test('the skeleton is one continuous border arc with border dots', () => {
  expect(buildSkeletonGeometry(GAUGE_SIZES.celebration)).toEqual({
    arcs: [{ d: 'M 11.50 116.00 A 104.5 104.5 0 0 1 220.50 116.00', color: colors.border }],
    startDot: { color: colors.border },
    endDot: { color: colors.border },
  });
});
