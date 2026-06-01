jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

import { getTabIconName } from '../src/components/navigation/BottomTabIcon';

describe('getTabIconName — one place for the route→icon mapping', () => {
  test('Home: filled when focused, outline otherwise', () => {
    expect(getTabIconName('Home', true)).toBe('home');
    expect(getTabIconName('Home', false)).toBe('home-outline');
  });

  test('maps all four tabs to their glyphs (Sessions stays the third tab)', () => {
    expect(getTabIconName('Children', true)).toBe('people');
    expect(getTabIconName('Sessions', true)).toBe('document-text');
    expect(getTabIconName('Assessments', true)).toBe('clipboard');
    // outline variants
    expect(getTabIconName('Children', false)).toBe('people-outline');
    expect(getTabIconName('Sessions', false)).toBe('document-text-outline');
    expect(getTabIconName('Assessments', false)).toBe('clipboard-outline');
  });

  test('unknown route falls back to a valid glyph, never undefined', () => {
    expect(getTabIconName('Mystery', true)).toBe('ellipse');
    expect(getTabIconName('Mystery', false)).toBe('ellipse-outline');
  });
});
