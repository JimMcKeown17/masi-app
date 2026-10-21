#!/usr/bin/env node

// Assessment Results Plan 3 Task 1. Controller-only disposable PG17 proof.
// Local admin URL: postgresql://postgres:postgres@127.0.0.1:65433/postgres (CI: 5432).
// No dotenv or Supabase CLI. Fixtures use only the pre-Task-1 schema so RED
// reaches current-delivery-denied, rather than failing during fixture setup.
const fs = require('node:fs');
const path = require('node:path');
const {
  MIGRATIONS_DIR, assertDisposableAdminTarget, bootstrapSql, buildDatabaseUrl,
  expectSqlState, runPsql,
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
const asActor = (actor, sql, { commit = false } = {}) => `
BEGIN;
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
    const cases = runCases(databaseUrl);
    process.stdout.write(`${JSON.stringify({ passed: Object.keys(cases).length, cases })}\n`);
  } finally {
    runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-database' });
  }
};

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { fixtureSql, runCases };
