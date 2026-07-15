const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');

const matchingMigrations = () => (
  fs.readdirSync(migrationsDir)
    .filter((filename) => /sync_relationship_indexes/.test(filename))
    .sort()
);

describe('sync relationship indexes Supabase migration', () => {
  test('adds sparse indexes for the three nullable session relationships', () => {
    const filenames = matchingMigrations();
    expect(filenames).toHaveLength(1);

    const sql = fs.readFileSync(path.join(migrationsDir, filenames[0]), 'utf8');
    expect(sql).toMatch(
      /create index if not exists idx_sessions_class_id\s+on public\.sessions\s*\(class_id\)\s+where class_id is not null/i
    );
    expect(sql).toMatch(
      /create index if not exists idx_sessions_group_id\s+on public\.sessions\s*\(group_id\)\s+where group_id is not null/i
    );
    expect(sql).toMatch(
      /create index if not exists idx_session_attendees_group_id\s+on public\.session_attendees\s*\(group_id\)\s+where group_id is not null/i
    );
  });

  test('does not guess at updated_at indexes before delta-pull predicates exist', () => {
    const [filename] = matchingMigrations();
    expect(filename).toBeDefined();

    const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    expect(sql).not.toMatch(/on public\.\w+\s*\([^)]*updated_at/i);
  });
});
