// __tests__/sessionGaugeGeometry.test.js
import { buildGaugeGeometry } from '../src/components/home/sessionGaugeGeometry';
import { colors } from '../src/constants/colors';

describe('buildGaugeGeometry', () => {
  test('three segments with 5 degree gaps match the canvas paths', () => {
    const g = buildGaugeGeometry({ target: 3, count: 2, ceiling: 5, state: 'below' });
    expect(g.arcs.map((arc) => arc.d)).toEqual([
      'M 8.50 88.00 A 79.5 79.5 0 0 1 44.31 21.58',
      'M 50.27 18.02 A 79.5 79.5 0 0 1 125.73 18.02',
      'M 131.69 21.58 A 79.5 79.5 0 0 1 167.50 88.00',
    ]);
    expect(g.arcs.map((arc) => arc.color)).toEqual([colors.primary, colors.primary, colors.border]);
    expect(g.startDot.color).toBe(colors.primary);
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
    expect(g.arcs[1].color).toBe(colors.primary);
    expect(g.arcs[1].d).toBe('M 8.50 88.00 A 79.5 79.5 0 0 1 88.00 8.50');
  });
});
