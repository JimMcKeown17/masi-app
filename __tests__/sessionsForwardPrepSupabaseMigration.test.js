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

describe('sessions forward-prep Supabase migration', () => {
  const migration = latestMatching(/sessions_forward_prep_columns/);

  test('exists', () => {
    expect(migration).toBeDefined();
  });

  test('adds group_id and state additively (idempotent)', () => {
    expect(migration.sql).toMatch(/add column if not exists group_id uuid references public\.groups\(id\)/i);
    expect(migration.sql).toMatch(/add column if not exists state text not null default 'completed'/i);
  });

  test('constrains state to the allowed set', () => {
    expect(migration.sql).toMatch(
      /check \(state in \('completed', 'in_progress', 'paused', 'discarded'\)\)/i
    );
  });
});
