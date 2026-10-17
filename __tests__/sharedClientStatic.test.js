import fs from 'fs';
import path from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

global.__MASI_NO_DEFAULT_HANDLE__ = true;

const root = path.resolve(__dirname, '..');
const sharedClientModule = 'src/services/supabaseClient';
const AUTH_CONSUMERS = new Set([
  `${sharedClientModule}.js`,
  'src/services/persistedAuthSession.js',
  'src/context/AuthContext.js',
]);
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(dir, entry.name);
  return entry.isDirectory() ? files(file) : /\.[cm]?[jt]sx?$/.test(file) ? [file] : [];
});
const relative = file => path.relative(root, file).replace(/\\/g, '/');
const isSharedModule = (file, source) => typeof source === 'string' && source.startsWith('.')
  && relative(path.resolve(path.dirname(file), source)).replace(/\.[cm]?[jt]sx?$/, '') === sharedClientModule;
const propertyName = node => node.computed ? node.property.value : node.property.name;
const isMember = node => ['MemberExpression', 'OptionalMemberExpression'].includes(node.type);
// Configuration reads carry no data and no identity. Ruling (controller, 2026-10-17): the
// persisted-session reader derives its storage-key fallback from the client's URL.
const CONFIG_READS = new Map([['src/services/persistedAuthSession.js', new Set(['supabaseUrl'])]]);

test('T20: the shared client is used only for auth in its three owners, never for data', () => {
  const violations = [];
  for (const file of files(path.join(root, 'src'))) {
    const name = relative(file);
    const fail = (node, reason) => violations.push(`${name}:${node.loc.start.line}: ${reason}`);
    const ast = parse(fs.readFileSync(file, 'utf8'), {
      sourceType: 'unambiguous',
      plugins: /\.[cm]?tsx?$/.test(file) ? ['jsx', 'typescript'] : ['jsx'],
    });
    const checkBinding = (binding) => {
      for (const reference of binding.referencePaths) {
        // Babel counts the canonical exported declaration itself as a reference.
        if (name === `${sharedClientModule}.js` && reference.isExportNamedDeclaration()
          && reference.node.declaration === binding.path.parentPath.node) continue;
        const parent = reference.parentPath.node;
        if (isMember(parent) && parent.object === reference.node) {
          const property = propertyName(parent);
          if (property === 'auth' && AUTH_CONSUMERS.has(name)) continue;
          if (CONFIG_READS.get(name)?.has(property)) continue;
          fail(parent, property === 'auth'
            ? 'shared client auth outside its three owners'
            : `shared client .${property || '<computed>'} access; only owner auth is allowed`);
        } else {
          // Do not let an alias, reexport, or argument hide a later data request.
          // Import aliases are already resolved by Babel's binding identity.
          fail(reference.node, 'shared client escapes direct auth access');
        }
      }
      for (const write of binding.constantViolations) fail(write.node, 'shared client binding reassigned');
    };

    traverse(ast, {
      ImportDeclaration(importPath) {
        if (!isSharedModule(file, importPath.node.source.value)) return;
        for (const specifier of importPath.node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') {
            fail(specifier, 'shared client namespace/default import hides client usage; use named imports');
          } else if ((specifier.imported.name || specifier.imported.value) === 'supabase') {
            checkBinding(importPath.scope.getBinding(specifier.local.name));
          }
        }
      },
      VariableDeclarator(declaration) {
        if (name === `${sharedClientModule}.js` && declaration.node.id.name === 'supabase'
          && declaration.scope.getBinding('supabase')?.scope.path.isProgram()) {
          checkBinding(declaration.scope.getBinding('supabase'));
        }
      },
      ExportNamedDeclaration({ node }) {
        if (!isSharedModule(file, node.source?.value)) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ExportNamespaceSpecifier'
            || (specifier.local?.name || specifier.local?.value) === 'supabase') {
            fail(specifier, 'shared client reexport hides client usage');
          }
        }
      },
      ExportAllDeclaration({ node }) {
        if (isSharedModule(file, node.source.value)) fail(node, 'shared client wildcard reexport hides client usage');
      },
      CallExpression({ node }) {
        if ((node.callee.name === 'require' || node.callee.type === 'Import')
          && isSharedModule(file, node.arguments[0]?.value)) {
          fail(node, 'shared client require/dynamic import hides client usage; use named imports');
        }
      },
    });
  }
  // A separate createClient (e.g. password verification), injected dataClient,
  // comments, and shadowed local identifiers do not use the shared export.
  expect(violations.sort()).toEqual([]);
});
