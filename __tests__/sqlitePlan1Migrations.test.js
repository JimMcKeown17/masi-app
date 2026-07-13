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

const latestMigrationMatching = (pattern) => {
  const matches = readMigrations().filter(({ filename }) => pattern.test(filename));
  return matches[matches.length - 1];
};

const compactSql = (sql) => sql.replace(/\s+/g, ' ').trim();

const policyBlock = (sql, policyName) => {
  const start = sql.indexOf(`create policy ${policyName}`);
  if (start === -1) return '';
  const rest = sql.slice(start);
  const next = rest.slice(1).search(/\ncreate policy /);
  return next === -1 ? rest : rest.slice(0, next + 1);
};

describe('Plan 1 SQLite Supabase migrations', () => {
  test('avoid policy string replacement when changing RLS policies', () => {
    const allSql = readMigrations().map(({ sql }) => sql).join('\n');

    expect(allSql).not.toMatch(/\bpg_policies\b/i);
    expect(allSql).not.toMatch(/\breplace\s*\(/i);
  });

  test('staff programme assignments enforce one active programme per user', () => {
    const allSql = readMigrations().map(({ sql }) => sql).join('\n');

    expect(allSql).toMatch(
      /create unique index[\s\S]+on public\.staff_programme_assignments\s*\(\s*user_id\s*\)[\s\S]+where ended_at is null/i
    );
  });

  test('RLS advisor cleanup revokes public execute and caches auth.uid in policies', () => {
    const cleanup = latestMigrationMatching(/rls_advisor_cleanup/);

    expect(cleanup).toBeDefined();
    expect(cleanup.sql).toMatch(/revoke execute on function[\s\S]+from public/i);

    const authUidCalls = cleanup.sql.match(/auth\.uid\(\)/g) || [];
    const cachedAuthUidCalls = cleanup.sql.match(/\(select auth\.uid\(\)\)/g) || [];

    expect(authUidCalls.length).toBeGreaterThan(0);
    expect(authUidCalls).toHaveLength(cachedAuthUidCalls.length);
  });

  test('RLS review fixes remove session SELECT recursion with private helpers', () => {
    const fix = latestMigrationMatching(/rls_review_fixes/);

    expect(fix).toBeDefined();
    expect(fix.sql).toMatch(/create or replace function private\.can_read_session\(/i);
    expect(fix.sql).toMatch(/create or replace function private\.can_read_session_attendee\(/i);
    expect(fix.sql).toMatch(/security definer/i);
    expect(fix.sql).toMatch(/set search_path = ''/i);

    expect(policyBlock(fix.sql, 'sessions_select_own_or_assigned_child_history'))
      .not.toMatch(/from public\.session_attendees/i);
    expect(policyBlock(fix.sql, 'session_attendees_select_assigned_child_history'))
      .not.toMatch(/from public\.sessions/i);
  });

  test('session upsert visibility keeps direct owner SELECT fallback', () => {
    const fix = latestMigrationMatching(/session_upsert_visibility/);

    expect(fix).toBeDefined();
    expect(fix.sql).toMatch(/drop policy if exists sessions_select_own_or_assigned_child_history on public\.sessions/i);
    expect(policyBlock(fix.sql, 'sessions_select_own_or_assigned_child_history'))
      .toMatch(/user_id = \(select auth\.uid\(\)\)[\s\S]+private\.can_read_session\(id\)/i);
    expect(policyBlock(fix.sql, 'sessions_select_own_or_assigned_child_history'))
      .not.toMatch(/from public\.session_attendees/i);
  });

  test('RLS review fixes enforce handover-sensitive writes', () => {
    const fix = latestMigrationMatching(/rls_review_fixes/);

    expect(fix).toBeDefined();
    expect(fix.sql).toMatch(
      /create or replace function private\.has_active_session_attendee_assignment[\s\S]+public\.session_attendees[\s\S]+public\.child_ea_assignments[\s\S]+unassigned_at is null/i
    );
    expect(policyBlock(fix.sql, 'sessions_update_active_assignment_after_attendee'))
      .toMatch(/private\.has_active_session_attendee_assignment\(id\)/i);
    expect(policyBlock(fix.sql, 'sessions_delete_active_assignment_after_attendee'))
      .toMatch(/private\.has_active_session_attendee_assignment\(id\)/i);

    expect(policyBlock(fix.sql, 'assessments_update_active_assignment'))
      .toMatch(/with check[\s\S]+public\.child_ea_assignments[\s\S]+public\.staff_programme_assignments/i);
    expect(policyBlock(fix.sql, 'letter_mastery_update_active_assignment'))
      .toMatch(/with check[\s\S]+public\.child_ea_assignments[\s\S]+public\.staff_programme_assignments/i);
  });

  test('assignment and attendee review fixes close child access escalation gaps', () => {
    const fix = latestMigrationMatching(/assignment_attendee_fixes/);

    expect(fix).toBeDefined();
    expect(fix.sql).toMatch(/drop policy if exists child_ea_assignments_update_own/i);
    expect(fix.sql).toMatch(/drop policy if exists child_ea_assignments_delete_own/i);
    expect(policyBlock(fix.sql, 'child_ea_assignments_update_own')).toBe('');
    expect(policyBlock(fix.sql, 'child_ea_assignments_delete_own')).toBe('');

    expect(fix.sql).toMatch(/create or replace function private\.can_modify_session_attendee/i);
    expect(policyBlock(fix.sql, 'session_attendees_update_own_session_active_assignment'))
      .toMatch(/private\.can_modify_session_attendee\(session_id, child_id\)/i);
    expect(policyBlock(fix.sql, 'session_attendees_delete_own_session_active_assignment'))
      .toMatch(/private\.can_modify_session_attendee\(session_id, child_id\)/i);
  });

  test('assignment insert recursion fix uses a private helper instead of querying children from the policy', () => {
    const fix = latestMigrationMatching(/assignment_insert_recursion_fix/);

    expect(fix).toBeDefined();
    expect(fix.sql).toMatch(/create or replace function private\.can_insert_child_ea_assignment/i);
    expect(fix.sql).toMatch(/security definer/i);
    expect(fix.sql).toMatch(/set search_path = ''/i);
    expect(policyBlock(fix.sql, 'child_ea_assignments_insert_created_child'))
      .toMatch(/private\.can_insert_child_ea_assignment\(child_id, user_id, created_by\)/i);
    expect(policyBlock(fix.sql, 'child_ea_assignments_insert_created_child'))
      .not.toMatch(/from public\.children/i);
  });

  test('Zazi alignment migration adds the missing longitudinal schema', () => {
    const alignment = latestMigrationMatching(/zazi_alignment_schema/);

    expect(alignment).toBeDefined();

    [
      'academic_years',
      'assessment_windows',
      'teachers',
      'class_ea_assignments',
      'group_ea_assignments',
      'grouping_versions',
      'class_grouping_state',
      'child_class_memberships',
    ].forEach((tableName) => {
      expect(alignment.sql).toMatch(
        new RegExp(`create table if not exists public\\.${tableName}\\b`, 'i')
      );
      expect(alignment.sql).toMatch(
        new RegExp(`alter table public\\.${tableName} enable row level security`, 'i')
      );
    });

    expect(alignment.sql).toMatch(/alter table public\.classes[\s\S]+academic_year_id[\s\S]+teacher_id[\s\S]+archived_at/i);
    expect(alignment.sql).toMatch(/alter table public\.children[\s\S]+archived_at[\s\S]+archive_reason/i);
    expect(alignment.sql).toMatch(/alter table public\.groups[\s\S]+grouping_version_id[\s\S]+display_number[\s\S]+archived_at/i);
    expect(alignment.sql).toMatch(/alter table public\.child_group_memberships[\s\S]+grouping_version_id/i);
    expect(alignment.sql).toMatch(/alter table public\.assessments[\s\S]+assessment_window_id[\s\S]+assessment_purpose[\s\S]+grade_snapshot[\s\S]+teacher_name_snapshot/i);
    expect(alignment.sql).toMatch(/alter table public\.session_attendees[\s\S]+grade_snapshot/i);
    expect(alignment.sql).toMatch(/alter table public\.letter_mastery[\s\S]+deleted_at/i);
  });

  test('Zazi alignment migration locks year, window, grouping, and mastery invariants', () => {
    const alignment = latestMigrationMatching(/zazi_alignment_schema/);

    expect(alignment).toBeDefined();

    expect(alignment.sql).toMatch(
      /create unique index if not exists idx_academic_years_active_unique[\s\S]+on public\.academic_years\s*\(\s*\(1\)\s*\)[\s\S]+where is_active = true/i
    );
    expect(alignment.sql).toMatch(/create or replace function private\.ensure_active_year_baseline_window/i);
    expect(alignment.sql).toMatch(/create trigger ensure_active_year_baseline_window_trigger/i);
    expect(alignment.sql).toMatch(
      /constraint assessment_windows_unique_window unique \(academic_year_id, window_type\)/i
    );
    expect(alignment.sql).toMatch(
      /add constraint assessments_window_purpose_chk check[\s\S]+assessment_purpose = 'official_window'[\s\S]+assessment_window_id is not null[\s\S]+assessment_purpose <> 'official_window'[\s\S]+assessment_window_id is null/i
    );
    expect(alignment.sql).toMatch(
      /create unique index if not exists idx_grouping_versions_active_unique[\s\S]+on public\.grouping_versions\(class_id, academic_year_id\)[\s\S]+where status = 'active'/i
    );
    expect(alignment.sql).toMatch(/drop index if exists idx_child_group_memberships_active_unique/i);
    expect(alignment.sql).toMatch(
      /create unique index if not exists idx_child_group_memberships_active_by_version[\s\S]+on public\.child_group_memberships\(child_id, grouping_version_id\)[\s\S]+where removed_at is null/i
    );
    expect(alignment.sql).toMatch(/drop index if exists idx_letter_mastery_unique_active/i);
    expect(alignment.sql).toMatch(
      /create unique index if not exists idx_letter_mastery_unique_active[\s\S]+on public\.letter_mastery\(user_id, child_id, programme_id, letter, language, source\)[\s\S]+where deleted_at is null/i
    );
  });

  test('Zazi alignment migration uses a three-path child write helper with stale-membership guards', () => {
    const alignment = latestMigrationMatching(/zazi_alignment_schema/);
    const sql = compactSql(alignment?.sql || '');

    expect(alignment).toBeDefined();
    expect(sql).toMatch(/create or replace function private\.current_user_can_write_for_child\(p_child_id uuid\)/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = ''/i);
    expect(sql).toMatch(/from public\.child_ea_assignments cea where cea\.child_id = p_child_id and cea\.user_id = \(select auth\.uid\(\)\) and cea\.unassigned_at is null/i);
    expect(sql).toMatch(/from public\.class_ea_assignments cls join public\.child_class_memberships ccm on ccm\.class_id = cls\.class_id and ccm\.exited_at is null where ccm\.child_id = p_child_id and cls\.ea_user_id = \(select auth\.uid\(\)\) and cls\.unassigned_at is null/i);
    expect(sql).toMatch(/from public\.group_ea_assignments grp join public\.child_group_memberships cgm on cgm\.group_id = grp\.group_id and cgm\.removed_at is null where cgm\.child_id = p_child_id and grp\.ea_user_id = \(select auth\.uid\(\)\) and grp\.unassigned_at is null/i);

    [
      'session_attendees_insert_active_assignment',
      'session_attendees_update_own_session_active_assignment',
      'session_attendees_delete_own_session_active_assignment',
      'assessments_insert_active_assignment',
      'assessments_update_active_assignment',
      'assessments_delete_active_assignment',
      'assessment_items_insert_own_active_assessment',
      'assessment_items_update_own_active_assessment',
      'assessment_items_delete_own_active_assessment',
      'letter_mastery_insert_active_assignment',
      'letter_mastery_update_active_assignment',
      'letter_mastery_delete_active_assignment',
    ].forEach((policyName) => {
      expect(policyBlock(alignment.sql, policyName))
        .toMatch(/private\.current_user_can_write_for_child/i);
    });
  });

  test('Zazi alignment seed includes active year, baseline window, and school list', () => {
    const alignment = latestMigrationMatching(/zazi_alignment_schema/);

    expect(alignment).toBeDefined();
    expect(alignment.sql).toMatch(/insert into public\.academic_years[\s\S]+'2026'[\s\S]+'2026-01-15'[\s\S]+'2026-12-15'[\s\S]+true/i);
    expect(alignment.sql).toMatch(/insert into public\.assessment_windows[\s\S]+'2026 Baseline'[\s\S]+'baseline'[\s\S]+'2026-01-15'[\s\S]+'2026-03-15'/i);
    expect(alignment.sql).toMatch(/School rows generated from scripts\/masi-schools-db-apr26\.csv: 325/i);
    expect(alignment.sql).toMatch(/Aaron Gqadu/i);
  });

  test('Zazi alignment migration keeps explicitly skipped Zazi tables out of Masi', () => {
    const allSql = readMigrations().map(({ sql }) => sql).join('\n');

    [
      'education_assistants',
      'child_school_enrollments',
      'staff_identity_links',
      'teacher_school_assignments',
      'class_teacher_assignments',
      'staff_children',
      'children_groups',
    ].forEach((tableName) => {
      expect(allSql).not.toMatch(new RegExp(`\\b${tableName}\\b`, 'i'));
    });
  });

  test('child delete guard removes direct child DELETE and routes no-history deletes through RPC', () => {
    const fix = latestMigrationMatching(/child_delete_guard/);

    expect(fix).toBeDefined();
    expect(fix.sql).toMatch(/drop policy if exists children_delete_active_assignment_or_creator on public\.children/i);
    expect(fix.sql).toMatch(/revoke delete on public\.children from authenticated/i);
    expect(fix.sql).toMatch(/create or replace function private\.delete_child_if_no_history\(p_child_id uuid\)/i);
    expect(fix.sql).toMatch(/language plpgsql[\s\S]+security definer[\s\S]+set search_path = ''/i);
    expect(fix.sql).toMatch(/create or replace function public\.delete_child_if_no_history\(p_child_id uuid\)/i);
    expect(fix.sql).toMatch(/grant execute on function public\.delete_child_if_no_history\(uuid\) to authenticated/i);

    expect(policyBlock(fix.sql, 'children_delete_active_assignment_or_creator')).toBe('');
  });

  test('child delete RPC blocks real history before deleting relationship rows', () => {
    const fix = latestMigrationMatching(/child_delete_guard/);
    const sql = compactSql(fix?.sql || '');

    expect(fix).toBeDefined();
    expect(sql).toMatch(/from public\.session_attendees where child_id = p_child_id/i);
    expect(sql).toMatch(/from public\.assessments where child_id = p_child_id/i);
    expect(sql).toMatch(/from public\.letter_mastery where child_id = p_child_id/i);
    expect(sql).toMatch(/from public\.child_group_memberships where child_id = p_child_id/i);
    expect(sql).toMatch(/from public\.child_ea_assignments where child_id = p_child_id and unassigned_at is not null/i);
    expect(sql).toMatch(/from public\.child_programme_enrollments where child_id = p_child_id and ended_at is not null/i);
    expect(sql).toMatch(/from public\.child_class_memberships where child_id = p_child_id and exited_at is not null/i);

    expect(sql).toMatch(/delete from public\.child_class_memberships where child_id = p_child_id/i);
    expect(sql).toMatch(/delete from public\.child_programme_enrollments where child_id = p_child_id/i);
    expect(sql).toMatch(/delete from public\.child_ea_assignments where child_id = p_child_id/i);
    expect(sql).toMatch(/delete from public\.children where id = p_child_id/i);
  });

  test('idempotent child delete migration returns success for an absent child before authorization', () => {
    const migration = readMigrations().find(({ filename }) => (
      filename === '20260712202409_masi_idempotent_child_delete.sql'
    ));
    const sql = compactSql(migration?.sql || '');

    expect(migration).toBeDefined();
    expect(sql).toMatch(/language plpgsql[\s\S]+security definer[\s\S]+set search_path = ''/i);
    expect(sql).toMatch(
      /if not exists \( select 1 from public\.children c where c\.id = p_child_id \) then return true; end if;[\s\S]+if not exists \([\s\S]+c\.created_by = \(select auth\.uid\(\)\)[\s\S]+raise exception 'Not authorized to delete child %'/i
    );
  });

  test('class EA assignment policy supports admin-precreated classes in the actor school', () => {
    const alignment = latestMigrationMatching(/zazi_alignment_schema/);
    const policy = policyBlock(alignment.sql, 'class_ea_assignments_insert_self');

    expect(policy).toMatch(/private\.current_user_can_access_class\(class_id\)/i);
    expect(policy).not.toMatch(/c\.created_by = \(select auth\.uid\(\)\)/i);
  });

  test('RLS contract cleanup closes assignment archive, class write, read-helper, and grant drift', () => {
    const fix = latestMigrationMatching(/rls_contract_cleanup/);
    const sql = compactSql(fix?.sql || '');

    expect(fix).toBeDefined();

    expect(sql).toMatch(/create or replace function private\.prevent_assignment_identity_change\(\)/i);
    [
      'child_ea_assignments',
      'class_ea_assignments',
      'group_ea_assignments',
    ].forEach((tableName) => {
      expect(sql).toMatch(
        new RegExp(`create trigger ${tableName}_prevent_identity_change[\\s\\S]+before update on public\\.${tableName}`, 'i')
      );
      expect(sql).toMatch(
        new RegExp(`drop policy if exists ${tableName}_delete`, 'i')
      );
      expect(sql).toMatch(
        new RegExp(`revoke delete on public\\.${tableName} from authenticated`, 'i')
      );
    });

    expect(policyBlock(fix.sql, 'child_ea_assignments_update_self_archive'))
      .toMatch(/for update to authenticated[\s\S]+user_id = \(select auth\.uid\(\)\)[\s\S]+with check[\s\S]+user_id = \(select auth\.uid\(\)\)/i);
    expect(policyBlock(fix.sql, 'class_ea_assignments_update_self'))
      .toMatch(/for update to authenticated[\s\S]+ea_user_id = \(select auth\.uid\(\)\)[\s\S]+with check[\s\S]+ea_user_id = \(select auth\.uid\(\)\)/i);
    expect(policyBlock(fix.sql, 'group_ea_assignments_update_self'))
      .toMatch(/for update to authenticated[\s\S]+ea_user_id = \(select auth\.uid\(\)\)[\s\S]+with check[\s\S]+ea_user_id = \(select auth\.uid\(\)\)/i);

    expect(policyBlock(fix.sql, 'classes_update_assigned_ea'))
      .toMatch(/private\.current_user_can_write_for_class\(id\)/i);
    expect(policyBlock(fix.sql, 'classes_delete_assigned_ea'))
      .toMatch(/private\.current_user_can_write_for_class\(id\)/i);

    expect(policyBlock(fix.sql, 'assessments_select_assigned_child_history'))
      .toMatch(/private\.current_user_can_read_child\(child_id\)/i);
    expect(policyBlock(fix.sql, 'assessment_items_select_visible_assessment'))
      .toMatch(/private\.current_user_can_read_child\(a\.child_id\)/i);
    expect(policyBlock(fix.sql, 'letter_mastery_select_assigned_child_history'))
      .toMatch(/private\.current_user_can_read_child\(child_id\)/i);

    expect(sql).toMatch(/drop policy if exists children_select_created_by on public\.children/i);
    expect(sql).toMatch(/drop policy if exists classes_select_created_by on public\.classes/i);
    expect(sql).toMatch(/drop policy if exists groups_select_created_by on public\.groups/i);

    [
      'schools',
      'job_titles',
      'programmes',
      'academic_years',
      'assessment_windows',
      'assessment_tools',
      'teachers',
      'staff_programme_assignments',
      'users',
    ].forEach((tableName) => {
      expect(sql).toMatch(
        new RegExp(`revoke insert, update, delete on public\\.${tableName} from authenticated`, 'i')
      );
    });
  });

  test('creator SELECT policies stay present for mobile upsert visibility', () => {
    const fix = latestMigrationMatching(/creator_select_upsert_visibility/);

    expect(fix).toBeDefined();
    [
      'children',
      'classes',
      'groups',
    ].forEach((tableName) => {
      expect(fix.sql).toMatch(
        new RegExp(`drop policy if exists ${tableName}_select_created_by on public\\.${tableName}`, 'i')
      );
      expect(policyBlock(fix.sql, `${tableName}_select_created_by`))
        .toMatch(/for select to authenticated[\s\S]+created_by = \(select auth\.uid\(\)\)/i);
    });
  });

  test('RLS grant cleanup removes non-DML table privileges from app roles', () => {
    const fix = latestMigrationMatching(/rls_grant_cleanup/);
    const sql = compactSql(fix?.sql || '');

    expect(fix).toBeDefined();
    expect(sql).toMatch(
      /revoke truncate, references, trigger on all tables in schema public from public, anon, authenticated/i
    );
    expect(sql).toMatch(
      /revoke insert, update, delete, truncate, references, trigger on public\.schools from authenticated/i
    );
    expect(sql).toMatch(
      /revoke insert, update, delete, truncate, references, trigger on public\.staff_programme_assignments from authenticated/i
    );
    expect(sql).toMatch(/grant select on public\.schools to authenticated/i);
    expect(sql).toMatch(/grant select on public\.staff_programme_assignments to authenticated/i);
  });
});
