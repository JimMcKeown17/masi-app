const IMPORT_PATTERNS: RegExp[] = [
  /from\s+['"]([^'"]+)['"]/g,
  /import\s+['"]([^'"]+)['"]/g,
  /import\s*\(\s*['"]([^'"]+)['"]/g,
  /require\s*\(\s*['"]([^'"]+)['"]/g,
];

const FORBIDDEN_PATTERNS: RegExp[] = [
  /^@supabase\//,
  /^@react-native-community\//,
  /^@react-native-async-storage\//,
  /^expo-/,
  /^expo$/,
  /(^|\/)services(\/|$)/,
  /(^|\/)repositories(\/|$)/,
  /(^|\/)screens(\/|$)/,
  /(^|\/)db(\/|$)/,
  /(^|\/)config(\/|$)/,
  /(^|\/)context(\/|$)/,
];

export function findForbiddenImports(code: string): string[] {
  const offenders: string[] = [];
  for (const pat of IMPORT_PATTERNS) {
    pat.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pat.exec(code)) !== null) {
      const spec = match[1];
      if (FORBIDDEN_PATTERNS.some((p) => p.test(spec))) {
        offenders.push(spec);
      }
    }
  }
  return offenders;
}
