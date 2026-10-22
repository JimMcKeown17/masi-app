import fs from 'fs';
import path from 'path';
import { fontFamilies, logoType, typeRoles } from '../src/constants/typography';
import * as typographyModule from '../src/constants/typography';

test('the legacy typography export is retired', () => {
  expect(typographyModule.typography).toBeUndefined();
});
test('Figtree 600 is a named face', () => {
  expect(fontFamilies.textSemi).toBe('Figtree_600SemiBold');
});
test('assessment content uses Andika Regular', () => {
  expect(fontFamilies.content).toBe('Andika_400Regular');
});
test('Bricolage only at 18px and above', () => {
  for (const [name, role] of Object.entries(typeRoles)) {
    if (role.fontFamily === fontFamilies.display) expect({ name, size: role.fontSize >= 18 }).toEqual({ name, size: true });
  }
});
test.each([
  ['lessonItem', 'Andika_400Regular', 20, 26, 0, {}],
  ['display3XL', 'BricolageGrotesque_800ExtraBold', 44, 46, -1.54, {}],
  ['display2XL', 'BricolageGrotesque_800ExtraBold', 38, 42, -1.14, {}],
  ['displayNumeralXL', 'BricolageGrotesque_800ExtraBold', 64, 64, -1.28, {}],
  ['displayTitle', 'BricolageGrotesque_800ExtraBold', 28, 32, -0.56, {}],
  ['displaySheetTitle', 'BricolageGrotesque_800ExtraBold', 24, 28, -0.48, {}],
  ['displayHeading', 'BricolageGrotesque_800ExtraBold', 18, 24, -0.27, {}],
  ['displayCount', 'BricolageGrotesque_800ExtraBold', 20, 24, -0.4, {}],
  ['textRowTitle', 'Figtree_700Bold', 16, 22, undefined, {}],
  ['textBodyL', 'Figtree_500Medium', 16, 22, undefined, {}],
  ['textBodyLStrong', 'Figtree_700Bold', 17, 22, undefined, {}],
  ['textBodySemi', 'Figtree_600SemiBold', 15, 20, undefined, {}],
  ['textParagraph', 'Figtree_500Medium', 15, 22, undefined, {}],
  ['textInput', 'Figtree_500Medium', 17, 22, undefined, {}],
  ['textOptionSelected', 'Figtree_800ExtraBold', 17, 22, undefined, {}],
  ['textButtonL', 'Figtree_800ExtraBold', 17, 20, undefined, {}],
  ['textButtonM', 'Figtree_800ExtraBold', 16, 20, undefined, {}],
  ['textLink', 'Figtree_800ExtraBold', 14, 20, undefined, {}],
  ['textSearch', 'Figtree_500Medium', 16, 20, undefined, {}],
  ['textMasked', 'Figtree_500Medium', 20, 24, 2.8, {}],
  ['textSmall', 'Figtree_500Medium', 14, 20, undefined, {}],
  ['textSmallStrong', 'Figtree_700Bold', 14, 20, undefined, {}],
  ['textPill', 'Figtree_800ExtraBold', 14, 18, undefined, { fontVariant: ['tabular-nums'] }],
  ['textNote', 'Figtree_600SemiBold', 13, 18, undefined, {}],
  ['textChip', 'Figtree_700Bold', 13, 18, undefined, {}],
  ['textBadge', 'Figtree_800ExtraBold', 12, 16, undefined, { fontVariant: ['tabular-nums'] }],
  ['textMetaStrong', 'Figtree_700Bold', 12, 16, undefined, {}],
  ['textSectionLabel', 'Figtree_800ExtraBold', 12, 16, 0.96, { textTransform: 'uppercase' }],
  ['textNavActive', 'Figtree_800ExtraBold', 11, 13, undefined, {}],
  ['textNavInactive', 'Figtree_600SemiBold', 11, 13, undefined, {}],
  ['textNavRecord', 'Figtree_700Bold', 11, 13, undefined, {}],
  ['textMicroStrong', 'Figtree_700Bold', 11, 14, undefined, {}],
  ['textLetter', 'Figtree_700Bold', 20, 24, undefined, {}],
  ['textDay', 'Figtree_600SemiBold', 16, 20, undefined, {}],
  ['textData', 'Figtree_700Bold', 15, 20, undefined, { fontVariant: ['tabular-nums'] }],
])('%s is pinned', (name, family, size, lineHeight, letterSpacing, extra) => {
  expect(typeRoles[name]).toEqual(expect.objectContaining({ fontFamily: family, fontSize: size, lineHeight, ...extra }));
  expect(typeRoles[name].letterSpacing).toBe(letterSpacing);
});

describe('typography roles', () => {
  test('every new role uses a weight-specific custom face and never sets fontWeight', () => {
    for (const [name, role] of Object.entries(typeRoles)) {
      expect({ name, family: Object.values(fontFamilies).includes(role.fontFamily) })
        .toEqual({ name, family: true });
      expect({ name, fontWeight: role.fontWeight }).toEqual({ name, fontWeight: undefined });
      expect(role.fontSize).toBeGreaterThanOrEqual(11);
      expect(role.lineHeight).toBeGreaterThanOrEqual(role.fontSize);
    }
  });
});

test.each([
  ['textInitialsSm', 11, 14, 0.33],
  ['textInitialsMd', 14, 18, 0.42],
  ['textInitialsLg', 22, 28, 0.66],
])('%s pins initials geometry without fontWeight', (name, fontSize, lineHeight, letterSpacing) => {
  expect(typeRoles[name]).toEqual({ fontFamily: fontFamilies.textHeavy, fontSize, lineHeight, letterSpacing });
});

describe('Login lockup type', () => {
  test('Bricolage 700 is a loaded face', () => {
    expect(fontFamilies.displayBold).toBe('BricolageGrotesque_700Bold');
  });

  test('every fontFamilies face is loaded by App.js useFonts', () => {
    const app = fs.readFileSync(path.join(process.cwd(), 'App.js'), 'utf8');
    const useFontsBlock = app.slice(app.indexOf('useFonts({'), app.indexOf('});', app.indexOf('useFonts({')));
    for (const face of Object.values(fontFamilies)) {
      expect({ face, loaded: useFontsBlock.includes(face) }).toEqual({ face, loaded: true });
    }
  });

  test('the wordmark styles match the board and are not type roles', () => {
    expect(logoType.wordmark).toEqual({
      fontFamily: fontFamilies.display, fontSize: 26, lineHeight: 24, letterSpacing: 0.26,
    });
    expect(logoType.wordmarkSub).toEqual({
      fontFamily: fontFamilies.displayBold, fontSize: 12, lineHeight: 15, letterSpacing: 1.56,
    });
    expect(Object.values(typeRoles)).not.toContain(logoType.wordmark);
    expect(typeRoles.wordmark).toBeUndefined();
  });
});
