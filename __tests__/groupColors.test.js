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
