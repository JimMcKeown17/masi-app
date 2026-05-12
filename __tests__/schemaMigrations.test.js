const fs = require('fs');
const path = require('path');

const readMigration = (filename) => (
  fs.readFileSync(path.join(__dirname, '..', 'supabase-migrations', filename), 'utf8')
);

describe('schema hardening migrations', () => {
  test('migration 14 locks down profile self-updates instead of recreating them', () => {
    const migration = readMigration('14_create_lookups_and_fks.sql');
    const policyBlock = migration.slice(migration.indexOf('DROP POLICY IF EXISTS "Users can update own profile"'));

    expect(policyBlock).toContain('DROP POLICY IF EXISTS "Users can update own profile" ON public.users;');
    expect(policyBlock).not.toMatch(/CREATE\s+POLICY\s+"Users can update own profile"/i);
  });

  test('corrective migration drops the restored profile self-update policy', () => {
    expect(readMigration('16b_drop_users_self_update_policy.sql'))
      .toContain('DROP POLICY IF EXISTS "Users can update own profile" ON public.users;');
  });
});
