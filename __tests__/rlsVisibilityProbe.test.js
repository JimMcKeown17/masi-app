const {
  PROBE_RULES,
  validateProbeEnv,
} = require('../scripts/rls-visibility-probe.cjs');

describe('rls visibility probe helpers', () => {
  const validEnv = {
    SUPABASE_URL_SQLITE: 'https://segygjzpujphwvrubusm.supabase.co',
    SUPABASE_ANON_KEY_SQLITE: 'anon-test-key',
    SUPABASE_SERVICE_ROLE_KEY_SQLITE: 'service-role-test-key',
    SUPABASE_PROJECT_ID_SQLITE: 'segygjzpujphwvrubusm',
  };

  test('defines the required parent-row upsert visibility probe rules', () => {
    expect(PROBE_RULES).toHaveLength(4);
    expect(PROBE_RULES.map(({ table, policy }) => [table, policy])).toEqual([
      ['children', 'children_select_created_by'],
      ['classes', 'classes_select_created_by'],
      ['groups', 'groups_select_created_by'],
      ['sessions', 'sessions_select_own_or_assigned_child_history'],
    ]);
  });

  test('rejects the legacy Supabase project ref', () => {
    expect(() => validateProbeEnv({
      ...validEnv,
      SUPABASE_URL_SQLITE: 'https://jcqrlwetutnpuchjoyyd.supabase.co',
      SUPABASE_PROJECT_ID_SQLITE: 'jcqrlwetutnpuchjoyyd',
    })).toThrow(/segygjzpujphwvrubusm/);
  });

  test('rejects a URL that does not match the sqlite project ref', () => {
    expect(() => validateProbeEnv({
      ...validEnv,
      SUPABASE_URL_SQLITE: 'https://different-ref.supabase.co',
    })).toThrow(/SUPABASE_URL_SQLITE/);
  });

  test('accepts the sqlite project env', () => {
    expect(validateProbeEnv(validEnv)).toEqual(validEnv);
  });
});
