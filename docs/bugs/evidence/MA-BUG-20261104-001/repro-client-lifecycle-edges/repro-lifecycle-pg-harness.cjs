#!/usr/bin/env node
// THROWAWAY REPRO (repro-client-lifecycle-edges). Proves the server answers that the
// jest fake transport gives for E1-E6, against EVERY canonical migration in
// supabase/migrations, in a disposable local PostgreSQL database. Never loads dotenv,
// never invokes the Supabase CLI. Each case runs in its own rolled-back transaction.
//
// Run:
//   HISTORY_RLS_ADMIN_DATABASE_URL=postgres://postgres:<password>@127.0.0.1:<port>/postgres \
//   HISTORY_RLS_DATABASE_NAME=masi_history_rls_lifecycle_edges \
//   HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE \
//   node repro-lifecycle-pg-harness.cjs
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const H = require('/Users/jimmckeown/Development/masi-app/scripts/history-authorization-postgres-harness.cjs');

const MIGRATIONS_DIR = process.env.REPRO_MIGRATIONS_DIR || H.MIGRATIONS_DIR;
const q = (s) => `"${s.replaceAll('"', '""')}"`;
const id = (prefix, n) => `${prefix}000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

const HO = id('16', 1); const EA_A = id('16', 2); const EA_B = id('16', 3);
const SCHOOL = id('26', 1);
const LIT = "(SELECT id FROM public.programmes WHERE code = 'literacy')";
const YEAR = '(SELECT id FROM public.academic_years WHERE is_active)';
const K = id('46', 1); const K2 = id('46', 2); const K3 = id('46', 3); const KS = id('46', 4); const KG = id('46', 5);
const C = (n) => id('56', n);
const CHA = (n, who = 'a') => id(who === 'a' ? '66' : '67', n);
const CPE = (n) => id('76', n);
const CCM = (n) => id('86', n);
const CEA_A = (cls) => id('36', parseInt(cls.slice(-2), 10));
const CEA_B = (cls) => id('37', parseInt(cls.slice(-2), 10));
const GV = id('96', 1); const G = id('97', 1); const GEA = id('98', 1);
const M1 = id('99', 1); const M2 = id('99', 2);
const SESSION_B = id('a6', 1); const ATT_B = id('a7', 1);

const deliveryChild = (n, classId, ea, createdBy = HO) => `
INSERT INTO public.children (id, first_name, last_name, class_id, created_by) VALUES ('${C(n)}', 'Child', '${n}', '${classId}', '${createdBy}');
INSERT INTO public.child_ea_assignments (id, user_id, child_id, created_by) VALUES ('${CHA(n, ea === EA_A ? 'a' : 'b')}', '${ea}', '${C(n)}', '${createdBy}');
INSERT INTO public.child_programme_enrollments (id, child_id, programme_id, created_by) VALUES ('${CPE(n)}', '${C(n)}', ${LIT}, '${createdBy}');
INSERT INTO public.child_class_memberships (id, child_id, class_id, academic_year_id, created_by) VALUES ('${CCM(n)}', '${C(n)}', '${classId}', ${YEAR}, '${createdBy}');
`;
const classRow = (classId) => `INSERT INTO public.classes (id, school_id, name, grade, academic_year_id, created_by) VALUES ('${classId}', '${SCHOOL}', 'Class ${classId.slice(-2)}', '2', ${YEAR}, '${HO}');`;
const classAssignment = (assignmentId, classId, ea) => `INSERT INTO public.class_ea_assignments (id, class_id, ea_user_id, programme_id, created_by) VALUES ('${assignmentId}', '${classId}', '${ea}', ${LIT}, '${HO}');`;

const fixtureSql = `
INSERT INTO auth.users (id) VALUES ('${HO}'), ('${EA_A}'), ('${EA_B}');
INSERT INTO public.schools (id, name) VALUES ('${SCHOOL}', 'Lifecycle edges school');
INSERT INTO public.users (id, first_name, last_name, school_id, organization_id) VALUES
  ('${HO}', 'Head', 'Office', '${SCHOOL}', 'a111879f-d066-47c9-95a1-bed2a400319a'),
  ('${EA_A}', 'EA', 'A', '${SCHOOL}', 'a111879f-d066-47c9-95a1-bed2a400319a'),
  ('${EA_B}', 'EA', 'B', '${SCHOOL}', 'a111879f-d066-47c9-95a1-bed2a400319a');
