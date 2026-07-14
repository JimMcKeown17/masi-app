const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260714220000_server_authoritative_reconcile_acknowledgments.sql'
);

describe('server-authoritative reconcile acknowledgment migration', () => {
  test('exposes a least-privilege authenticated RPC with every reconciled relationship set', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/function private\.get_reconcile_acknowledgments\(\)[\s\S]+security definer[\s\S]+set search_path = ''/i);
    expect(sql).toMatch(/v_user_id uuid := \(select auth\.uid\(\)\)/i);
    expect(sql).toMatch(/errcode = '42501'/i);
    expect(sql).toMatch(/function public\.get_reconcile_acknowledgments\(\)[\s\S]+security invoker[\s\S]+select private\.get_reconcile_acknowledgments\(\)/i);
    expect(sql).toMatch(/revoke all on function public\.get_reconcile_acknowledgments\(\) from public, anon/i);
    expect(sql).toMatch(/grant execute on function public\.get_reconcile_acknowledgments\(\) to authenticated/i);

    for (const index of [
      'idx_class_ea_assignments_reconcile_snapshot',
      'idx_group_ea_assignments_reconcile_snapshot',
      'idx_child_group_memberships_active_group',
    ]) {
      expect(sql).toContain(index);
    }

    for (const table of [
      'staff_programme_assignments',
      'child_ea_assignments',
      'child_programme_enrollments',
      'child_class_memberships',
      'class_ea_assignments',
      'group_ea_assignments',
      'child_group_memberships',
    ]) {
      expect(sql).toContain(`public.${table}`);
    }

    for (const key of [
      'schema_version',
      'complete',
      'user_id',
      'active_programme_id',
      'child_ea_assignment_ids',
      'assigned_child_ids',
      'visible_child_ids',
      'child_programme_enrollment_ids',
      'child_class_membership_ids',
      'class_ea_assignment_ids',
      'class_ids',
      'group_ea_assignment_ids',
      'group_ids',
      'child_group_membership_ids',
    ]) {
      expect(sql).toContain(`'${key}'`);
    }
  });
});
