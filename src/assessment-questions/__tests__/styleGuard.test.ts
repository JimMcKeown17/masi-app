import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '..');

// Delete entries as shared typography/primitives replace each file's styling.
export const FONT_RATCHET: ReadonlySet<string> = new Set<string>([
  'questions/LetterWritingFromPicturesQuestion/index.tsx',
  'questions/ListenAndAnswerStoryQuestion/index.tsx',
  'questions/ListenFirstSoundQuestion/index.tsx',
  'questions/ListenPhonemeBlendQuestion/index.tsx',
  'questions/StoryWritingRubricQuestion/index.tsx',
]);
export const STYLE_RATCHET: ReadonlySet<string> = new Set<string>([
  'questions/LetterWritingFromPicturesQuestion/index.tsx',
  'questions/ListenAndAnswerStoryQuestion/index.tsx',
  'questions/ListenFirstSoundQuestion/index.tsx',
  'questions/ListenPhonemeBlendQuestion/index.tsx',
  'questions/StoryWritingRubricQuestion/index.tsx',
]);

function parseCode(code: string): ts.SourceFile {
  const parse = (text: string) =>
    ts.createSourceFile('guard.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const source = parse(code);
  // Existing rule fixtures include bare object expressions. Parse those as objects,
  // rather than treating their keys as statement labels inside a block.
  return source.statements.length === 1 && ts.isBlock(source.statements[0])
    ? parse(`(\n${code}\n)`)
    : source;
}

// Comments are trivia, not visited nodes. Type shapes (including inline annotations)
// are not runtime styling; don't inspect their descendants or ratchet their fields.
function walkRuntime(node: ts.Node, inspect: (node: ts.Node) => void): void {
  if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
  inspect(node);
  ts.forEachChild(node, child => walkRuntime(child, inspect));
}

function objectKeyViolations(source: ts.SourceFile, keys: ReadonlySet<string>): string[] {
  const violations = new Set<string>();
  walkRuntime(source, node => {
    if (!ts.isPropertyAssignment(node) && !ts.isShorthandPropertyAssignment(node)) return;
    const name = ts.isComputedPropertyName(node.name) ? node.name.expression : node.name;
    if ((ts.isIdentifier(name) && !ts.isComputedPropertyName(node.name)) ||
        ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) {
      if (keys.has(name.text)) violations.add(name.text);
    }
  });
  return [...violations];
}

export function fontViolations(code: string): string[] {
  return objectKeyViolations(parseCode(code), new Set(['fontWeight', 'fontFamily', 'fontStyle']));
}

export function styleViolations(code: string): string[] {
  const source = parseCode(code);
  const violations = objectKeyViolations(source, new Set([
    'fontSize', 'lineHeight', 'color', 'backgroundColor', 'borderColor', 'borderWidth', 'borderRadius',
  ]));
  const forbidden = new Set([
    'Text', 'Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback', 'Modal',
  ]);
  walkRuntime(source, node => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text === 'react-native') {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      if (clause?.name || (bindings && ts.isNamespaceImport(bindings))) {
        violations.push('import * react-native');
      }
      if (bindings && ts.isNamedImports(bindings)) {
        for (const binding of bindings.elements) {
          const name = (binding.propertyName ?? binding.name).text;
          if (forbidden.has(name)) violations.push(`import ${name}`);
        }
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
        node.expression.text === 'require') {
      const specifier = node.arguments[0];
      if (specifier && (ts.isStringLiteral(specifier) || ts.isNoSubstitutionTemplateLiteral(specifier)) &&
          specifier.text === 'react-native') violations.push('require react-native');
    }
  });
  return [...new Set(violations)];
}

function collectFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return ['__tests__', 'theme'].includes(entry.name) ? [] : collectFiles(full);
    }
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [full] : [];
  }).sort();
}

const fontFiles = collectFiles(ROOT).map(file => path.relative(ROOT, file));
const styleFiles = fontFiles.filter(file => !file.split(path.sep).includes('ui'));

function violationsOutsideRatchet(
  files: readonly string[], ratchet: ReadonlySet<string>, rule: (code: string) => string[],
): string[] {
  return files.filter(file => !ratchet.has(file)).flatMap(file =>
    rule(fs.readFileSync(path.join(ROOT, file), 'utf8')).map(key => `${file}:${key}`),
  );
}

