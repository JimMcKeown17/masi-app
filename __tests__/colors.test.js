import { colors, spacing, borderRadius, shadows } from '../src/constants/colors';

const FORBIDDEN_VALUES = ['#294A99', '#FFDD00'];

describe('Masi red-dominant design tokens', () => {
  it('exposes the red ramp derived from brand red', () => {
    expect(colors.red50).toBe('#FDECEF');
    expect(colors.red100).toBe('#FBD5DC');
    expect(colors.red200).toBe('#F4A9B6');
    expect(colors.red300).toBe('#EE7D90');
    expect(colors.red400).toBe('#EC5470');
    expect(colors.red500).toBe('#E72D4D');
    expect(colors.red600).toBe('#C81F3E');
    expect(colors.red700).toBe('#A4182F');
    expect(colors.red800).toBe('#7C1223');
    expect(colors.red900).toBe('#530B17');
  });

  it('remaps legacy names onto the red system without breaking exports', () => {
    expect(colors.primary).toBe('#E72D4D');
    expect(colors.primaryLight).toBe('#EC5470');
    expect(colors.primaryDark).toBe('#C81F3E');
    expect(colors.emphasis).toBe('#E72D4D');
    expect(colors.accent).toBe('#B26A00');
    expect(colors.tabActive).toBe('#C81F3E');
  });

  it('preserves every required export key (fail-closed against dropped exports)', () => {
    const REQUIRED_KEYS = [
      'red50','red100','red200','red300','red400','red500','red600','red700','red800','red900',
      'primary','primaryLight','primaryDark','emphasis','accent','success',
      'error','errorBg','warning','info','successBg','successText','successBorder',
      'background','surface','cardBackground','text','textSecondary','border','disabled','placeholder',
      'tabActive','tabInactive','heroDark','onDark','onDarkMuted','ringNeutral','ringStart',
    ];
    REQUIRED_KEYS.forEach((key) => expect(Object.keys(colors)).toContain(key));
  });

  it('contains no retired legacy blue or yellow values', () => {
    const values = Object.values(colors).map((value) => String(value).toLowerCase());
    FORBIDDEN_VALUES.forEach((hex) => {
      expect(values).not.toContain(hex.toLowerCase());
    });
  });

  it('keeps semantic error red distinct from brand red', () => {
    expect(colors.error).toBe('#B3261E');
    expect(colors.error).not.toBe(colors.primary);
  });

  it('uses warm neutral canvas, ink, and line tokens', () => {
    expect(colors.background).toBe('#F8F5F4');
    expect(colors.text).toBe('#221A1B');
    expect(colors.border).toBe('#ECE5E4');
  });

  it('exposes the success semantic trio', () => {
    expect(colors.success).toBe('#3FA535');
    expect(colors.successBg).toBe('#E7F3E5');
    expect(colors.successText).toBe('#2E7D27');
    expect(colors.successBorder).toBe('#CDE8C9');
  });

  it('keeps spacing unchanged and applies the Zazi radii', () => {
    expect(spacing).toEqual({ xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 });
    expect(borderRadius).toEqual({ sm: 9, md: 14, lg: 18, xl: 22 });
  });

  it('uses the approved warm shadow styles', () => {
    expect(shadows).toEqual({
      card: {
        shadowColor: '#3A2424',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
      },
      elevated: {
        shadowColor: '#3A2424',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.10,
        shadowRadius: 14,
        elevation: 4,
      },
    });
  });

  it('every color token value belongs to the approved palette (fail-closed)', () => {
    const APPROVED = new Set([
      // red ramp
      '#fdecef', '#fbd5dc', '#f4a9b6', '#ee7d90', '#ec5470',
      '#e72d4d', '#c81f3e', '#a4182f', '#7c1223', '#530b17',
      // warm neutrals and dark-band tokens
      '#221a1b', '#76696b', '#ece5e4', '#f8f5f4', '#ffffff',
      '#b3a8a8', '#1c1517', '#c9bfc0', '#9aa3ab', '#8a939c',
      // semantic tokens
      '#3fa535', '#e7f3e5', '#2e7d27', '#cde8c9', '#b3261e',
      '#fceae8', '#b26a00',
    ]);

    Object.entries(colors).forEach(([name, value]) => {
      expect({ name, approved: APPROVED.has(String(value).toLowerCase()) }).toEqual({
        name,
        approved: true,
      });
    });
  });
});
