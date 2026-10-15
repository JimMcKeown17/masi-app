#!/usr/bin/env node

// S1 (actor lifecycle spec §6.6): proves the upload contract against the real migrations.
// PostgreSQL checks INSERT WITH CHECK on every INSERT ... ON CONFLICT DO UPDATE row, even when
// it conflicts, so an upsert of a Head Office-created row fails for an editing EA, while a
// plain UPDATE by id passes the UPDATE policy. Each case runs in its own transaction and rolls
// back, so cases never affect each other.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MIGRATIONS_DIR,
  assertDisposableAdminTarget,
  bootstrapSql,
  buildDatabaseUrl,
  expectSqlState,
  runPsql,
} = require('./history-authorization-postgres-harness.cjs');

// Local invocation: PATH includes PostgreSQL 17; set HISTORY_RLS_ADMIN_DATABASE_URL,
// HISTORY_RLS_DATABASE_NAME (masi_history_rls_*), HISTORY_RLS_DISPOSABLE_CONFIRM
// (I_UNDERSTAND_THIS_IS_DISPOSABLE), and PGTZ=UTC. Never loads dotenv or uses Supabase CLI.
const LOCATION_MIGRATION = '20261015120000_time_entry_location_optional.sql';

const quoteIdentifier = (identifier) => `"${identifier.replaceAll('"', '""')}"`;

const HEAD_OFFICE = '11000000-0000-0000-0000-000000000001';
const ASSIGNED_EA = '11000000-0000-0000-0000-000000000002';
const UNASSIGNED_EA = '11000000-0000-0000-0000-000000000003';
const SCHOOL = '21000000-0000-0000-0000-000000000001';
const CLASS = '41000000-0000-0000-0000-000000000001';
const CHILD = '51000000-0000-0000-0000-000000000001';
const GROUP = '72100000-0000-0000-0000-000000000001';
const ACTIVE_GROUP = '72100000-0000-0000-0000-000000000002';
const GROUP_ASSIGNMENT = '74100000-0000-0000-0000-000000000001';
const ACTIVE_GROUP_ASSIGNMENT = '74100000-0000-0000-0000-000000000002';
const MASTERY = '75100000-0000-0000-0000-000000000001';
const TIME_ENTRY = '76100000-0000-0000-0000-000000000001';
const NEW_CHILD = '51000000-0000-0000-0000-000000000099';
const PROGRAMME = "(SELECT id FROM public.programmes WHERE code = 'literacy')";
const ACTIVE_YEAR = '(SELECT id FROM public.academic_years WHERE is_active)';

const fixtureSql = `
INSERT INTO auth.users (id) VALUES ('${HEAD_OFFICE}'), ('${ASSIGNED_EA}'), ('${UNASSIGNED_EA}');
INSERT INTO public.schools (id, name) VALUES ('${SCHOOL}', 'Upload contract harness school');
INSERT INTO public.users (id, first_name, last_name, school_id) VALUES
  ('${HEAD_OFFICE}', 'Head', 'Office', '${SCHOOL}'),
  ('${ASSIGNED_EA}', 'Assigned', 'EA', '${SCHOOL}'),
  ('${UNASSIGNED_EA}', 'Unassigned', 'EA', '${SCHOOL}');
INSERT INTO public.staff_programme_assignments (id, user_id, programme_id, school_id) VALUES
  ('31000000-0000-0000-0000-000000000002', '${ASSIGNED_EA}', ${PROGRAMME}, '${SCHOOL}'),
  ('31000000-0000-0000-0000-000000000003', '${UNASSIGNED_EA}', ${PROGRAMME}, '${SCHOOL}');
INSERT INTO public.classes (id, school_id, name, grade, academic_year_id, created_by)
VALUES ('${CLASS}', '${SCHOOL}', 'Head Office class', '1', ${ACTIVE_YEAR}, '${HEAD_OFFICE}');
INSERT INTO public.class_ea_assignments (id, class_id, ea_user_id, programme_id, created_by)
VALUES ('71100000-0000-0000-0000-000000000001', '${CLASS}', '${ASSIGNED_EA}', ${PROGRAMME}, '${HEAD_OFFICE}');
INSERT INTO public.children (id, first_name, last_name, class_id, created_by, reading_level)
VALUES ('${CHILD}', 'Harness', 'Child', '${CLASS}', '${HEAD_OFFICE}', 'letters');
INSERT INTO public.child_ea_assignments (id, user_id, child_id, created_by)
VALUES ('71200000-0000-0000-0000-000000000001', '${ASSIGNED_EA}', '${CHILD}', '${HEAD_OFFICE}');
INSERT INTO public.groups (id, name, programme_id, class_id, created_by)
VALUES ('${GROUP}', 'Head Office group', ${PROGRAMME}, '${CLASS}', '${HEAD_OFFICE}');
INSERT INTO public.group_ea_assignments (
  id, group_id, ea_user_id, programme_id, created_by, unassigned_at, handover_reason
) VALUES (
  '${GROUP_ASSIGNMENT}', '${GROUP}', '${ASSIGNED_EA}', ${PROGRAMME}, '${HEAD_OFFICE}',
  pg_catalog.now(), 'harness archive'
);
INSERT INTO public.groups (id, name, programme_id, class_id, created_by)
VALUES ('${ACTIVE_GROUP}', 'Head Office active group', ${PROGRAMME}, '${CLASS}', '${HEAD_OFFICE}');
INSERT INTO public.group_ea_assignments (
  id, group_id, ea_user_id, programme_id, created_by, unassigned_at
) VALUES (
  '${ACTIVE_GROUP_ASSIGNMENT}', '${ACTIVE_GROUP}', '${ASSIGNED_EA}', ${PROGRAMME}, '${HEAD_OFFICE}', NULL
);
INSERT INTO public.letter_mastery (id, user_id, child_id, programme_id, letter, language, source, deleted_at)
VALUES ('${MASTERY}', '${ASSIGNED_EA}', '${CHILD}', ${PROGRAMME}, 'a', 'isiXhosa', 'taught', pg_catalog.now());
INSERT INTO public.time_entries (id, user_id, sign_in_time, sign_in_lat, sign_in_lon)
VALUES ('${TIME_ENTRY}', '${ASSIGNED_EA}', pg_catalog.now(), -33.96, 25.6);
`;

