import { colors } from '../constants/colors';
import { fontFamilies } from '../constants/typography';

export const navigationTheme = {
  dark: false,
  colors: {
    primary: colors.primary,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    border: colors.border,
    notification: colors.primary,
  },
  fonts: {
    regular: { fontFamily: fontFamilies.textMedium, fontWeight: 'normal' },
    medium: { fontFamily: fontFamilies.textSemi, fontWeight: 'normal' },
    bold: { fontFamily: fontFamilies.textBold, fontWeight: 'normal' },
    heavy: { fontFamily: fontFamilies.textHeavy, fontWeight: 'normal' },
  },
};
