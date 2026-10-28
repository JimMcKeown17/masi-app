global.__MASI_NO_DEFAULT_HANDLE__ = true;
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ ...require('../test-support/supabaseTestConfig'), supabase: {} }));
import fs from 'fs';
import path from 'path';
import { createHistoryStoreFixture } from '../test-support/assessmentHistoryStoreFixture';

const sourceFiles = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(dir, entry.name);
  return entry.isDirectory() ? sourceFiles(file) : file.endsWith('.js') ? [file] : [];
});
const root = path.resolve(__dirname, '..');
const files = sourceFiles(path.join(root, 'src'));
test('every history start belongs to the seven pinned trigger rows', () => {
  const actual = { sessionHistory: {}, assessmentHistory: {} };
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8'), relative = path.relative(root, file);
    for (const match of source.matchAll(/\b(sessionHistory|assessmentHistory)\.start\(/g)) {
      actual[match[1]][relative] = (actual[match[1]][relative] || 0) + 1;
    }
  }
  expect(actual).toEqual({
    sessionHistory: { 'src/context/ChildrenContext.js': 1, 'src/context/OfflineContext.js': 1, 'src/screens/sessions/SessionHistoryScreen.js': 1 },
    assessmentHistory: { 'src/context/ChildrenContext.js': 1, 'src/context/ClassesContext.js': 1, 'src/context/OfflineContext.js': 1, 'src/screens/assessments/AssessmentHistoryScreen.js': 1 },
  });
});
test('repositories, components, hooks, upload and lesson persistence never start history', () => {
  const forbidden = files.filter(file => /src\/(db\/repositories|components|hooks)\//.test(file)
    || /src\/services\/(offlineSync|lessonSave)\.js$/.test(file));
  for (const file of forbidden) {
    const relative = path.relative(root, file), source = fs.readFileSync(file, 'utf8');
    // Task 9's panel-only hook observes page versions; it must never start a pull.
    const pageObserver = relative === 'src/hooks/useLetterMasterySyncRefresh.js';
    const found = /sessionHistory\.start|assessmentHistory\.start/.test(source)
      || (!pageObserver && /assessmentHistory/.test(source));
    expect({ file: relative, found }).toEqual({ file: relative, found: false });
  }
});
test('fresh starts at +1, +7 and +14 minutes make no RPC; +16 minutes makes three delta calls', async () => {
  const initial = Date.parse('2026-10-21T09:00:00Z');
  let now = initial;
  const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
  const f = await createHistoryStoreFixture();
  try {
    const store = f.makeStore();
    await store.start({ userId: 'user-1' });
    expect(f.server.calls).toHaveLength(3);
    f.server.calls.length = 0;
    for (const minutes of [1, 7, 14]) {
      now = initial + minutes * 60_000;
      await store.start({ userId: 'user-1' });
      expect(f.server.calls).toEqual([]);
    }
    now = initial + 16 * 60_000;
    await store.start({ userId: 'user-1' });
    expect(f.server.calls.map(call => call.name)).toEqual(['get_battery_run_history_page', 'get_assessment_history_page', 'get_letter_mastery_page']);
  } finally { clock.mockRestore(); await f.db.closeAsync(); }
});
