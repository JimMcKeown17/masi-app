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

describe('upload contract forward-only time entries', () => {
  test('guards owner inserts and updates and preserves only the five clock-out fields', () => {
    const sql = readMigration();
    expect(sql).toMatch(/create trigger time_entries_forward_only\s+before insert or update on public\.time_entries\s+for each row execute function private\.time_entries_forward_only\(\)/i);
    expect(sql).toMatch(/drop trigger if exists time_entries_forward_only on public\.time_entries/i);
    const body = sql.match(/create or replace function private\.time_entries_forward_only\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/i)?.[1];
    expect(body).toBeDefined();
    expect(body).toMatch(/auth\.uid\(\) = new\.user_id/i);
    expect(body).toMatch(/auth\.uid\(\) = old\.user_id/i);
    expect(body).toMatch(/old\.auto_clocked_out\s+and old\.sign_out_time = old\.sign_in_time \+ interval '10 hours'/i);
    for (const column of ['sign_out_time', 'sign_out_lat', 'sign_out_lon', 'sign_out_location_status', 'auto_clocked_out']) {
      expect(body).toContain(`new.${column} := old.${column};`);
    }
    expect([...body.matchAll(/new\.(\w+)\s*:=/gi)].map((match) => match[1])).toEqual(expect.arrayContaining([
      'sign_out_time', 'sign_out_lat', 'sign_out_lon', 'sign_out_location_status', 'auto_clocked_out',
    ]));
    expect(body).not.toMatch(/new\.(?!sign_out_time\b|sign_out_lat\b|sign_out_lon\b|sign_out_location_status\b|auto_clocked_out\b)\w+\s*:=/i);
    expect(body).not.toMatch(/return null|raise exception/i);
    expect(body).toMatch(/return new;/i);
    expect(sql).toMatch(/revoke execute on function private\.time_entries_forward_only\(\) from public, anon, authenticated/i);
  });

  test('closes only overdue open entries at ten hours and returns the affected count', () => {
    const sql = readMigration();
    expect(sql).toMatch(/create or replace function private\.close_overdue_time_entries\(\)\s+returns integer\s+language plpgsql\s+set search_path = ''/i);
    const body = sql.match(/create or replace function private\.close_overdue_time_entries\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/i)?.[1];
    expect(body).toBeDefined();
    expect(body).toMatch(/update public\.time_entries\s+set sign_out_time = sign_in_time \+ interval '10 hours'/i);
    expect(body).toMatch(/auto_clocked_out = true/i);
    for (const column of ['sign_out_lat', 'sign_out_lon', 'sign_out_location_status']) {
      expect(body).toContain(`${column} = null`);
    }
    expect(body).toMatch(/where sign_out_time is null\s+and sign_in_time < (?:pg_catalog\.)?now\(\) - interval '10 hours'/i);
    expect(body).toMatch(/get diagnostics \w+ = row_count;/i);
    expect(body).toMatch(/return \w+;/i);
    expect(sql).toMatch(/revoke execute on function private\.close_overdue_time_entries\(\) from public, anon, authenticated, service_role/i);
  });

  test('installs and schedules cron only where the extension is offered in postgres', () => {
    expect(readMigration()).toMatch(/do \$\$\s+begin\s+if exists \(select 1 from pg_available_extensions where name = 'pg_cron'\) and\s+current_database\(\) = 'postgres' then\s+create extension if not exists pg_cron;\s+execute \$\w*\$\s*select cron\.schedule\(\s*'masi_close_overdue_time_entries',\s*'\*\/15 \* \* \* \*',\s*'select private\.close_overdue_time_entries\(\);'\s*\);?\s*\$\w*\$;\s+end if;\s+end;\s+\$\$;/i);
  });

  test('keeps schema reload and timeout resets last', () => {
    expect(readMigration()).toMatch(/notify pgrst, 'reload schema';\s+reset statement_timeout;\s+reset lock_timeout;\s*$/i);
  });
});
