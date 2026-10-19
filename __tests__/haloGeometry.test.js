import { haloGeometry } from '../src/utils/haloGeometry';

const CARD_STRADDLE = 108;

test('390 reproduces the board circle (r 214, centre 26 below the field edge, gap 112)', () => {
  expect(haloGeometry(390)).toEqual({ cx: 195, r: 214, stroke: 32, svgHeight: 205, cy: 231, headlineGap: 112 });
});

test.each([360, 390, 411, 430])('at %idp the inner leg exits the sides above the field edge and the band clears the headline by 16', (width) => {
  const { r, stroke, headlineGap } = haloGeometry(width);
  const inner = r - stroke / 2;
  const exitAboveFieldEdge = Math.sqrt(inner ** 2 - (width / 2) ** 2) - 26;
  expect(exitAboveFieldEdge).toBeGreaterThan(0);
  // band outer top = fieldBottom − (r + 16 − 26); headline bottom = fieldBottom − 108 − gap
  const clearance = headlineGap + CARD_STRADDLE + 10 - r;
  expect(clearance).toBeGreaterThanOrEqual(16);
});

test('the gap grows on wide phones', () => {
  expect(haloGeometry(360).headlineGap).toBe(112);
  expect(haloGeometry(411).headlineGap).toBe(123);
  expect(haloGeometry(430).headlineGap).toBe(132);
});
