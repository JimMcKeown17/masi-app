#!/usr/bin/env node

// Assessment Results Plan 3 Tasks 1–2. Controller-only disposable PG17 proof.
// Local admin URL: postgresql://postgres:postgres@127.0.0.1:65433/postgres (CI: 5432).
// No dotenv or Supabase CLI. Fixtures use only the pre-Task-1 schema so RED
// reaches current-delivery-denied, rather than failing during fixture setup.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {
  MIGRATIONS_DIR, assertDisposableAdminTarget, bootstrapSql, buildDatabaseUrl,
  collectPlanMetrics, expectSqlState, runPsql,
} = require('./history-authorization-postgres-harness.cjs');

const MIGRATION = '20261022120000_assessment_history_pull.sql';
const id = (prefix, n) => `${prefix}000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const ACTORS = Object.fromEntries([
  'OWNER', 'CLASS_ONLY', 'FORMER_DELIVERY', 'CURRENT_DELIVERY', 'GROUP_ONLY',
  'UNRELATED', 'OLD_CLASS', 'ENDED_CLASS', 'LAST_YEAR_CLASS',
].map((name, n) => [name, id('16', n + 1)]));
const {
  OWNER, CLASS_ONLY, FORMER_DELIVERY, CURRENT_DELIVERY, GROUP_ONLY, UNRELATED,
  OLD_CLASS, ENDED_CLASS, LAST_YEAR_CLASS,
} = ACTORS;
const SCHOOL = id('26', 1);
const CLASS_1 = id('46', 1);
const CLASS_2 = id('46', 2);
const CLASS_OLD = id('46', 3);
const CHILD_A = id('56', 1);
const CHILD_B = id('56', 2);
const CHILD_M = id('56', 3);
const GROUP = id('66', 1);
const A_2026_EARLY = id('76', 1);
const A_2026_LATE = id('76', 2);
const A_2025 = id('76', 3);
const B_2026 = id('76', 4);
const A_2026_PRE_YEAR_RUN = id('76', 5);
const RUN_2026 = id('86', 1);
const RUN_YEAR_EDGE = id('86', 2);
const RUN_PRE_YEAR = id('86', 3);
const PROGRAMME = "(SELECT id FROM public.programmes WHERE code = 'literacy')";
const YEAR = "(SELECT id FROM public.academic_years WHERE label = '2026')";
const OLD_YEAR = "(SELECT id FROM public.academic_years WHERE label = '2025')";
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const sqlAssert = (condition, message) => `
DO $assert$ BEGIN
  IF (${condition}) IS DISTINCT FROM TRUE THEN RAISE EXCEPTION '%', ${quote(message)}; END IF;
END; $assert$;`;
const asActor = (actor, sql, { commit = false, setup = '' } = {}) => `
BEGIN;
${setup}
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${actor}';
${sql}
${commit ? 'COMMIT' : 'ROLLBACK'};`;

const fixtureSql = `
INSERT INTO auth.users (id) VALUES ${Object.values(ACTORS).map((actor) => `('${actor}')`).join(', ')};
INSERT INTO public.schools (id, name) VALUES ('${SCHOOL}', 'Assessment history harness');
INSERT INTO public.users (id, first_name, last_name, school_id, organization_id)
SELECT id, 'History harness', id::text, '${SCHOOL}', 'a111879f-d066-47c9-95a1-bed2a400319a'
FROM auth.users;
INSERT INTO public.staff_programme_assignments (user_id, programme_id, school_id)
SELECT id, ${PROGRAMME}, '${SCHOOL}' FROM auth.users;
INSERT INTO public.academic_years (label, starts_on, ends_on, is_active)
VALUES ('2025', '2025-01-15', '2025-12-15', false);
INSERT INTO public.classes (id, school_id, name, grade, academic_year_id, created_by)
VALUES ('${CLASS_1}', '${SCHOOL}', 'Class 1', '1', ${YEAR}, '${OWNER}'),
       ('${CLASS_2}', '${SCHOOL}', 'Class 2', '1', ${YEAR}, '${OWNER}'),
       ('${CLASS_OLD}', '${SCHOOL}', 'Old class', '1', ${OLD_YEAR}, '${OWNER}');
INSERT INTO public.class_ea_assignments (class_id, ea_user_id, programme_id, created_by, assigned_at, unassigned_at)
VALUES ('${CLASS_1}', '${CLASS_ONLY}', ${PROGRAMME}, '${OWNER}', '2026-06-01', null),
       ('${CLASS_2}', '${OLD_CLASS}', ${PROGRAMME}, '${OWNER}', '2026-01-15', null),
       ('${CLASS_1}', '${ENDED_CLASS}', ${PROGRAMME}, '${OWNER}', '2026-01-15', '2026-05-01'),
       ('${CLASS_OLD}', '${LAST_YEAR_CLASS}', ${PROGRAMME}, '${OWNER}', '2025-01-15', null);
-- UNRELATED created the children: created_by must grant no history authority.
INSERT INTO public.children (id, first_name, last_name, created_by)
VALUES ('${CHILD_A}', 'History', 'A', '${UNRELATED}'),
       ('${CHILD_B}', 'History', 'B', '${UNRELATED}'),
       ('${CHILD_M}', 'History', 'Mastery', '${UNRELATED}');
INSERT INTO public.child_class_memberships (child_id, class_id, academic_year_id, enrolled_at, exited_at, created_by)
VALUES ('${CHILD_A}', '${CLASS_2}', ${YEAR}, '2026-01-15', '2026-05-01', '${OWNER}'),
       ('${CHILD_A}', '${CLASS_1}', ${YEAR}, '2026-05-01', null, '${OWNER}'),
       ('${CHILD_A}', '${CLASS_OLD}', ${OLD_YEAR}, '2025-01-15', '2025-12-15', '${OWNER}'),
       ('${CHILD_B}', '${CLASS_1}', ${OLD_YEAR}, '2025-01-15', '2025-12-15', '${OWNER}'),
       ('${CHILD_M}', '${CLASS_1}', ${YEAR}, '2026-01-15', null, '${OWNER}');
INSERT INTO public.child_ea_assignments (child_id, user_id, created_by, assigned_at, unassigned_at)
VALUES ('${CHILD_A}', '${FORMER_DELIVERY}', '${OWNER}', '2026-01-15', '2026-05-01'),
       ('${CHILD_A}', '${CURRENT_DELIVERY}', '${OWNER}', '2026-05-01', null),
       ('${CHILD_M}', '${FORMER_DELIVERY}', '${OWNER}', '2026-01-15', null);
