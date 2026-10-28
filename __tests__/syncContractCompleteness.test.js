jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {} }));
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { __contract, createOutboxSyncEngine, _testBuildSyncPayload } from '../src/services/offlineSync';
import { createAssessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { bindTestActor } from '../test-support/actorTestUtils';

// These child rows travel only inside their parent family payload and acknowledgement.
// They still require complete server/local column classification.
const FAMILY_MEMBER_TABLES = ['assessment_items'];

it('the class edition is explicitly server-owned and excluded from server columns', () => {
  expect(__contract.SERVER_COLUMNS.classes).not.toContain('letter_order_edition');
  expect(__contract.INTENTIONALLY_UNSYNCED.classes?.letter_order_edition)
    .toBe('Server-owned: the classes trigger sets it (migration 20261027120000); pulls take the server value.');
});

it.each(['insert', 'update'])('a class %s payload never sends its stored edition', operation => {
  const payload = _testBuildSyncPayload('classes', {
    id: 'class-1', name: 'Renamed class', letter_order_edition: '2099-01-01',
  }, operation);
  expect(payload).toMatchObject({ name: 'Renamed class' });
  expect(payload).not.toHaveProperty('letter_order_edition');
});

let db;
beforeAll(async () => { db = createBetterSqliteTestDatabase(':memory:'); await runMigrations(db); });

const schemaColumns = async (table) => {
  const info = await db.getAllAsync(`PRAGMA table_info(${table})`);
  return info.map((c) => c.name); // includes CREATE-TABLE and ALTER-ADDED columns
};

it('every pushed table and family-member column is synced, intentionally-unsynced, or local-only (exactly one)', async () => {
  const { SERVER_COLUMNS, PUSH_ORDER, INTENTIONALLY_UNSYNCED, LOCAL_ONLY_COLUMNS } = __contract;
  for (const table of [...PUSH_ORDER, ...FAMILY_MEMBER_TABLES]) {
    const cols = await schemaColumns(table);
    expect(cols.length).toBeGreaterThan(0); // table exists in the migrated schema
    for (const col of cols) {
      const inServer = (SERVER_COLUMNS[table] || []).includes(col);
      const inIntentional = Boolean((INTENTIONALLY_UNSYNCED[table] || {})[col]);
      const inLocalOnly = LOCAL_ONLY_COLUMNS.includes(col);
      const count = [inServer, inIntentional, inLocalOnly].filter(Boolean).length;
      expect({ table, col, count }).toEqual({ table, col, count: 1 });
    }
  }
});

it('sessions.group_id is synced and sessions.state stays intentionally unsynced', () => {
  const { SERVER_COLUMNS, INTENTIONALLY_UNSYNCED } = __contract;
  expect(SERVER_COLUMNS.sessions).toContain('group_id');
  expect(INTENTIONALLY_UNSYNCED.sessions.group_id).toBeUndefined();
  expect(INTENTIONALLY_UNSYNCED.sessions?.state).toBeTruthy();
});

it('PUSH_ORDER contains every locally-written synced table (no pushable table omitted)', async () => {
  const { PUSH_ORDER } = __contract;
  // Tables carrying the sync_status bookkeeping column participate in sync bookkeeping.
  const allTables = (await db.getAllAsync(
    "select name from sqlite_master where type='table' and name not like 'sqlite_%'"
  )).map((t) => t.name);
  const syncedTables = [];
  for (const t of allTables) {
    const cols = (await db.getAllAsync(`PRAGMA table_info(${t})`)).map((c) => c.name);
    if (cols.includes('sync_status')) syncedTables.push(t);
  }

  // Reference/pull-only tables: they carry sync_status for local bookkeeping but are PULLED from
  // the server (pullReferenceData / fetchAndCacheSchools), never pushed via the sync_outbox —
  // so they are intentionally NOT in PUSH_ORDER.
  // Verification method for each: grep -rn "<table>" src/db/repositories src/services
  //   confirmed zero enqueueDomainOutbox / insertOutboxRecord calls.
  const PULL_ONLY_SYNCED_TABLES = [
    // Admin-managed reference data; populated exclusively by fetchAndCacheSchools and
    // pullReferenceData → schoolsRepository.replaceFromServer. No local write path enqueues
    // outbox rows for schools.
    'schools',
    // Populated by pullReferenceData → jobTitlesRepository.replaceFromServer. Read-only
    // reference data managed by head-office; no local write path exists.
    'job_titles',
    // Populated by pullReferenceData → programmesRepository.replaceFromServer. The only
    // local write (ensureLegacyProgramme in domainRepositoryUtils.js) explicitly sets
    // sync_status = 'terminal', so it is intentionally never pushed to the server.
    'programmes',
    // Populated by pullReferenceData → academicYearsRepository.replaceFromServer. Calendar
    // reference data managed server-side; no field-device write path enqueues outbox rows.
    'academic_years',
    // Populated by pullReferenceData → assessmentWindowsRepository.replaceFromServer.
    // Assessment-window definitions are server-managed; no local write enqueues outbox rows.
    'assessment_windows',
    // Populated by pullReferenceData → assessmentToolsRepository.replaceFromServer.
    // Tool definitions are server-managed; no local write enqueues outbox rows.
    'assessment_tools',
    // Populated by pullReferenceData → teachersRepository.replaceFromServer.
    // Teacher records are admin-managed server-side; no local write enqueues outbox rows.
    'teachers',
    // Populated by pullReferenceData → staffProgrammeAssignmentsRepository.replaceFromServer.
    // Staff-programme assignments are set by admins server-side and pulled down; the field
    // device never creates or mutates them locally.
    'staff_programme_assignments',
  ];

  // The real family round trip below guards the family-member exception.
  const expectedPush = syncedTables.filter((t) => (
    !PULL_ONLY_SYNCED_TABLES.includes(t) && !FAMILY_MEMBER_TABLES.includes(t)
  )).sort();
  expect([...PUSH_ORDER].sort()).toEqual(expectedPush);
});

it('assessment items travel in the parent family payload and are acknowledged with it', async () => {
  const userId = '00000000-0000-4000-8000-000000000001';
  const childId = '00000000-0000-4000-8000-000000000002';
  const programmeId = '00000000-0000-4000-8000-000000000003';
  const assessmentId = '00000000-0000-4000-8000-000000000004';
  const familyDb = bindTestActor(createBetterSqliteTestDatabase(':memory:'), userId);
  try {
    await runMigrations(familyDb);
    await familyDb.runAsync(
      "insert into programmes (id, code, name, sync_status) values (?, 'lit', 'Literacy', 'synced')",
      programmeId
    );
    await familyDb.runAsync(`insert into staff_programme_assignments
      (id, user_id, programme_id, assigned_at, sync_status)
      values ('programme-assignment', ?, ?, '2026-01-15T00:00:00.000Z', 'synced')`,
    userId, programmeId);
    await familyDb.runAsync(
      "insert into children (id, first_name, last_name, sync_status) values (?, 'Test', 'Child', 'synced')",
      childId
    );
    await createAssessmentsRepository({ database: familyDb }).saveQuestionResult({
      assessmentId, userId, childId,
      result: {
        question_code: 'letter_sounds', question_version: '2026.1',
        item_set_id: 'letter_sounds@2026.1.en', language: 'en',
        duration_ms: 1000, stopped_reason: 'completed',
        items: [{ position: 0, item_key: 'a', prompt: 'a', is_correct: true }],
        derived: { total_correct: 1, total_attempted: 1, percent: 100, last_attempted_position: 0 },
      },
    });
    const queued = await familyDb.getAllAsync('select table_name, payload from sync_outbox');
    expect(queued).toHaveLength(1);
    expect(queued[0].table_name).toBe('assessments');
    const family = JSON.parse(queued[0].payload);
    expect(family.items).toEqual([expect.objectContaining({ assessment_id: assessmentId, item_key: 'a' })]);
    expect(__contract.PUSH_ORDER).not.toContain('assessment_items');

    const supabaseClient = {
      from: jest.fn(() => { throw new Error('family must use its RPC'); }),
      rpc: jest.fn(async () => ({ data: 'inserted', error: null })),
    };
    const engine = createOutboxSyncEngine({
      database: familyDb, supabaseClient,
      enqueueRequest: task => task(),
      getAuthSession: async () => ({ data: { session: { user: { id: userId } } } }),
    });
    expect(await engine.syncAll()).toEqual(expect.objectContaining({ totalSynced: 1, totalFailed: 0 }));
    expect(supabaseClient.rpc).toHaveBeenCalledWith('submit_assessment', expect.objectContaining({
      p_items: family.items,
    }));
    expect(await familyDb.getAllAsync('select id from sync_outbox')).toEqual([]);
    expect(await familyDb.getFirstAsync('select sync_status from assessments where id = ?', assessmentId))
      .toEqual({ sync_status: 'synced' });
    expect(await familyDb.getAllAsync('select sync_status, last_sync_error from assessment_items'))
      .toEqual([{ sync_status: 'synced', last_sync_error: null }]);
  } finally {
    await familyDb.closeAsync();
  }
});


it('time_entries explicitly uploads both nullable location outcome columns', () => {
  expect(__contract.SERVER_COLUMNS.time_entries).toEqual([
    'id', 'user_id', 'sign_in_time', 'sign_in_lat', 'sign_in_lon', 'sign_out_time',
    'sign_out_lat', 'sign_out_lon', 'sign_in_location_status', 'sign_out_location_status',
    'auto_clocked_out', 'created_at', 'updated_at',
  ]);
});
