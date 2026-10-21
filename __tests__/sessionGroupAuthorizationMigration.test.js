global.__MASI_NO_DEFAULT_HANDLE__ = true;
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

const migration = latestMatching(/session_group_authorization/);
const migrationSql = () => {
  if (!migration) {
    throw new Error('No session_group_authorization migration found');
  }
  return migration.sql;
};
const normalizedSql = () => migrationSql()
  .replace(/--.*$/gm, '')
  .replace(/\s+/g, ' ')
  .trim();
const policySql = (name) => {
  const match = normalizedSql().match(new RegExp(
    `create policy ${name}\\b([\\s\\S]*?);`,
    'i'
  ));
  expect(match).not.toBeNull();
  return match[0];
};

describe('session group authorization Supabase migration', () => {
  test('exists and sorts after the assessment-results contract', () => {
    expect(migration).toBeDefined();
    expect(
      migration.filename.localeCompare('20261021120000_assessment_results_contract.sql')
    ).toBeGreaterThan(0);
  });

  test('uses bounded session-level timeouts and resets them last', () => {
    const sql = normalizedSql();
    expect(sql).toMatch(/^SET lock_timeout = '10s'; SET statement_timeout = '60s';/i);
    expect(sql).toMatch(/RESET statement_timeout; RESET lock_timeout;$/i);
    expect(sql).not.toMatch(/\bSET LOCAL\b/i);
  });

  test('authorizes held assignments using the group programme as provenance', () => {
    const sql = normalizedSql();
    const functionMatch = sql.match(
      /create or replace function private\.current_user_has_held_group_assignment\(\s*p_group_id uuid, p_programme_id uuid\s*\)([\s\S]*?)\$\$;/i
    );

    expect(functionMatch).not.toBeNull();
    expect(functionMatch[0]).toMatch(/security definer/i);
    expect(functionMatch[0]).toMatch(/set search_path = ''/i);
    expect(functionMatch[1]).toMatch(/g\.programme_id = p_programme_id/i);
    expect(functionMatch[1]).toMatch(/gea\.ea_user_id = \(select auth\.uid\(\)\)/i);
    expect(functionMatch[1]).not.toMatch(/gea\.programme_id/i);
    expect(functionMatch[1]).not.toMatch(/unassigned_at/i);
    expect(sql).not.toMatch(
      /create or replace function private\.current_user_can_write_for_child/i
    );
  });

  test('limits helper execution to authenticated callers', () => {
    const sql = normalizedSql();
    expect(sql).toMatch(
      /revoke execute on function private\.current_user_has_held_group_assignment\(uuid, uuid\) from public, anon;/i
    );
    expect(sql).toMatch(
      /grant execute on function private\.current_user_has_held_group_assignment\(uuid, uuid\) to authenticated;/i
    );
  });

  test.each([
    'sessions_state_completed_group_held_insert',
    'sessions_state_completed_group_held_update',
    'session_attendees_group_held_insert',
    'session_attendees_group_held_update',
  ])('creates %s as a restrictive policy', (name) => {
    expect(policySql(name)).toMatch(/\bas restrictive\b/i);
  });

  test.each([
    'sessions_state_completed_group_held_insert',
    'sessions_state_completed_group_held_update',
  ])('%s keeps the completed-state guard', (name) => {
    expect(policySql(name)).toMatch(/state = 'completed'/i);
  });

  test.each([
    'sessions_state_completed_group_held_update',
    'session_attendees_group_held_update',
  ])('%s keeps existing rows eligible for the permissive update policy', (name) => {
    expect(policySql(name)).toMatch(/using \(true\)/i);
  });

  test('replaces the forward-prep pins only after all new guards exist', () => {
    const sql = normalizedSql().toLowerCase();
    const lastCreatePolicy = sql.lastIndexOf('create policy');

    expect(lastCreatePolicy).toBeGreaterThan(-1);
    expect(sql.indexOf(
      'drop policy if exists sessions_forward_prep_pin_defaults_insert',
      lastCreatePolicy
    )).toBeGreaterThan(lastCreatePolicy);
    expect(sql.indexOf(
      'drop policy if exists sessions_forward_prep_pin_defaults_update',
      lastCreatePolicy
    )).toBeGreaterThan(lastCreatePolicy);
  });

  test('refuses authenticated group hard deletes without removing service-role privileges', () => {
    const sql = normalizedSql();
    expect(sql).toMatch(/drop policy if exists groups_delete_created_by on public\.groups;/i);
    expect(sql).toMatch(/revoke delete on public\.groups from authenticated;/i);
    expect(sql).not.toMatch(/revoke[^;]*on public\.groups from[^;]*service_role/i);
  });

  test('keeps the session programme and group immutable with an idempotent identity trigger', () => {
    const sql = normalizedSql();
    const match = sql.match(/create or replace function private\.prevent_session_identity_change\(\)([\s\S]*?)\$\$;/i);
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(/returns trigger language plpgsql set search_path = ''/i);
    expect(match[1]).toMatch(/if new\.programme_id is distinct from old\.programme_id or new\.group_id is distinct from old\.group_id then/i);
    expect(match[1]).toMatch(/raise exception 'sessions programme_id and group_id cannot be changed after insert' using errcode = '23514';/i);
    expect(match[1]).toMatch(/end if; return new;/i);
    expect(sql).toMatch(/revoke execute on function private\.prevent_session_identity_change\(\) from public, anon, authenticated;/i);
    expect(sql).toMatch(/drop trigger if exists sessions_prevent_identity_change on public\.sessions; create trigger sessions_prevent_identity_change before update on public\.sessions for each row execute function private\.prevent_session_identity_change\(\);/i);
  });
});
