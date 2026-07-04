jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { __contract } from '../src/services/offlineSync';

let db;
beforeAll(async () => { db = createBetterSqliteTestDatabase(':memory:'); await runMigrations(db); });

const schemaColumns = async (table) => {
  const info = await db.getAllAsync(`PRAGMA table_info(${table})`);
  return info.map((c) => c.name); // includes CREATE-TABLE and ALTER-ADDED columns
};

it('every PUSH_ORDER table column is synced, intentionally-unsynced, or local-only (exactly one)', async () => {
  const { SERVER_COLUMNS, PUSH_ORDER, INTENTIONALLY_UNSYNCED, LOCAL_ONLY_COLUMNS } = __contract;
  for (const table of PUSH_ORDER) {
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

it('sessions.group_id and sessions.state are documented as intentionally unsynced', () => {
  const { INTENTIONALLY_UNSYNCED } = __contract;
  expect(INTENTIONALLY_UNSYNCED.sessions?.group_id).toBeTruthy();
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
  //   src/utils/storage.js — confirmed zero enqueueDomainOutbox / insertOutboxRecord calls.
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

  const expectedPush = syncedTables.filter((t) => !PULL_ONLY_SYNCED_TABLES.includes(t)).sort();
  expect([...PUSH_ORDER].sort()).toEqual(expectedPush);
});
