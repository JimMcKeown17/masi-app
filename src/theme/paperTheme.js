import { configureFonts, MD3LightTheme } from 'react-native-paper';
import { colors, tints } from '../constants/colors';
import { fontFamilies, typeRoles } from '../constants/typography';

// Paper merges over MD3's typescale: explicitly clear its weights and tracking
// so Android keeps the selected weight-specific face.
const font = (role) => ({
  ...role,
  letterSpacing: role.letterSpacing ?? 0,
  fontWeight: undefined,
});

export const paperTheme = {
  ...MD3LightTheme,
  roundness: 6,
  colors: {
    primary: colors.primary,
    onPrimary: colors.onDark,
    primaryContainer: colors.red50,
    onPrimaryContainer: colors.red700,
    secondary: colors.text,
    onSecondary: colors.onDark,
    secondaryContainer: colors.text,
    onSecondaryContainer: colors.onDark,
    tertiary: colors.warningText,
    onTertiary: colors.onDark,
    tertiaryContainer: colors.warningBg,
    onTertiaryContainer: colors.warningText,
    error: colors.error,
    onError: colors.onDark,
    errorContainer: colors.errorBg,
    onErrorContainer: colors.error,
    background: colors.background,
    onBackground: colors.text,
    surface: colors.surface,
    onSurface: colors.text,
    surfaceVariant: colors.background,
    onSurfaceVariant: colors.textSecondary,
    surfaceDisabled: colors.border,
    onSurfaceDisabled: colors.disabled,
    outline: tints.control,
    outlineVariant: colors.border,
    inverseSurface: colors.text,
    inverseOnSurface: colors.onDark,
    inversePrimary: colors.onDark,
    shadow: colors.shadowWarm,
    scrim: colors.heroDark,
    backdrop: tints.scrim,
    elevation: {
      level0: 'transparent',
      level1: colors.surface,
      level2: colors.surface,
      level3: colors.surface,
      level4: colors.surface,
      level5: colors.surface,
    },
    success: colors.success,
  },
  fonts: configureFonts({
    config: {
      displayLarge: font(typeRoles.display3XL),
      displayMedium: font(typeRoles.display2XL),
      displaySmall: font(typeRoles.displayXL),
      headlineLarge: font(typeRoles.displayXL),
      headlineMedium: font(typeRoles.displayTitle),
      headlineSmall: font(typeRoles.displaySheetTitle),
      titleLarge: font(typeRoles.displayM),
      titleMedium: font(typeRoles.textRowTitle),
      titleSmall: font(typeRoles.textSmallStrong),
      labelLarge: font(typeRoles.textButton),
      labelMedium: font(typeRoles.textMetaStrong),
      labelSmall: font(typeRoles.textMicroStrong),
      bodyLarge: font(typeRoles.textBodyL),
      bodyMedium: font(typeRoles.textBody),
      bodySmall: font(typeRoles.textCaption),
      default: font({ fontFamily: fontFamilies.textMedium }),
    },
  }),
};
