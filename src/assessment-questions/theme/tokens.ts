/**
 * Package design tokens. The ONLY file in the package allowed to contain colour literals
 * (enforced by __tests__/rawHexGuard.test.ts). Values mirror the Masi host palette in
 * src/constants/colors.js; they are copied because the OSS boundary forbids importing host code.
 */
export const tokens = {
  color: {
    ink: '#221A1B',
    muted: '#76696B',
    line: '#ECE5E4',
    canvas: '#F8F5F4',
    surface: '#FFFFFF',
    primary: '#E72D4D',
    primaryPressed: '#C81F3E',
    onPrimary: '#FFFFFF',
    marked: '#2E7D27',
    onMarked: '#FFFFFF',
    markedSoft: '#E7F3E5',
    error: '#B3261E',
    errorSoft: '#FCEAE8',
    notReached: '#B3A8A8',
    scrim: 'rgba(34, 26, 27, 0.45)',
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  radius: { pill: 999, card: 12, cell: 8 },
  font: { markingItem: 28, prompt: 32, body: 16, caption: 13, heading: 20 },
} as const;

export type Tokens = typeof tokens;
