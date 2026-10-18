import { colors } from './colors';

export const typography = {
  screenTitle:  { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  cardTitle:    { fontSize: 16, fontWeight: '800', color: colors.text },
  body:         { fontSize: 14, fontWeight: '600', color: colors.text },
  caption:      { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  statValue:    { fontSize: 26, fontWeight: '800', color: colors.text },
  sectionLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.textSecondary },
};

// Bold Red type roles (Home first; other screens adopt them as they are
// redesigned). Android rule: a custom family is chosen per weight, so roles set
// the weight-specific face and never fontWeight (fontWeight + custom family
// makes Android fall back to the system font).
export const fontFamilies = {
  display: 'BricolageGrotesque_800ExtraBold',
  textMedium: 'Figtree_500Medium',
  textBold: 'Figtree_700Bold',
  textHeavy: 'Figtree_800ExtraBold',
};

export const typeRoles = {
  displayXL: { fontFamily: fontFamilies.display, fontSize: 32, lineHeight: 36, letterSpacing: -0.8 },
  displayNumeral: { fontFamily: fontFamilies.display, fontSize: 48, lineHeight: 48 },
  displayM: { fontFamily: fontFamilies.display, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 },
  textBody: { fontFamily: fontFamilies.textMedium, fontSize: 15, lineHeight: 20 },
  textBodyStrong: { fontFamily: fontFamilies.textBold, fontSize: 15, lineHeight: 20 },
  textCaption: { fontFamily: fontFamilies.textMedium, fontSize: 13, lineHeight: 18 },
  textLabel: {
    fontFamily: fontFamilies.textHeavy, fontSize: 11, lineHeight: 14, letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  textButton: { fontFamily: fontFamilies.textHeavy, fontSize: 15, lineHeight: 20 },
};
