import { colors } from '../src/constants/colors';

const channel = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground, background, where]
const TEXT_PAIRS = [
  ['onDark', 'primary', 'primary buttons, FAB'], ['primary', 'surface', 'tertiary links, C13 text'],
  ['primary', 'background', 'active tab, links on canvas'], ['primary', 'red50', 'active tab label in its pill'],
  ['red50', 'red600', 'captions on red'], ['onDark', 'red700', 'hero disc'], ['red700', 'red50', 'avatar, FAB icon'],
  ['text', 'background', 'body on canvas'], ['text', 'surface', 'body on white'], ['onDark', 'text', 'toast, selected chip'],
  ['textSecondary', 'surface', 'muted on white'], ['textSecondary', 'background', 'muted on canvas'],
  ['placeholder', 'surface', 'placeholder'], ['warningText', 'warningBg', 'badges, D8 note'],
  ['error', 'errorBg', 'error note'], ['error', 'surface', 'destructiveQuiet'], ['onDark', 'error', 'destructive'],
  ['successText', 'successBg', 'Synced badge'], ['successText', 'surface', 'taught tile text'],
  ['onDark', 'successText', 'Sequential Correct'],
];
const GRAPHIC_PAIRS = [
  ['success', 'surface', 'synced cloud'], ['onDark', 'success', 'toast check disc'],
  ['fieldEdge', 'surface', 'field edge on white'], ['fieldEdge', 'background', 'field edge on canvas'],
  ['warning', 'surface', 'amber glyph'], ['warning', 'warningBg', 'D8 glyph'],
];

test.each(TEXT_PAIRS)('%s on %s (%s) passes 4.5:1 text contrast', (fg, bg) => {
  expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
});
test.each(GRAPHIC_PAIRS)('%s on %s (%s) passes 3:1 graphic contrast', (fg, bg) => {
  expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(3);
});
test('red500 stays graphic-only: it is not the action red and fails text contrast with white', () => {
  expect(colors.primary).not.toBe(colors.red500);
  expect(contrast(colors.onDark, colors.red500)).toBeLessThan(4.5);
});
