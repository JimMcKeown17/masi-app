global.__MASI_NO_DEFAULT_HANDLE__ = true;
const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname, '..', 'supabase', 'migrations', '20261018180000_upload_contract_row_version.sql'
);
const readMigration = () => fs.readFileSync(migrationPath, 'utf8');
const tables = [
  'children', 'classes', 'groups',
  'child_ea_assignments', 'class_ea_assignments', 'group_ea_assignments',
  'child_programme_enrollments', 'child_class_memberships', 'child_group_memberships',
  'grouping_versions', 'class_grouping_state',
];

describe('upload contract row version Supabase migration', () => {
  test.each(tables)('adds a version and an update trigger to %s', (table) => {
    const sql = readMigration();
    expect(sql).toMatch(new RegExp(
      `alter table public\\.${table}\\s+add column if not exists row_version bigint not null default 1`, 'i'
    ));
    expect(sql).toMatch(new RegExp(
      `drop trigger if exists ${table}_enforce_row_version on public\\.${table}`, 'i'
    ));
    expect(sql).toMatch(new RegExp(
      `create trigger ${table}_enforce_row_version\\s+before update on public\\.${table}\\s+for each row execute function private\\.enforce_row_version\\(\\)`, 'i'
    ));
  });

  test('rejects lower versions with MV001 and returns accepted rows unchanged', () => {
    const sql = readMigration();
    expect(sql).toMatch(/create or replace function private\.enforce_row_version\(\)\s+returns trigger\s+language plpgsql\s+set search_path = ''/i);
    expect(sql).toMatch(/if new\.row_version < old\.row_version then\s+raise exception using/i);
    expect(sql).toMatch(/errcode = 'MV001'/);
    expect(sql).toMatch(/message = 'stale_version'/i);
    expect(sql).toMatch(/detail = format\([^;]*tg_table_name[^;]*new\.id[^;]*new\.row_version[^;]*old\.row_version\)/i);
    expect(sql).toMatch(/end if;\s+return new;/i);
    expect(sql).not.toMatch(/return null/i);
  });

  test('revokes direct execution from API roles', () => {
    expect(readMigration()).toMatch(
      /revoke execute on function private\.enforce_row_version\(\) from public, anon, authenticated/i
    );
  });

  test('does not install the version rule on history, time entries or mastery', () => {
    const sql = readMigration();
    for (const table of [
      'time_entries', 'sessions', 'session_attendees', 'assessments', 'assessment_items', 'letter_mastery',
    ]) {
      expect(sql).not.toMatch(new RegExp(`create trigger ${table}_enforce_row_version`, 'i'));
    }
    expect(sql.match(/create trigger \w+_enforce_row_version/gi)).toHaveLength(11);
  });

  test('reloads PostgREST without transaction-local settings', () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/set local/i);
    expect(sql).toMatch(/notify pgrst, 'reload schema'/i);
  });
});
