const fs = require('fs');
const path = require('path');

const collectScreenFiles = (dirPath) => (
  fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      return collectScreenFiles(fullPath);
    }

    if (!entry.isFile() || !entry.name.endsWith('.js')) {
      return [];
    }

    return path.relative(process.cwd(), fullPath).split(path.sep).join('/');
  })
);

const SCREEN_FILES = collectScreenFiles(path.join(process.cwd(), 'src/screens'));

describe('screen timer audit', () => {
  test('audits every screen file rather than a hand-maintained shortlist', () => {
    expect(SCREEN_FILES.length).toBeGreaterThan(4);
    expect(SCREEN_FILES).toEqual(expect.arrayContaining([
      'src/screens/assessments/AssessmentChildSelectScreen.js',
      'src/screens/main/HomeScreen.js',
    ]));
  });

  test('child and class write screens do not delay local-first navigation with setTimeout', () => {
    // Catches both inline (`setTimeout(() => navigation.goBack(), 500)`) and
    // braced-body (`setTimeout(() => { navigation.goBack(); }, 500)`) forms,
    // for both `goBack` and `navigate`. Bounded at 400 chars to keep matches
    // local to a single setTimeout callback rather than matching across
    // unrelated code.
    const DELAYED_NAVIGATION_PATTERN = /setTimeout\([\s\S]{0,400}?navigation\.(goBack|navigate)\s*\(/;

    const offenders = SCREEN_FILES.filter((filePath) => {
      const source = fs.readFileSync(path.join(process.cwd(), filePath), 'utf8');
      return DELAYED_NAVIGATION_PATTERN.test(source);
    });

    expect(offenders).toEqual([]);
  });
});