INSERT INTO public.groups (id, name, programme_id, class_id, created_by)
VALUES ('${GROUP}', 'History group', ${PROGRAMME}, '${CLASS_1}', '${OWNER}');
INSERT INTO public.group_ea_assignments (group_id, ea_user_id, programme_id, created_by)
VALUES ('${GROUP}', '${GROUP_ONLY}', ${PROGRAMME}, '${OWNER}');
INSERT INTO public.child_group_memberships (child_id, group_id, created_by)
VALUES ('${CHILD_A}', '${GROUP}', '${OWNER}');
INSERT INTO public.battery_runs
  (id, user_id, child_id, programme_id, battery_code, battery_version, language, started_at, status)
VALUES ('${RUN_2026}', '${OWNER}', '${CHILD_A}', ${PROGRAMME}, 'wela_plus_full', '2024.1', 'en', '2026-03-01T08:00Z', 'in_progress'),
       ('${RUN_YEAR_EDGE}', '${OWNER}', '${CHILD_A}', ${PROGRAMME}, 'wela_plus_full', '2024.1', 'en', '2026-01-14T23:30:00Z', 'in_progress'),
       ('${RUN_PRE_YEAR}', '${OWNER}', '${CHILD_A}', ${PROGRAMME}, 'wela_plus_full', '2024.1', 'en', '2026-01-14T20:00:00Z', 'in_progress');
INSERT INTO public.assessments
  (id, user_id, child_id, programme_id, assessment_type, question_code, assessment_date, total_items, battery_run_id)
VALUES ('${A_2026_EARLY}', '${OWNER}', '${CHILD_A}', ${PROGRAMME}, 'letter_sounds', 'letter_sounds', '2026-03-01', 1, null),
       ('${A_2026_LATE}', '${OWNER}', '${CHILD_A}', ${PROGRAMME}, 'letter_sounds', 'letter_sounds', '2026-09-01', 3, null),
       ('${A_2025}', '${OWNER}', '${CHILD_A}', ${PROGRAMME}, 'letter_sounds', 'letter_sounds', '2025-11-01', 1, null),
       ('${B_2026}', '${OWNER}', '${CHILD_B}', ${PROGRAMME}, 'letter_sounds', 'letter_sounds', '2026-08-01', 1, null),
       ('${A_2026_PRE_YEAR_RUN}', '${OWNER}', '${CHILD_A}', ${PROGRAMME}, 'letter_sounds', 'letter_sounds', '2026-01-15', 1, '${RUN_PRE_YEAR}');
INSERT INTO public.assessment_items (assessment_id, position, item_key, prompt, is_correct)
SELECT a.id, p.position, 'item-' || p.position, 'k', true
FROM public.assessments a CROSS JOIN LATERAL generate_series(0, a.total_items - 1) p(position);
`;

const sameIds = (table, ids) => sqlAssert(`
  (SELECT coalesce(array_agg(id ORDER BY id), ARRAY[]::uuid[]) FROM public.${table}) =
  ARRAY[${[...ids].sort().map(quote).join(', ')}]::uuid[]`, `${table}: exact visible ids`);
const itemsFollowParent = () => sqlAssert(`
  (SELECT count(*) FROM public.assessment_items) =
  (SELECT coalesce(sum(total_items), 0) FROM public.assessments)
  AND NOT EXISTS (SELECT 1 FROM public.assessment_items i
    WHERE NOT EXISTS (SELECT 1 FROM public.assessments a WHERE a.id = i.assessment_id))
  AND NOT EXISTS (SELECT 1 FROM public.assessments a WHERE a.total_items <>
    (SELECT count(*) FROM public.assessment_items i WHERE i.assessment_id = a.id))`,
'Items follow every readable parent, with no extra or missing items');
const correction = (confirmed) => `public.set_letter_mastery(
  '${id('96', confirmed ? 1 : 2)}', '${CHILD_M}', 'k', 'xh', ${confirmed},
  '${confirmed ? '2026-01-16' : '2026-01-17'}T08:00:00Z'::timestamptz)`;
const masteryVisible = (visible, confirmed) => `
${sqlAssert(`(SELECT count(*) FROM public.letter_mastery WHERE child_id = '${CHILD_M}') = ${visible ? 1 : 0}`,
  'Exact mastery visibility after correction/handover')}