// Runs one statement as an authenticated actor inside a transaction that always rolls back.
const asActor = (actorId, statement) => `
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${actorId}';
${statement}
ROLLBACK;
`;

const returnedIds = (output) => output.split('\n').map((line) => line.trim()).filter(Boolean);

// PostgREST's upsert (Prefer: resolution=merge-duplicates) for the mobile payload shape.
const upsertSql = (table, columns, values) => `
INSERT INTO public.${table} (${columns.join(', ')})
VALUES (${values.join(', ')})
ON CONFLICT (id) DO UPDATE SET ${columns.filter((c) => c !== 'id').map((c) => `${c} = EXCLUDED.${c}`).join(', ')};
`;

// PostgREST's update(...).eq('id', ...).select('id').
const updateByIdSql = (table, assignments, id) => `
UPDATE public.${table} SET ${assignments} WHERE id = '${id}' RETURNING id;
`;

const CASES = [
  {
    table: 'children',
    headOfficeCreated: true,
    upsert: upsertSql(
      'children',
      ['id', 'first_name', 'last_name', 'class_id', 'created_by', 'reading_level'],
      [`'${CHILD}'`, "'Harness'", "'Child'", `'${CLASS}'`, `'${HEAD_OFFICE}'`, "'words'"],
    ),
    update: updateByIdSql('children', "reading_level = 'words'", CHILD),
    id: CHILD,
    impersonatingInsert: `INSERT INTO public.children (id, first_name, last_name, class_id, created_by)
      VALUES ('${NEW_CHILD}', 'Fake', 'Child', '${CLASS}', '${HEAD_OFFICE}');`,
  },
  {
    table: 'classes',
    headOfficeCreated: true,
    upsert: upsertSql(
      'classes',
      ['id', 'school_id', 'name', 'grade', 'academic_year_id', 'created_by'],
      [`'${CLASS}'`, `'${SCHOOL}'`, "'Renamed by EA'", "'1'", ACTIVE_YEAR, `'${HEAD_OFFICE}'`],
    ),
    update: updateByIdSql('classes', "name = 'Renamed by EA'", CLASS),
    id: CLASS,
    impersonatingInsert: `INSERT INTO public.classes (id, school_id, name, grade, academic_year_id, created_by)
      VALUES ('41000000-0000-0000-0000-000000000099', '${SCHOOL}', 'Fake', '1', ${ACTIVE_YEAR}, '${HEAD_OFFICE}');`,
  },
  // group writes need an active assignment, hence a separate group.
  {
    table: 'groups',
    headOfficeCreated: true,
    upsert: upsertSql(
      'groups',
      ['id', 'name', 'programme_id', 'class_id', 'created_by'],
      [`'${ACTIVE_GROUP}'`, "'Renamed group'", PROGRAMME, `'${CLASS}'`, `'${HEAD_OFFICE}'`],
    ),
    update: updateByIdSql('groups', "name = 'Renamed group'", ACTIVE_GROUP),
    id: ACTIVE_GROUP,
    impersonatingInsert: `INSERT INTO public.groups (id, name, programme_id, class_id, created_by)
      VALUES ('72100000-0000-0000-0000-000000000099', 'Fake', ${PROGRAMME}, '${CLASS}', '${HEAD_OFFICE}');`,
  },
  {
    table: 'letter_mastery',
    headOfficeCreated: false,
    update: updateByIdSql('letter_mastery', 'deleted_at = NULL', MASTERY),
    id: MASTERY,
  },
  {
    table: 'time_entries',
    headOfficeCreated: false,
    update: updateByIdSql('time_entries', 'sign_out_time = pg_catalog.now()', TIME_ENTRY),
    id: TIME_ENTRY,
  },
  {
    table: 'group_ea_assignments (restore)',
    headOfficeCreated: false,
    update: updateByIdSql(
      'group_ea_assignments',
      'unassigned_at = NULL, handover_reason = NULL',
      GROUP_ASSIGNMENT,
    ),
    id: GROUP_ASSIGNMENT,
  },
];

