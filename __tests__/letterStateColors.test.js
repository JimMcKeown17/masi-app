import { letterStateColors } from '../src/constants/letterStateColors';
import { colors } from '../src/constants/colors';

describe('letterStateColors', () => {
  it('uses shared design tokens for letter tracker cell states', () => {
    expect(letterStateColors.assessment.bg).toBe(colors.accent);
    expect(letterStateColors.assessment.text).toBe('#FFFFFF');

    expect(letterStateColors.taught.bg).toBe(colors.success);
    expect(letterStateColors.taught.text).toBe('#FFFFFF');

    expect(letterStateColors.default.bg).toBe(colors.surface);
    expect(letterStateColors.default.text).toBe(colors.text);
    expect(letterStateColors.default.border).toBe(colors.border);
  });
});
