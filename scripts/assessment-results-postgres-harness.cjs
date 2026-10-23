#!/usr/bin/env node

// Assessment Results Plan 1, Task 6. The controller runs this against disposable PG17.
// Never loads dotenv or invokes Supabase CLI. Fixtures use only the pre-Task-6 schema,
// so RED is an executed submit_assessment assertion, not a missing fixture table.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  MIGRATIONS_DIR,
  assertDisposableAdminTarget,
  bootstrapSql,
  buildDatabaseUrl,
  buildPsqlEnv,
  expectSqlState,
  runPsql,
} = require('./history-authorization-postgres-harness.cjs');

const EA_A = '14000000-0000-0000-0000-000000000001';
const EA_B = '14000000-0000-0000-0000-000000000002';
const UNRELATED_EA = '14000000-0000-0000-0000-000000000003';
const NO_PROGRAMME_EA = '14000000-0000-0000-0000-000000000004';
const HEAD_OFFICE = '14000000-0000-0000-0000-000000000005';
const SCHOOL = '24000000-0000-0000-0000-000000000001';
const CLASS_A = '44000000-0000-0000-0000-000000000001';
const CLASS_B = '44000000-0000-0000-0000-000000000002';
const CHILD = '54000000-0000-0000-0000-000000000001';
const OTHER_CHILD = '54000000-0000-0000-0000-000000000002';
const UNAUTHORIZED_CHILD = '54000000-0000-0000-0000-000000000003';
const PROGRAMME = "(SELECT id FROM public.programmes WHERE code = 'literacy')";
const ACTIVE_YEAR = '(SELECT id FROM public.academic_years WHERE is_active)';
const STARTED_AT = '2026-10-01T09:00:00.000Z';
const COMPLETED_AT = '2026-10-01T09:10:00.000Z';
const WHOLE_CLASS_MIGRATION = '20261023120000_whole_class_assessment_access.sql';
const OLD_UPDATED_AT = '2001-01-01T00:00:00.000Z';
const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const json = (value) => `${quote(JSON.stringify(value))}::jsonb`;

// No class/group assignments: revoking a direct child assignment must really remove
// write authority. A and B share CHILD only to isolate the other-EA-run check.
const fixtureSql = `
INSERT INTO auth.users (id) VALUES
  ('${EA_A}'), ('${EA_B}'), ('${UNRELATED_EA}'), ('${NO_PROGRAMME_EA}'), ('${HEAD_OFFICE}');
INSERT INTO public.schools (id, name) VALUES ('${SCHOOL}', 'Assessment results harness school');
INSERT INTO public.users (id, first_name, last_name, school_id, organization_id)
SELECT id, 'Assessment harness', id::text, '${SCHOOL}', 'a111879f-d066-47c9-95a1-bed2a400319a'
FROM auth.users;
INSERT INTO public.staff_programme_assignments (user_id, programme_id, school_id)
VALUES ('${EA_A}', ${PROGRAMME}, '${SCHOOL}'),
       ('${EA_B}', ${PROGRAMME}, '${SCHOOL}'),
       ('${UNRELATED_EA}', ${PROGRAMME}, '${SCHOOL}');
INSERT INTO public.classes (id, school_id, name, grade, academic_year_id, created_by)
VALUES ('${CLASS_A}', '${SCHOOL}', 'Harness A', '1', ${ACTIVE_YEAR}, '${HEAD_OFFICE}'),
       ('${CLASS_B}', '${SCHOOL}', 'Harness B', '1', ${ACTIVE_YEAR}, '${HEAD_OFFICE}');
INSERT INTO public.children (id, first_name, last_name, created_by)
VALUES ('${CHILD}', 'Harness', 'Shared child', '${HEAD_OFFICE}'),
       ('${OTHER_CHILD}', 'Harness', 'Other child', '${HEAD_OFFICE}'),
       ('${UNAUTHORIZED_CHILD}', 'Harness', 'Unauthorized child', '${HEAD_OFFICE}');
INSERT INTO public.child_ea_assignments (user_id, child_id, created_by)
VALUES ('${EA_A}', '${CHILD}', '${HEAD_OFFICE}'),
       ('${EA_B}', '${CHILD}', '${HEAD_OFFICE}'),
       ('${NO_PROGRAMME_EA}', '${CHILD}', '${HEAD_OFFICE}'),
       ('${EA_A}', '${OTHER_CHILD}', '${HEAD_OFFICE}'),
       ('${EA_B}', '${UNAUTHORIZED_CHILD}', '${HEAD_OFFICE}');
`;

const asActor = (actorId, statement, { setup = '', commit = false } = {}) => `
BEGIN;
${setup}
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${actorId}';
${statement}
${commit ? 'COMMIT' : 'ROLLBACK'};
`;

const sqlAssert = (condition, message) => `
DO $assert$
BEGIN
  IF (${condition}) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION '%', ${quote(message)};
  END IF;
END;
$assert$;
`;

const makeFamily = (programmeId, overrides = {}, positions = [0, 1, 2]) => {
  const assessment = {
    id: randomUUID(), user_id: EA_A, child_id: CHILD, programme_id: programmeId,
    battery_run_id: null, question_code: 'letter_sounds', question_version: '2026.1',
    item_set_id: 'letter_sounds@2026.1.en', language: 'en', stopped_reason: 'completed',
    duration_ms: 1200, derived: { total_correct: 2, total_attempted: 3, capture_mode: 'sequential' },
    assessment_type: 'letter_sounds', score: 2, total_items: positions.length,
    capture_mode: 'sequential', assessment_purpose: 'progress_check', assessment_window_id: null,
    assessment_date: '2026-10-01', created_at: STARTED_AT, updated_at: OLD_UPDATED_AT,
    ...overrides,
  };
  const items = positions.map((position, index) => ({
    id: randomUUID(), assessment_id: assessment.id, position,
    item_key: ['a', 'b', 'c'][index], prompt: ['a', 'b', 'c'][index],
    is_correct: index !== 1, metadata: { row: 0, reached: true },
    created_at: STARTED_AT, updated_at: OLD_UPDATED_AT,
  }));
  return { assessment, items };
};

