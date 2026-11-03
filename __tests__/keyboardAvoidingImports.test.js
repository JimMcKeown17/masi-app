const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : /\.[jt]sx?$/.test(file) ? [file] : [];
  });
}
test('src imports KeyboardAvoidingView only through the app wrapper', () => {
  const root = path.join(__dirname, '../src');
  const violations = files(root).filter(file => {
    if (file === path.join(root, 'components/common/KeyboardAvoidingView.js')) return false;
    const ast = parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx', file.endsWith('.ts') || file.endsWith('.tsx') ? 'typescript' : 'flow'] });
    return ast.program.body.some(node => node.type === 'ImportDeclaration' && node.source.value === 'react-native' && node.specifiers.some(specifier => specifier.imported?.name === 'KeyboardAvoidingView'));
  }).map(file => path.relative(root, file));
  expect(violations).toEqual([]);
});

test('only FormScrollView sets automaticallyAdjustKeyboardInsets', () => {
  const root = path.join(__dirname, '../src');
  const violations = files(root).filter(file => {
    if (file === path.join(root, 'components/forms/FormScrollView.js')) return false;
    const ast = parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx', /\.tsx?$/.test(file) ? 'typescript' : 'flow'] });
    function hasAttribute(node) {
      if (!node || typeof node !== 'object') return false;
      if (node.type === 'JSXAttribute' && node.name.name === 'automaticallyAdjustKeyboardInsets') return true;
      return Object.values(node).some(value => Array.isArray(value) ? value.some(hasAttribute) : hasAttribute(value));
    }
    return hasAttribute(ast);
  }).map(file => path.relative(root, file));
  expect(violations).toEqual([]);
});
