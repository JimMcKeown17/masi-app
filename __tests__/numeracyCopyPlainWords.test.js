global.__MASI_NO_DEFAULT_HANDLE__ = true;

const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');
const { BANNED_WORDS } = require('../content/numeracy-curriculum/bannedWords.cjs');
const ROOT = path.resolve(__dirname, '..');

// Parsing excludes comments and distinguishes literal text from identifiers and expressions.
function literalTexts(source) {
  const ast = parse(source, { sourceType: 'unambiguous', plugins: ['jsx'] });
  const texts = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'StringLiteral' || node.type === 'JSXText') texts.push(node.value);
    if (node.type === 'TemplateElement') texts.push(node.value.cooked ?? node.value.raw);
    for (const [key, value] of Object.entries(node)) {
      if (['comments', 'leadingComments', 'trailingComments', 'innerComments', 'loc', 'tokens'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(ast);
  return texts;
}
const violations = source => literalTexts(source).filter(text => BANNED_WORDS.some(pattern => pattern.test(text)));
function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(file) : entry.name.endsWith('.js') ? [file] : [];
  });
}

test('the plain-words scanner catches literal and JSX text and ignores comments', () => {
  expect(violations('<Text>count on</Text>')).toEqual(['count on']);
  expect(violations('const x = "number bonds"')).toEqual(['number bonds']);
  expect(violations("const x = 'ladder'")).toEqual(['ladder']);
  expect(violations('const x = `Hello ${name}, count on`')).toEqual([', count on']);
  expect(violations('/* number bonds */ const x = "Add"; // count on\n')).toEqual([]);
  expect(violations('const x = "number\\u0020bonds"')).toEqual(['number bonds']);
});

test('numeracy copy uses plain words in every string literal and JSX text', () => {
  const files = ['src/numeracyLesson', 'src/components/numeracy', 'src/screens/numeracy']
    .flatMap(directory => filesUnder(path.join(ROOT, directory)));
  expect(files).toContain(path.join(ROOT, 'src/numeracyLesson/copy.js'));
  const failures = files.flatMap(file => violations(fs.readFileSync(file, 'utf8'))
    .map(text => `${path.relative(ROOT, file)}: ${JSON.stringify(text)}`));
  expect(failures).toEqual([]);
});

test('content verification and screens share a frozen non-empty banned-word list', () => {
  expect(Object.isFrozen(BANNED_WORDS)).toBe(true);
  expect(Array.isArray(BANNED_WORDS)).toBe(true);
  expect(BANNED_WORDS.length).toBeGreaterThan(0);
  for (const pattern of BANNED_WORDS) expect(pattern).toBeInstanceOf(RegExp);
  const verifier = fs.readFileSync(path.join(ROOT, 'content/numeracy-curriculum/verify.cjs'), 'utf8');
  expect(verifier).toMatch(/const\s*\{\s*BANNED_WORDS\s*\}\s*=\s*require\(['"]\.\/bannedWords\.cjs['"]\)/);
  expect(verifier).not.toMatch(/\bBANNED_WORDS\s*=\s*\[/);
});