${visible ? sqlAssert(`(SELECT confirmed = ${confirmed} FROM public.letter_mastery WHERE child_id = '${CHILD_M}')`,
    'Mastery value follows the winning correction') : ''}`;

const runCases = (databaseUrl) => {
  const cases = {};
  const check = (label, sql) => {
    runPsql({ databaseUrl, label, sql });
    cases[label] = 'passed';
  };
  const denied = (label, sql) => {
    expectSqlState({ databaseUrl, label, sql: asActor(CLASS_ONLY, sql), sqlState: '42501' });
    cases[label] = 'passed';
  };

  // FIRST executed assertion: pre-change policies expose A_2026_LATE to a deliverer.
  check('current-delivery-denied', asActor(CURRENT_DELIVERY, sqlAssert(`
    NOT EXISTS (SELECT 1 FROM public.assessments WHERE id = '${A_2026_LATE}')`,
  'CURRENT_DELIVERY must not see A_2026_LATE through delivery alone')));

  check('fixture-active-year', sqlAssert(`EXISTS (SELECT 1 FROM public.academic_years
    WHERE id = ${YEAR} AND is_active AND starts_on = '2026-01-15' AND ends_on = '2026-12-15')`,
  'Seeded 2026 must be the active academic year'));
  for (const [name, actor] of Object.entries(ACTORS)) {
    const owned = name === 'OWNER';
    const inClass = ['CLASS_ONLY', 'OLD_CLASS'].includes(name);
    const assessments = owned ? [A_2026_EARLY, A_2026_LATE, A_2025, B_2026, A_2026_PRE_YEAR_RUN]
      : inClass ? [A_2026_EARLY, A_2026_LATE, A_2026_PRE_YEAR_RUN] : [];
    const runs = owned ? [RUN_2026, RUN_YEAR_EDGE, RUN_PRE_YEAR]
      : inClass ? [RUN_2026, RUN_YEAR_EDGE] : [];
    check(`read-matrix-${name.toLowerCase()}`, asActor(actor, `
      ${sameIds('assessments', assessments)}
      ${sameIds('battery_runs', runs)}
      ${itemsFollowParent()}
    `));
    // Exercise the helper directly too; SELECT policies must not hide a broken helper.
    check(`predicate-${name.toLowerCase()}`, asActor(actor, sqlAssert(`
      private.can_read_assessment('${OWNER}', '${CHILD_A}', '2026-03-01') IS ${owned || inClass}
      AND private.can_read_assessment('${OWNER}', '${CHILD_A}', '2025-11-01') IS ${owned}
      AND private.can_read_assessment('${OWNER}', '${CHILD_B}', '2026-08-01') IS ${owned}`, 'Predicate actor matrix')));
  }
  check('run-year-edge', asActor(CLASS_ONLY, `
    ${sqlAssert(`EXISTS (SELECT 1 FROM public.battery_runs WHERE id = '${RUN_YEAR_EDGE}')`, 'SAST year-start run is visible')}
    ${sqlAssert(`NOT EXISTS (SELECT 1 FROM public.battery_runs WHERE id = '${RUN_PRE_YEAR}')`, 'Pre-year SAST run is hidden')}
    ${sqlAssert(`EXISTS (SELECT 1 FROM public.assessments WHERE id = '${A_2026_PRE_YEAR_RUN}')`, 'Assessment date independently grants the linked Question')}
  `));
  check('predicate-inclusive-year-boundaries', asActor(CLASS_ONLY, sqlAssert(`
    private.can_read_assessment('${OWNER}', '${CHILD_A}', '2026-01-15')
    AND private.can_read_assessment('${OWNER}', '${CHILD_A}', '2026-12-15')
    AND NOT private.can_read_assessment('${OWNER}', '${CHILD_A}', '2026-01-14')
    AND NOT private.can_read_assessment('${OWNER}', '${CHILD_A}', '2026-12-16')`, 'Inclusive active-year bounds')));
  check('predicate-any-programme', `BEGIN;
    UPDATE public.class_ea_assignments SET unassigned_at = now()
      WHERE ea_user_id = '${CLASS_ONLY}' AND unassigned_at IS NULL;
    INSERT INTO public.class_ea_assignments (class_id, ea_user_id, programme_id, created_by)
      VALUES ('${CLASS_1}', '${CLASS_ONLY}', (SELECT id FROM public.programmes WHERE code = 'numeracy'), '${OWNER}');
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claim.sub = '${CLASS_ONLY}';
    ${sameIds('assessments', [A_2026_EARLY, A_2026_LATE, A_2026_PRE_YEAR_RUN])}
    ROLLBACK;`);
  check('predicate-no-active-year', `BEGIN;
    UPDATE public.academic_years SET is_active = false;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claim.sub = '${CLASS_ONLY}';
    ${sameIds('assessments', [])}
    SET LOCAL request.jwt.claim.sub = '${OWNER}';
    ${sameIds('assessments', [A_2026_EARLY, A_2026_LATE, A_2025, B_2026, A_2026_PRE_YEAR_RUN])}
    ROLLBACK;`);

  check('mastery-confirm', asActor(FORMER_DELIVERY, sqlAssert(`
    (SELECT outcome = 'applied' AND confirmed FROM ${correction(true)})`, 'Former deliverer confirms k'), { commit: true }));
  const masteryStage = (label, formerVisible, currentVisible, confirmed) => {
    for (const [actor, visible] of [[FORMER_DELIVERY, formerVisible], [CURRENT_DELIVERY, currentVisible],
      [CLASS_ONLY, false], [UNRELATED, false]]) {
      runPsql({ databaseUrl, label, sql: asActor(actor, masteryVisible(visible, confirmed)) });
    }
    cases[label] = 'passed';
  };
  masteryStage('mastery-before-handover', true, false, true);
  check('mastery-handover', `
    UPDATE public.child_ea_assignments SET unassigned_at = now()
      WHERE child_id = '${CHILD_M}' AND user_id = '${FORMER_DELIVERY}' AND unassigned_at IS NULL;
    INSERT INTO public.child_ea_assignments (child_id, user_id, created_by)
      VALUES ('${CHILD_M}', '${CURRENT_DELIVERY}', '${OWNER}');`);
  masteryStage('mastery-last-writer-after-handover', true, true, true);
  check('mastery-unconfirm', asActor(CURRENT_DELIVERY, sqlAssert(`
    (SELECT outcome = 'applied' AND NOT confirmed FROM ${correction(false)})`, 'Current deliverer un-confirms k'), { commit: true }));
  masteryStage('mastery-new-writer-revokes-former', false, true, false);

  check('predicate-grants', sqlAssert(`
    NOT has_function_privilege('anon', 'private.can_read_assessment(uuid,uuid,date)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'private.can_read_assessment(uuid,uuid,date)', 'EXECUTE')`, 'Predicate EXECUTE grants'));
  denied('rollout-select-denied', 'SELECT * FROM private.history_pull_rollout;');
  denied('rollout-insert-denied', "INSERT INTO private.history_pull_rollout(feature, enabled) VALUES ('assessments', false);");
  denied('rollout-function-denied', `SELECT private.history_pull_enabled('assessments', '${CLASS_ONLY}');`);
  check('rollout-anon-and-table-grants', sqlAssert(`
    NOT has_function_privilege('anon', 'private.history_pull_enabled(text,uuid)', 'EXECUTE')
    AND NOT has_table_privilege('anon', 'private.history_pull_rollout', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'private.history_pull_rollout', 'SELECT,INSERT,UPDATE,DELETE')
    AND (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'private.history_pull_rollout'::regclass)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'private' AND tablename = 'history_pull_rollout')`,
  'Rollout is private, RLS enabled, and has no policies'));
  check('rollout-seed', sqlAssert(`
    (SELECT count(*) = 3 AND bool_and(enabled) FROM private.history_pull_rollout WHERE user_id IS NULL)
    AND private.history_pull_enabled('assessments', '${CLASS_ONLY}')
    AND private.history_pull_enabled('battery_runs', '${CLASS_ONLY}')
    AND private.history_pull_enabled('letter_mastery', '${CLASS_ONLY}')`, 'Three enabled everyone rows'));
  check('rollout-precedence-and-default', `BEGIN;
    INSERT INTO private.history_pull_rollout (feature, user_id, enabled) VALUES ('assessments', '${CLASS_ONLY}', false);
    ${sqlAssert(`NOT private.history_pull_enabled('assessments', '${CLASS_ONLY}')
      AND private.history_pull_enabled('assessments', '${UNRELATED}')`, 'User false overrides everyone true')}
    UPDATE private.history_pull_rollout SET enabled = false WHERE feature = 'assessments' AND user_id IS NULL;
    UPDATE private.history_pull_rollout SET enabled = true WHERE user_id = '${CLASS_ONLY}';
    ${sqlAssert(`private.history_pull_enabled('assessments', '${CLASS_ONLY}')
      AND NOT private.history_pull_enabled('assessments', '${UNRELATED}')`, 'User true overrides everyone false')}
    DELETE FROM private.history_pull_rollout WHERE feature = 'battery_runs';
    ${sqlAssert(`NOT private.history_pull_enabled('battery_runs', '${CLASS_ONLY}')
      AND NOT private.history_pull_enabled('unknown', '${CLASS_ONLY}')`, 'Absent switch defaults off')}
    ROLLBACK;`);
  // Run late: before Task 1 exists, RED must reach the delivery-only assertion above.
  const migrationSql = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf8');
  check('rollout-reapply-preserves-switches', `BEGIN;
    UPDATE private.history_pull_rollout SET enabled = false, note = 'controller disabled' WHERE feature = 'assessments';
    INSERT INTO private.history_pull_rollout (feature, user_id, enabled, note)
      VALUES ('assessments', '${CLASS_ONLY}', true, 'controller enabled');
    ${migrationSql}
    ${sqlAssert(`(SELECT count(*) = 3 FROM private.history_pull_rollout WHERE user_id IS NULL)
      AND NOT private.history_pull_enabled('assessments', '${UNRELATED}')
      AND private.history_pull_enabled('assessments', '${CLASS_ONLY}')
      AND (SELECT note = 'controller disabled' FROM private.history_pull_rollout WHERE feature = 'assessments' AND user_id IS NULL)`,
    'Reapply neither duplicates nor re-enables switch rows')}
    ROLLBACK;`);
  check('select-policy-inventory', sqlAssert(`
    (SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_catalog.pg_policies
      WHERE schemaname = 'public' AND tablename IN ('assessments', 'assessment_items', 'battery_runs', 'letter_mastery') AND cmd = 'SELECT') =
    ARRAY['assessment_items_select_readable_assessment', 'assessments_select_owner_or_class_year',
      'battery_runs_select_owner_or_class_year', 'letter_mastery_select_writer_or_deliverer']::text[]`, 'Only intended SELECT policies remain'));
  return cases;
};

