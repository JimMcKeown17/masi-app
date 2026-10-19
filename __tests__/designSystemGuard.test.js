global.__MASI_NO_DEFAULT_HANDLE__ = true;
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const walk = (dir, acc = []) => {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) { if (!rel(full).startsWith('src/assessment-questions')) walk(full, acc); }
    else if (name.endsWith('.js')) acc.push(full);
  }
  return acc;
};
const FILES = [...walk(path.join(ROOT, 'src')), path.join(ROOT, 'App.js')].map(rel);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const source = (f) => strip(fs.readFileSync(path.join(ROOT, f), 'utf8'));

const TYPOGRAPHY = 'src/constants/typography.js';
const NAV_THEME = 'src/theme/navigationTheme.js';
const PAPER_THEME = 'src/theme/paperTheme.js';
const RATCHETED_PAPER = ['TextInput', 'Searchbar', 'SegmentedButtons', 'Card', 'Chip', 'FAB', 'Banner', 'Menu', 'Button', 'HelperText'];

// The 10 board files keep their raw type sizes and Paper inputs until their own PR.
// A count may fall but never rise; a line whose file is clean must be deleted.
const BOARD_RATCHET = {
  'src/screens/auth/ForgotPasswordScreen.js': { rawType: 0, paperImports: ['TextInput', 'Button'] },
};

const rawTypeCount = (s) => (s.match(/\b(fontSize|lineHeight|letterSpacing)\s*:\s*-?\d/g) || []).length;
const paperImports = (s) => [...s.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]react-native-paper['"]/g)]
  .flatMap((m) => m[1].split(',').map((t) => t.trim().split(/\s+as\s+/)[0]).filter(Boolean));
const hexLiterals = (s) => s.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) || [];

const violations = (f) => {
  const s = source(f);
  const v = [];
  if (f !== TYPOGRAPHY) {
    const weights = s.match(/\bfontWeight\s*:\s*[^,}\n]+/g) || [];
    const allowed = f === NAV_THEME ? /fontWeight\s*:\s*'normal'/ : f === PAPER_THEME ? /fontWeight\s*:\s*undefined/ : null;
    weights.filter((w) => !(allowed && allowed.test(w))).forEach((w) => v.push(`fontWeight: ${w}`));
    if (/fontFamily\s*:\s*['"`]/.test(s)) v.push('string-literal fontFamily');
  }
  const ratchet = BOARD_RATCHET[f];
  if (f !== TYPOGRAPHY && rawTypeCount(s) > (ratchet ? ratchet.rawType : 0)) v.push(`raw type values: ${rawTypeCount(s)}`);
  if (!f.startsWith('src/constants/') && f !== 'src/utils/scoreBands.js' && hexLiterals(s).length) v.push(`colour literals: ${hexLiterals(s).join(' ')}`);
  const imports = paperImports(s);
  if (imports.includes('Snackbar')) v.push('Snackbar import');
  imports.filter((i) => RATCHETED_PAPER.includes(i) && !(ratchet && ratchet.paperImports.includes(i)))
    .forEach((i) => v.push(`Paper ${i} import`));
  return v;
};

describe('design-system guard', () => {
  test.each(FILES)('%s follows the token rules', (f) => {
    expect(violations(f)).toEqual([]);
  });
  test.each(Object.keys(BOARD_RATCHET))('%s ratchet line is still needed', (f) => {
    expect(FILES).toContain(f);
    const s = source(f);
    const stillUsed = rawTypeCount(s) > 0 || paperImports(s).some((i) => BOARD_RATCHET[f].paperImports.includes(i));
    expect(stillUsed).toBe(true);
  });
  test('the theme exceptions hold', () => {
    const nav = source(NAV_THEME);
    expect(nav.match(/fontFamily\s*:\s*fontFamilies\.\w+/g)).toHaveLength(4);
    // Every fontWeight in the Paper theme must be exactly `undefined` (Codex plan review F1:
    // a negative lookahead after `\s*` backtracks and matches `fontWeight: undefined`).
    const weights = [...source(PAPER_THEME).matchAll(/fontWeight\s*:\s*([^,}\n]+)/g)].map((m) => m[1].trim());
    expect(weights.length).toBeGreaterThan(0);
    expect(weights.every((w) => w === 'undefined')).toBe(true);
  });
  test('the paper-theme weight rule accepts undefined and rejects real weights (fixtures)', () => {
    const check = (src) => [...src.matchAll(/fontWeight\s*:\s*([^,}\n]+)/g)].map((m) => m[1].trim()).every((w) => w === 'undefined');
    expect(check('{ fontWeight: undefined, a: 1 }')).toBe(true);
    expect(check('{ fontWeight:   undefined }')).toBe(true);
    expect(check("{ fontWeight: '400' }")).toBe(false);
    expect(check('{ fontWeight: "bold" }')).toBe(false);
  });
});