INSERT INTO public.staff_programme_assignments (id, user_id, programme_id, school_id, created_by) VALUES
  ('${id('35', 1)}', '${EA_A}', ${LIT}, '${SCHOOL}', '${HO}'),
  ('${id('35', 2)}', '${EA_B}', ${LIT}, '${SCHOOL}', '${HO}');
${[K, K2, K3, KS, KG].map(classRow).join('\n')}
-- E1a: EA_A holds K; delivery child 1 in K.
${classAssignment(CEA_A(K), K, EA_A)}
${deliveryChild(1, K, EA_A)}
-- E1c: child 2 in K2 (EA_B holds K2); EA_A direct assignment (ended in the case setup).
${classAssignment(CEA_B(K2), K2, EA_B)}
${deliveryChild(2, K2, EA_A)}
-- E2: EA_A-created child 4 in K.
${deliveryChild(4, K, EA_A, EA_A)}
-- E3: child 5 in K3; EA_A holds K3 (case b deletes that row in its setup).
${classAssignment(CEA_A(K3), K3, EA_A)}
${deliveryChild(5, K3, EA_A)}
-- E5: shared class KS held by EA_A and EA_B; child 7 = EA_B delivery, child 8 = EA_A delivery.
${classAssignment(CEA_A(KS), KS, EA_A)}
${classAssignment(CEA_B(KS), KS, EA_B)}
${deliveryChild(7, KS, EA_B)}
${deliveryChild(8, KS, EA_A)}
-- E4/E6: class KG held by EA_A; seeded grouping version + group; child 6 and child 9.
${classAssignment(CEA_A(KG), KG, EA_A)}
${deliveryChild(6, KG, EA_A)}
${deliveryChild(9, KG, EA_A)}
INSERT INTO public.grouping_versions (id, class_id, academic_year_id, version_number, status, created_by)
VALUES ('${GV}', '${KG}', ${YEAR}, 1, 'active', '${HO}');
INSERT INTO public.groups (id, name, programme_id, class_id, grouping_version_id, display_number, created_by)
VALUES ('${G}', 'Group 1', ${LIT}, '${KG}', '${GV}', 1, '${HO}');
INSERT INTO public.group_ea_assignments (id, group_id, ea_user_id, programme_id, created_by)
VALUES ('${GEA}', '${G}', '${EA_A}', ${LIT}, '${HO}');
`;

const asActor = (actor, statement, setup = '') => `
BEGIN;
${setup}
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${actor}';
${statement}
ROLLBACK;
`;
// PostgREST update(patch).eq('id', id).select('id') — the client's archive/edit shape.
const updateById = (table, assignments, rowId) => `WITH pgrst_source AS (UPDATE public.${table} SET ${assignments} WHERE id = '${rowId}' RETURNING id) SELECT '${table}:rows=' || count(*) FROM pgrst_source;`;
// PostgREST upsert (merge-duplicates, onConflict id) for a child_group_memberships insert payload.
const membershipUpsert = (mid) => `
INSERT INTO public.child_group_memberships (id, child_id, group_id, grouping_version_id, joined_at, removed_at, created_by, row_version)
VALUES ('${mid}', '${C(6)}', '${G}', '${GV}', pg_catalog.now(), NULL, '${EA_A}', 2)
ON CONFLICT (id) DO UPDATE SET child_id = EXCLUDED.child_id, group_id = EXCLUDED.group_id,
  grouping_version_id = EXCLUDED.grouping_version_id, joined_at = EXCLUDED.joined_at,
  removed_at = EXCLUDED.removed_at, created_by = EXCLUDED.created_by, row_version = EXCLUDED.row_version;`;

const results = [];
const run = (label, sql, expected) => {
  const output = H.runPsql({ databaseUrl: global.databaseUrl, sql, label });
  const lines = output.split('\n').map(l => l.trim()).filter(Boolean)
    // psql -Atq echoes "UPDATE n"/"INSERT 0 n" only without -q; keep only result rows.
    ;
  const ok = JSON.stringify(lines) === JSON.stringify(expected);
  results.push({ label, ok, observed: lines, expected });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}\n  observed=${JSON.stringify(lines)}\n  expected=${JSON.stringify(expected)}`);
};
const runDenied = (label, sql, sqlState) => {
  const r = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-Atq', global.databaseUrl, '-c', sql], {
    encoding: 'utf8', env: H.buildPsqlEnv(label), timeout: 180000,
  });
  const m = /ERROR:\s+([0-9A-Z]{5}):\s*([^\n]*)/.exec(r.stderr || '');
  const ok = r.status !== 0 && m && m[1] === sqlState;
  results.push({ label, ok, observed: { status: r.status, sqlstate: m?.[1], message: m?.[2], stdout: r.stdout.trim() }, expected: sqlState });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}\n  observed=${JSON.stringify({ status: r.status, sqlstate: m?.[1], message: m?.[2], stdout: r.stdout.trim() })}`);
};

const cases = () => {
  // ---------------- E1a: Head Office ended EA_A's class assignment (handover to EA_B); EA_A archives class offline.
  const hoHandoverK = `
    UPDATE public.class_ea_assignments SET unassigned_at = pg_catalog.now(), handover_reason = 'HO handover' WHERE id = '${CEA_A(K)}';
    ${classAssignment(CEA_B(K), K, EA_B)}`;
  run('E1a-class-archive-zero-rows-then-children-edit-and-own-assignment', asActor(EA_A, `
    ${updateById('classes', 'archived_at = pg_catalog.now(), row_version = 2', K)}
    SELECT 'class-visible:' || (archived_at IS NULL)::text FROM public.classes WHERE id = '${K}';
    SELECT 'pull-join:' || ccm.id || '|' || (c.archived_at IS NULL)::text FROM public.child_class_memberships ccm
      JOIN public.classes c ON c.id = ccm.class_id WHERE ccm.child_id = '${C(1)}' AND ccm.exited_at IS NULL;
    ${updateById('children', 'class_id = NULL, updated_at = pg_catalog.now(), row_version = 2', C(1))}
    ${updateById('child_class_memberships', 'exited_at = pg_catalog.now(), row_version = 2', CCM(1))}
    ${updateById('class_ea_assignments', 'unassigned_at = pg_catalog.now(), row_version = 2', CEA_A(K))}
  `, hoHandoverK), ['classes:rows=0', 'class-visible:true', `pull-join:${CCM(1)}|true`, 'children:rows=1', 'child_class_memberships:rows=1', 'class_ea_assignments:rows=1']);

  // ---------------- E1c: Head Office ended EA_A's direct assignment to child 2; EA_A has no class path (EA_B holds K2).
  const hoEndChild2 = `
    UPDATE public.child_ea_assignments SET unassigned_at = pg_catalog.now() WHERE id = '${CHA(2)}';
    INSERT INTO public.child_ea_assignments (id, user_id, child_id, created_by) VALUES ('${CHA(2, 'b')}', '${EA_B}', '${C(2)}', '${HO}');`;
  run('E1c-child-archive-cascade-after-ho-end', asActor(EA_A, `
    ${updateById('children', 'archived_at = pg_catalog.now(), row_version = 2', C(2))}
    ${updateById('child_programme_enrollments', 'ended_at = pg_catalog.now(), row_version = 2', CPE(2))}
    ${updateById('child_class_memberships', 'exited_at = pg_catalog.now(), row_version = 2', CCM(2))}
    ${updateById('child_ea_assignments', 'unassigned_at = pg_catalog.now(), row_version = 2', CHA(2))}
    SELECT 'active-direct-for-pull:' || count(*) FROM public.child_ea_assignments WHERE user_id = '${EA_A}' AND child_id = '${C(2)}' AND unassigned_at IS NULL;
    SELECT 'child-visible:' || (archived_at IS NULL)::text FROM public.children WHERE id = '${C(2)}';
  `, hoEndChild2), ['children:rows=0', 'child_programme_enrollments:rows=0', 'child_class_memberships:rows=0', 'child_ea_assignments:rows=1', 'active-direct-for-pull:0', 'child-visible:true']);

  // ---------------- E1 replay: Head Office re-opens EA_A's assignment later; the stale terminal intent replayed by Sync now lands.
  run('E1a-replay-class-archive-after-reassign', asActor(EA_A, `
    ${updateById('classes', 'archived_at = pg_catalog.now(), row_version = 2', K)}
    SELECT 'ea-b-still-assigned:' || (unassigned_at IS NULL)::text FROM public.class_ea_assignments WHERE id = '${CEA_B(K)}';
  `, `${hoHandoverK}
    UPDATE public.class_ea_assignments SET unassigned_at = NULL, handover_reason = NULL WHERE id = '${CEA_A(K)}';`), ['classes:rows=1', 'ea-b-still-assigned:true']);
  run('E1c-replay-child-archive-after-reassign', asActor(EA_A, `
    ${updateById('children', 'archived_at = pg_catalog.now(), row_version = 2', C(2))}
    ${updateById('child_programme_enrollments', 'ended_at = pg_catalog.now(), row_version = 2', CPE(2))}
    ${updateById('child_class_memberships', 'exited_at = pg_catalog.now(), row_version = 2', CCM(2))}
    SELECT 'own-direct-still-active:' || (unassigned_at IS NULL)::text FROM public.child_ea_assignments WHERE id = '${CHA(2)}';
  `, `${hoEndChild2}
    UPDATE public.child_ea_assignments SET unassigned_at = NULL WHERE id = '${CHA(2)}';`), ['children:rows=1', 'child_programme_enrollments:rows=1', 'child_class_memberships:rows=1', 'own-direct-still-active:true']);

  // ---------------- E2: EA_A-created child 4 has server history recorded by EA_B (session attendee).
  const historyByB = `
    INSERT INTO public.sessions (id, user_id, programme_id, session_date) VALUES ('${SESSION_B}', '${EA_B}', ${LIT}, DATE '2026-10-19');
    INSERT INTO public.session_attendees (id, session_id, child_id) VALUES ('${ATT_B}', '${SESSION_B}', '${C(4)}');`;
  run('E2-delete-child-if-no-history-returns-false', asActor(EA_A, `
    SELECT 'rpc:' || public.delete_child_if_no_history('${C(4)}')::text;
    SELECT 'child-still-there:' || count(*) FROM public.children WHERE id = '${C(4)}';
    SELECT 'pull-scope-active-assignment:' || count(*) FROM public.child_ea_assignments WHERE user_id = '${EA_A}' AND child_id = '${C(4)}' AND unassigned_at IS NULL;
  `, historyByB), ['rpc:false', 'child-still-there:1', 'pull-scope-active-assignment:1']);
  run('E2-control-no-history-deletes', asActor(EA_A, `
    SELECT 'rpc:' || public.delete_child_if_no_history('${C(4)}')::text;
    SELECT 'child-still-there:' || count(*) FROM public.children WHERE id = '${C(4)}';
  `), ['rpc:true', 'child-still-there:0']);

  // ---------------- E3: assignment archive overtakes the class-membership exit.
  run('E3a-holds-class-exit-after-assignment-end', asActor(EA_A, `
    ${updateById('child_programme_enrollments', 'ended_at = pg_catalog.now(), row_version = 2', CPE(5))}
    ${updateById('child_ea_assignments', 'unassigned_at = pg_catalog.now(), row_version = 2', CHA(5))}
    ${updateById('child_class_memberships', 'exited_at = pg_catalog.now(), row_version = 2', CCM(5))}
  `), ['child_programme_enrollments:rows=1', 'child_ea_assignments:rows=1', 'child_class_memberships:rows=1']);
  run('E3b-no-class-exit-after-assignment-end-zero-rows', asActor(EA_A, `
    ${updateById('child_programme_enrollments', 'ended_at = pg_catalog.now(), row_version = 2', CPE(5))}
    ${updateById('child_ea_assignments', 'unassigned_at = pg_catalog.now(), row_version = 2', CHA(5))}
    ${updateById('child_class_memberships', 'exited_at = pg_catalog.now(), row_version = 2', CCM(5))}
    SELECT 'membership-still-active:' || (exited_at IS NULL)::text FROM public.child_class_memberships WHERE id = '${CCM(5)}';
  `, `DELETE FROM public.class_ea_assignments WHERE id = '${CEA_A(K3)}';
      ${classAssignment(CEA_B(K3), K3, EA_B)}`), ['child_programme_enrollments:rows=1', 'child_ea_assignments:rows=1', 'child_class_memberships:rows=0', 'membership-still-active:true']);
  run('E3b-control-exit-before-assignment-end-lands', asActor(EA_A, `
    ${updateById('child_class_memberships', 'exited_at = pg_catalog.now(), row_version = 2', CCM(5))}
    ${updateById('child_ea_assignments', 'unassigned_at = pg_catalog.now(), row_version = 2', CHA(5))}
  `, `DELETE FROM public.class_ea_assignments WHERE id = '${CEA_A(K3)}';`), ['child_class_memberships:rows=1', 'child_ea_assignments:rows=1']);

  // ---------------- E4: seeded group (grouping_version_id not null).
  run('E4-pass1-m1-lands-active', asActor(EA_A, `${membershipUpsert(M1)} SELECT 'm1:' || (removed_at IS NULL)::text FROM public.child_group_memberships WHERE id = '${M1}';`),
    ['m1:true']);
  runDenied('E4-pass1-m2-23505-while-m1-active', asActor(EA_A, `${membershipUpsert(M1)} ${membershipUpsert(M2)}`), '23505');
  run('E4-pass2-m1-archive-then-forced-m2-lands', asActor(EA_A, `
    ${membershipUpsert(M1)}
    ${updateById('child_group_memberships', 'removed_at = pg_catalog.now(), row_version = 2', M1)}
    ${membershipUpsert(M2)}
    SELECT id || ':' || (removed_at IS NULL)::text FROM public.child_group_memberships WHERE child_id = '${C(6)}' ORDER BY id;
  `), ['child_group_memberships:rows=1', `${M1}:false`, `${M2}:true`]);

  // ---------------- E5: EA_A archives the shared class; EA_B still holds it.
  run('E5-co-ea-archive-and-ea-b-view', `
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${EA_A}';
${updateById('classes', 'archived_at = pg_catalog.now(), row_version = 2', KS)}
${updateById('children', 'class_id = NULL, row_version = 2', C(8))}
${updateById('child_class_memberships', 'exited_at = pg_catalog.now(), row_version = 2', CCM(8))}
${updateById('class_ea_assignments', 'unassigned_at = pg_catalog.now(), row_version = 2', CEA_A(KS))}
SET LOCAL request.jwt.claim.sub = '${EA_B}';
SELECT 'b-roster-pull:' || cea.id || '|archived=' || (c.archived_at IS NOT NULL)::text FROM public.class_ea_assignments cea JOIN public.classes c ON c.id = cea.class_id
  WHERE cea.ea_user_id = '${EA_B}' AND cea.unassigned_at IS NULL AND cea.class_id = '${KS}';
