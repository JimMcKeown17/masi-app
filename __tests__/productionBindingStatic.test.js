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
const ambientHandle = name => ['requireCurrentHandle', 'getCurrentHandle', 'subscribeToHandle'].includes(name);
const normalizeSource = (file, source = '') => (source.startsWith('.')
  ? path.relative(path.dirname(root), path.resolve(path.dirname(file), source))
  : source).replace(/\\/g, '/').replace(/\.[cm]?[jt]sx?$/, '');
const repositorySource = source => /^src\/db\/repositories\/.*Repository$/.test(source);
const audit = () => files(root).filter((file) => !path.relative(root, file).startsWith('session/')).flatMap((file) => {
  const violations = [];
  const fail = (node, reason) => violations.push(`${path.relative(root, file)}:${node.loc.start.line}: ${reason}`);
  const ast = parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  // AuthContext owns the registry. SignedInEAContext receives a handle explicitly
  // and needs no exception; all other React consumers capture useSignedInEA().
  const mayReadRegistry = path.relative(root, file) === 'context/AuthContext.js';
  const checkSource = (node, specifiers, all = false) => {
    const source = normalizeSource(file, node.source?.value);
    if (source.includes('supabaseRequestQueue')) fail(node, 'shared request queue');
    if (all && repositorySource(source)) fail(node, 'repository namespace may expose singletons');
    if (all && source === 'src/session/signedInHandle' && !mayReadRegistry) fail(node, 'ambient handle namespace');
    for (const specifier of specifiers) {
      const name = specifier.imported?.name || specifier.imported?.value || specifier.local?.name;
      const namespace = ['ImportNamespaceSpecifier', 'ImportDefaultSpecifier', 'ExportNamespaceSpecifier'].includes(specifier.type);
      if (repositorySource(source) && (namespace || singleton(name || ''))) fail(node, `singleton ${name || 'namespace'}`);
      if (!mayReadRegistry && (ambientHandle(name) || (namespace && source === 'src/session/signedInHandle'))) fail(node, `ambient handle ${name || 'namespace'}`);
      if (source === 'src/db/client' && /^(initializeDatabase|getDatabase|getWriter|withDatabaseAccess|withTransaction|resetDatabaseConnectionForTests)$/.test(name)) fail(node, `ambient connection ${name}`);
    }
  };
  traverse(ast, {
    ImportDeclaration({ node }) {
      checkSource(node, node.specifiers);
    },
    ExportNamedDeclaration({ node }) {
      if (node.source) checkSource(node, node.specifiers);
    },
    ExportAllDeclaration({ node }) { checkSource(node, [], true); },
    AssignmentPattern({ node }) {
      if (node.right.type === 'Identifier' && singleton(node.right.name)) fail(node, `singleton default ${node.right.name}`);
    },
    CallExpression({ node }) {
      if (node.callee.name === 'require' || node.callee.type === 'Import') {
        const source = normalizeSource(file, node.arguments[0]?.value);
        if (repositorySource(source) || source.includes('supabaseRequestQueue')) fail(node, 'unreviewed repository or queue require');
        if (source === 'src/session/signedInHandle' && !mayReadRegistry) fail(node, 'ambient handle require');
      }
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

test.each([
  ["import { requireCurrentHandle } from './session/signedInHandle'; export const save = row => requireCurrentHandle().repositories.children.save(row);", 'ambient handle'],
  ["import { getCurrentHandle as current } from './session/../session/signedInHandle.js';", 'ambient handle'],
  ["import { subscribeToHandle } from './session/signedInHandle';", 'ambient handle'],
  ["import * as handles from './session/signedInHandle.js';", 'ambient handle'],
  ["import { childrenRepository as rows } from './db/repositories/childrenRepository.js';", 'singleton'],
  ["import * as rows from './db/../db/repositories/childrenRepository.js';", 'singleton'],
  ["export { childrenRepository as rows } from './db/repositories/childrenRepository.js';", 'singleton'],
  ["export * from './db/repositories/childrenRepository.js';", 'singleton'],
  ["export { requireCurrentHandle as current } from './session/signedInHandle.js';", 'ambient handle'],
  ["export * from './session/signedInHandle.js';", 'ambient handle'],
  ["const handles = require('./session/signedInHandle.js');", 'ambient handle'],
  ["const rows = require('./db/repositories/childrenRepository.js');", 'repository'],
])('the binding audit rejects normalized imports and reexports: %s', (source, reason) => {
  const fixture = path.join(root, '__binding_probe__.js');
  try {
    fs.writeFileSync(fixture, source);
    expect(audit()).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(`__binding_probe__.*${reason}`))]));
  } finally { fs.unlinkSync(fixture); }
});
