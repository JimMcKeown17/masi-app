import fs from 'fs';
import path from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

const ROOT = path.resolve(__dirname, '..');
const ENGINE = path.join(ROOT, 'src/lessonPlan/engine');
const ALLOWED = new Set(['src/utils/decodability', 'src/constants/literacyConstants', 'src/utils/groupMastery']);
const ENGINE_RULES = { root: 'src/lessonPlan/engine/', allowed: ALLOWED };
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const f = path.join(dir, e.name);
  return e.isDirectory() ? files(f) : f.endsWith('.js') ? [f] : [];
});
const target = (file, source) => path.relative(ROOT, path.resolve(path.dirname(file), source))
  .replace(/\\/g, '/').replace(/\/index\.js$/, '').replace(/\.js$/, '');
const isMember = (node, obj, prop) => node?.type === 'MemberExpression'
  && node.object.name === obj && node.property.name === prop;

const auditEngineSource = (source, file, rules = ENGINE_RULES) => {
  const violations = [];
  const fail = (node, why) => violations.push(`${path.relative(ROOT, file)}:${node.loc.start.line}: ${why}`);
  const checkImport = (node, source) => {
    if (!source.startsWith('.')) return fail(node, `package import ${source}`);
    const t = target(file, source);
    if (!t.startsWith(rules.root) && !rules.allowed.has(t)) fail(node, `import ${t}`);
  };
  traverse(parse(source, { sourceType: 'module' }), {
    ImportDeclaration({ node }) { checkImport(node, node.source.value); },
    ExportNamedDeclaration({ node }) { if (node.source) checkImport(node, node.source.value); },
    ExportAllDeclaration({ node }) { checkImport(node, node.source.value); },
    CallExpression({ node }) {
      const { callee } = node;
      if (callee.type === 'Import' || callee.name === 'require') fail(node, 'dynamic import or require');
      if (callee.name === 'Date' || isMember(callee, 'Date', 'now') || isMember(callee, 'performance', 'now')) fail(node, 'clock read');
      if (isMember(callee, 'Math', 'random')) fail(node, 'randomness');
      if (callee.type === 'MemberExpression' && callee.object.name === 'console') fail(node, 'console');
    },
    NewExpression({ node }) {
      if (node.callee.name === 'Date' && node.arguments.length === 0) fail(node, 'clock read: new Date()');
    },
    VariableDeclarator(p) {
      const mutableBinding = ['let', 'var'].includes(p.parent.kind);
      const mutableCollection = p.node.init?.type === 'NewExpression' && ['Map', 'Set', 'WeakMap'].includes(p.node.init.callee.name);
      if ((mutableBinding || mutableCollection) && p.scope.path.isProgram()) fail(p.node, 'module-level mutable state');
    },
  });
  return violations;
};

test('the guard catches each kind of impurity', () => {
  const bad = "import React from 'react';\nimport { x } from '../../db/client';\nlet n = 0;\nconst cache = new Map();\n"
    + 'export const f = () => [Date.now(), new Date(), Math.random(), Date(), console.log(1)];';
  expect(auditEngineSource(bad, path.join(ENGINE, 'bad.js'))).toHaveLength(9);
});

test('the guard allows date arithmetic on input strings', () => {
  const good = "import { READING_LEVELS } from '../../constants/literacyConstants';\n"
    + "export const day = (d) => [Date.parse(`${d}T00:00:00Z`), new Date(Date.UTC(2026, 9, 19)).getUTCDay(), READING_LEVELS];";
  expect(auditEngineSource(good, path.join(ENGINE, 'good.js'))).toEqual([]);
});

test('engine files are pure (spec §7.3)', () => {
  const violations = [...files(ENGINE), path.join(ROOT, 'src/utils/groupMastery.js')]
    .flatMap((f) => auditEngineSource(fs.readFileSync(f, 'utf8'), f));
  expect(violations).toEqual([]);
});

test('numeracy files are pure', () => {
  const rules = { root: 'src/numeracy/', allowed: new Set(['src/utils/groupMastery']) };
  const violations = files(path.join(ROOT, 'src/numeracy'))
    .flatMap((f) => auditEngineSource(fs.readFileSync(f, 'utf8'), f, rules));
  expect(violations).toEqual([]);
});
