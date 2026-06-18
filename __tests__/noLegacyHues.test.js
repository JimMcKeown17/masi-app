const fs = require('fs');
const path = require('path');

// Fail-closed colour audit. Every colour literal in app source must be ALLOWED.
// Token-source files (constants/colors.js, constants/groupColors.js) are the ONLY
// sanctioned homes for raw palette literals and are excluded from the scan.
const ALLOWED = new Set([
  // red ramp
  '#fdecef', '#fbd5dc', '#f4a9b6', '#ee7d90', '#ec5470', '#e72d4d', '#c81f3e', '#a4182f', '#7c1223', '#530b17',
  // warm neutrals
  '#221a1b', '#76696b', '#ece5e4', '#f8f5f4', '#b3a8a8', '#1c1517', '#c9bfc0', '#3a2424', '#9aa3ab', '#8a939c',
  // greens
  '#3fa535', '#e7f3e5', '#2e7d27', '#cde8c9',
  // errors
  '#b3261e', '#fceae8',
  // amber
  '#b26a00',
  // pure black/white
  '#fff', '#ffffff', '#000', '#000000',
  // --- semantic data colours (NOT chrome): RAG score-band heat scale (scoreBands.js, ADR-0003).
  //     Signed off as a deliberate exception to the no-rainbow-chrome rule; legend-labelled.
  '#1e7a34', // great-green (darker than success)
  '#ffbb00', // okay/gold — also the ranked-bar mid tier
].map((v) => v.toLowerCase()));

// black/white/ink overlays at any alpha (all three channels equal: 0/17/255)
const ALLOWED_NEUTRAL_RGBA = /^rgba?\(\s*(0|17|255)\s*,\s*\1\s*,\s*\1\s*[,)]/;
// brand red500 rgba tints: #E72D4D = rgb(231,45,77)
const ALLOWED_RED_RGBA = /^rgba?\(\s*231\s*,\s*45\s*,\s*77\s*[,)]/;

// Coverage boundary (inherited from the fork guard): matches hex (#RGB..#RRGGBBAA),
// rgb()/rgba(), and hsl()/hsla(). Named CSS colours ('red'/'gold'), processColor(),
// and colours built via template-string/concatenation are OUT of scope — do not
// introduce colours in those forms. (src/ currently contains none.)
const LITERAL_PATTERN = /#[0-9a-fA-F]{3,8}\b|rgba?\([0-9, .]+\)|hsla?\([^)]*\)/g;

const collectJsFiles = (dir, acc = []) => {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) collectJsFiles(full, acc);
    else if (name.endsWith('.js')) acc.push(full);
  }
  return acc;
};

const isAllowed = (literal) => {
  const n = literal.toLowerCase().replace(/\s+/g, '');
  return ALLOWED.has(n) || ALLOWED_NEUTRAL_RGBA.test(n) || ALLOWED_RED_RGBA.test(n);
};

describe('colour-literal allowlist (Item 3 capstone — red-dominant, no stray hues)', () => {
  const root = path.join(__dirname, '..');
  // Token-source files are the only sanctioned homes for raw palette literals.
  // groupColors.js (the categorical group-identity palette) is pinned separately by
  // __tests__/groupColors.test.js, so its exclusion here is not an unguarded sink.
  const EXCLUDED = [path.join('constants', 'colors.js'), path.join('constants', 'groupColors.js')];
  const files = [...collectJsFiles(path.join(root, 'src')), path.join(root, 'App.js')]
    .filter((file) => !EXCLUDED.some((suffix) => file.endsWith(suffix)));

  it.each(files.map((file) => [path.relative(root, file), file]))(
    '%s contains only allowed colour literals',
    (relative, file) => {
      const source = fs.readFileSync(file, 'utf8');
      const literals = source.match(LITERAL_PATTERN) || [];
      const offenders = [...new Set(literals.filter((l) => !isAllowed(l)))];
      expect(offenders).toEqual([]);
    }
  );
});
