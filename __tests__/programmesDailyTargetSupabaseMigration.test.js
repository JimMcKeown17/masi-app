const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');

const readMigrations = () => (
  fs.readdirSync(migrationsDir)
    .filter((filename) => filename.endsWith('.sql'))
    .sort()
    .map((filename) => ({
      filename,
      sql: fs.readFileSync(path.join(migrationsDir, filename), 'utf8'),
    }))
);

const latestMatching = (pattern) => {
  const matches = readMigrations().filter(({ filename }) => pattern.test(filename));
  return matches[matches.length - 1];
};

describe('programmes daily-session-target Supabase migration', () => {
  const migration = latestMatching(/programmes_daily_session_target/);

  test('exists', () => {
    expect(migration).toBeDefined();
  });

  test('adds both columns additively (idempotent)', () => {
    expect(migration.sql).toMatch(/add column if not exists daily_session_target integer/i);
    expect(migration.sql).toMatch(/add column if not exists daily_session_ceiling integer/i);
  });

  test('seeds per-programme targets for the known programmes', () => {
    const sql = migration.sql;
    // numeracy = 5, yeboneer = 1, one_thousand_stories = no target (left NULL)
    expect(sql).toMatch(/numeracy/);
    expect(sql).toMatch(/yeboneer/);
    expect(sql).toMatch(/one_thousand_stories/);
  });
});
