jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('../scripts/sqlite-staging.cjs', () => ({ loadEnvFiles: jest.fn() }));
jest.mock('../scripts/lib/parseCsv', () => ({ parseCsvFile: jest.fn() }));

const {
  parseOrganisationArg,
  resolveOrganisationId,
  checkExistingOrganisation,
  buildProfile,
} = require('../scripts/lib/organisationProvisioning');
const { main, processRow } = require('../scripts/createTesters');
const { createClient } = require('@supabase/supabase-js');
const { loadEnvFiles } = require('../scripts/sqlite-staging.cjs');
const { parseCsvFile } = require('../scripts/lib/parseCsv');

const ORGANISATION_ID = 'a111879f-d066-47c9-95a1-bed2a400319a';
const OTHER_ORGANISATION_ID = '22000000-0000-0000-0000-000000000001';
const USER_ID = '12000000-0000-0000-0000-000000000001';
const USAGE = 'Usage: node scripts/createTesters.js [--dry-run] --organization <slug> <path-to-csv>';
const row = {
  email: 'pilot@example.org',
  password: 'unique-temporary-password',
  first_name: 'Pilot',
  last_name: 'Tester',
  job_title_code: 'literacy_coach',
  school_uid: 'SCH-00001',
  programme_code: 'literacy',
  tester_type: 'zero_class',
};
const lookupMaps = {
  jobTitlesByCode: new Map([['literacy_coach', { id: 'job-id', code: 'literacy_coach' }]]),
  schoolsByUid: new Map([['SCH-00001', { id: 'school-id', school_uid: 'SCH-00001' }]]),
  programmesByCode: new Map([['literacy', { id: 'programme-id', code: 'literacy' }]]),
};
const programmeAssignment = {
  id: 'programme-assignment-id', programme_id: 'programme-id', school_id: 'school-id',
};

// Only the Supabase boundary is faked. The real preflight and row workflow run
// against it; every mutation is recorded so a refusal must leave zero writes.
function mockAdmin({
  organisation = { id: ORGANISATION_ID },
  organisationError = null,
  existingUser = { id: USER_ID, email: row.email },
  existingProfile = { organization_id: ORGANISATION_ID },
  profileError = null,
  assignments = {},
} = {}) {
  const writes = [];
  const queries = [];
  const admin = {
    auth: { admin: {
      listUsers: jest.fn(async () => ({ data: { users: existingUser ? [existingUser] : [] }, error: null })),
      createUser: jest.fn(async (payload) => {
        writes.push({ table: 'auth.users', operation: 'create', payload });
        return { data: { user: { id: USER_ID } }, error: null };
      }),
      deleteUser: jest.fn(async (id) => {
        writes.push({ table: 'auth.users', operation: 'delete', id });
        return { error: null };
      }),
    } },
    from: jest.fn((table) => ({
      select: (columns) => {
        const query = { table, columns };
        queries.push(query);
        return {
          eq: (column, value) => {
            query.filter = [column, value];
            return {
              maybeSingle: async () => {
                if (table === 'organizations') return { data: organisation, error: organisationError };
                if (table === 'users') return { data: existingProfile, error: profileError };
                throw new Error(`Unexpected single-row query: ${table}`);
              },
              is: async () => ({ data: assignments[table] || [], error: null }),
            };
          },
          in: async () => {
            const maps = {
              job_titles: lookupMaps.jobTitlesByCode,
              schools: lookupMaps.schoolsByUid,
              programmes: lookupMaps.programmesByCode,
            };
            if (!maps[table]) throw new Error(`Unexpected lookup: ${table}`);
            return { data: [...maps[table].values()], error: null };
          },
        };
      },
      upsert: jest.fn(async (payload, options) => {
        writes.push({ table, operation: 'upsert', payload, options });
        return { error: null };
      }),
      insert: jest.fn(async (payload) => {
        writes.push({ table, operation: 'insert', payload });
        return { error: null };
      }),
    })),
  };
  return { admin, queries, writes };
}