const makeRun = (programmeId, overrides = {}) => ({
  id: randomUUID(), user_id: EA_A, child_id: CHILD, programme_id: programmeId,
  class_id: null, battery_code: 'wela_plus_full', battery_version: '2024.1',
  assessment_purpose: 'progress_check', assessment_window_id: null, language: 'en',
  started_at: STARTED_AT, completed_at: null, status: 'in_progress', notes: null,
  created_at: STARTED_AT, updated_at: OLD_UPDATED_AT,
  ...overrides,
});
const completed = (run) => ({ ...run, status: 'completed', completed_at: COMPLETED_AT });
const submit = ({ assessment, items }) => `public.submit_assessment(${json(assessment)}, ${json(items)})`;
const saveRun = (run) => `public.save_battery_run(${json(run)})`;
const expectResult = (call, expected) => sqlAssert(`${call} = '${expected}'`, `Expected ${expected}`);
const count = (table, column, id) => `(SELECT count(*) FROM public.${table} WHERE ${column} = '${id}')`;
const familyCounts = (family, expectedItems = family.items.length, expectedParents = 1) => `
${sqlAssert(`${count('assessments', 'id', family.assessment.id)} = ${expectedParents}`, 'Parent count')}
${sqlAssert(`${count('assessment_items', 'assessment_id', family.assessment.id)} = ${expectedItems}`, 'Item count')}
`;

const childSetup = (childId) => `
INSERT INTO public.children (id, first_name, last_name, created_by)
VALUES ('${childId}', 'Independent', 'Harness child', '${HEAD_OFFICE}');
INSERT INTO public.child_ea_assignments (user_id, child_id, created_by)
VALUES ('${EA_A}', '${childId}', '${HEAD_OFFICE}');
`;
const revokeChild = (childId) => `
UPDATE public.child_ea_assignments SET unassigned_at = now()
WHERE child_id = '${childId}' AND user_id = '${EA_A}' AND unassigned_at IS NULL;
`;
const directInsert = (table, row) => {
  const value = (v) => v === null ? 'NULL'
    : typeof v === 'object' ? json(v)
      : typeof v === 'string' ? quote(v) : String(v);
  return `INSERT INTO public.${table} (${Object.keys(row).join(', ')})
    VALUES (${Object.values(row).map(value).join(', ')});`;
};