const runCases = (databaseUrl) => {
  const summary = {};
  for (const testCase of CASES) {
    const label = testCase.table.replace(/\W+/g, '-');
    if (testCase.headOfficeCreated) {
      // 1. Red today: the upsert the app sends now is refused by the INSERT policy.
      expectSqlState({
        databaseUrl,
        sql: asActor(ASSIGNED_EA, testCase.upsert),
        label: `${label}-upsert-refused`,
        sqlState: '42501',
      });
      // 4. Impersonation: an EA cannot create a row in Head Office's name.
      expectSqlState({
        databaseUrl,
        sql: asActor(ASSIGNED_EA, testCase.impersonatingInsert),
        label: `${label}-impersonation-refused`,
        sqlState: '42501',
      });
    }
    // 2. Green with spec §6.5: UPDATE by id acknowledges exactly one row.
    assert.deepEqual(
      returnedIds(runPsql({ databaseUrl, sql: asActor(ASSIGNED_EA, testCase.update), label: `${label}-update` })),
      [testCase.id],
      `${testCase.table}: the assigned EA's UPDATE by id must acknowledge exactly one row`,
    );
    // 3. An unassigned EA's UPDATE affects zero rows (read by the app as UPDATE_NOT_APPLIED).
    assert.deepEqual(
      returnedIds(runPsql({ databaseUrl, sql: asActor(UNASSIGNED_EA, testCase.update), label: `${label}-unassigned` })),
      [],
      `${testCase.table}: an unassigned EA's UPDATE must affect zero rows`,
    );
    summary[testCase.table] = 'passed';
  }
  return summary;
};

const runLocationCases = (databaseUrl) => {
  let passed = 0;
  const owner = (sql, label) => runPsql({ databaseUrl, sql: asActor(ASSIGNED_EA, sql), label });
  const insert = (lat, lon, status) => `INSERT INTO public.time_entries
    (user_id, sign_in_time, sign_in_lat, sign_in_lon, sign_in_location_status)
    VALUES ('${ASSIGNED_EA}', now(), ${lat}, ${lon}, ${status})
    RETURNING sign_in_location_status;`;
  for (const status of ['timeout', 'denied', 'services_off', 'unavailable']) {
    assert.equal(owner(insert('NULL', 'NULL', `'${status}'`), `location-insert-${status}`), status);
    passed += 1;
  }
  assert.equal(owner(`INSERT INTO public.time_entries (user_id, sign_in_time, sign_in_lat, sign_in_lon)
    VALUES ('${ASSIGNED_EA}', now(), -33.9, 25.6) RETURNING sign_in_location_status IS NULL;`, 'location-older-build'), 't');
  passed += 1;
  for (const prefix of ['sign_in', 'sign_out']) {
    for (const [lat, lon, status] of [
      ['1', 'NULL', 'NULL'], ['NULL', '2', 'NULL'], ['NULL', 'NULL', "'fix'"],
      ['1', '2', "'timeout'"], ['1', '2', "'denied'"], ['1', '2', "'services_off'"],
      ['1', '2', "'unavailable'"], ['NULL', 'NULL', "'unknown'"],
    ]) {
      expectSqlState({ databaseUrl, label: `location-${prefix}-invalid-${passed}`, sqlState: '23514',
        sql: asActor(ASSIGNED_EA, updateByIdSql('time_entries',
          `${prefix}_lat = ${lat}, ${prefix}_lon = ${lon}, ${prefix}_location_status = ${status}`, TIME_ENTRY)) });
      passed += 1;
    }
    assert.equal(owner(updateByIdSql('time_entries',
      `${prefix}_lat = 0, ${prefix}_lon = 0, ${prefix}_location_status = 'fix'`, TIME_ENTRY), `location-${prefix}-fix`), TIME_ENTRY);
    passed += 1;
  }
  const close = updateByIdSql('time_entries',
    "sign_out_time = now(), sign_out_lat = NULL, sign_out_lon = NULL, sign_out_location_status = 'unavailable'", TIME_ENTRY);
  assert.equal(owner(close, 'location-owner-clock-out'), TIME_ENTRY);
  passed += 1;
  assert.equal(runPsql({ databaseUrl, sql: asActor(UNASSIGNED_EA, close), label: 'location-nonowner-update' }), '');
  assert.equal(runPsql({ databaseUrl, sql: asActor(UNASSIGNED_EA,
    `SELECT sign_in_location_status, sign_out_location_status FROM public.time_entries WHERE id = '${TIME_ENTRY}';`),
    label: 'location-nonowner-select' }), '');
  expectSqlState({ databaseUrl, sql: asActor(UNASSIGNED_EA, insert('NULL', 'NULL', "'timeout'")),
    label: 'location-nonowner-insert', sqlState: '42501' });
  passed += 3;
  for (const column of ['sign_in_location_status', 'sign_out_location_status']) {
    for (const privilege of ['INSERT', 'UPDATE', 'SELECT']) {
      assert.equal(runPsql({ databaseUrl, label: `location-grant-${column}-${privilege}`,
        sql: `SELECT has_column_privilege('authenticated', 'public.time_entries', '${column}', '${privilege}');` }), 't');
      passed += 1;
    }
  }
  assert.equal(runPsql({ databaseUrl, label: 'location-validated-checks', sql: `SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.time_entries'::regclass AND conname LIKE 'time_entries_%_location_%' AND convalidated;` }), '6');
  passed += 1;
  return { passed };
};