function staleRatchetEntries(
  files: readonly string[], ratchet: ReadonlySet<string>, rule: (code: string) => string[],
): string[] {
  return [...ratchet].flatMap(file => {
    if (!files.includes(file)) return [`${file}: missing or outside guard scope`];
    return rule(fs.readFileSync(path.join(ROOT, file), 'utf8')).length === 0
      ? [`${file}: no longer violates; remove ratchet entry`]
      : [];
  });
}

test('fontViolations finds weight, family and style keys', () => {
  expect(fontViolations("const s = { fontWeight: '600' }")).toEqual(['fontWeight']);
  expect(fontViolations("const s = { fontFamily: faces.body, fontStyle: 'italic' }")).toEqual(['fontFamily', 'fontStyle']);
  expect(fontViolations('x = tokens.font.body')).toEqual([]);
});

test('styleViolations finds raw text/colour/border keys and forbidden RN imports', () => {
  expect(styleViolations("import { View, Text } from 'react-native'")).toEqual(['import Text']);
  expect(styleViolations('{ backgroundColor: tokens.color.surface }')).toEqual(['backgroundColor']);
  expect(styleViolations('tokens.color.ink')).toEqual([]);
  expect(styleViolations("{ gap: tokens.space.sm, flexDirection: 'row' }")).toEqual([]);
  expect(styleViolations('const s = { fontSize: 16, lineHeight: 24, color: ink, borderColor: ink, borderWidth: 1, borderRadius: 8 }'))
    .toEqual(['fontSize', 'lineHeight', 'color', 'borderColor', 'borderWidth', 'borderRadius']);
});

test('styleViolations finds multiline, aliased and default-plus-named RN imports', () => {
  expect(styleViolations(`import RN, {
    Text as Label, Pressable, TouchableOpacity, TouchableHighlight,
    TouchableWithoutFeedback, Modal,
  } from "react-native";`)).toEqual([
    'import * react-native', 'import Text', 'import Pressable', 'import TouchableOpacity', 'import TouchableHighlight',
    'import TouchableWithoutFeedback', 'import Modal',
  ]);
  expect(styleViolations("import { Text, Pressable } from '../ui'; import { View, StyleSheet } from 'react-native';"))
    .toEqual([]);
});

test('both key rules find quoted object properties', () => {
  const code = `StyleSheet.create({ tile: {
    'fontFamily': 'X', 'fontWeight': '600', 'fontStyle': 'italic',
    'fontSize': 32, 'color': ink,
  } })`;
  expect({ font: fontViolations(code), style: styleViolations(code) }).toEqual({
    font: ['fontFamily', 'fontWeight', 'fontStyle'], style: ['fontSize', 'color'],
  });
});

test('both key rules find computed string and template-literal object properties', () => {
  const code = "const s = { ['fontFamily']: 'X', [\"fontWeight\"]: '600', " +
    "[`fontStyle`]: 'italic', ['fontSize']: 32, [\"color\"]: ink };";
  expect({ font: fontViolations(code), style: styleViolations(code) }).toEqual({
    font: ['fontFamily', 'fontWeight', 'fontStyle'], style: ['fontSize', 'color'],
  });
});

test('both key rules find shorthand object properties', () => {
  const code = 'const style = { fontFamily, fontWeight, fontStyle, fontSize, color };';
  expect({ font: fontViolations(code), style: styleViolations(code) }).toEqual({
    font: ['fontFamily', 'fontWeight', 'fontStyle'], style: ['fontSize', 'color'],
  });
});

test('namespace React Native imports are forbidden even when controls use namespace JSX', () => {
  expect(styleViolations("import * as RN from 'react-native'; const el = <RN.Text>Hello</RN.Text>;"))
    .toEqual(['import * react-native']);
});

test('default React Native imports are forbidden', () => {
  expect(styleViolations("import RN from 'react-native';")).toEqual(['import * react-native']);
});

test.each([
  "const { Text, Pressable } = require('react-native');",
  "const { Text: Label, Pressable: Button } = require('react-native');",
])('CommonJS destructuring cannot bypass the control guard: %s', code => {
  expect(styleViolations(code)).toEqual(['require react-native']);
});

test('CommonJS member access cannot bypass the control guard', () => {
  expect(styleViolations("const Text = require('react-native').Text;"))
    .toEqual(['require react-native']);
});