const runCases = (databaseUrl, programmeId) => {
  const summary = {};
  const check = (label, sql) => {
    runPsql({ databaseUrl, label, sql });
    summary[label] = 'passed';
  };
  const denied = (label, sql, sqlState) => {
    expectSqlState({ databaseUrl, label, sql, sqlState });
    summary[label] = 'passed';
  };

  const first = makeFamily(programmeId);
  // Keep this first: before Task 6's migration, this DO executes and fails on
  // public.submit_assessment(jsonb, jsonb), after migrations and fixtures succeeded.
  check('submit-complete-insert', asActor(EA_A, `
    ${expectResult(submit(first), 'inserted')}
    RESET ROLE;
    ${familyCounts(first)}
    ${sqlAssert(`(SELECT question_code = 'letter_sounds' AND total_items = 3 AND score = 2
      FROM public.assessments WHERE id = '${first.assessment.id}')`, 'Stored parent fields')}
    ${sqlAssert(`(SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'assessment_id', assessment_id, 'position', position,
      'item_key', item_key, 'is_correct', is_correct, 'metadata', metadata) ORDER BY position)
      FROM public.assessment_items WHERE assessment_id = '${first.assessment.id}') =
      ${json(first.items.map(({ created_at, updated_at, prompt, ...item }) => item))}`, 'Stored item evidence')}
  `));

  const replay = makeFamily(programmeId);
  check('submit-replay', asActor(EA_A, `
    ${expectResult(submit(replay), 'inserted')}
    ${expectResult(submit(replay), 'already_present')}
    RESET ROLE;
    ${familyCounts(replay)}
  `));

  const revokedChild = randomUUID();
  const revokedFamily = makeFamily(programmeId, { child_id: revokedChild });
  runPsql({ databaseUrl, label: 'submit-revoked-seed', sql: asActor(EA_A,
    expectResult(submit(revokedFamily), 'inserted'), { setup: childSetup(revokedChild), commit: true }) });
  runPsql({ databaseUrl, label: 'submit-revoke-assignment', sql: revokeChild(revokedChild) });
  check('submit-committed-replay-after-revocation', asActor(EA_A, `
    ${sqlAssert(`NOT private.current_user_can_write_for_child('${revokedChild}')`, 'Assignment really revoked')}
    ${expectResult(submit(revokedFamily), 'already_present')}
    RESET ROLE;
    ${familyCounts(revokedFamily)}
  `));

  for (const mismatch of ['child_id', 'item_set_id', 'item-id-set']) {
    const original = makeFamily(programmeId);
    const incoming = structuredClone(original);
    if (mismatch === 'item-id-set') incoming.items[0].id = randomUUID();
    else incoming.assessment[mismatch] = mismatch === 'child_id' ? OTHER_CHILD : 'letter_sounds@2026.2.en';
    denied(`submit-mismatch-${mismatch}`, asActor(EA_A, `
      ${expectResult(submit(original), 'inserted')}
      SELECT ${submit(incoming)};
    `), 'MA001');
  }

  const sparse = makeFamily(programmeId, {}, [0, 3, 7]);
  check('submit-sparse-positions', asActor(EA_A, `
    ${expectResult(submit(sparse), 'inserted')}
    RESET ROLE;
    ${familyCounts(sparse)}
    ${sqlAssert(`(SELECT array_agg(position ORDER BY position) FROM public.assessment_items
      WHERE assessment_id = '${sparse.assessment.id}') = ARRAY[0,3,7]`, 'Sparse positions preserved')}
  `));

  for (const malformed of ['duplicate-positions', 'short-items', 'missing-metadata']) {
    const family = makeFamily(programmeId);
    if (malformed === 'duplicate-positions') family.items[1].position = family.items[0].position;
    if (malformed === 'short-items') family.items.pop();
    if (malformed === 'missing-metadata') delete family.items[0].metadata;
    // Catch in a subtransaction and inspect before the outer ROLLBACK, so that
    // partial writes cannot be hidden by the harness's transaction cleanup.
    denied(`submit-${malformed}`, asActor(EA_A, `
      DO $case$
      BEGIN
        BEGIN
          PERFORM ${submit(family)};
          RAISE EXCEPTION 'Malformed family unexpectedly accepted';
        EXCEPTION WHEN SQLSTATE '22023' THEN
          IF ${count('assessments', 'id', family.assessment.id)} <> 0
            OR ${count('assessment_items', 'assessment_id', family.assessment.id)} <> 0 THEN
            RAISE EXCEPTION 'Rejected family left partial rows';
          END IF;
          RAISE;
        END;
      END;
      $case$;
    `), '22023');
  }

  for (const [label, actorId, overrides] of [
    ['unauthorized-child', EA_A, { child_id: UNAUTHORIZED_CHILD }],
    ['no-programme-assignment', NO_PROGRAMME_EA, { user_id: NO_PROGRAMME_EA }],
    ['caller-mismatch', EA_A, { user_id: EA_B }],
  ]) {
    denied(`submit-${label}`, asActor(actorId, `SELECT ${submit(makeFamily(programmeId, overrides))};`), '42501');
    denied(`run-${label}`, asActor(actorId, `SELECT ${saveRun(makeRun(programmeId, overrides))};`), '42501');
  }

  for (const [label, runOverrides, owner] of [
    ['another-eas-run', { user_id: EA_B }, EA_B],
    ['run-child-mismatch', { child_id: OTHER_CHILD }, EA_A],
  ]) {
    const run = makeRun(programmeId, runOverrides);
    const family = makeFamily(programmeId, { battery_run_id: run.id });
    denied(`submit-${label}`, asActor(owner, `
      ${expectResult(saveRun(run), 'inserted')}
      SET LOCAL request.jwt.claim.sub = '${EA_A}';
      SELECT ${submit(family)};
    `), '42501');
  }

  const finishedRun = makeRun(programmeId);
  const lateQuestion = makeFamily(programmeId, { battery_run_id: finishedRun.id });
  check('submit-question-after-run-completed', asActor(EA_A, `
    ${expectResult(saveRun(finishedRun), 'inserted')}
    ${expectResult(saveRun(completed(finishedRun)), 'updated')}
    ${expectResult(submit(lateQuestion), 'inserted')}
    RESET ROLE;
    ${familyCounts(lateQuestion)}
  `));
  const duplicateRun = makeRun(programmeId);
  const originalQuestion = makeFamily(programmeId, { battery_run_id: duplicateRun.id });
  const duplicateQuestion = makeFamily(programmeId, { battery_run_id: duplicateRun.id });
  denied('submit-duplicate-run-question', asActor(EA_A, `
    ${expectResult(saveRun(duplicateRun), 'inserted')}
    ${expectResult(submit(originalQuestion), 'inserted')}
    SELECT ${submit(duplicateQuestion)};
  `), '23505');

  const newRun = makeRun(programmeId);
  check('run-insert', asActor(EA_A, `
    ${expectResult(saveRun(newRun), 'inserted')}
    RESET ROLE;
    ${sqlAssert(`${count('battery_runs', 'id', newRun.id)} = 1`, 'One run stored')}
    ${sqlAssert(`(SELECT status = 'in_progress' AND completed_at IS NULL
      FROM public.battery_runs WHERE id = '${newRun.id}')`, 'Initial run state')}
  `));

  for (const mode of ['forward-update', 'in-progress-replay', 'completed-replay', 'stale-in-progress']) {
    const run = makeRun(programmeId);
    const terminal = mode !== 'in-progress-replay';
    check(`run-${mode}`, asActor(EA_A, `
      ${expectResult(saveRun(run), 'inserted')}
      ${terminal ? expectResult(saveRun(completed(run)), 'updated') : ''}
      ${mode === 'forward-update' ? '' : expectResult(saveRun(
        mode === 'completed-replay' ? completed(run) : run), 'unchanged')}
      RESET ROLE;
      ${sqlAssert(`${count('battery_runs', 'id', run.id)} = 1`, 'One run after retry')}
      ${sqlAssert(`(SELECT status = '${terminal ? 'completed' : 'in_progress'}'
        AND completed_at IS NOT DISTINCT FROM ${terminal ? `'${COMPLETED_AT}'::timestamptz` : 'NULL::timestamptz'}
        FROM public.battery_runs WHERE id = '${run.id}')`, 'Run must not regress')}
    `));
  }

  for (const [label, patch] of [
    ['different-terminal-status', { status: 'abandoned', completed_at: null }],
    ['different-completed-at', { completed_at: '2026-10-01T09:11:00.000Z' }],
  ]) {
    const run = makeRun(programmeId);
    denied(`run-${label}`, asActor(EA_A, `
      ${expectResult(saveRun(run), 'inserted')}
      ${expectResult(saveRun(completed(run)), 'updated')}
      SELECT ${saveRun({ ...completed(run), ...patch })};
    `), 'MA002');
  }

  const finalizeChild = randomUUID();
  const finalizeRun = makeRun(programmeId, { child_id: finalizeChild });
  runPsql({ databaseUrl, label: 'run-revoked-seed', sql: asActor(EA_A,
    expectResult(saveRun(finalizeRun), 'inserted'), { setup: childSetup(finalizeChild), commit: true }) });
  runPsql({ databaseUrl, label: 'run-revoke-assignment', sql: revokeChild(finalizeChild) });
  check('run-finalize-after-revocation', asActor(EA_A, `
    ${sqlAssert(`NOT private.current_user_can_write_for_child('${finalizeChild}')`, 'Assignment really revoked')}
    ${expectResult(saveRun(completed(finalizeRun)), 'updated')}
    RESET ROLE;
    ${sqlAssert(`(SELECT status = 'completed' AND completed_at = '${COMPLETED_AT}'::timestamptz
      FROM public.battery_runs WHERE id = '${finalizeRun.id}')`, 'Revoked owner finalized run')}
  `));
  const mismatchRun = makeRun(programmeId);
  denied('run-identity-mismatch', asActor(EA_A, `
    ${expectResult(saveRun(mismatchRun), 'inserted')}
    SELECT ${saveRun({ ...mismatchRun, child_id: OTHER_CHILD })};
  `), 'MA001');

  for (const valid of [true, false]) {
    const childId = randomUUID();
    const run = makeRun(programmeId, { child_id: childId, class_id: valid ? CLASS_A : CLASS_B });
    const membershipId = randomUUID();
    const setup = `
      ${childSetup(childId)}
      UPDATE public.children SET class_id = '${CLASS_A}' WHERE id = '${childId}';
      INSERT INTO public.child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at, created_by)
      VALUES ('${membershipId}', '${childId}', '${CLASS_A}', ${ACTIVE_YEAR}, '2026-09-01', '${HEAD_OFFICE}');
      UPDATE public.child_class_memberships SET exited_at = '2026-10-02' WHERE id = '${membershipId}';
      INSERT INTO public.child_class_memberships (child_id, class_id, academic_year_id, enrolled_at, created_by)
      VALUES ('${childId}', '${CLASS_B}', ${ACTIVE_YEAR}, '2026-10-02', '${HEAD_OFFICE}');
      UPDATE public.children SET class_id = '${CLASS_B}' WHERE id = '${childId}';
    `;
    if (valid) {
      check('run-class-at-started-at-after-move', asActor(EA_A, `
        ${expectResult(saveRun(run), 'inserted')}
        RESET ROLE;
        ${sqlAssert(`(SELECT class_id = '${CLASS_A}' FROM public.battery_runs WHERE id = '${run.id}')`,
          'Capture class preserved after move')}
      `, { setup }));
    } else {
      denied('run-class-not-member-at-started-at', asActor(EA_A, `SELECT ${saveRun(run)};`, { setup }), '42501');
    }
  }

  // Test all nine writes with valid, independently seeded rows. UPDATE/DELETE
  // must raise 42501, not silently affect zero rows under a SELECT-only policy.
  for (const table of ['assessments', 'assessment_items', 'battery_runs']) {
    for (const operation of ['INSERT', 'UPDATE', 'DELETE']) {
      const run = makeRun(programmeId);
      const family = makeFamily(programmeId, { battery_run_id: run.id });
      const existing = table === 'assessments' ? family.assessment
        : table === 'assessment_items' ? family.items[0] : run;
      const fresh = table === 'assessments' ? makeFamily(programmeId).assessment
        : table === 'assessment_items' ? { ...family.items[0], id: randomUUID(), position: 99 } : makeRun(programmeId);
      const statement = operation === 'INSERT' ? directInsert(table, fresh)
        : operation === 'UPDATE' ? `UPDATE public.${table} SET updated_at = now() WHERE id = '${existing.id}';`
          : `DELETE FROM public.${table} WHERE id = '${existing.id}';`;
      denied(`${table}-direct-${operation.toLowerCase()}-refused`, asActor(EA_A, `
        ${expectResult(saveRun(run), 'inserted')}
        ${expectResult(submit(family), 'inserted')}
        ${statement}
      `), '42501');
    }
  }

  const privateRun = makeRun(programmeId);
  check('run-rls-enabled-and-unrelated-select-empty', asActor(EA_A, `
    ${expectResult(saveRun(privateRun), 'inserted')}
    ${sqlAssert(`${count('battery_runs', 'id', privateRun.id)} = 1`, 'Owner can read run')}
    SET LOCAL request.jwt.claim.sub = '${UNRELATED_EA}';
    ${sqlAssert('(SELECT count(*) FROM public.battery_runs) = 0', 'Unrelated EA sees no runs')}
    ${sqlAssert(`(SELECT relrowsecurity FROM pg_catalog.pg_class
      WHERE oid = 'public.battery_runs'::regclass)`, 'Run RLS enabled')}
  `));
  for (const signature of ['public.submit_assessment(jsonb,jsonb)', 'public.save_battery_run(jsonb)']) {
    check(`${signature}-execute-grants`, `
      ${sqlAssert(`has_function_privilege('authenticated', '${signature}', 'EXECUTE')`, 'Authenticated may execute')}
      ${sqlAssert(`NOT has_function_privilege('anon', '${signature}', 'EXECUTE')`, 'Anon may not execute')}
      ${sqlAssert(`NOT has_function_privilege('public', '${signature}', 'EXECUTE')`, 'PUBLIC may not execute')}
    `);
  }

  for (const direct of [false, true]) {
    const childId = randomUUID();
    const run = makeRun(programmeId, { child_id: childId });
    const sql = asActor(EA_A, `
      ${sqlAssert(`NOT private.child_has_delete_blocking_history('${childId}')`, 'No pre-existing blocking history')}
      ${expectResult(saveRun(run), 'inserted')}
      ${sqlAssert(`${count('assessments', 'child_id', childId)} = 0`, 'Run has zero Questions')}
      ${direct ? `RESET ROLE; DELETE FROM public.children WHERE id = '${childId}';` : `
        ${sqlAssert(`public.delete_child_if_no_history('${childId}') = false`, 'Zero-Question run blocks RPC deletion')}
        RESET ROLE;
        ${sqlAssert(`${count('children', 'id', childId)} = 1`, 'Child preserved')}
        ${sqlAssert(`${count('battery_runs', 'id', run.id)} = 1`, 'Run preserved')}
      `}
    `, { setup: childSetup(childId) });
    if (direct) denied('run-child-delete-restrict-postgres', sql, '23503');
    else check('run-only-history-blocks-delete-rpc', sql);
  }

  const timestampFamily = makeFamily(programmeId);
  check('submit-server-timestamps', asActor(EA_A, `
    ${expectResult(submit(timestampFamily), 'inserted')}
    RESET ROLE;
    ${familyCounts(timestampFamily)}
    ${sqlAssert(`(SELECT updated_at = now() FROM public.assessments
      WHERE id = '${timestampFamily.assessment.id}')`, 'Parent uses transaction now')}
    ${sqlAssert(`(SELECT bool_and(updated_at = now()) FROM public.assessment_items
      WHERE assessment_id = '${timestampFamily.assessment.id}')`, 'All items share transaction now')}
  `));
  const timestampRun = makeRun(programmeId);
  check('run-server-timestamp', asActor(EA_A, `
    ${expectResult(saveRun(timestampRun), 'inserted')}
    RESET ROLE;
    ${sqlAssert(`(SELECT updated_at = now() FROM public.battery_runs
      WHERE id = '${timestampRun.id}')`, 'Run ignores old payload timestamp')}
  `));
  // Direct owner inserts isolate the four INSERT triggers from the RPCs' own stamping.
  for (const table of ['assessments', 'assessment_items', 'battery_runs', 'letter_mastery']) {
    const family = makeFamily(programmeId);
    const row = table === 'assessments' ? family.assessment
      : table === 'assessment_items' ? family.items[0]
        : table === 'battery_runs' ? makeRun(programmeId) : {
          id: randomUUID(), child_id: CHILD, programme_id: programmeId,
          letter: 'a', language: 'en', confirmed: true, changed_at: STARTED_AT,
          correction_id: randomUUID(), changed_by: EA_A, created_at: STARTED_AT, updated_at: OLD_UPDATED_AT,
        };
    check(`${table}-insert-trigger-timestamp`, `
      BEGIN;
      ${table === 'assessment_items' ? directInsert('assessments', family.assessment) : ''}
      ${directInsert(table, row)}
      ${sqlAssert(`(SELECT updated_at = now() FROM public.${table} WHERE id = '${row.id}')`,
        `${table} INSERT trigger replaces old updated_at`)}
      ROLLBACK;
    `);
  }
  return summary;
};