describe('organisation provisioning helpers', () => {
  test.each([
    [],
    ['testers.csv'],
    ['--organization'],
    ['--organization', '--dry-run', 'testers.csv'],
    ['--organization', 'a', 'testers.csv'],
    ['--organization', 'a'.repeat(41), 'testers.csv'],
    ['--organization', 'Masinyusane', 'testers.csv'],
    ['--organization', 'masi_nyusane', 'testers.csv'],
    ['--organization', ' masinyusane', 'testers.csv'],
    ['--organization', 'masinyusane', '--organization', 'partner', 'testers.csv'],
  ])('requires one explicit valid organisation slug: %j', (...argv) => {
    expect(() => parseOrganisationArg(argv)).toThrow(USAGE);
  });

  test.each(['masinyusane', 'partner-2', 'ab', 'a'.repeat(40)])('accepts the valid slug %s', (slug) => {
    expect(parseOrganisationArg(['--dry-run', '--organization', slug, 'testers.csv'])).toBe(slug);
  });

  test('resolves the selected slug through organizations using the provided client', async () => {
    const { admin, queries } = mockAdmin();
    await expect(resolveOrganisationId(admin, 'masinyusane')).resolves.toBe(ORGANISATION_ID);
    expect(queries).toEqual([{ table: 'organizations', columns: 'id', filter: ['slug', 'masinyusane'] }]);
  });

  test('rejects an unknown slug before any user access or mutation', async () => {
    const { admin, writes } = mockAdmin({ organisation: null });
    await expect(resolveOrganisationId(admin, 'unknown-partner')).rejects.toThrow('Unknown organisation "unknown-partner"');
    expect(admin.from.mock.calls).toEqual([['organizations']]);
    expect(admin.auth.admin.listUsers).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  test('propagates organisation lookup errors instead of treating them as unknown', async () => {
    const error = new Error('lookup unavailable');
    const { admin } = mockAdmin({ organisation: null, organisationError: error });
    await expect(resolveOrganisationId(admin, 'masinyusane')).rejects.toBe(error);
  });

  test('accepts an existing profile in the same organisation', () => {
    expect(checkExistingOrganisation({ organization_id: ORGANISATION_ID }, ORGANISATION_ID)).toEqual({ ok: true });
  });

  test('refuses to change a stored organisation', () => {
    expect(checkExistingOrganisation({ organization_id: OTHER_ORGANISATION_ID }, ORGANISATION_ID))
      .toEqual({ ok: false, reason: 'organisation_conflict' });
  });

  test('permits creating a missing profile but refuses an existing unlabelled profile', () => {
    expect(checkExistingOrganisation(null, ORGANISATION_ID)).toEqual({ ok: true });
    expect(checkExistingOrganisation({ organization_id: null }, ORGANISATION_ID))
      .toEqual({ ok: false, reason: 'organisation_conflict' });
  });

  test('builds the full profile with the resolved organisation id and no password', () => {
    expect(buildProfile(row, lookupMaps, USER_ID, ORGANISATION_ID)).toEqual({
      id: USER_ID,
      first_name: 'Pilot',
      last_name: 'Tester',
      email: 'pilot@example.org',
      job_title_id: 'job-id',
      school_id: 'school-id',
      organization_id: ORGANISATION_ID,
    });
  });
});

describe('provisioning workflow with a mocked admin client', () => {
  const originalEnv = process.env;
  const sqliteEnv = {
    SUPABASE_PROJECT_ID_SQLITE: 'segygjzpujphwvrubusm',
    SUPABASE_PROJECT_URL_SQLITE: 'https://segygjzpujphwvrubusm.supabase.co',
    SUPABASE_SECRET_KEY_SQLITE: 'service-role-test-key',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, ...sqliteEnv };
    loadEnvFiles.mockReturnValue(sqliteEnv);
    parseCsvFile.mockReturnValue([row]);
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  test('importing the script neither loads env files nor constructs a client', () => {
    jest.isolateModules(() => { require('../scripts/createTesters'); });
    expect(loadEnvFiles).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  test.each([false, true])('a conflict refuses all writes before assignment checks (dryRun=%s)', async (dryRun) => {
    const existingProfile = { organization_id: OTHER_ORGANISATION_ID };
    const { admin, queries, writes } = mockAdmin({
      existingProfile,
      assignments: { class_ea_assignments: [{ id: 'already-assigned' }] },
    });
    await expect(processRow(admin, row, lookupMaps, ORGANISATION_ID, { dryRun }))
      .resolves.toEqual({ status: 'error', reason: 'organisation_conflict' });
    expect(queries.map(query => query.table)).toEqual(['users']);
    expect(writes).toEqual([]);
    expect(existingProfile.organization_id).toBe(OTHER_ORGANISATION_ID);
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  test('a failed profile read refuses all writes', async () => {
    const { admin, writes } = mockAdmin({ profileError: new Error('profile unavailable') });
    await expect(processRow(admin, row, lookupMaps, ORGANISATION_ID))
      .resolves.toEqual({ status: 'error', reason: 'existing-account preflight failed: profile unavailable' });
    expect(writes).toEqual([]);
  });

  test('a matching organisation still enforces zero-class assignment checks', async () => {
    const { admin, writes } = mockAdmin({ assignments: { class_ea_assignments: [{ id: 'assigned' }] } });
    const result = await processRow(admin, row, lookupMaps, ORGANISATION_ID);
    expect(result.status).toBe('error');
    expect(result.reason).toMatch(/active class_ea_assignments/);
    expect(writes).toEqual([]);
  });

  test('a matching organisation still refuses a conflicting Programme assignment', async () => {
    const { admin, writes } = mockAdmin({
      assignments: { staff_programme_assignments: [{ ...programmeAssignment, programme_id: 'other-programme' }] },
    });
    const result = await processRow(admin, row, lookupMaps, ORGANISATION_ID);
    expect(result.status).toBe('error');
    expect(result.reason).toMatch(/does not match/);
    expect(writes).toEqual([]);
  });

  test('a compatible account keeps its organisation in an upsert on id', async () => {
    const { admin, writes } = mockAdmin({ assignments: { staff_programme_assignments: [programmeAssignment] } });
    await expect(processRow(admin, row, lookupMaps, ORGANISATION_ID)).resolves.toEqual({ status: 'reused' });
    expect(writes).toEqual([{
      table: 'users', operation: 'upsert',
      payload: buildProfile(row, lookupMaps, USER_ID, ORGANISATION_ID),
      options: { onConflict: 'id' },
    }]);
  });

  test('a new account receives the explicit organisation and Programme assignment', async () => {
    const { admin, writes } = mockAdmin({ existingUser: null });
    await expect(processRow(admin, row, lookupMaps, ORGANISATION_ID)).resolves.toEqual({ status: 'created' });
    expect(writes.map(({ table, operation }) => [table, operation])).toEqual([
      ['auth.users', 'create'], ['users', 'upsert'], ['staff_programme_assignments', 'insert'],
    ]);
    expect(writes[1].payload.organization_id).toBe(ORGANISATION_ID);
    expect(writes[1].options).toEqual({ onConflict: 'id' });
  });

  test.each([false, true])('unknown organisations stop the entire run before user access (dryRun=%s)', async (dryRun) => {
    const { admin, writes } = mockAdmin({ organisation: null });
    createClient.mockReturnValue(admin);
    await expect(main([
      ...(dryRun ? ['--dry-run'] : []), '--organization', 'unknown-partner', 'testers.csv',
    ])).rejects.toThrow('Unknown organisation "unknown-partner"');
    expect(admin.from.mock.calls).toEqual([['organizations']]);
    expect(admin.auth.admin.listUsers).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  test.each([false, true])('the run reports the exact conflict reason and returns failure (dryRun=%s)', async (dryRun) => {
    const { admin, writes } = mockAdmin({ existingProfile: { organization_id: OTHER_ORGANISATION_ID } });
    createClient.mockReturnValue(admin);
    await expect(main([
      ...(dryRun ? ['--dry-run'] : []), '--organization', 'masinyusane', 'testers.csv',
    ])).resolves.toBe(1);
    expect(console.log).toHaveBeenCalledWith('[ERROR] line 2 pilot@example.org :: organisation_conflict');
    expect(writes).toEqual([]);
  });

  test('dry run resolves the slug and correctly parses the CSV path without writing', async () => {
    const { admin, queries, writes } = mockAdmin();
    createClient.mockReturnValue(admin);
    await expect(main(['testers.csv', '--organization', 'masinyusane', '--dry-run'])).resolves.toBe(0);
    expect(queries[0]).toEqual({ table: 'organizations', columns: 'id', filter: ['slug', 'masinyusane'] });
    expect(parseCsvFile).toHaveBeenCalledWith(require('path').resolve('testers.csv'));
    expect(console.log).toHaveBeenCalledWith('[DRY-RUN] line 2 pilot@example.org :: would reuse compatible account');
    expect(writes).toEqual([]);
  });

  test.each([
    ['testers.csv'],
    ['--organization', 'masinyusane'],
    ['--organization', 'masinyusane', '--unknown', 'testers.csv'],
  ])('invalid CLI arguments fail before loading credentials: %j', async (...argv) => {
    await expect(main(argv)).rejects.toThrow(USAGE);
    expect(loadEnvFiles).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });
});
