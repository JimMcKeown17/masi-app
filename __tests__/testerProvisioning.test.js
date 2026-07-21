const {
  ZERO_CLASS_ASSIGNMENT_TABLES,
  normalizeTesterRows,
  validateActiveProgrammeAssignments,
  validateZeroClassAssignments,
  validateTesterProvisioningEnv,
} = require('../scripts/lib/testerProvisioning');
const { spawnSync } = require('child_process');
const path = require('path');

describe('SQLite tester provisioning safety', () => {
  const sqliteEnv = {
    SUPABASE_PROJECT_ID_SQLITE: 'segygjzpujphwvrubusm',
    SUPABASE_PROJECT_URL_SQLITE: 'https://segygjzpujphwvrubusm.supabase.co',
    SUPABASE_SECRET_KEY_SQLITE: 'service-role-test-key',
  };

  test('accepts only the exact SQLite backend identity', () => {
    expect(validateTesterProvisioningEnv(sqliteEnv)).toEqual(sqliteEnv);

    expect(() => validateTesterProvisioningEnv({
      ...sqliteEnv,
      SUPABASE_PROJECT_ID_SQLITE: 'jcqrlwetutnpuchjoyyd',
      SUPABASE_PROJECT_URL_SQLITE: 'https://jcqrlwetutnpuchjoyyd.supabase.co',
    })).toThrow(/segygjzpujphwvrubusm/);

    expect(() => validateTesterProvisioningEnv({
      ...sqliteEnv,
      SUPABASE_PROJECT_URL_SQLITE:
        'https://evil.example.com/segygjzpujphwvrubusm.supabase.co',
    })).toThrow(/must be https:\/\/segygjzpujphwvrubusm\.supabase\.co/);
  });

  test('requires per-user credentials, programme, and an explicit zero-class cohort', () => {
    const [tester] = normalizeTesterRows([{
      email: ' Pilot@Example.org ',
      password: 'unique-temporary-password',
      first_name: ' Pilot ',
      last_name: ' Tester ',
      job_title_code: 'literacy_coach',
      school_uid: 'SCH-00001',
      programme_code: 'literacy',
      tester_type: 'zero_class',
    }]);

    expect(tester).toMatchObject({
      email: 'pilot@example.org',
      password: 'unique-temporary-password',
      first_name: 'Pilot',
      last_name: 'Tester',
      programme_code: 'literacy',
      tester_type: 'zero_class',
    });

    expect(() => normalizeTesterRows([{
      email: 'pilot@example.org',
      first_name: 'Pilot',
      last_name: 'Tester',
      job_title_code: 'literacy_coach',
      school_uid: 'SCH-00001',
      programme_code: 'literacy',
      tester_type: 'zero_class',
    }])).toThrow(/password/);

    expect(() => normalizeTesterRows([{
      email: 'pilot@example.org',
      password: 'unique-temporary-password',
      first_name: 'Pilot',
      last_name: 'Tester',
      job_title_code: 'literacy_coach',
      school_uid: 'SCH-00001',
      programme_code: 'literacy',
      tester_type: 'seeded',
    }])).toThrow(/zero_class/);
  });

  test('zero-class preflight covers every assignment scope and rejects any active row', () => {
    expect(ZERO_CLASS_ASSIGNMENT_TABLES).toEqual([
      { table: 'class_ea_assignments', userColumn: 'ea_user_id' },
      { table: 'child_ea_assignments', userColumn: 'user_id' },
      { table: 'group_ea_assignments', userColumn: 'ea_user_id' },
    ]);

    expect(() => validateZeroClassAssignments({
      class_ea_assignments: [],
      child_ea_assignments: [{ id: 'child-assignment-1' }],
      group_ea_assignments: [],
    })).toThrow(/child_ea_assignments/);

    expect(validateZeroClassAssignments({
      class_ea_assignments: [],
      child_ea_assignments: [],
      group_ea_assignments: [],
    })).toBe(true);
  });

  test('Programme preflight rejects ambiguity and mismatched grants before writes', () => {
    expect(validateActiveProgrammeAssignments([], {
      programmeId: 'literacy-id',
      schoolId: 'school-id',
    })).toBeNull();

    expect(validateActiveProgrammeAssignments([{
      id: 'assignment-1',
      programme_id: 'literacy-id',
      school_id: 'school-id',
    }], {
      programmeId: 'literacy-id',
      schoolId: 'school-id',
    })).toMatchObject({ id: 'assignment-1' });

    expect(() => validateActiveProgrammeAssignments([
      { id: 'assignment-1', programme_id: 'literacy-id', school_id: 'school-id' },
      { id: 'assignment-2', programme_id: 'literacy-id', school_id: 'school-id' },
    ], {
      programmeId: 'literacy-id',
      schoolId: 'school-id',
    })).toThrow(/multiple active Programme assignments/);

    expect(() => validateActiveProgrammeAssignments([{
      id: 'assignment-1',
      programme_id: 'other-programme',
      school_id: 'school-id',
    }], {
      programmeId: 'literacy-id',
      schoolId: 'school-id',
    })).toThrow(/does not match/);
  });

  test('the legacy generic-env loader is disabled instead of risking the old backend', () => {
    const result = spawnSync(
      process.execPath,
      [path.join(__dirname, '..', 'scripts', 'loadTestUsers.js'), '--dry-run', 'testers.csv'],
      { encoding: 'utf8', env: {} }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/disabled/i);
    expect(result.stderr).toMatch(/createTesters\.js/);
    expect(result.stderr).not.toMatch(/password for new users/i);
  });
});