// Whole-class Task 1: public RPC behavior, with no delivery grant or enrollment
// unless explicitly requested. Cases roll back except the committed-retry fixture.
const runWholeClassCases = (databaseUrl, programmeId) => {
  const summary = {};
  const check = (label, sql, sqlState) => {
    if (sqlState) expectSqlState({ databaseUrl, label, sql, sqlState });
    else runPsql({ databaseUrl, label, sql });
    summary[label] = 'passed';
  };
  // Relative days keep the grace cases valid as the wall clock advances. The active
  // year's bounds are controlled in each transaction, never on a hosted project.
  const today = runPsql({ databaseUrl, label: 'whole-class-local-day', sql:
    "SELECT (now() AT TIME ZONE 'Africa/Johannesburg')::date;" });
  const day = (offset) => new Date(Date.parse(`${today}T12:00:00Z`) + offset * 86400000)
    .toISOString().slice(0, 10);
  const d = day(-10);
  const at = (date, time = '12:00:00') => `${date}T${time}+02:00`;
  const yearSetup = `UPDATE public.academic_years
    SET starts_on = '${day(-365)}', ends_on = '${day(365)}' WHERE is_active;`;

  const seedGrant = ({ arm = 'class', actor = EA_A, start = at(day(-11)),
    end = at(day(-9)), memberStart = at(day(-12)), memberEnd = null } = {}) => {
    const childId = randomUUID();
    const scopeId = randomUUID();
    const grantId = randomUUID();
    const membershipId = randomUUID();
    const endSql = end === null ? 'NULL' : quote(end);
    const memberEndSql = memberEnd === null ? 'NULL' : quote(memberEnd);
    let setup = `${yearSetup}
      INSERT INTO public.children (id, first_name, last_name, created_by)
      VALUES ('${childId}', 'Control', 'Whole class', '${HEAD_OFFICE}');`;
    if (arm === 'delivery') {
      setup += `INSERT INTO public.child_ea_assignments
        (id, user_id, child_id, assigned_at, unassigned_at, created_by)
        VALUES ('${grantId}', '${actor}', '${childId}', '${start}', ${endSql}, '${HEAD_OFFICE}');`;
    } else if (arm === 'class') {
      setup += `INSERT INTO public.classes (id, school_id, name, grade, academic_year_id, created_by)
        VALUES ('${scopeId}', '${SCHOOL}', 'Whole class', '1', ${ACTIVE_YEAR}, '${HEAD_OFFICE}');
        INSERT INTO public.class_ea_assignments
          (id, class_id, ea_user_id, programme_id, assigned_at, unassigned_at, created_by)
        VALUES ('${grantId}', '${scopeId}', '${actor}', '${programmeId}', '${start}', ${endSql}, '${HEAD_OFFICE}');
        INSERT INTO public.child_class_memberships
          (id, child_id, class_id, academic_year_id, enrolled_at, exited_at, created_by)
        VALUES ('${membershipId}', '${childId}', '${scopeId}', ${ACTIVE_YEAR}, '${memberStart}', ${memberEndSql}, '${HEAD_OFFICE}');`;
    } else {
      setup += `INSERT INTO public.groups (id, name, programme_id, created_by)
        VALUES ('${scopeId}', 'Whole class group', '${programmeId}', '${HEAD_OFFICE}');
        INSERT INTO public.group_ea_assignments
          (id, group_id, ea_user_id, programme_id, assigned_at, unassigned_at, created_by)
        VALUES ('${grantId}', '${scopeId}', '${actor}', '${programmeId}', '${start}', ${endSql}, '${HEAD_OFFICE}');
        INSERT INTO public.child_group_memberships
          (id, child_id, group_id, joined_at, removed_at, created_by)
        VALUES ('${membershipId}', '${childId}', '${scopeId}', '${memberStart}', ${memberEndSql}, '${HEAD_OFFICE}');`;
    }
    return { setup, childId, scopeId, grantId, membershipId };
  };

  // First new assertion fails behaviorally on the old schema: an ended class
  // assignment must still authorize a new family captured inside its old window.
  for (const scenario of [
    { label: 'class-ended-inside-window' },
    { label: 'class-only-current-control', end: null },
    { label: 'class-another-eas-ended-grant', actor: EA_B, caller: EA_A, denied: true },
    { label: 'class-ended-day-after', end: at(d, '23:59:59'), date: day(-9), denied: true },
    { label: 'class-membership-ended-same-day', memberEnd: at(d, '09:00:00') },
    { label: 'class-never-overlapped', end: at(d, '10:00:00'), memberStart: at(d, '11:00:00'), denied: true },
    { label: 'class-touching-intervals', end: at(d, '10:00:00'), memberStart: at(d, '10:00:00'), denied: true },
    { label: 'class-same-day-0800-sast', start: at(d, '08:00:00'), end: at(d, '09:00:00') },
    { label: 'class-utc-end-next-sast-day', end: `${d}T23:30:00Z`, date: day(-9), time: '00:30:00' },
    { label: 'class-end-exact-local-midnight', end: at(d, '00:00:00'), denied: true },
    { label: 'class-start-next-local-midnight', start: at(day(-9), '00:00:00'), denied: true },
    { label: 'class-zero-duration-grant', start: at(d), end: at(d), denied: true },
    { label: 'class-future-date', start: at(day(-1)), end: at(day(2)), date: day(1), denied: true },
    { label: 'class-outside-active-year', date: day(-366), memberStart: at(day(-367)), start: at(day(-367)), end: at(day(-365)), denied: true },
    { label: 'class-no-active-year', noActiveYear: true, denied: true },
    { label: 'class-no-open-programme', actor: NO_PROGRAMME_EA, denied: true },
    { label: 'class-current-before-grant', start: at(day(-1)), end: null },
    { label: 'class-current-future-preserved', end: null, date: day(1) },
    { label: 'class-current-outside-year-preserved', end: null, date: day(-366) },
    { label: 'delivery-ended-inside-window', arm: 'delivery' },
    { label: 'delivery-ended-day-after', arm: 'delivery', end: at(d, '23:59:59'), date: day(-9), denied: true },
    { label: 'group-ended-intersection', arm: 'group', memberStart: at(d, '08:00:00'), memberEnd: at(d, '09:00:00') },
    { label: 'group-never-overlapped', arm: 'group', end: at(d, '08:00:00'), memberStart: at(d, '09:00:00'), denied: true },
    { label: 'group-member-removed-before-day', arm: 'group', start: at(day(-13)), memberEnd: at(day(-11)), denied: true },
    { label: 'group-member-joins-after-day', arm: 'group', end: at(day(-8)), memberStart: at(day(-9)), denied: true },
  ]) {
    const seed = seedGrant(scenario);
    const date = scenario.date || d;
    const actor = scenario.caller || scenario.actor || EA_A;
    const overrides = { child_id: seed.childId, user_id: actor };
    const family = makeFamily(programmeId, { ...overrides, assessment_date: date });
    const run = makeRun(programmeId, { ...overrides, started_at: at(date, scenario.time || '12:00:00') });
    const setup = seed.setup + (scenario.noActiveYear
      ? 'UPDATE public.academic_years SET is_active = false WHERE is_active;' : '');
    for (const [kind, call] of [['submit', submit(family)], ['run', saveRun(run)]]) {
      check(`whole-class-${kind}-${scenario.label}`, asActor(actor,
        scenario.denied ? `SELECT ${call};` : expectResult(call, 'inserted'), { setup }),
      scenario.denied ? '42501' : undefined);
    }
  }

  const retry = seedGrant({ end: null });
  const retryFamily = makeFamily(programmeId, { child_id: retry.childId, assessment_date: d });
  const retryRun = makeRun(programmeId, { child_id: retry.childId, started_at: at(d) });
  runPsql({ databaseUrl, label: 'whole-class-committed-retry-seed', sql: asActor(EA_A, `
    ${expectResult(submit(retryFamily), 'inserted')}
    ${expectResult(saveRun(retryRun), 'inserted')}
  `, { setup: retry.setup, commit: true }) });
  runPsql({ databaseUrl, label: 'whole-class-end-committed-class-grant', sql: `
    UPDATE public.class_ea_assignments SET unassigned_at = '${at(day(-9))}' WHERE id = '${retry.grantId}';
  ` });
  check('whole-class-committed-family-and-run-after-class-ended', asActor(EA_A, `
    ${sqlAssert(`NOT private.current_user_can_write_for_child('${retry.childId}')`, 'Class grant really ended')}
    ${expectResult(submit(retryFamily), 'already_present')}
    ${expectResult(saveRun({ ...retryRun, status: 'abandoned' }), 'updated')}
    RESET ROLE;
    ${familyCounts(retryFamily)}
  `, { setup: `UPDATE public.staff_programme_assignments SET ended_at = now()
    WHERE user_id = '${EA_A}' AND ended_at IS NULL;` }));

  // Grace cannot bypass the exact-instant class-at-started_at check.
  const instant = seedGrant({ memberStart: at(d, '13:00:00') });
  check('whole-class-run-still-checks-class-at-started-at', asActor(EA_A, `SELECT ${saveRun(
    makeRun(programmeId, { child_id: instant.childId, class_id: instant.scopeId, started_at: at(d) }))};`,
  { setup: instant.setup }), '42501');
  check('whole-class-run-valid-class-at-started-at', asActor(EA_A, expectResult(saveRun(
    makeRun(programmeId, { child_id: instant.childId, class_id: instant.scopeId, started_at: at(d, '14:00:00') })), 'inserted'),
  { setup: instant.setup }));

  const own = seedGrant({ end: null });
  const ended = seedGrant();
  const otherEA = seedGrant({ actor: EA_B, end: null });
  const otherProgramme = randomUUID();
  const otherProgrammeClass = seedGrant({ end: null });
  const sharedChild = randomUUID();
  const sharedMembership = randomUUID();
  const closedMembership = randomUUID();
  const priorYear = randomUUID();
  const priorMembership = randomUUID();
  const ackSetup = `${own.setup}${ended.setup}${otherEA.setup}${otherProgrammeClass.setup}
    INSERT INTO public.academic_years (id, label, starts_on, ends_on, is_active)
    VALUES ('${priorYear}', 'Whole class prior year', '${day(-730)}', '${day(-366)}', false);
    INSERT INTO public.child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at, created_by)
    VALUES ('${priorMembership}', '${own.childId}', '${own.scopeId}', '${priorYear}', '${at(day(-400))}', '${HEAD_OFFICE}');
    INSERT INTO public.programmes (id, code, name) VALUES ('${otherProgramme}', 'whole_class_other', 'Other programme');
    INSERT INTO public.class_ea_assignments (class_id, ea_user_id, programme_id, assigned_at, created_by)
    VALUES ('${otherProgrammeClass.scopeId}', '${EA_A}', '${otherProgramme}', '${at(day(-11))}', '${HEAD_OFFICE}');
    UPDATE public.class_ea_assignments SET unassigned_at = '${at(day(-9))}' WHERE id = '${otherProgrammeClass.grantId}';
    INSERT INTO public.children (id, first_name, last_name, created_by)
    VALUES ('${sharedChild}', 'Other EA delivery', 'Shared class', '${HEAD_OFFICE}');
    INSERT INTO public.child_ea_assignments (user_id, child_id, created_by)
    VALUES ('${EA_B}', '${sharedChild}', '${HEAD_OFFICE}');
    INSERT INTO public.child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at, created_by)
    VALUES ('${sharedMembership}', '${sharedChild}', '${own.scopeId}', ${ACTIVE_YEAR}, '${at(day(-11))}', '${HEAD_OFFICE}');
    INSERT INTO public.child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at, exited_at, created_by)
    VALUES ('${closedMembership}', '${ended.childId}', '${own.scopeId}', ${ACTIVE_YEAR}, '${at(day(-20))}', '${at(day(-15))}', '${HEAD_OFFICE}');`;
  check('whole-class-roster-ack-exact-active-programme-and-shared-class', asActor(EA_A, `
    ${sqlAssert(`(public.get_reconcile_acknowledgments()->>'schema_version')::int = 1`, 'Schema stays 1')}
    ${sqlAssert(`public.get_reconcile_acknowledgments()->'roster_class_ids' = ${json([own.scopeId])}`, 'Only own active-programme classes')}
    ${sqlAssert(`public.get_reconcile_acknowledgments()->'roster_membership_ids' = ${json([own.membershipId, sharedMembership, priorMembership].sort())}`,
      'Every open membership includes controls and another EA delivery child')}
    ${sqlAssert(`public.get_reconcile_acknowledgments()->'child_class_membership_ids' = '[]'::jsonb`, 'Delivery acknowledgment unchanged')}
  `, { setup: ackSetup }));
  check('whole-class-roster-ack-authoritative-empty', asActor(UNRELATED_EA, `
    ${sqlAssert(`public.get_reconcile_acknowledgments()->'roster_class_ids' = '[]'::jsonb`, 'Empty class set is an array')}
    ${sqlAssert(`public.get_reconcile_acknowledgments()->'roster_membership_ids' = '[]'::jsonb`, 'Empty membership set is an array')}
  `));
  const noProgramme = seedGrant({ actor: NO_PROGRAMME_EA, end: null });
  check('whole-class-roster-ack-no-programme-empty', asActor(NO_PROGRAMME_EA, `
    ${sqlAssert(`public.get_reconcile_acknowledgments()->'roster_class_ids' = '[]'::jsonb`, 'No programme means empty classes')}
    ${sqlAssert(`public.get_reconcile_acknowledgments()->'roster_membership_ids' = '[]'::jsonb`, 'No programme means empty memberships')}
  `, { setup: noProgramme.setup }));

  for (const signature of ['public.submit_assessment(jsonb,jsonb)', 'public.save_battery_run(jsonb)']) {
    check(`whole-class-${signature}-definer-and-api-grants`, `
      ${sqlAssert(`(SELECT prosecdef AND proconfig @> ARRAY['search_path=""'] FROM pg_proc
        WHERE oid = '${signature}'::regprocedure)`, 'RPC retains definer and empty search_path')}
      ${sqlAssert(`NOT has_function_privilege('service_role', '${signature}', 'EXECUTE')`, 'No service-role execute')}
      ${sqlAssert(`NOT has_function_privilege('authenticator', '${signature}', 'EXECUTE')`, 'No authenticator execute')}
    `);
  }
  check('whole-class-helper-security-and-grants', `
    ${sqlAssert(`(SELECT prosecdef AND proconfig @> ARRAY['search_path=""'] FROM pg_proc
      WHERE oid = 'private.user_held_grant_on(uuid,date)'::regprocedure)`, 'Helper is definer with empty search_path')}
    ${sqlAssert(`NOT has_function_privilege('public', 'private.user_held_grant_on(uuid,date)', 'EXECUTE')`, 'No PUBLIC helper execution')}
    ${sqlAssert(`NOT has_function_privilege('anon', 'private.user_held_grant_on(uuid,date)', 'EXECUTE')`, 'No anon helper execution')}
    ${sqlAssert(`NOT has_function_privilege('authenticated', 'private.user_held_grant_on(uuid,date)', 'EXECUTE')`, 'Helper only called inside definer RPCs')}
  `);
  return summary;
};

