const {
  buildCommandPlan,
  parseEnvContent,
  validateSqliteEnv,
} = require('../scripts/sqlite-staging.cjs');

describe('sqlite staging script helpers', () => {
  test('parses DB passwords with shell metacharacters without executing env content', () => {
    const parsed = parseEnvContent(`
SUPABASE_PROJECT_ID_SQLITE=segygjzpujphwvrubusm
SUPABASE_PROJECT_URL_SQLITE=https://segygjzpujphwvrubusm.supabase.co
SUPABASE_DB_PASSWORD_SQLITE=TD!PuwV2f^dBI
SUPABASE_PUBLISHABLE_KEY_SQLITE=sb_publishable_test
`);

    expect(parsed.SUPABASE_DB_PASSWORD_SQLITE).toBe('TD!PuwV2f^dBI');
  });

  test('requires every sqlite Supabase env var and checks URL/project match', () => {
    expect(() => validateSqliteEnv({
      SUPABASE_PROJECT_ID_SQLITE: 'segygjzpujphwvrubusm',
      SUPABASE_PROJECT_URL_SQLITE: 'https://different-ref.supabase.co',
      SUPABASE_DB_PASSWORD_SQLITE: 'secret',
      SUPABASE_PUBLISHABLE_KEY_SQLITE: 'sb_publishable_test',
    })).toThrow(/must be https:\/\/segygjzpujphwvrubusm\.supabase\.co/);

    expect(() => validateSqliteEnv({
      SUPABASE_PROJECT_ID_SQLITE: 'segygjzpujphwvrubusm',
      SUPABASE_PROJECT_URL_SQLITE: 'https://segygjzpujphwvrubusm.supabase.co',
      SUPABASE_DB_PASSWORD_SQLITE: 'secret',
    })).toThrow(/SUPABASE_PUBLISHABLE_KEY_SQLITE/);
  });

  test('rejects primary or malformed project URLs for sqlite staging commands', () => {
    expect(() => validateSqliteEnv({
      SUPABASE_PROJECT_ID_SQLITE: 'jcqrlwetutnpuchjoyyd',
      SUPABASE_PROJECT_URL_SQLITE: 'https://jcqrlwetutnpuchjoyyd.supabase.co',
      SUPABASE_DB_PASSWORD_SQLITE: 'secret',
      SUPABASE_PUBLISHABLE_KEY_SQLITE: 'sb_publishable_test',
    })).toThrow(/segygjzpujphwvrubusm/);

    expect(() => validateSqliteEnv({
      SUPABASE_PROJECT_ID_SQLITE: 'segygjzpujphwvrubusm',
      SUPABASE_PROJECT_URL_SQLITE: 'https://evil.example.com/segygjzpujphwvrubusm.supabase.co',
      SUPABASE_DB_PASSWORD_SQLITE: 'secret',
      SUPABASE_PUBLISHABLE_KEY_SQLITE: 'sb_publishable_test',
    })).toThrow(/must be https:\/\/segygjzpujphwvrubusm\.supabase\.co/);
  });

  test('maps sqlite env vars into Supabase and Expo command env without printing secrets', () => {
    const plan = buildCommandPlan('start', {
      SUPABASE_PROJECT_ID_SQLITE: 'segygjzpujphwvrubusm',
      SUPABASE_PROJECT_URL_SQLITE: 'https://segygjzpujphwvrubusm.supabase.co',
      SUPABASE_DB_PASSWORD_SQLITE: 'secret-password',
      SUPABASE_PUBLISHABLE_KEY_SQLITE: 'sb_publishable_test',
    });

    expect(plan.command).toBe('npx');
    expect(plan.args).toEqual(['expo', 'start']);
    expect(plan.env).toMatchObject({
      SUPABASE_DB_PASSWORD: 'secret-password',
      EXPO_PUBLIC_SUPABASE_TARGET: 'sqlite-staging',
      EXPO_PUBLIC_SUPABASE_PROJECT_ID: 'segygjzpujphwvrubusm',
      EXPO_PUBLIC_SUPABASE_URL: 'https://segygjzpujphwvrubusm.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_test',
    });
    expect(plan.safeSummary.join('\n')).not.toContain('secret-password');
    expect(plan.safeSummary.join('\n')).not.toContain('sb_publishable_test');
  });

  test('push command is non-interactive', () => {
    const plan = buildCommandPlan('db-push', {
      SUPABASE_PROJECT_ID_SQLITE: 'segygjzpujphwvrubusm',
      SUPABASE_PROJECT_URL_SQLITE: 'https://segygjzpujphwvrubusm.supabase.co',
      SUPABASE_DB_PASSWORD_SQLITE: 'secret-password',
      SUPABASE_PUBLISHABLE_KEY_SQLITE: 'sb_publishable_test',
    });

    expect(plan.command).toBe('supabase');
    expect(plan.args).toEqual(['--yes', 'db', 'push', '--linked']);
  });

  test('link command does not expose the database password as a process argument', () => {
    const plan = buildCommandPlan('link', {
      SUPABASE_PROJECT_ID_SQLITE: 'segygjzpujphwvrubusm',
      SUPABASE_PROJECT_URL_SQLITE: 'https://segygjzpujphwvrubusm.supabase.co',
      SUPABASE_DB_PASSWORD_SQLITE: 'secret-password',
      SUPABASE_PUBLISHABLE_KEY_SQLITE: 'sb_publishable_test',
    });

    expect(plan.command).toBe('supabase');
    expect(plan.args).toEqual([
      '--yes',
      'link',
      '--project-ref',
      'segygjzpujphwvrubusm',
    ]);
    expect(plan.args).not.toContain('secret-password');
    expect(plan.env.SUPABASE_DB_PASSWORD).toBe('secret-password');
  });
});
