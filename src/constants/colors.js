const RED = {
  50: '#FDECEF',
  100: '#FBD5DC',
  200: '#F4A9B6',
  300: '#EE7D90',
  400: '#EC5470',
  500: '#E72D4D',
  600: '#C81F3E',
  700: '#A4182F',
  800: '#7C1223',
  900: '#530B17',
};

const INK = '#221A1B';
const MUTED = '#76696B';
const LINE = '#ECE5E4';
const CANVAS = '#F8F5F4';
const ERROR = '#B3261E';
const ERROR_BG = '#FCEAE8';
const WARNING = '#B26A00';
const SUCCESS = '#3FA535';
const SUCCESS_BG = '#E7F3E5';
const SUCCESS_TEXT = '#2E7D27';
const SUCCESS_BORDER = '#CDE8C9';

export const colors = {
  // Red ramp
  red50: RED[50],
  red100: RED[100],
  red200: RED[200],
  red300: RED[300],
  red400: RED[400],
  red500: RED[500],
  red600: RED[600],
  red700: RED[700],
  red800: RED[800],
  red900: RED[900],

  // Legacy/brand names remapped to red
  primary: RED[500],
  primaryLight: RED[400],
  primaryDark: RED[600],
  emphasis: RED[500],
  accent: WARNING, // amber #B26A00 — caution/highlight, distinct from primary red
  success: SUCCESS,

  // Semantic
  error: ERROR,
  errorBg: ERROR_BG,
  warning: WARNING,
  warningBg: '#FFF8E1', // light amber — caution/warning surfaces (empty-state cards, unsynced/offline badges)
  warningText: '#8A4B00', // deep amber — caution text on warningBg (>=4.5:1 AA)
  info: MUTED,
  successBg: SUCCESS_BG,
  successText: SUCCESS_TEXT,
  successBorder: SUCCESS_BORDER,

  // Neutrals
  background: CANVAS,
  surface: '#FFFFFF',
  cardBackground: '#FFFFFF',
  text: INK,
  textSecondary: MUTED,
  border: LINE,
  disabled: '#B3A8A8',
  placeholder: '#B3A8A8',

  // Component-specific
  tabActive: RED[600],
  tabInactive: MUTED,

  // Dark hero band
  heroDark: '#1C1517',
  heroSurface: '#2A2224',
  heroBorder: '#3A2F31',
  onDark: '#FFFFFF',
  onDarkMuted: '#C9BFC0',

  // Session-ring stage tokens
  ringNeutral: '#9AA3AB',
  ringStart: '#8A939C',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 9,
  md: 14,
  lg: 18,
  xl: 22,
};

export const shadows = {
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
};