const ASSESSMENT_COLUMNS = [
  'id', 'user_id', 'child_id', 'programme_id', 'assessment_tool_id', 'assessment_window_id',
  'assessment_purpose', 'grade_snapshot', 'teacher_name_snapshot', 'assessment_type', 'capture_mode',
  'assessment_date', 'score', 'total_items', 'notes', 'question_code', 'question_version', 'item_set_id',
  'language', 'stopped_reason', 'duration_ms', 'derived', 'battery_run_id', 'created_at', 'updated_at',
];
const RUN_COLUMNS = [
  'id', 'user_id', 'child_id', 'programme_id', 'class_id', 'battery_code', 'battery_version',
  'assessment_purpose', 'assessment_window_id', 'language', 'started_at', 'completed_at', 'status',
  'notes', 'created_at', 'updated_at',
];
const MASTERY_COLUMNS = ['id', 'child_id', 'letter', 'language', 'confirmed', 'changed_at',
  'correction_id', 'changed_by', 'programme_id', 'created_at', 'updated_at'];
const NAME_COLUMNS = ['child_first_name', 'child_last_name', 'child_preferred_name'];
const PAGE_FUNCTIONS = {
  assessments: 'get_assessment_history_page', battery_runs: 'get_battery_run_history_page',
  letter_mastery: 'get_letter_mastery_page',
};
const pageCall = (feature, { programme = PROGRAMME, year = YEAR, size = '1',
  after = 'null', afterId = 'null', overlap = '0' } = {}) =>
  `public.${PAGE_FUNCTIONS[feature]}(${feature === 'letter_mastery'
    ? `${after}, ${afterId}, ${size}, ${overlap}`
    : `${programme}, ${year}, ${size}, ${after}, ${afterId}, ${overlap}`})`;
const keysEqual = (expression, keys) => `
  (SELECT array_agg(k ORDER BY k COLLATE "C") FROM jsonb_object_keys(${expression}) k) =
  ARRAY[${[...keys].sort().map(quote).join(', ')}]::text[]`;
const claims = (actor) => `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${actor}';`;
const assertState = (call, state, message) => `
DO $state$ DECLARE caught boolean := false; BEGIN
  BEGIN
    PERFORM * FROM ${call};
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '${state}' ${message ? `OR SQLERRM <> '${message}'` : ''} THEN RAISE; END IF;
    caught := true;
  END;
  IF NOT caught THEN RAISE EXCEPTION 'Expected SQLSTATE ${state}'; END IF;
END; $state$;`;

// A size-one walk tests exact cursor strings inside PostgreSQL, not JS Date precision.
const walkAssertion = (feature, expectedQuery, { startAt = 'null', stopAt = null, ...options } = {}) => `
DO $walk$ DECLARE
  cursor_time timestamptz := ${startAt}; cursor_id uuid${startAt === 'null' ? '' : " := '00000000-0000-0000-0000-000000000000'"}; page jsonb; row_json jsonb;
  seen uuid[] := ARRAY[]::uuid[]; expected uuid[]; iterations integer := 0;
BEGIN
  LOOP
    SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.updated_at, p.id), '[]'::jsonb) INTO page
      FROM ${pageCall(feature, { ...options, size: '1', after: 'cursor_time', afterId: 'cursor_id' })} p;
    EXIT WHEN jsonb_array_length(page) = 0;
    ${stopAt ? `EXIT WHEN (page->0->>'updated_at')::timestamptz > ${stopAt};` : ''}
    IF jsonb_array_length(page) <> 1 THEN RAISE EXCEPTION 'Page size one was not honored'; END IF;
    row_json := page->0;
    IF (row_json->>'id')::uuid = ANY(seen) THEN RAISE EXCEPTION 'Duplicate keyset row'; END IF;
    seen := array_append(seen, (row_json->>'id')::uuid);
    cursor_time := (row_json->>'updated_at')::timestamptz;
    cursor_id := (row_json->>'id')::uuid;
    iterations := iterations + 1;
    IF iterations > 100 THEN RAISE EXCEPTION 'Walk did not exhaust'; END IF;
  END LOOP;
  SELECT coalesce(array_agg(e.id ORDER BY e.updated_at, e.id), ARRAY[]::uuid[]) INTO expected
    FROM (${expectedQuery}) e;
  IF seen IS DISTINCT FROM expected THEN RAISE EXCEPTION 'RPC walk differs from policy: % vs %', seen, expected; END IF;
END; $walk$;`;
const directScope = (feature) => `SELECT id, updated_at FROM public.${feature}${feature === 'letter_mastery' ? '' : `
  WHERE programme_id = ${PROGRAMME} AND ${feature === 'assessments'
    ? "question_code IS NOT NULL AND assessment_date"
    : "(started_at AT TIME ZONE 'Africa/Johannesburg')::date"}
  BETWEEN '2026-01-15' AND '2026-12-15'`}`;

