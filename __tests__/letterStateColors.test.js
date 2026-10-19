import { letterStateColors } from '../src/constants/letterStateColors';
import { colors, tints } from '../src/constants/colors';

test('mastery states use the same green palette on every surface', () => {
  expect(letterStateColors).toEqual({
    taught: { bg: colors.successText, border: colors.successText, text: colors.onDark },
    assessment: { bg: colors.successBg, border: colors.successBorder, text: colors.successText },
    default: { bg: colors.surface, border: tints.control, text: colors.text },
  });
});

test('white on the taught green passes 4.5:1 at full precision', () => {
  const luminance = (hex) => {
    const linear = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map((c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const [hi, lo] = [luminance(colors.onDark), luminance(colors.successText)].sort((a, b) => b - a);
  expect((hi + 0.05) / (lo + 0.05)).toBeGreaterThanOrEqual(4.5);
});
