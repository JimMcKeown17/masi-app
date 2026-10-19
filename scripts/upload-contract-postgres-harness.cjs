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
const CHILD_ASSIGNMENT = '71200000-0000-0000-0000-000000000001';
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
INSERT INTO public.users (id, first_name, last_name, school_id, organization_id) VALUES
  ('${HEAD_OFFICE}', 'Head', 'Office', '${SCHOOL}', 'a111879f-d066-47c9-95a1-bed2a400319a'),
  ('${ASSIGNED_EA}', 'Assigned', 'EA', '${SCHOOL}', 'a111879f-d066-47c9-95a1-bed2a400319a'),
  ('${UNASSIGNED_EA}', 'Unassigned', 'EA', '${SCHOOL}', 'a111879f-d066-47c9-95a1-bed2a400319a');
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
VALUES ('${CHILD_ASSIGNMENT}', '${ASSIGNED_EA}', '${CHILD}', '${HEAD_OFFICE}');
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

// Setup runs as postgres before the actor's statements; the whole transaction rolls back.
const asActor = (actorId, statement, setup = '') => `
BEGIN;
${setup}
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${actorId}';
${statement}
ROLLBACK;
`;

const returnedIds = (output) => output.split('\n').map((line) => line.trim()).filter(Boolean);

// PostgREST's upsert (Prefer: resolution=merge-duplicates) for the mobile payload shape.
const upsertSql = (table, columns, values, returning = false) => `
INSERT INTO public.${table} (${columns.join(', ')})
VALUES ${(Array.isArray(values[0]) ? values : [values]).map((row) => `(${row.join(', ')})`).join(', ')}
ON CONFLICT (id) DO UPDATE SET ${columns.filter((c) => c !== 'id').map((c) => `${c} = EXCLUDED.${c}`).join(', ')}${returning ? ' RETURNING id' : ''};
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

const runRowVersionCases = (databaseUrl) => {
  let passed = 0;
  const childSeed = `UPDATE public.children SET row_version = 3 WHERE id = '${CHILD}';`;
  // Conflicting upserts still need INSERT permission; use EA-created children for those cases.
  const upsertSeed = `${childSeed}
    UPDATE public.children SET created_by = '${ASSIGNED_EA}' WHERE id = '${CHILD}';`;
  const batchSeed = `${upsertSeed}
    INSERT INTO public.children (id, first_name, last_name, class_id, created_by, reading_level)
    VALUES ('${NEW_CHILD}', 'Harness', 'Child', '${CLASS}', '${ASSIGNED_EA}', 'letters');
    UPDATE public.children SET row_version = 3 WHERE id = '${NEW_CHILD}';`;
  const childUpsert = (versions, returning = true) => upsertSql(
    'children',
    ['id', 'first_name', 'last_name', 'class_id', 'created_by', 'reading_level',
      ...(versions[0] === undefined ? [] : ['row_version'])],
    versions.map((version, index) => [
      `'${[CHILD, NEW_CHILD][index]}'`, "'Harness'", "'Child'", `'${CLASS}'`, `'${ASSIGNED_EA}'`, "'words'",
      ...(version === undefined ? [] : [version]),
    ]),
    returning,
  );
  const versionPatch = (version) => version === undefined ? '' : `, row_version = ${version}`;
  const cases = [
    {
      label: 'children-update', table: 'children', id: CHILD, setup: childSeed,
      write: (version) => updateByIdSql('children', `reading_level = 'words'${versionPatch(version)}`, CHILD),
      state: 'reading_level', expected: 'words',
    },
    {
      label: 'children-upsert', table: 'children', id: CHILD, setup: upsertSeed,
      write: (version) => childUpsert([version]), state: 'reading_level', expected: 'words',
    },
    {
      label: 'groups-archive', table: 'groups', id: ACTIVE_GROUP,
      setup: `UPDATE public.groups SET row_version = 3, archived_at = NULL WHERE id = '${ACTIVE_GROUP}';`,
      write: (version) => updateByIdSql('groups', `archived_at = now()${versionPatch(version)}`, ACTIVE_GROUP),
      state: 'archived_at IS NOT NULL', expected: 't',
    },
    {
      label: 'groups-restore', table: 'groups', id: ACTIVE_GROUP,
      setup: `UPDATE public.groups SET row_version = 3, archived_at = now() WHERE id = '${ACTIVE_GROUP}';`,
      write: (version) => updateByIdSql('groups', `archived_at = NULL${versionPatch(version)}`, ACTIVE_GROUP),
      state: 'archived_at IS NULL', expected: 't',
    },
    {
      label: 'child-assignment-archive', table: 'child_ea_assignments', id: CHILD_ASSIGNMENT,
      setup: `UPDATE public.child_ea_assignments SET row_version = 3 WHERE id = '${CHILD_ASSIGNMENT}';`,
      write: (version) => updateByIdSql('child_ea_assignments',
        `unassigned_at = now()${versionPatch(version)}`, CHILD_ASSIGNMENT),
      state: 'unassigned_at IS NOT NULL', expected: 't',
    },
  ];
  for (const testCase of cases) {
    expectSqlState({ databaseUrl, label: `version-${testCase.label}-lower`, sqlState: 'MV001',
      sql: asActor(ASSIGNED_EA, testCase.write(2), testCase.setup) });
    passed += 1;
    for (const [version, stored, label] of [[undefined, 3, 'omitted'], [4, 4, 'higher']]) {
      const sql = `${testCase.write(version)}
        SELECT row_version, ${testCase.state} FROM public.${testCase.table} WHERE id = '${testCase.id}';`;
      assert.deepEqual(returnedIds(runPsql({ databaseUrl, label: `version-${testCase.label}-${label}`,
        sql: asActor(ASSIGNED_EA, sql, testCase.setup) })), [testCase.id, `${stored}|${testCase.expected}`]);
      passed += 1;
    }
  }

  // Catch inside a subtransaction to inspect both rows, then rethrow the original SQLSTATE.
  expectSqlState({ databaseUrl, label: 'version-children-batch-lower-atomic', sqlState: 'MV001',
    sql: asActor(ASSIGNED_EA, `DO $case$ BEGIN
      BEGIN
        ${childUpsert([4, 2], false)}
        RAISE EXCEPTION 'Expected the stale batch to fail';
      EXCEPTION WHEN SQLSTATE 'MV001' THEN
        IF (SELECT count(*) FROM public.children WHERE id IN ('${CHILD}', '${NEW_CHILD}')
            AND row_version = 3 AND reading_level = 'letters') <> 2 THEN
          RAISE EXCEPTION 'A refused batch changed a child';
        END IF;
        RAISE;
      END;
    END; $case$;`, batchSeed) });
  passed += 1;
  for (const [version, stored, label] of [[undefined, 3, 'omitted'], [4, 4, 'higher']]) {
    const output = returnedIds(runPsql({ databaseUrl, label: `version-children-batch-${label}`,
      sql: asActor(ASSIGNED_EA, `${childUpsert([version, version])}
        SELECT id, row_version, reading_level FROM public.children
        WHERE id IN ('${CHILD}', '${NEW_CHILD}') ORDER BY id;`, batchSeed) }));
    assert.deepEqual(output.slice(0, 2).sort(), [CHILD, NEW_CHILD].sort());
    assert.deepEqual(output.slice(2), [CHILD, NEW_CHILD].sort().map((id) => `${id}|${stored}|words`));
    passed += 1;
  }

  expectSqlState({ databaseUrl, label: 'version-s1-after-s2', sqlState: 'MV001',
    sql: asActor(ASSIGNED_EA, `
      ${updateByIdSql('children', "first_name = 'B', row_version = 3", CHILD)}
      DO $case$ BEGIN
        BEGIN
          UPDATE public.children SET first_name = 'A', row_version = 2 WHERE id = '${CHILD}';
          RAISE EXCEPTION 'Expected S1 after S2 to fail';
        EXCEPTION WHEN SQLSTATE 'MV001' THEN
          IF NOT EXISTS (SELECT 1 FROM public.children
              WHERE id = '${CHILD}' AND first_name = 'B' AND row_version = 3) THEN
            RAISE EXCEPTION 'S1 overwrote S2';
          END IF;
          RAISE;
        END;
      END; $case$;`, childSeed) });
  passed += 1;

  // Run as the table owner: the point is that ON CONFLICT DO NOTHING never reaches the
  // BEFORE UPDATE version rule; RLS on assignment inserts is covered by runCases.
  assert.deepEqual(returnedIds(runPsql({ databaseUrl, label: 'version-assignment-insert-ignore',
    sql: `BEGIN;
      UPDATE public.child_ea_assignments SET row_version = 3 WHERE id = '${CHILD_ASSIGNMENT}';
      INSERT INTO public.child_ea_assignments (id, user_id, child_id, created_by, row_version)
      VALUES ('${CHILD_ASSIGNMENT}', '${ASSIGNED_EA}', '${CHILD}', '${ASSIGNED_EA}', 2)
      ON CONFLICT (id) DO NOTHING RETURNING id;
      SELECT row_version, created_by FROM public.child_ea_assignments WHERE id = '${CHILD_ASSIGNMENT}';
      ROLLBACK;` })),
  [`3|${HEAD_OFFICE}`]);
  passed += 1;

  assert.deepEqual(returnedIds(runPsql({ databaseUrl, label: 'version-class-delete-set-null', sql: `
    BEGIN;
    ${childSeed}
    UPDATE public.groups SET row_version = 3 WHERE id IN ('${GROUP}', '${ACTIVE_GROUP}');
    DELETE FROM public.classes WHERE id = '${CLASS}' RETURNING id;
    SELECT row_version, class_id IS NULL FROM public.children WHERE id = '${CHILD}';
    SELECT row_version, class_id IS NULL FROM public.groups WHERE id IN ('${GROUP}', '${ACTIVE_GROUP}') ORDER BY id;
    ROLLBACK;` })), [CLASS, '3|t', '3|t', '3|t']);
  passed += 1;

  const membershipId = '71300000-0000-0000-0000-000000000001';
  assert.deepEqual(returnedIds(runPsql({ databaseUrl, label: 'version-membership-exit-omitted',
    sql: asActor(ASSIGNED_EA, `
      ${updateByIdSql('child_class_memberships', 'exited_at = now()', membershipId)}
      SELECT row_version, exited_at IS NOT NULL FROM public.child_class_memberships WHERE id = '${membershipId}';`, `
      INSERT INTO public.child_class_memberships (id, child_id, class_id, academic_year_id, created_by)
      VALUES ('${membershipId}', '${CHILD}', '${CLASS}', ${ACTIVE_YEAR}, '${HEAD_OFFICE}');
      UPDATE public.child_class_memberships SET row_version = 3 WHERE id = '${membershipId}';`) })),
  [membershipId, '3|t']);
  passed += 1;
  return { passed };
};

const runTimeEntryForwardCases = (databaseUrl) => {
  let passed = 0;
  const lateOpenUpsert = upsertSql('time_entries',
    ['id', 'user_id', 'sign_in_time', 'sign_in_lat', 'sign_in_lon',
      'sign_out_time', 'sign_out_lat', 'sign_out_lon', 'sign_out_location_status', 'auto_clocked_out'],
    [`'${TIME_ENTRY}'`, `'${ASSIGNED_EA}'`,
      `(SELECT sign_in_time FROM public.time_entries WHERE id = '${TIME_ENTRY}')`, '-33.96', '25.6',
      'NULL', 'NULL', 'NULL', 'NULL', 'false'], true);

  // RED on the pre-fix migrations: the open snapshot overwrites the owner's close.
  assert.deepEqual(returnedIds(runPsql({ databaseUrl, label: 'late open write reopens a closed shift',
    sql: asActor(ASSIGNED_EA, `
      ${updateByIdSql('time_entries', "sign_out_time = sign_in_time + interval '6 hours'", TIME_ENTRY)}
      ${lateOpenUpsert}
      SELECT sign_out_time IS NOT DISTINCT FROM sign_in_time + interval '6 hours'
        FROM public.time_entries WHERE id = '${TIME_ENTRY}';`) })),
  [TIME_ENTRY, TIME_ENTRY, 't'], 'late open write reopens a closed shift');
  passed += 1;

  const start = "(now() - interval '11 hours')";
  const open = { hours: null, lat: null, lon: null, status: null, auto: false };
  const manual = { hours: 6, lat: -33.95, lon: 25.61, status: 'fix', auto: false };
  const automatic = { ...open, hours: 10, auto: true };
  const later = { ...manual, hours: 7, lat: -33.94, lon: 25.62 };
  const tooLate = { ...later, hours: 11 };
  const columns = ['sign_out_time', 'sign_out_lat', 'sign_out_lon', 'sign_out_location_status', 'auto_clocked_out'];
  const values = (state) => [
    state.hours === null ? 'NULL' : `${start} + interval '${state.hours} hours'`,
    state.lat ?? 'NULL', state.lon ?? 'NULL',
    state.status === null ? 'NULL' : `'${state.status}'`, state.auto,
  ];
  const assignments = (state) => columns.map((column, index) => `${column} = ${values(state)[index]}`).join(', ');
  const setup = (state) => `UPDATE public.time_entries SET sign_in_time = ${start},
    ${assignments(state)} WHERE id = '${TIME_ENTRY}';`;
  const jobSetup = `${setup(open)}
    DO $case$ BEGIN PERFORM private.close_overdue_time_entries(); END; $case$;`;
  const snapshot = `SELECT json_build_object(
    'hours', extract(epoch FROM (sign_out_time - sign_in_time)) / 3600,
    'lat', sign_out_lat, 'lon', sign_out_lon, 'status', sign_out_location_status, 'auto', auto_clocked_out)
    FROM public.time_entries WHERE id = '${TIME_ENTRY}';`;
  const write = (kind, state) => {
    if (kind === 'update') return updateByIdSql('time_entries', assignments(state), TIME_ENTRY);
    const insert = `INSERT INTO public.time_entries
      (id, user_id, sign_in_time, sign_in_lat, sign_in_lon, ${columns.join(', ')})
      VALUES ('${TIME_ENTRY}', '${ASSIGNED_EA}', ${start}, -33.96, 25.6, ${values(state).join(', ')})`;
    return `${insert}${kind === 'upsert' ? ` ON CONFLICT (id) DO UPDATE SET ${columns
      .map((column) => `${column} = EXCLUDED.${column}`).join(', ')}` : ''} RETURNING id;`;
  };
  const expectWrite = (label, sql, seed, expected, actor = ASSIGNED_EA) => {
    const output = returnedIds(runPsql({ databaseUrl, label,
      sql: actor === null ? `BEGIN; ${seed} ${sql} ${snapshot} ROLLBACK;`
        : asActor(actor, `${sql} ${snapshot}`, seed) }));
    assert.equal(output.length, 2, `${label}: one returned id and one stored snapshot`);
    assert.equal(output[0], TIME_ENTRY, `${label}: the write must acknowledge exactly one row`);
    assert.deepEqual(JSON.parse(output[1]), expected, `${label}: stored clock-out fields`);
    passed += 1;
  };

  const cases = [
    { label: 'open-honest-close', stored: open, incoming: manual, expected: manual },
    { label: 'open-exact-ten-hour-close', stored: open, incoming: automatic, expected: automatic },
    { label: 'open-over-ten-hour-close', stored: open, incoming: tooLate, expected: automatic },
    { label: 'open-retry', stored: open, incoming: open, expected: open },
    { label: 'job-closed-exact-phone-auto-close', job: true, incoming: automatic, expected: automatic },
    { label: 'job-closed-honest-close', job: true, incoming: manual, expected: manual },
    { label: 'job-closed-open-retry', job: true, incoming: open, expected: automatic },
    { label: 'job-closed-later-close', job: true, incoming: tooLate, expected: automatic },
    { label: 'manual-closed-open-retry', stored: manual, incoming: open, expected: manual },
    { label: 'manual-closed-later-close', stored: manual, incoming: later, expected: manual },
    { label: 'manual-closed-earlier-close', stored: later, incoming: manual, expected: later },
    { label: 'manual-closed-auto-close', stored: manual, incoming: automatic, expected: manual },
    { label: 'non-ten-hour-auto-is-preserved', stored: { ...manual, auto: true },
      incoming: { ...later, hours: 5 }, expected: { ...manual, auto: true } },
  ];
  for (const kind of ['update', 'upsert']) {
    for (const testCase of cases) {
      expectWrite(`time-entry-${kind}-${testCase.label}`, write(kind, testCase.incoming),
        testCase.job ? jobSetup : setup(testCase.stored), testCase.expected);
    }
  }
  const missing = `DELETE FROM public.time_entries WHERE id = '${TIME_ENTRY}';`;
  expectWrite('time-entry-insert-over-ten-hour-close', write('insert', tooLate), missing, automatic);
  expectWrite('time-entry-insert-honest-close', write('insert', manual), missing, manual);
  expectWrite('time-entry-insert-open', write('insert', open), missing, open);

  // No auth.uid(): Head Office corrections are outside the EA's forward-only rule.
  expectWrite('time-entry-postgres-closed-update', write('update', tooLate), setup(manual), tooLate, null);
  expectWrite('time-entry-postgres-closed-insert', write('insert', tooLate), missing, tooLate, null);

  const recentEntry = '76100000-0000-0000-0000-000000000099';
  assert.deepEqual(returnedIds(runPsql({ databaseUrl, label: 'time-entry-job-overdue-only-and-idempotent', sql: `
    BEGIN;
    ${setup(open)}
    INSERT INTO public.time_entries (id, user_id, sign_in_time, sign_in_lat, sign_in_lon)
    VALUES ('${recentEntry}', '${ASSIGNED_EA}', now() - interval '2 hours', -33.96, 25.6);
    SELECT private.close_overdue_time_entries();
    SELECT sign_out_time = sign_in_time + interval '10 hours', auto_clocked_out,
      sign_out_lat IS NULL, sign_out_lon IS NULL, sign_out_location_status IS NULL
      FROM public.time_entries WHERE id = '${TIME_ENTRY}';
    SELECT sign_out_time IS NULL, auto_clocked_out FROM public.time_entries WHERE id = '${recentEntry}';
    SELECT private.close_overdue_time_entries();
    ROLLBACK;` })), ['1', 't|t|t|t|t', 't|f', '0']);
  passed += 1;

  for (const role of ['anon', 'authenticated', 'service_role']) {
    expectSqlState({ databaseUrl, label: `time-entry-job-${role}-refused`, sqlState: '42501',
      sql: `BEGIN; SET LOCAL ROLE ${role}; SELECT private.close_overdue_time_entries(); ROLLBACK;` });
    assert.equal(runPsql({ databaseUrl, label: `time-entry-job-${role}-execute-revoked`,
      sql: `SELECT has_function_privilege('${role}', 'private.close_overdue_time_entries()', 'EXECUTE');` }), 'f');
    passed += 2;
  }
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
    process.stdout.write(`${JSON.stringify({
      ...runCases(databaseUrl), location: runLocationCases(databaseUrl), rowVersion: runRowVersionCases(databaseUrl),
      timeEntryForward: runTimeEntryForwardCases(databaseUrl),
    })}\n`);
  } finally {
    runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-database' });
  }
};

if (require.main === module) {
  main();
}

module.exports = { CASES, fixtureSql };