// runPsql is spawnSync. These connections must remain alive simultaneously.
const spawnPsql = ({ databaseUrl, sql, label, onStderr = () => {} }) => {
  const child = spawn('psql', [
    '-X', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-Atq', databaseUrl, '-c', sql,
  ], { env: buildPsqlEnv(label), stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  let spawnError;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 30_000);
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; onStderr(stderr); });
  const done = new Promise((resolve, reject) => {
    child.on('error', (error) => { spawnError = error; });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (spawnError || timedOut || code !== 0) {
        reject(new Error(`${label} failed (exit=${code}, signal=${signal}, timeout=${timedOut}):\n`
          + `${spawnError?.message || ''}\n${stderr || stdout}`));
      } else resolve(stdout.trim());
    });
  });
  return { child, done };
};

const overlappingCalls = async (databaseUrl, label, call, expected,
  { secondCall = call, firstActor = EA_A, secondActor = EA_A } = {}) => {
  const marker = `assessment_harness_holding_${label}`;
  let second;
  let firstClosed = false;
  let secondStartedWhileFirstOpen = false;
  // NOTICE goes to stderr immediately; unlike stdout it is not held by psql's
  // output buffering. Launch the retry only after the first call has inserted.
  const first = spawnPsql({
    databaseUrl, label: `${label}-first`,
    sql: asActor(firstActor, `
      SET LOCAL client_min_messages = notice;
      SELECT ${call};
      DO $holding$ BEGIN RAISE NOTICE '${marker}'; END; $holding$;
      SELECT pg_sleep(2);
    `, { commit: true }),
    onStderr: (stderr) => {
      if (second || !stderr.includes(marker)) return;
      second = spawnPsql({
        databaseUrl, label: `${label}-second`,
        sql: asActor(secondActor, `
          SET LOCAL client_min_messages = notice;
          DO $retry$ BEGIN RAISE NOTICE 'assessment_harness_retry_started'; END; $retry$;
          SELECT ${secondCall};
        `, { commit: true }),
        onStderr: (output) => {
          if (output.includes('assessment_harness_retry_started') && !firstClosed) {
            secondStartedWhileFirstOpen = true;
          }
        },
      });
      // Attach a rejection handler immediately, even while the first is sleeping.
      second.done.catch(() => {});
    },
  });
  first.child.on('close', () => { firstClosed = true; });
  const [firstResult] = await Promise.allSettled([first.done]);
  const [secondResult] = second ? await Promise.allSettled([second.done]) : [];
  const failures = [firstResult, secondResult].filter((result) => result?.status === 'rejected');
  if (failures.length) throw new Error(failures.map((result) => result.reason.message).join('\n'));
  assert.ok(second, `${label}: first connection never reached the holding marker`);
  assert.ok(secondStartedWhileFirstOpen, `${label}: retry did not start while the first transaction was held open`);
  assert.deepEqual([firstResult.value, secondResult.value], expected, `${label}: both connections must succeed`);
};