const runPullCases = (databaseUrl) => {
  const cases = {};
  const check = (label, sql) => { runPsql({ databaseUrl, label, sql }); cases[label] = 'passed'; };
  // FIRST new assertion. Task 1 fixtures and its 39 cases work without any page RPC.
  check('assessment-page-exists', asActor(OWNER, sqlAssert(`
    (SELECT count(*) FROM ${pageCall('assessments')}) = 1`, 'Assessment page returns its first row')));
  for (const [name, actor] of Object.entries(ACTORS)) {
    for (const feature of Object.keys(PAGE_FUNCTIONS)) {
      check(`page-policy-${feature}-${name.toLowerCase()}`,
        asActor(actor, walkAssertion(feature, directScope(feature))));
    }
  }
  check('owner-page-year-bound', asActor(OWNER, `
    ${sqlAssert(`NOT EXISTS (SELECT 1 FROM ${pageCall('assessments', { size: '200' })} WHERE id = '${A_2025}')`, 'Owner assessment pages exclude prior year')}
    ${sqlAssert(`NOT EXISTS (SELECT 1 FROM ${pageCall('battery_runs', { size: '200' })} WHERE id = '${RUN_PRE_YEAR}')`, 'Owner run pages exclude pre-year run')}`));
  check('overlapping-grants-deduplicate', asActor(OWNER,
    walkAssertion('assessments', directScope('assessments')), {
      setup: `INSERT INTO public.class_ea_assignments (class_id, ea_user_id, programme_id)
        VALUES ('${CLASS_1}', '${OWNER}', ${PROGRAMME});`,
    }));
  check('programme-partition-not-grant', asActor(CLASS_ONLY, `
    ${walkAssertion('assessments', directScope('assessments'))}
    ${sqlAssert(`(SELECT count(*) = 1 FROM ${pageCall('assessments', { programme: "(SELECT id FROM public.programmes WHERE code = 'numeracy')", size: '200' })}
      WHERE id = '${id('77', 4)}')`, 'Class assignment in Literacy grants a Numeracy result; the page partitions by Programme')}`, {
    setup: `INSERT INTO public.assessments (id, user_id, child_id, programme_id, assessment_type, question_code, assessment_date, total_items)
      VALUES ('${id('77', 4)}', '${UNRELATED}', '${CHILD_A}', (SELECT id FROM public.programmes WHERE code = 'numeracy'), 'letter_sounds', 'letter_sounds', '2026-06-01', 0);`,
  }));
  for (const actor of [CLASS_ONLY, OWNER]) {
    check(`embedded-header-${actor === OWNER ? 'owner' : 'class'}`, asActor(actor, `
      ${sqlAssert(`(SELECT battery_run->>'id' = '${RUN_PRE_YEAR}'
        AND (battery_run->>'started_at')::timestamptz = '2026-01-14T20:00:00Z'::timestamptz
        AND ${keysEqual('battery_run', RUN_COLUMNS)}
        FROM ${pageCall('assessments', { size: '200' })} WHERE id = '${A_2026_PRE_YEAR_RUN}')`, 'Readable assessment grants exactly its complete run header')}
      ${sqlAssert(`NOT EXISTS (SELECT 1 FROM ${pageCall('battery_runs', { size: '200' })} WHERE id = '${RUN_PRE_YEAR}')`, 'Embedded header does not widen run pager')}
      ${actor === CLASS_ONLY ? sqlAssert(`NOT EXISTS (SELECT 1 FROM public.battery_runs WHERE id = '${RUN_PRE_YEAR}')`, 'Embedded header does not widen run SELECT') : ''}`));
  }
  check('embedded-header-unrelated-denied', asActor(UNRELATED, sqlAssert(`
    NOT EXISTS (SELECT 1 FROM ${pageCall('assessments')})`, 'No assessment means no embedded header')));
  check('whole-family-and-projection', asActor(CLASS_ONLY, sqlAssert(`
    (SELECT jsonb_array_length(items) = total_items AND total_items = 3
      AND (SELECT array_agg((i->>'position')::integer ORDER BY ord) FROM jsonb_array_elements(items) WITH ORDINALITY el(i, ord)) = ARRAY[0,1,2]
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(items) i WHERE NOT (${keysEqual('i', ['id', 'position', 'item_key', 'prompt', 'response', 'is_correct', 'metadata'])}))
      AND battery_run IS NULL
      AND ${keysEqual('to_jsonb(p)', [...ASSESSMENT_COLUMNS, 'items', 'battery_run', ...NAME_COLUMNS])}
      AND child_first_name = 'History' AND child_last_name = 'A' AND child_preferred_name = 'History preferred'
      FROM ${pageCall('assessments', { size: '200' })} p WHERE id = '${A_2026_LATE}')`, 'Whole ordered family, exact item/parent keys and child projection'), {
    setup: `UPDATE public.children SET preferred_name = 'History preferred' WHERE id = '${CHILD_A}';`,
  }));
  check('skipped-family-and-legacy-filter', asActor(OWNER, `
    ${sqlAssert(`(SELECT items = '[]'::jsonb AND total_items = 0 FROM ${pageCall('assessments', { size: '200' })} WHERE id = '${id('77', 1)}')`, 'Skipped family is an empty array')}
    ${sqlAssert(`NOT EXISTS (SELECT 1 FROM ${pageCall('assessments', { size: '200' })} WHERE id = '${id('77', 2)}')`, 'Legacy null Question is not paged')}`, {
    setup: `INSERT INTO public.assessments (id, user_id, child_id, programme_id, assessment_type, assessment_date, question_code, total_items, stopped_reason)
      VALUES ('${id('77', 1)}', '${OWNER}', '${CHILD_A}', ${PROGRAMME}, 'letter_sounds', '2026-06-01', 'letter_sounds', 0, 'skipped_child_refused'),
             ('${id('77', 2)}', '${OWNER}', '${CHILD_A}', ${PROGRAMME}, 'legacy', '2026-06-01', null, 0, null);`,
  }));
  for (const feature of ['battery_runs', 'letter_mastery']) {
    check(`projection-${feature}`, asActor(feature === 'letter_mastery' ? CURRENT_DELIVERY : OWNER, sqlAssert(`
      (SELECT bool_and(${keysEqual('to_jsonb(p)', [...(feature === 'battery_runs' ? RUN_COLUMNS : MASTERY_COLUMNS), ...NAME_COLUMNS])})
        FROM ${pageCall(feature, { size: '200' })} p)`, 'Exact pager columns')));
  }
  for (const feature of ['assessments', 'battery_runs']) {
    for (const actor of [OWNER, UNRELATED]) {
      for (const year of [OLD_YEAR, `'${id('99', 1)}'::uuid`]) {
        check(`year-mismatch-${feature}-${actor}-${year === OLD_YEAR ? 'old' : 'random'}`,
          asActor(actor, assertState(pageCall(feature, { year }), 'MR002', 'academic_year_mismatch')));
      }
    }
    check(`year-rollover-${feature}`, asActor(OWNER, `
      ${assertState(pageCall(feature), 'MR002', 'academic_year_mismatch')}
      ${sqlAssert(`(SELECT count(*) FROM ${pageCall(feature, { year: OLD_YEAR })}) >= 0`, 'Matching switched year succeeds')}`, {
      setup: `UPDATE public.academic_years SET is_active = false WHERE is_active;
        UPDATE public.academic_years SET is_active = true WHERE id = ${OLD_YEAR};`,
    }));
    for (const year of [YEAR, OLD_YEAR, `'${id('99', 1)}'::uuid`]) {
      check(`no-active-year-${feature}-${year === YEAR ? 'current' : year === OLD_YEAR ? 'old' : 'random'}`,
        asActor(OWNER, assertState(pageCall(feature, { year }), '55000', 'no_active_academic_year'), {
          setup: 'UPDATE public.academic_years SET is_active = false WHERE is_active;',
        }));
    }
  }
  check('mastery-no-year-bound-or-programme-filter', asActor(CURRENT_DELIVERY, sqlAssert(`
    (SELECT count(*) = 1 AND bool_and(NOT confirmed AND programme_id IS NULL)
      FROM ${pageCall('letter_mastery', { size: '200' })})`, 'Mastery is current state across years and nullable Programme'), {
    setup: `UPDATE public.academic_years SET is_active = false WHERE is_active;
      UPDATE public.letter_mastery SET programme_id = null, changed_at = '2025-01-01' WHERE child_id = '${CHILD_M}';`,
  }));
  check('mastery-pager-handover', `BEGIN;
    UPDATE public.child_ea_assignments SET unassigned_at = now() WHERE child_id = '${CHILD_M}' AND unassigned_at IS NULL;
    INSERT INTO public.child_ea_assignments (child_id, user_id, created_by) VALUES ('${CHILD_M}', '${FORMER_DELIVERY}', '${OWNER}');
    ${claims(FORMER_DELIVERY)}
    SELECT * FROM public.set_letter_mastery('${id('96', 3)}', '${CHILD_M}', 'k', 'xh', true, '2026-01-18T08:00Z');
    RESET ROLE;
    UPDATE public.child_ea_assignments SET unassigned_at = now() WHERE child_id = '${CHILD_M}' AND unassigned_at IS NULL;
    INSERT INTO public.child_ea_assignments (child_id, user_id, created_by) VALUES ('${CHILD_M}', '${CURRENT_DELIVERY}', '${OWNER}');
    ${claims(FORMER_DELIVERY)}
    ${sqlAssert(`(SELECT count(*) = 1 FROM ${pageCall('letter_mastery')})`, 'Former deliverer still pages last-written record after handover')}
    ${claims(CLASS_ONLY)}
    ${sqlAssert(`NOT EXISTS (SELECT 1 FROM ${pageCall('letter_mastery')})`, 'Class scope grants no mastery page')}
    ${claims(UNRELATED)}
    ${sqlAssert(`NOT EXISTS (SELECT 1 FROM ${pageCall('letter_mastery')})`, 'Unrelated actor has no mastery page')}
    ${claims(CURRENT_DELIVERY)}
    SELECT * FROM public.set_letter_mastery('${id('96', 4)}', '${CHILD_M}', 'k', 'xh', false, '2026-01-19T08:00Z');
    ${sqlAssert(`(SELECT NOT confirmed FROM ${pageCall('letter_mastery')})`, 'Un-confirmed records are paged')}
    ${claims(FORMER_DELIVERY)}
    ${sqlAssert(`NOT EXISTS (SELECT 1 FROM ${pageCall('letter_mastery')})`, 'Former deliverer loses page when no longer last writer')}
    ROLLBACK;`);

  for (const feature of Object.keys(PAGE_FUNCTIONS)) {
    const badOptions = [
      { size: '0' }, { size: '201' }, { size: 'null' }, { overlap: '601' }, { overlap: '-1' },
      { overlap: 'null' }, { after: "'2026-01-01'::timestamptz" }, { afterId: `'${OWNER}'::uuid` },
      ...(feature === 'letter_mastery' ? [] : [{ programme: 'null' }, { year: 'null' }]),
    ];
    badOptions.forEach((options, n) => check(`arguments-${feature}-${n}`, asActor(OWNER, assertState(pageCall(feature, options), '22023'))));
    check(`no-auth-${feature}`, asActor('', assertState(pageCall(feature), '28000')));
    check(`guard-order-${feature}`, asActor('', `
      ${assertState(pageCall(feature, { size: '0' }), '28000')}
      SET LOCAL request.jwt.claim.sub = '${OWNER}';
      ${assertState(pageCall(feature, { size: '0' }), 'MR001', 'rollout_disabled')}`, {
      setup: `UPDATE private.history_pull_rollout SET enabled = false WHERE feature = '${feature}';
        UPDATE public.academic_years SET is_active = false WHERE is_active;`,
    }));
    if (feature !== 'letter_mastery') {
      check(`arguments-before-year-${feature}`, asActor(OWNER,
        assertState(pageCall(feature, { size: '0' }), '22023'), {
          setup: 'UPDATE public.academic_years SET is_active = false WHERE is_active;',
        }));
    }
    const label = `anon-execute-${feature}`;
    expectSqlState({ databaseUrl, label, sqlState: '42501', sql: `BEGIN; SET LOCAL ROLE anon; SELECT * FROM ${pageCall(feature)}; ROLLBACK;` });
    cases[label] = 'passed';
    check(`switch-isolated-${feature}`, `BEGIN;
      UPDATE private.history_pull_rollout SET enabled = false WHERE feature = '${feature}';
      ${claims(OWNER)}
      ${assertState(pageCall(feature, { size: '0' }), 'MR001', 'rollout_disabled')}
      ${Object.keys(PAGE_FUNCTIONS).filter(f => f !== feature).map(f => sqlAssert(`(SELECT count(*) FROM ${pageCall(f)}) >= 0`, 'Other feature remains enabled')).join('\n')}
      ROLLBACK;`);
  }
  check('switch-assessment-overrides', `BEGIN;
    DELETE FROM private.history_pull_rollout WHERE feature = 'assessments';
    ${Object.values(ACTORS).map(actor => `${claims(actor)} ${assertState(pageCall('assessments'), 'MR001', 'rollout_disabled')}`).join('\n')}
    RESET ROLE;
    INSERT INTO private.history_pull_rollout (feature, user_id, enabled) VALUES ('assessments', '${OWNER}', true);
    ${Object.values(ACTORS).map(actor => `${claims(actor)} ${actor === OWNER
      ? sqlAssert(`(SELECT count(*) FROM ${pageCall('assessments')}) = 1`, 'User enable overrides absent everyone')
      : assertState(pageCall('assessments'), 'MR001', 'rollout_disabled')}`).join('\n')}
    RESET ROLE;
    INSERT INTO private.history_pull_rollout (feature, enabled) VALUES ('assessments', true);
    UPDATE private.history_pull_rollout SET enabled = false WHERE user_id = '${OWNER}';
    ${claims(OWNER)} ${assertState(pageCall('assessments'), 'MR001', 'rollout_disabled')}
    ${claims(CLASS_ONLY)} ${sqlAssert(`(SELECT count(*) FROM ${pageCall('assessments')}) = 1`, 'Everyone enable serves class actor')}
    SET LOCAL request.jwt.claim.sub = '';
    ${assertState(pageCall('assessments'), '28000')}
    ROLLBACK;`);

  const pinned = "'2026-06-01T08:00:00.123456Z'::timestamptz";
  for (const feature of Object.keys(PAGE_FUNCTIONS)) {
    const fixture = feature === 'assessments'
      ? `INSERT INTO public.assessments (id, user_id, child_id, programme_id, assessment_type, question_code, assessment_date, total_items, updated_at)
          SELECT md5('assessment-page-keyset-' || n)::uuid, '${OWNER}', '${CHILD_A}', ${PROGRAMME}, 'letter_sounds', 'letter_sounds', '2026-06-01', 0, ${pinned} FROM generate_series(1,5) g(n);`
      : feature === 'battery_runs'
        ? `INSERT INTO public.battery_runs (id, user_id, child_id, programme_id, battery_code, battery_version, language, started_at, updated_at)
            SELECT md5('run-page-keyset-' || n)::uuid, '${OWNER}', '${CHILD_A}', ${PROGRAMME}, 'wela_plus_full', '2024.1', 'en', '2026-06-01', ${pinned} FROM generate_series(1,5) g(n);`
        : `INSERT INTO public.letter_mastery (id, child_id, letter, language, confirmed, changed_at, correction_id, changed_by, programme_id, updated_at)
            SELECT private.letter_mastery_id('${CHILD_A}', chr(96+n), 'en'), '${CHILD_A}', chr(96+n), 'en', true,
              ${pinned}, md5('mastery-page-keyset-' || n)::uuid, '${OWNER}', null, ${pinned} FROM generate_series(1,5) g(n);`;
    check(`keyset-and-overlap-${feature}`, asActor(OWNER, `
      ${walkAssertion(feature, `SELECT id, updated_at FROM public.${feature} WHERE updated_at = ${pinned}`, {
    startAt: `${pinned} - interval '1 microsecond'`, stopAt: pinned,
  })}
      ${sqlAssert(`(SELECT count(*) FROM ${pageCall(feature, { size: '200', after: `${pinned} + interval '60 seconds'`, afterId: `'${OWNER}'::uuid`, overlap: '120' })} WHERE updated_at = ${pinned}) = 5`, '120 second overlap re-returns rows 60 seconds before cursor')}`, {
      setup: `SET LOCAL session_replication_role = replica;
        ${fixture}
        SET LOCAL session_replication_role = origin;`,
    }));
  }
  check('zero-question-run-status-delta-and-stamp', asActor(OWNER, `
    DO $delta$ DECLARE previous_time timestamptz; previous_id uuid; payload jsonb; BEGIN
      SELECT p.updated_at, p.id INTO previous_time, previous_id FROM ${pageCall('battery_runs', { size: '200' })} p WHERE p.id = '${RUN_YEAR_EDGE}';
      IF previous_id IS NULL THEN RAISE EXCEPTION 'Zero-Question run missing'; END IF;
      SELECT to_jsonb(r) || jsonb_build_object('status', 'completed', 'completed_at', '2026-03-01T08:10Z', 'updated_at', '2001-01-01T00:00Z')
        INTO payload FROM public.battery_runs r WHERE r.id = previous_id;
      PERFORM public.save_battery_run(payload);
      IF NOT EXISTS (SELECT 1 FROM ${pageCall('battery_runs', { size: '200', after: 'previous_time', afterId: 'previous_id' })} p
        WHERE p.id = previous_id AND p.status = 'completed' AND p.updated_at = now())
      THEN RAISE EXCEPTION 'Status-only change missing from run delta or not server stamped'; END IF;
    END; $delta$;`));
  const familyId = id('77', 3);
  check('submit-and-mastery-server-stamps', asActor(CURRENT_DELIVERY, `
    ${sqlAssert(`public.submit_assessment(jsonb_build_object(
      'id', '${familyId}', 'user_id', '${CURRENT_DELIVERY}', 'child_id', '${CHILD_A}', 'programme_id', ${PROGRAMME},
      'assessment_type', 'letter_sounds', 'question_code', 'letter_sounds', 'question_version', '2026.1',
      'item_set_id', 'letter_sounds@2026.1.en', 'language', 'en', 'stopped_reason', 'completed',
      'duration_ms', 1000, 'derived', '{}'::jsonb, 'score', 1, 'total_items', 1, 'capture_mode', 'sequential',
      'assessment_purpose', 'progress_check', 'assessment_date', '2026-06-01', 'updated_at', '2001-01-01T00:00Z'),
      jsonb_build_array(jsonb_build_object('id', '${id('97', 1)}', 'assessment_id', '${familyId}',
        'position', 0, 'item_key', 'k', 'prompt', 'k', 'is_correct', true, 'metadata', '{}'::jsonb,
        'updated_at', '2001-01-01T00:00Z'))) = 'inserted'`, 'Submit complete one-item family')}
    SELECT * FROM public.set_letter_mastery('${id('96', 5)}', '${CHILD_M}', 'k', 'xh', true, '2001-01-01T00:00Z');
    RESET ROLE;
    ${sqlAssert(`(SELECT updated_at = now() FROM public.assessments WHERE id = '${familyId}')`, 'Assessment server stamps 2001 payload')}
    ${sqlAssert(`(SELECT updated_at = now() FROM public.assessment_items WHERE assessment_id = '${familyId}')`, 'Items share the server family stamp')}
    ${sqlAssert(`(SELECT updated_at = now() FROM public.letter_mastery WHERE child_id = '${CHILD_M}')`, 'Mastery server stamps old correction')}`, {
    setup: `DELETE FROM public.letter_mastery WHERE child_id = '${CHILD_M}';`,
  }));
  return cases;
};

