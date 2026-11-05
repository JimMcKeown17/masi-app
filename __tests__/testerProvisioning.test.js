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

describe('tester account rollback under ON DELETE RESTRICT', () => {
  // A lost response can leave the programme assignment written although the insert reported an
  // error. Since 20261105120000 staff_programme_assignments -> public.users is RESTRICT, so the
  // rollback deletes the account's own rows, children first, before the auth user.
  const makeAdmin = () => {
    const calls = [];
    const from = (table) => {
      let op = 'select';
      const builder = {
        select: () => builder,
        in: () => builder,
        is: () => builder,
        eq: (column, value) => { calls.push(['eq', table, column, value]); return builder; },
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        upsert: () => Promise.resolve({ error: null }),
        update: () => { op = 'update'; return builder; },
        delete: () => { op = 'delete'; calls.push(['delete', table]); return builder; },
        insert: () => Promise.resolve({ error: { message: 'lost response' } }),
        then: (resolve) => resolve(op === 'update'
          ? { data: [{ id: 'new-user' }], error: null }
          : { data: [], error: null }),
      };
      return builder;
    };
    return {
      calls,
      from,
      auth: {
        admin: {
          listUsers: jest.fn().mockResolvedValue({ data: { users: [] }, error: null }),
          createUser: jest.fn().mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null }),
          deleteUser: jest.fn(async () => { calls.push(['deleteUser']); return { error: null }; }),
        },
      },
    };
  };
  const lookupMaps = {
    jobTitlesByCode: new Map([['literacy_coach', { id: 'job' }]]),
    schoolsByUid: new Map([['school-1', { id: 'school' }]]),
    programmesByCode: new Map([['literacy', { id: 'programme' }]]),
  };
  const row = {
    email: 'pilot@example.org', password: 'unique-temporary-password', first_name: 'Pilot',
    last_name: 'Tester', job_title_code: 'literacy_coach', school_uid: 'school-1', programme_code: 'literacy',
  };

  test('a failed programme assignment removes the assignment and profile before the auth user', async () => {
    const { processRow } = require('../scripts/createTesters');
    const admin = makeAdmin();
    const result = await processRow(admin, row, lookupMaps, 'org-id');
    expect(result).toEqual(expect.objectContaining({ status: 'error' }));
    const removals = admin.calls
      .filter(([op]) => op === 'delete' || op === 'deleteUser')
      .map(([op, table]) => table || op);
    expect(removals).toEqual(['staff_programme_assignments', 'users', 'deleteUser']);
    expect(admin.calls).toContainEqual(['eq', 'staff_programme_assignments', 'user_id', 'new-user']);
    expect(admin.calls).toContainEqual(['eq', 'users', 'id', 'new-user']);
  });
});

describe('tester account creation', () => {
  test('marks new tester accounts as test accounts', async () => {
    const { processRow } = require('../scripts/createTesters');
    const createUser = jest.fn().mockResolvedValue({ data: null, error: { message: 'stop after create' } });
    const admin = {
      auth: { admin: { listUsers: jest.fn().mockResolvedValue({ data: { users: [] }, error: null }), createUser } },
    };
    const row = { email: 'pilot@example.org', password: 'unique-temporary-password' };
    await processRow(admin, row, {}, 'org-id');
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'pilot@example.org',
      app_metadata: { is_test_account: true },
    }));
  });

  test('marks new field staff accounts as counted staff when asked explicitly', async () => {
    const { processRow } = require('../scripts/createTesters');
    const createUser = jest.fn().mockResolvedValue({ data: null, error: { message: 'stop after create' } });
    const admin = {
      auth: { admin: { listUsers: jest.fn().mockResolvedValue({ data: { users: [] }, error: null }), createUser } },
    };
    const row = { email: 'coach@example.org', password: 'unique-temporary-password' };
    await processRow(admin, row, {}, 'org-id', { fieldStaff: true });
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'coach@example.org',
      app_metadata: { is_test_account: false },
    }));
  });
});

describe('tester provisioning arguments', () => {
  test('reads --field-staff and --dry-run around the organisation and CSV path', () => {
    const { parseProvisioningArgs } = require('../scripts/createTesters');
    expect(parseProvisioningArgs(['--field-staff', '--organization', 'masinyusane', 'coaches.csv']))
      .toEqual({ organisationSlug: 'masinyusane', dryRun: false, fieldStaff: true, csvArg: 'coaches.csv' });
    expect(parseProvisioningArgs(['--dry-run', '--organization', 'masinyusane', 'testers.csv']))
      .toEqual({ organisationSlug: 'masinyusane', dryRun: true, fieldStaff: false, csvArg: 'testers.csv' });
  });

  test('rejects unknown flags instead of treating them as the CSV path', () => {
    const { parseProvisioningArgs } = require('../scripts/createTesters');
    expect(() => parseProvisioningArgs(['--organization', 'masinyusane', '--feild-staff', 'coaches.csv']))
      .toThrow(/Usage/);
  });
});