test('a complete component using namespace controls and quoted styles violates both guards', () => {
  const code = `import React from 'react';
    import * as RN from 'react-native';
    const styles = RN.StyleSheet.create({ tile: {
      'fontFamily': 'X', 'fontWeight': '600', 'fontSize': 32, 'color': 'black',
    } });
    export function Tile() {
      return <RN.Pressable><RN.Text style={styles.tile}>Start</RN.Text></RN.Pressable>;
    }`;
  expect({ font: fontViolations(code), style: styleViolations(code) }).toEqual({
    font: ['fontFamily', 'fontWeight'], style: ['fontSize', 'color', 'import * react-native'],
  });
});

test('object keys ignore type annotations, code-looking strings, comments and JSX attributes', () => {
  const code = `const data: { fontWeight: string; color: string } = value;
    function useStyle(style: { fontFamily: string; fontSize: number }) {}
    const example = "fontWeight: '600'; color: ink; import * as RN from 'react-native'";
    // const s = { fontFamily, color }; require('react-native');
    /* import RN from 'react-native'; const s = { fontWeight, fontSize }; */
    const el = <View fontFamily="X" color="black" />;`;
  expect(fontViolations(code)).toEqual([]);
  expect(styleViolations(code)).toEqual([]);
  expect(styleViolations("import { View, StyleSheet, ScrollView, Platform } from 'react-native';"))
    .toEqual([]);
  expect(styleViolations("import RN from '../ui'; const UI = require('../ui');"))
    .toEqual([]);
});

test('ratchet membership equals the complete current offender sets', () => {
  const violatingFiles = (files: readonly string[], rule: (code: string) => string[]) =>
    files.filter(file => rule(fs.readFileSync(path.join(ROOT, file), 'utf8')).length > 0);
  expect(violatingFiles(fontFiles, fontViolations)).toEqual([...FONT_RATCHET].sort());
  expect(violatingFiles(styleFiles, styleViolations)).toEqual([...STYLE_RATCHET].sort());
});

test('both rules ignore line and block comments but still inspect surrounding code', () => {
  const comments = `// fontWeight: '600', fontFamily: faces.body
    /* fontStyle: 'italic'; color: ink; backgroundColor: surface;
       import { Text, Pressable } from 'react-native'; */`;
  expect(fontViolations(comments)).toEqual([]);
  expect(styleViolations(comments)).toEqual([]);
  expect(fontViolations(`${comments}\nconst s = { /* regular */ fontWeight: '600' };`)).toEqual(['fontWeight']);
  expect(styleViolations(`${comments}\nconst url = 'https://example.com'; const s = { color: ink };`))
    .toEqual(['color']);
});

test('type and interface fields are shapes rather than styling offenders', () => {
  const declarations = `interface Props { color: string; fontWeight: string }
    type Shape = { backgroundColor: string; fontFamily: string; fontStyle: string };`;
  expect(fontViolations(declarations)).toEqual([]);
  expect(styleViolations(declarations)).toEqual([]);
  expect(styleViolations(`${declarations}\nconst s = { color: ink };`)).toEqual(['color']);
});

test('no file outside the font ratchet sets a font weight, family or style', () => {
  expect(violationsOutsideRatchet(fontFiles, FONT_RATCHET, fontViolations)).toEqual([]);
});

test('no file outside the style ratchet styles text, colour, borders or tappables itself', () => {
  expect(violationsOutsideRatchet(styleFiles, STYLE_RATCHET, styleViolations)).toEqual([]);
});

test('every ratchet entry still violates (the ratchet only shrinks)', () => {
  expect(staleRatchetEntries(fontFiles, FONT_RATCHET, fontViolations)).toEqual([]);
  expect(staleRatchetEntries(styleFiles, STYLE_RATCHET, styleViolations)).toEqual([]);
});

test('ratchet validation rejects deleted paths and cleaned files', () => {
  expect(staleRatchetEntries(fontFiles, new Set(['deleted.tsx']), fontViolations))
    .toEqual(['deleted.tsx: missing or outside guard scope']);
  expect(staleRatchetEntries(fontFiles, new Set(['types/ItemSet.ts']), fontViolations))
    .toEqual(['types/ItemSet.ts: no longer violates; remove ratchet entry']);
});

test('theme contains only its canonical files and their tests', () => {
  const entries = fs.readdirSync(path.join(ROOT, 'theme'), { withFileTypes: true });
  expect(entries.map(entry => entry.name).sort()).toEqual([
    'AssessmentTheme.tsx', '__tests__', 'tokens.ts', 'typography.ts',
  ]);
  for (const entry of entries) {
    expect(entry.name === '__tests__' ? entry.isDirectory() : entry.isFile()).toBe(true);
  }
});