const runDensePlanChecks = (databaseUrl) => {
  const noise = id('17', 1), owner = id('17', 2), sparse = id('17', 3);
  const child = id('57', 1), heldClass = id('47', 1);
  runPsql({ databaseUrl, label: 'dense-assessment-plan-fixture', sql: `
    INSERT INTO auth.users (id) VALUES ('${noise}'), ('${owner}'), ('${sparse}');
    INSERT INTO public.users (id, first_name, last_name, organization_id)
      SELECT id, 'Dense fixture', id::text, 'a111879f-d066-47c9-95a1-bed2a400319a' FROM auth.users WHERE id IN ('${noise}', '${owner}', '${sparse}');
    INSERT INTO public.classes (id, school_id, name, grade, academic_year_id, created_by)
      VALUES ('${heldClass}', '${SCHOOL}', 'Sparse class', '1', ${YEAR}, '${noise}');
    INSERT INTO public.children (id, first_name, last_name) VALUES ('${child}', 'Sparse', 'Child');
    INSERT INTO public.child_class_memberships (child_id, class_id, academic_year_id) VALUES ('${child}', '${heldClass}', ${YEAR});
    INSERT INTO public.class_ea_assignments (class_id, ea_user_id, programme_id) VALUES ('${heldClass}', '${sparse}', ${PROGRAMME});
    BEGIN; SET LOCAL session_replication_role = replica;
    INSERT INTO public.assessments (id, user_id, child_id, programme_id, assessment_type, question_code, assessment_date, total_items, updated_at)
      SELECT md5('assessment-history-noise-' || n)::uuid, '${noise}', CASE WHEN n <= 3 THEN '${child}'::uuid ELSE '${CHILD_B}'::uuid END,
        ${PROGRAMME}, 'letter_sounds', 'letter_sounds', '2026-03-01', 0, '2026-01-01'::timestamptz + n * interval '1 second'
      FROM generate_series(1,20000) g(n);
    INSERT INTO public.assessments (id, user_id, child_id, programme_id, assessment_type, question_code, assessment_date, total_items, updated_at)
      SELECT md5('assessment-history-owner-' || n)::uuid, '${owner}', '${CHILD_B}', ${PROGRAMME}, 'letter_sounds', 'letter_sounds',
        '2026-03-01', 0, '2026-01-01'::timestamptz + n * interval '1 second' FROM generate_series(1,5000) g(n);
    COMMIT;
    ANALYZE public.assessments; ANALYZE public.assessment_items;
    ANALYZE public.class_ea_assignments; ANALYZE public.child_class_memberships;` });
  const measure = (label, actor, sql) => {
    const output = runPsql({ databaseUrl, label, sql: asActor(actor, `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql};`) });
    const start = output.indexOf('[');
    assert.ok(start >= 0, `${label}: no plan JSON`);
    return collectPlanMetrics(JSON.parse(output.slice(start)));
  };
  const raw = measure('assessment-dense-raw-baseline', sparse, `SELECT count(*) FROM (${directScope('assessments')}) visible`);
  const first = measure('assessment-sparse-class-first-page', sparse, `SELECT * FROM ${pageCall('assessments', { size: '200' })}`);
  const deep = measure('assessment-dense-owner-deep-page', owner, `SELECT * FROM ${pageCall('assessments', {
    size: '200', after: "'2026-01-01'::timestamptz + 4900 * interval '1 second'", afterId: "md5('assessment-history-owner-4900')::uuid",
  })}`);
  process.stdout.write(`${JSON.stringify({ noise_fixture_assessments: 20000, dense_owner_fixture_assessments: 5000,
    dense_raw_baseline: raw, sparse_class_first_page: first, dense_owner_deep_page: deep })}\n`);
  assert.equal(first.actual_rows, 3);
  assert.equal(deep.actual_rows, 100);
  assert.ok(raw.root_shared_blocks > 0, 'Raw RLS baseline must measure shared blocks');
  for (const [label, metrics] of [['sparse class', first], ['dense owner', deep]]) {
    assert.ok(metrics.root_shared_blocks < raw.root_shared_blocks / 10,
      `${label}: expected less than one tenth raw root shared blocks: raw=${JSON.stringify(raw)} rpc=${JSON.stringify(metrics)}`);
  }
  return { 'dense-plan-buffer-gate': 'passed' };
};

