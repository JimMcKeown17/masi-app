import { colors, tints } from './colors';

export const letterStateColors = {
  taught: { bg: colors.successText, border: colors.successText, text: colors.onDark },
  assessment: { bg: colors.successBg, border: colors.successBorder, text: colors.successText },
  default: { bg: colors.surface, border: tints.control, text: colors.text },
};
