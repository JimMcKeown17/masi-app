import { GROUP_COLORS } from '../src/constants/groupColors';

// Fail-closed pin for the categorical group-identity palette. groupColors.js is
// excluded from the noLegacyHues colour guard (it is a deliberate data-colour
// source), so this is its dedicated guard: any hue drift, or an added/removed
// scheme, must be a conscious change that updates this test.
describe('GROUP_COLORS categorical palette', () => {
  it('pins the 8 group-identity schemes exactly', () => {
    expect(GROUP_COLORS).toEqual([
      { bg: '#E3F2FD', text: '#1565C0' }, // Blue
      { bg: '#E8F5E9', text: '#2E7D32' }, // Green
      { bg: '#FFF3E0', text: '#E65100' }, // Orange
      { bg: '#F3E5F5', text: '#7B1FA2' }, // Purple
      { bg: '#E0F7FA', text: '#00695C' }, // Teal
      { bg: '#FCE4EC', text: '#C62828' }, // Pink
      { bg: '#FFF8E1', text: '#F57F17' }, // Amber
      { bg: '#E8EAF6', text: '#283593' }, // Indigo
    ]);
  });

  it('has exactly 8 schemes', () => {
    expect(GROUP_COLORS).toHaveLength(8);
  });
});

import { GROUP_DOT_COLORS } from '../src/constants/groupColors';

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratioOnWhite = (hex) => 1.05 / (luminance(hex) + 0.05);

describe('GROUP_DOT_COLORS', () => {
  it('pins the six dot hues in order', () => {
    expect(GROUP_DOT_COLORS).toEqual(['#1565C0', '#2E7D32', '#E65100', '#7B1FA2', '#00695C', '#283593']);
  });
  it('every dot is at least 3:1 on white (graphic)', () => {
    GROUP_DOT_COLORS.forEach((hex) => expect(ratioOnWhite(hex)).toBeGreaterThanOrEqual(3));
  });
});