const main = () => {
  const databaseName = process.env.HISTORY_RLS_DATABASE_NAME;
  const adminUrl = assertDisposableAdminTarget({
    adminDatabaseUrl: process.env.HISTORY_RLS_ADMIN_DATABASE_URL, databaseName,
    confirmation: process.env.HISTORY_RLS_DISPOSABLE_CONFIRM,
  });
  const adminDatabaseUrl = buildDatabaseUrl(adminUrl, 'postgres').href;
  const databaseUrl = buildDatabaseUrl(adminUrl, databaseName).href;
  const quotedDatabase = quoteIdentifier(databaseName);
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-stale-database' });
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `CREATE DATABASE ${quotedDatabase};`, label: 'create-database' });
  try {
    runPsql({ databaseUrl, sql: bootstrapSql, label: 'bootstrap' });
    runPsql({ databaseUrl, label: 'supabase-default-privileges', sql: `
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
    ` });
    for (const filename of fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort()) {
      runPsql({ databaseUrl, file: path.join(MIGRATIONS_DIR, filename), label: `migration-${filename}` });
    }
    runPsql({ databaseUrl, sql: fixtureSql, label: 'assessment-history-fixture' });
    const cases = { ...runCases(databaseUrl), ...runPullCases(databaseUrl), ...runDensePlanChecks(databaseUrl) };
    process.stdout.write(`${JSON.stringify({ passed: Object.keys(cases).length, cases })}\n`);
  } finally {
    runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-database' });
  }
};

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { fixtureSql, runCases, runPullCases, runDensePlanChecks, pageCall, walkAssertion };
