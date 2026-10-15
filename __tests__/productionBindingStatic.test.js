import fs from 'fs';
import path from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

global.__MASI_NO_DEFAULT_HANDLE__ = true;
const root = path.resolve(__dirname, '../src');
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(dir, entry.name);
  return entry.isDirectory() ? files(file) : file.endsWith('.js') ? [file] : [];
});
const singleton = (name) => /Repository$/.test(name) && !/^create/.test(name);
const audit = () => files(root).filter((file) => !path.relative(root, file).startsWith('session/')).flatMap((file) => {
  const violations = [];
  const fail = (node, reason) => violations.push(`${path.relative(root, file)}:${node.loc.start.line}: ${reason}`);
  const ast = parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  traverse(ast, {
    ImportDeclaration({ node }) {
      const source = node.source.value;
      if (source.includes('supabaseRequestQueue')) fail(node, 'shared request queue');
      for (const specifier of node.specifiers) {
        const name = specifier.imported?.name;
        if (specifier.type === 'ImportNamespaceSpecifier' && /Repository$/.test(source)) fail(node, 'repository namespace may expose singletons');
        if (name && singleton(name) && /Repository$/.test(source)) fail(node, `singleton ${name}`);
        if (/db\/client$/.test(source) && /^(initializeDatabase|getDatabase|getWriter|withDatabaseAccess|withTransaction|resetDatabaseConnectionForTests)$/.test(name)) fail(node, `ambient connection ${name}`);
      }
    },
    ExportNamedDeclaration({ node }) {
      if (/Repository$/.test(node.source?.value || '')) {
        for (const specifier of node.specifiers) if (singleton(specifier.local?.name || '')) fail(node, 'reexported repository singleton');
      }
    },
    AssignmentPattern({ node }) {
      if (node.right.type === 'Identifier' && singleton(node.right.name)) fail(node, `singleton default ${node.right.name}`);
    },
    CallExpression({ node }) {
      if (node.callee.name === 'require' && /(?:Repository|supabaseRequestQueue)$/.test(node.arguments[0]?.value || '')) fail(node, 'unreviewed repository or queue require');
      if (['resolveDatabase', 'runRepositoryTransaction'].includes(node.callee.name)
        && (!node.arguments.length || node.arguments[0].type === 'NullLiteral')) fail(node, 'unbound database access');
    },
  });
  return violations;
});
test('all production consumers bind their repository and database dependencies', () => {
  expect(audit()).toEqual([]);
});
test('the binding audit detects a new ambient consumer (temporary file)', () => {
  const fixture = path.join(root, '__binding_probe__.js');
  try {
    fs.writeFileSync(fixture, "import { childrenRepository as rows } from './db/repositories/childrenRepository';\nrows.getChildren();\n");
    expect(audit()).toEqual(expect.arrayContaining([expect.stringContaining('__binding_probe__.js:1: singleton childrenRepository')]));
  } finally { fs.unlinkSync(fixture); }
});
