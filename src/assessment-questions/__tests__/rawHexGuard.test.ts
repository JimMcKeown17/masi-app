import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const ALLOWED = new Set([path.join(ROOT, 'theme', 'tokens.ts')]);
const HEX_IN_STRING = /['"`]#[0-9a-fA-F]{3,8}['"`]/;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

describe('raw hex guard', () => {
  test('no hex colour literals outside theme/tokens.ts', () => {
    const offenders = walk(ROOT)
      .filter((f) => !ALLOWED.has(f))
      .flatMap((f) =>
        fs.readFileSync(f, 'utf8').split('\n')
          .map((line, i) => (HEX_IN_STRING.test(line) ? `${path.relative(ROOT, f)}:${i + 1}` : null))
          .filter((x): x is string => x !== null),
      );
    expect(offenders).toEqual([]);
  });
});