const locationLegacyFixture = `
INSERT INTO public.time_entries (id, user_id, sign_in_time, sign_in_lat, sign_in_lon,
  sign_out_time, sign_out_lat, sign_out_lon, auto_clocked_out)
VALUES
  ('76100000-0000-0000-0000-000000000002', '${ASSIGNED_EA}', now(), -33.9, 25.6, now(), -33.8, 25.7, false),
  ('76100000-0000-0000-0000-000000000003', '${ASSIGNED_EA}', now(), -33.9, 25.6, now(), NULL, NULL, true);
`;
const locationSnapshot = (databaseUrl) => runPsql({ databaseUrl, label: 'location-snapshot', sql: `
SELECT to_jsonb(t) - 'sign_in_location_status' - 'sign_out_location_status' FROM public.time_entries t ORDER BY id;
SELECT relacl::text FROM pg_class WHERE oid = 'public.time_entries'::regclass;
SELECT row_to_json(p) FROM pg_policies p WHERE schemaname = 'public' AND tablename = 'time_entries' ORDER BY policyname;
SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'time_entries' ORDER BY indexname;
SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid = 'public.time_entries'::regclass ORDER BY tgname;
` });

const main = () => {
  const baseName = process.env.HISTORY_RLS_DATABASE_NAME;
  const databaseName = baseName ? `${baseName}_upload` : baseName;
  const adminUrl = assertDisposableAdminTarget({
    adminDatabaseUrl: process.env.HISTORY_RLS_ADMIN_DATABASE_URL,
    databaseName,
    confirmation: process.env.HISTORY_RLS_DISPOSABLE_CONFIRM,
  });
  const adminDatabaseUrl = buildDatabaseUrl(adminUrl, 'postgres').href;
  const databaseUrl = buildDatabaseUrl(adminUrl, databaseName).href;
  const quotedDatabase = quoteIdentifier(databaseName);

  runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-stale-database' });
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `CREATE DATABASE ${quotedDatabase};`, label: 'create-database' });
  try {
    runPsql({ databaseUrl, sql: bootstrapSql, label: 'bootstrap' });
    let seeded = false;
    for (const filename of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
      let before;
      if (filename === LOCATION_MIGRATION) {
        runPsql({ databaseUrl, sql: fixtureSql + locationLegacyFixture, label: 'pre-location-fixture' });
        seeded = true;
        before = locationSnapshot(databaseUrl);
      }
      runPsql({ databaseUrl, file: path.join(MIGRATIONS_DIR, filename), label: `migration-${filename}` });
      if (before) assert.equal(locationSnapshot(databaseUrl), before, 'Location migration preserves legacy rows, grants, policies, indexes and triggers');
    }
    if (!seeded) runPsql({ databaseUrl, sql: fixtureSql, label: 'upload-contract-fixture' });
    process.stdout.write(`${JSON.stringify({ ...runCases(databaseUrl), location: runLocationCases(databaseUrl) })}\n`);
  } finally {
    runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-database' });
  }
};

if (require.main === module) {
  main();
}

module.exports = { CASES, fixtureSql };