SELECT 'b-child7-membership-active:' || (exited_at IS NULL)::text FROM public.child_class_memberships WHERE id = '${CCM(7)}';
SELECT 'b-child7-assignment-active:' || (unassigned_at IS NULL)::text FROM public.child_ea_assignments WHERE id = '${CHA(7, 'b')}';
${updateById('classes', 'archived_at = NULL, row_version = 3', KS)}
ROLLBACK;
`, ['classes:rows=1', 'children:rows=1', 'child_class_memberships:rows=1', 'class_ea_assignments:rows=1', `b-roster-pull:${CEA_B(KS)}|archived=true`, 'b-child7-membership-active:true', 'b-child7-assignment-active:true', 'classes:rows=1']);

  // ---------------- E6: "No class" on a delivery child.
  run('E6-no-class', asActor(EA_A, `
    ${updateById('children', 'class_id = NULL, updated_at = pg_catalog.now(), row_version = 2', C(9))}
    ${updateById('child_class_memberships', 'exited_at = pg_catalog.now(), row_version = 2', CCM(9))}
    SELECT 'assignment-active:' || (unassigned_at IS NULL)::text FROM public.child_ea_assignments WHERE id = '${CHA(9)}';
    SELECT 'enrollment-active:' || (ended_at IS NULL)::text FROM public.child_programme_enrollments WHERE id = '${CPE(9)}';
    SELECT 'open-class-memberships:' || count(*) FROM public.child_class_memberships WHERE child_id = '${C(9)}' AND exited_at IS NULL;
  `), ['children:rows=1', 'child_class_memberships:rows=1', 'assignment-active:true', 'enrollment-active:true', 'open-class-memberships:0']);
};

const main = () => {
  const databaseName = process.env.HISTORY_RLS_DATABASE_NAME;
  const adminUrl = H.assertDisposableAdminTarget({
    adminDatabaseUrl: process.env.HISTORY_RLS_ADMIN_DATABASE_URL,
    databaseName,
    confirmation: process.env.HISTORY_RLS_DISPOSABLE_CONFIRM,
  });
  const adminDatabaseUrl = H.buildDatabaseUrl(adminUrl, 'postgres').href;
  global.databaseUrl = H.buildDatabaseUrl(adminUrl, databaseName).href;
  H.runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${q(databaseName)} WITH (FORCE);`, label: 'drop' });
  H.runPsql({ databaseUrl: adminDatabaseUrl, sql: `CREATE DATABASE ${q(databaseName)};`, label: 'create' });
  try {
    H.runPsql({ databaseUrl: global.databaseUrl, sql: H.bootstrapSql, label: 'bootstrap' });
    H.runPsql({ databaseUrl: global.databaseUrl, label: 'default-privileges', sql: `
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;` });
    const migrations = fs.readdirSync(MIGRATIONS_DIR).filter(n => n.endsWith('.sql')).sort();
    for (const filename of migrations) {
      H.runPsql({ databaseUrl: global.databaseUrl, file: path.join(MIGRATIONS_DIR, filename), label: `migration-${filename}` });
    }
    console.log(`loaded ${migrations.length} migrations (last: ${migrations[migrations.length - 1]})`);
    H.runPsql({ databaseUrl: global.databaseUrl, sql: fixtureSql, label: 'fixture' });
    cases();
  } finally {
    H.runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${q(databaseName)} WITH (FORCE);`, label: 'cleanup' });
  }
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} cases matched expectations`);
  fs.writeFileSync(path.join(__dirname, 'pg-results.json'), JSON.stringify(results, null, 2));
  if (failed.length) process.exitCode = 1;
};

main();