const runOverlappingCases = async (databaseUrl, programmeId) => {
  const family = makeFamily(programmeId);
  await overlappingCalls(databaseUrl, 'submit-overlap', submit(family), ['inserted', 'already_present']);
  runPsql({ databaseUrl, label: 'submit-overlap-counts', sql: familyCounts(family) });
  const run = makeRun(programmeId);
  await overlappingCalls(databaseUrl, 'run-overlap', saveRun(run), ['inserted', 'unchanged']);
  runPsql({ databaseUrl, label: 'run-overlap-count', sql:
    sqlAssert(`${count('battery_runs', 'id', run.id)} = 1`, 'Concurrent run retries store one parent') });
  return { 'submit-overlapping-retries': 'passed', 'run-overlapping-retries': 'passed' };
};

const main = async () => {
  const baseName = process.env.HISTORY_RLS_DATABASE_NAME;
  const databaseName = baseName ? `${baseName}_assessment_results` : baseName;
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
    // Match the support-incident harness's Supabase-style default ACLs.
    runPsql({ databaseUrl, label: 'supabase-default-privileges', sql: `
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
    ` });
    for (const filename of fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort()) {
      runPsql({ databaseUrl, file: path.join(MIGRATIONS_DIR, filename), label: `migration-${filename}` });
    }
    // Apply the new migration twice in total before exercising its behavior.
    // CREATE OR REPLACE must preserve signatures, grants and repeated application.
    const wholeClassMigration = path.join(MIGRATIONS_DIR, WHOLE_CLASS_MIGRATION);
    if (fs.existsSync(wholeClassMigration)) {
      runPsql({ databaseUrl, file: wholeClassMigration, label: 'whole-class-migration-second-application' });
    }
    runPsql({ databaseUrl, sql: fixtureSql, label: 'assessment-results-fixture' });
    const programmeId = runPsql({ databaseUrl, label: 'literacy-programme', sql: `SELECT ${PROGRAMME};` });
    assert.match(programmeId, /^[0-9a-f-]{36}$/, 'Exactly one literacy programme is required');
    const cases = {
      ...(fs.existsSync(wholeClassMigration) ? { 'whole-class-migration-applied-twice': 'passed' } : {}),
      ...runCases(databaseUrl, programmeId),
      ...runWholeClassCases(databaseUrl, programmeId),
      ...await runOverlappingCases(databaseUrl, programmeId),
    };
    process.stdout.write(`${JSON.stringify({ passed: Object.keys(cases).length, cases })}\n`);
  } finally {
    // Both asynchronous clients have been awaited before cleanup, including on failure.
    runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-database' });
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { fixtureSql, runCases, runWholeClassCases, runOverlappingCases, overlappingCalls };
