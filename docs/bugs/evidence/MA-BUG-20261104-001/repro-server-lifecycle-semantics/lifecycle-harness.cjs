#!/usr/bin/env node
// repro-server-lifecycle-semantics: server-side lifecycle write semantics (L1-L7) against a
// disposable PostgreSQL 17 database with EVERY canonical Masi migration loaded.
//
// Safety: reuses Masi's assertDisposableAdminTarget (localhost-only, masi_history_rls_ prefix,
// explicit confirmation). Never loads dotenv, .env.local or the Supabase CLI.
//
// Actor model:
//   * EA writes run as `SET LOCAL ROLE authenticated` + request.jwt.claim.sub (same as the
//     session-group / letter-mastery / assessment-results harnesses).
//   * "Head Office" writes run as the postgres superuser (stand-in for Studio SQL editor or a
//     service_role script: both bypass RLS, both still fire triggers and CHECK constraints).
//   * Every EA statement is wrapped in a data-modifying CTE
//       WITH r AS (<dml> RETURNING id) SELECT jsonb_agg(r), count(*)
//     which is the same shape PostgREST builds (WITH pgrst_source AS (...)). RETURNING makes
//     PostgreSQL apply SELECT policies exactly as supabase-js does (.select('id') / RETURNING 1).
//   * Every scenario runs in its own transaction and is ROLLED BACK.
//
// Run:
//   PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH \
//   HISTORY_RLS_ADMIN_DATABASE_URL=postgres://postgres:<password>@127.0.0.1:<port>/postgres \
//   HISTORY_RLS_DATABASE_NAME=masi_history_rls_lifecycle_repro \
//   HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE \
//   node lifecycle-harness.cjs [--no-load]

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const MASI = '/Users/jimmckeown/Development/masi-app';
const { buildPsqlEnv } = require(path.join(MASI, 'scripts/history-authorization-postgres-harness.cjs'));
const { target, loadDatabase } = require('./load-db.cjs');

const OUT_DIR = __dirname;

// ---------------------------------------------------------------------------------------------
// Masi deterministic ids. Mirrors src/db/domainId.js:3-9 (uuid v5, parts joined by U+001F,
// namespace MASI_DOMAIN_ID_NAMESPACE) and src/db/repositories/domainRepositoryUtils.js:36-50.
// Cross-checked at runtime against Masi's own installed `uuid` package (v5).
const MASI_DOMAIN_ID_NAMESPACE = '09dcf4b2-6c53-4c46-917f-33bc7f2df4d2';
const uuidV5 = (name, namespace) => {
  const ns = Buffer.from(namespace.replaceAll('-', ''), 'hex');
  const hash = crypto.createHash('sha1').update(Buffer.concat([ns, Buffer.from(name, 'utf8')])).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const deterministicDomainId = (...parts) => uuidV5(parts.map((p) => String(p ?? '')).join('\u001f'), MASI_DOMAIN_ID_NAMESPACE);
const childEaAssignmentId = (userId, childId) => deterministicDomainId('child_ea_assignments', userId, childId);
const enrollmentId = (childId, programmeId) => deterministicDomainId('child_programme_enrollments', childId, programmeId);
const classEaAssignmentId = (classId, eaUserId, programmeId) => deterministicDomainId('class_ea_assignments', classId, eaUserId, programmeId);
const groupEaAssignmentId = (groupId) => deterministicDomainId('group_ea_assignments', groupId);

// ---------------------------------------------------------------------------------------------
const ORG = 'a111879f-d066-47c9-95a1-bed2a400319a';
const LITERACY = "(SELECT id FROM public.programmes WHERE code = 'literacy')";
const ACTIVE_YEAR = '(SELECT id FROM public.academic_years WHERE is_active)';

const id = (prefix, n) => `${prefix}-0000-0000-0000-${String(n).padStart(12, '0')}`;
const HO = id('1a000000', 1);
const EA_A = id('1a000000', 2);
const EA_B = id('1a000000', 3);
const EA_DOOMED = id('1a000000', 4);
const SCHOOL = id('2a000000', 1);
const K = id('4a000000', 1);   // Head Office class; EA_A holds an active class assignment
const KA = id('4a000000', 2);  // EA_A-created class
const K2 = id('4a000000', 3);  // Head Office class; EA_A assigned; no memberships
const C_DIRECT = id('5a000000', 1);    // HO child; EA_A direct + class K + group G + enrolment
const C_CLASSONLY = id('5a000000', 2); // HO child; EA_A reaches it ONLY through class K
const C_GROUPONLY = id('5a000000', 3); // HO child; EA_A reaches it ONLY through group G
const C_EA = id('5a000000', 4);        // EA_A-created child with an active direct assignment
const C_FREE = id('5a000000', 5);      // HO child; EA_A direct only, no class/group membership
const C_EA2 = id('5a000000', 6);       // EA_A-created child with NO assignment yet (L3)
const C_L7 = id('5a000000', 7);        // EA_A-created child with NO assignment yet (L7)
const G = id('7a000000', 1);   // HO group in K, no grouping version; EA_A assigned
const GV_G1 = id('7a000000', 2); // HO seeded group, grouping version GV
const GV_G2 = id('7a000000', 3); // HO seeded sibling group, grouping version GV
const GV = id('6a000000', 1);
const CCM_DIRECT = id('9a000000', 1);
const CCM_CLASSONLY = id('9a000000', 2);
const CGM_DIRECT_G = id('9b000000', 1);
const CGM_GROUPONLY_G = id('9b000000', 2);
const M1 = id('9b000000', 3);   // C_DIRECT in GV_G1 (versioned)
const M2 = id('9b000000', 4);   // new phone membership id (uuidv4 in Masi; fixed here)

// Programme ids are gen_random_uuid() at seed time, so every id derived from a programme is built
// after the database is loaded.
const build = (LITERACY_ID) => {
const IDS = {
  CEA_DIRECT: childEaAssignmentId(EA_A, C_DIRECT),
  CEA_FREE: childEaAssignmentId(EA_A, C_FREE),
  CEA_CEA: childEaAssignmentId(EA_A, C_EA),
  CEA_CEA2: childEaAssignmentId(EA_A, C_EA2),
  CEA_L7: childEaAssignmentId(EA_A, C_L7),
  CPE_DIRECT: enrollmentId(C_DIRECT, LITERACY_ID),
  CPE_CLASSONLY: enrollmentId(C_CLASSONLY, LITERACY_ID),
  CPE_GROUPONLY: enrollmentId(C_GROUPONLY, LITERACY_ID),
  CPE_CEA2: enrollmentId(C_EA2, LITERACY_ID),
  CLA_K: classEaAssignmentId(K, EA_A, LITERACY_ID),
  CLA_K2: classEaAssignmentId(K2, EA_A, LITERACY_ID),
  CLA_KA: classEaAssignmentId(KA, EA_A, LITERACY_ID),
  GEA_G: groupEaAssignmentId(G),
  GEA_GV_G1: groupEaAssignmentId(GV_G1),
  GEA_GV_G2: groupEaAssignmentId(GV_G2),
};

const fixtureSql = `
INSERT INTO auth.users (id) VALUES ('${HO}'), ('${EA_A}'), ('${EA_B}'), ('${EA_DOOMED}');
INSERT INTO public.schools (id, name) VALUES ('${SCHOOL}', 'Lifecycle repro school');
INSERT INTO public.users (id, first_name, last_name, school_id, organization_id) VALUES
  ('${HO}', 'Head', 'Office', '${SCHOOL}', '${ORG}'),
  ('${EA_A}', 'EA', 'A', '${SCHOOL}', '${ORG}'),
  ('${EA_B}', 'EA', 'B', '${SCHOOL}', '${ORG}'),
  ('${EA_DOOMED}', 'EA', 'Doomed', '${SCHOOL}', '${ORG}');
INSERT INTO public.staff_programme_assignments (id, user_id, programme_id, school_id, created_by) VALUES
  ('${id('3a000000', 1)}', '${EA_A}', ${LITERACY}, '${SCHOOL}', '${HO}'),
  ('${id('3a000000', 2)}', '${EA_B}', ${LITERACY}, '${SCHOOL}', '${HO}'),
  ('${id('3a000000', 3)}', '${EA_DOOMED}', ${LITERACY}, '${SCHOOL}', '${HO}');
INSERT INTO public.classes (id, school_id, name, grade, academic_year_id, created_by) VALUES
  ('${K}', '${SCHOOL}', 'HO class K', '1', ${ACTIVE_YEAR}, '${HO}'),
  ('${KA}', '${SCHOOL}', 'EA_A class KA', '1', ${ACTIVE_YEAR}, '${EA_A}'),
  ('${K2}', '${SCHOOL}', 'HO class K2', '2', ${ACTIVE_YEAR}, '${HO}');
INSERT INTO public.children (id, first_name, last_name, class_id, created_by) VALUES
  ('${C_DIRECT}', 'Child', 'Direct', '${K}', '${HO}'),
  ('${C_CLASSONLY}', 'Child', 'ClassOnly', '${K}', '${HO}'),
  ('${C_GROUPONLY}', 'Child', 'GroupOnly', NULL, '${HO}'),
  ('${C_EA}', 'Child', 'EaCreated', '${KA}', '${EA_A}'),
  ('${C_FREE}', 'Child', 'Free', NULL, '${HO}'),
  ('${C_EA2}', 'Child', 'EaCreated2', NULL, '${EA_A}'),
  ('${C_L7}', 'Child', 'EaCreatedL7', NULL, '${EA_A}');
INSERT INTO public.child_ea_assignments (id, user_id, child_id, assigned_at, created_by) VALUES
  ('${IDS.CEA_DIRECT}', '${EA_A}', '${C_DIRECT}', TIMESTAMPTZ '2026-02-01 08:00:00+02', '${HO}'),
  ('${IDS.CEA_FREE}', '${EA_A}', '${C_FREE}', TIMESTAMPTZ '2026-02-01 08:00:00+02', '${HO}'),
  ('${IDS.CEA_CEA}', '${EA_A}', '${C_EA}', TIMESTAMPTZ '2026-02-01 08:00:00+02', '${EA_A}');
INSERT INTO public.child_programme_enrollments (id, child_id, programme_id, enrolled_at, created_by) VALUES
  ('${IDS.CPE_DIRECT}', '${C_DIRECT}', ${LITERACY}, TIMESTAMPTZ '2026-02-01 08:00:00+02', '${HO}'),
  ('${IDS.CPE_CLASSONLY}', '${C_CLASSONLY}', ${LITERACY}, TIMESTAMPTZ '2026-02-01 08:00:00+02', '${HO}'),
  ('${IDS.CPE_GROUPONLY}', '${C_GROUPONLY}', ${LITERACY}, TIMESTAMPTZ '2026-02-01 08:00:00+02', '${HO}');
INSERT INTO public.class_ea_assignments (id, class_id, ea_user_id, programme_id, assigned_at, created_by) VALUES
  ('${IDS.CLA_K}', '${K}', '${EA_A}', ${LITERACY}, TIMESTAMPTZ '2026-02-01 08:00:00+02', '${HO}'),
  ('${IDS.CLA_K2}', '${K2}', '${EA_A}', ${LITERACY}, TIMESTAMPTZ '2026-02-01 08:00:00+02', '${HO}');
INSERT INTO public.child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at, created_by) VALUES
  ('${CCM_DIRECT}', '${C_DIRECT}', '${K}', ${ACTIVE_YEAR}, TIMESTAMPTZ '2026-02-01 08:00:00+02', '${HO}'),
  ('${CCM_CLASSONLY}', '${C_CLASSONLY}', '${K}', ${ACTIVE_YEAR}, TIMESTAMPTZ '2026-02-01 08:00:00+02', '${HO}');
INSERT INTO public.grouping_versions (id, class_id, academic_year_id, version_number, status, created_by) VALUES
  ('${GV}', '${K}', ${ACTIVE_YEAR}, 1, 'active', '${HO}');
INSERT INTO public.groups (id, name, programme_id, class_id, grouping_version_id, display_number, created_by) VALUES
  ('${G}', 'HO group G', ${LITERACY}, '${K}', NULL, NULL, '${HO}'),
  ('${GV_G1}', 'Seeded group 1', ${LITERACY}, '${K}', '${GV}', 1, '${HO}'),
  ('${GV_G2}', 'Seeded group 2', ${LITERACY}, '${K}', '${GV}', 2, '${HO}');
INSERT INTO public.group_ea_assignments (id, group_id, ea_user_id, programme_id, assigned_at, created_by) VALUES
  ('${IDS.GEA_G}', '${G}', '${EA_A}', ${LITERACY}, TIMESTAMPTZ '2026-02-01 08:00:00+02', '${HO}'),
  ('${IDS.GEA_GV_G1}', '${GV_G1}', '${EA_A}', ${LITERACY}, TIMESTAMPTZ '2026-02-01 08:00:00+02', '${HO}'),
  ('${IDS.GEA_GV_G2}', '${GV_G2}', '${EA_A}', ${LITERACY}, TIMESTAMPTZ '2026-02-01 08:00:00+02', '${HO}');
INSERT INTO public.child_group_memberships (id, child_id, group_id, grouping_version_id, joined_at, created_by) VALUES
  ('${CGM_DIRECT_G}', '${C_DIRECT}', '${G}', NULL, TIMESTAMPTZ '2026-02-01 08:00:00+02', '${HO}'),
  ('${CGM_GROUPONLY_G}', '${C_GROUPONLY}', '${G}', NULL, TIMESTAMPTZ '2026-02-01 08:00:00+02', '${HO}'),
  ('${M1}', '${C_DIRECT}', '${GV_G1}', '${GV}', TIMESTAMPTZ '2026-02-01 08:00:00+02', '${HO}');
`;

// Harness-only helpers live in their own schema in the disposable database.
const helperSql = `
CREATE SCHEMA harness;
-- Runs one DML statement as the CURRENT role (SECURITY INVOKER) inside a subtransaction and
-- reports exactly what the client would see: rows returned or the SQLSTATE/message/constraint.
CREATE FUNCTION harness.try_dml(p_step TEXT, p_sql TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER AS $fn$
DECLARE
  v_rows JSONB; v_count BIGINT; v_state TEXT; v_msg TEXT; v_detail TEXT; v_constraint TEXT; v_table TEXT;
  v_who JSONB := jsonb_build_object('role', current_user, 'jwt_sub', NULLIF(current_setting('request.jwt.claim.sub', TRUE), ''));
BEGIN
  BEGIN
    EXECUTE format('WITH r AS (%s) SELECT COALESCE(jsonb_agg(to_jsonb(r)), ''[]''::jsonb), count(*) FROM r', p_sql)
      INTO v_rows, v_count;
    RETURN jsonb_build_object('step', p_step, 'as', v_who, 'ok', TRUE, 'rows_affected', v_count, 'returned', v_rows);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL,
      v_constraint = CONSTRAINT_NAME, v_table = TABLE_NAME;
    RETURN jsonb_build_object('step', p_step, 'as', v_who, 'ok', FALSE, 'sqlstate', v_state, 'message', v_msg,
      'detail', NULLIF(v_detail, ''), 'constraint', NULLIF(v_constraint, ''), 'table', NULLIF(v_table, ''));
  END;
END;
$fn$;
-- Reads a row bypassing RLS (SECURITY DEFINER, owned by the superuser) so state is reported truthfully.
CREATE FUNCTION harness.peek(p_step TEXT, p_table REGCLASS, p_id UUID, p_cols TEXT[])
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_row JSONB; v_out JSONB := '{}'::jsonb; c TEXT;
BEGIN
  EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE t.id = $1', p_table) INTO v_row USING p_id;
  IF v_row IS NULL THEN
    RETURN jsonb_build_object('step', p_step, 'table', p_table::text, 'id', p_id, 'row', NULL);
  END IF;
  FOREACH c IN ARRAY p_cols LOOP v_out := v_out || jsonb_build_object(c, v_row -> c); END LOOP;
  RETURN jsonb_build_object('step', p_step, 'table', p_table::text, 'id', p_id, 'row', v_out);
END;
$fn$;
CREATE FUNCTION harness.q(p_step TEXT, p_sql TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v JSONB;
BEGIN
  EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) FROM (%s) r', p_sql) INTO v;
  RETURN jsonb_build_object('step', p_step, 'result', v);
END;
$fn$;
GRANT USAGE ON SCHEMA harness TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA harness TO authenticated;
`;

// ---------------------------------------------------------------------------------------------
// SQL builders that mirror src/services/offlineSync.js send shapes.
const lit = (v) => (v === null ? 'NULL' : v.startsWith('(') || v.startsWith('TIMESTAMPTZ') || v.startsWith('now()') || v.startsWith('pg_catalog') ? v : `'${v}'`);
const dollar = (sql) => `$dml$${sql}$dml$`;
const step = (label, sql) => `SELECT harness.try_dml('${label.replaceAll("'", "''")}', ${dollar(sql)});`;
const peek = (label, table, rowId, cols) => `SELECT harness.peek('${label}', '${table}', '${rowId}', ARRAY[${cols.map((c) => `'${c}'`).join(', ')}]);`;
const q = (label, sql) => `SELECT harness.q('${label.replaceAll("'", "''")}', ${dollar(sql)});`;
const asEA = (actor) => `SET LOCAL ROLE authenticated;\nSET LOCAL request.jwt.claim.sub = '${actor}';`;
const asHO = 'RESET ROLE;\nSET LOCAL request.jwt.claim.sub = \'\';';

// offlineSync.js:747-764 — archive/restore: update(buildOperationPatch(...)).eq('id', id).select('id').
// buildOperationPatch (offlineSync.js:603-616) keeps ARCHIVE_SERVER_COLUMNS[table] present in the
// payload plus the claimed row_version (stamped at claim; rowVersion.js isStampedOperation).
const archiveUpdate = (table, rowId, patch) => `UPDATE public.${table} SET ${Object.entries(patch).map(([c, v]) => `${c} = ${lit(v)}`).join(', ')} WHERE id = '${rowId}' RETURNING id`;
// offlineSync.js:794-802 — upsert(payload, { onConflict: 'id', ignoreDuplicates: insert && INSERT_OR_IGNORE_TABLES }).
const insertOrIgnore = (table, row) => `INSERT INTO public.${table} (${Object.keys(row).join(', ')}) VALUES (${Object.values(row).map(lit).join(', ')}) ON CONFLICT (id) DO NOTHING RETURNING id`;
const mergeUpsert = (table, row) => `INSERT INTO public.${table} (${Object.keys(row).join(', ')}) VALUES (${Object.values(row).map(lit).join(', ')}) ON CONFLICT (id) DO UPDATE SET ${Object.keys(row).filter((c) => c !== 'id').map((c) => `${c} = EXCLUDED.${c}`).join(', ')} RETURNING id`;
const hardDelete = (table, rowId) => `DELETE FROM public.${table} WHERE id = '${rowId}' RETURNING id`;

const tx = (body) => `BEGIN;\n${body}\nROLLBACK;\n`;

// ---------------------------------------------------------------------------------------------
const scenarios = [];
const add = (scenarioId, title, body) => scenarios.push({ id: scenarioId, title, sql: tx(body) });

// ===== L1 Redundant removal ==================================================================
add('L1.class_membership.direct_path', 'HO exits C_DIRECT from class K, then EA_A queued exit (EA_A still has direct assignment)', [
  asHO,
  step('HO exits membership (no row_version)', archiveUpdate('child_class_memberships', CCM_DIRECT, { exited_at: "TIMESTAMPTZ '2026-11-03 09:00:00+02'" })),
  asEA(EA_A),
  step('EA_A queued archive exit', archiveUpdate('child_class_memberships', CCM_DIRECT, { exited_at: "TIMESTAMPTZ '2026-11-02 10:00:00+02'", row_version: '2' })),
  asHO,
  peek('final row', 'public.child_class_memberships', CCM_DIRECT, ['exited_at', 'row_version']),
].join('\n'));
add('L1.class_membership.class_only_path', 'HO exits C_CLASSONLY from class K (EA_A reaches child only through K), then EA_A queued exit', [
  asHO,
  step('HO exits membership', archiveUpdate('child_class_memberships', CCM_CLASSONLY, { exited_at: "TIMESTAMPTZ '2026-11-03 09:00:00+02'" })),
  asEA(EA_A),
  step('EA_A queued archive exit', archiveUpdate('child_class_memberships', CCM_CLASSONLY, { exited_at: "TIMESTAMPTZ '2026-11-02 10:00:00+02'", row_version: '2' })),
  asHO,
  peek('final row', 'public.child_class_memberships', CCM_CLASSONLY, ['exited_at', 'row_version']),
].join('\n'));
add('L1.group_membership.direct_path', 'HO removes C_DIRECT from group G, then EA_A queued removal (EA_A has direct assignment + active group assignment)', [
  asHO,
  step('HO removes membership', archiveUpdate('child_group_memberships', CGM_DIRECT_G, { removed_at: "TIMESTAMPTZ '2026-11-03 09:00:00+02'" })),
  asEA(EA_A),
  step('EA_A queued archive removal', archiveUpdate('child_group_memberships', CGM_DIRECT_G, { removed_at: "TIMESTAMPTZ '2026-11-02 10:00:00+02'", row_version: '2' })),
  asHO,
  peek('final row', 'public.child_group_memberships', CGM_DIRECT_G, ['removed_at', 'row_version']),
].join('\n'));
add('L1.group_membership.group_only_path', 'HO removes C_GROUPONLY from group G (EA_A reaches child only through G), then EA_A queued removal', [
  asHO,
  step('HO removes membership', archiveUpdate('child_group_memberships', CGM_GROUPONLY_G, { removed_at: "TIMESTAMPTZ '2026-11-03 09:00:00+02'" })),
  asEA(EA_A),
  step('EA_A queued archive removal', archiveUpdate('child_group_memberships', CGM_GROUPONLY_G, { removed_at: "TIMESTAMPTZ '2026-11-02 10:00:00+02'", row_version: '2' })),
  asHO,
  peek('final row', 'public.child_group_memberships', CGM_GROUPONLY_G, ['removed_at', 'row_version']),
].join('\n'));
add('L1.enrollment.direct_path', 'HO ends C_DIRECT literacy enrolment, then EA_A queued enrolment archive', [
  asHO,
  step('HO ends enrolment', archiveUpdate('child_programme_enrollments', IDS.CPE_DIRECT, { ended_at: "TIMESTAMPTZ '2026-11-03 09:00:00+02'" })),
  asEA(EA_A),
  step('EA_A queued archive', archiveUpdate('child_programme_enrollments', IDS.CPE_DIRECT, { ended_at: "TIMESTAMPTZ '2026-11-02 10:00:00+02'", row_version: '2' })),
  asHO,
  peek('final row', 'public.child_programme_enrollments', IDS.CPE_DIRECT, ['ended_at', 'row_version']),
].join('\n'));
add('L1.enrollment.class_only_path', 'HO ends C_CLASSONLY enrolment (class path still active), then EA_A queued enrolment archive', [
  asHO,
  step('HO ends enrolment', archiveUpdate('child_programme_enrollments', IDS.CPE_CLASSONLY, { ended_at: "TIMESTAMPTZ '2026-11-03 09:00:00+02'" })),
  asEA(EA_A),
  step('EA_A queued archive', archiveUpdate('child_programme_enrollments', IDS.CPE_CLASSONLY, { ended_at: "TIMESTAMPTZ '2026-11-02 10:00:00+02'", row_version: '2' })),
  asHO,
  peek('final row', 'public.child_programme_enrollments', IDS.CPE_CLASSONLY, ['ended_at', 'row_version']),
].join('\n'));
add('L1.direct_assignment', 'HO ends EA_A direct assignment to C_DIRECT, then EA_A queued child_ea_assignments archive', [
  asHO,
  step('HO ends direct assignment', archiveUpdate('child_ea_assignments', IDS.CEA_DIRECT, { unassigned_at: "TIMESTAMPTZ '2026-11-03 09:00:00+02'" })),
  asEA(EA_A),
  step('EA_A queued archive', archiveUpdate('child_ea_assignments', IDS.CEA_DIRECT, { unassigned_at: "TIMESTAMPTZ '2026-11-02 10:00:00+02'", row_version: '2' })),
  asHO,
  peek('final row', 'public.child_ea_assignments', IDS.CEA_DIRECT, ['unassigned_at', 'row_version']),
].join('\n'));
add('L1.group_assignment_ended.membership_removal', 'HO ends EA_A group G assignment only; EA_A queued removal of C_DIRECT (still directly assigned) from G', [
  asHO,
  step('HO ends group G assignment', archiveUpdate('group_ea_assignments', IDS.GEA_G, { unassigned_at: "TIMESTAMPTZ '2026-11-03 09:00:00+02'", handover_reason: 'HO handover' })),
  asEA(EA_A),
  step('EA_A queued removal C_DIRECT from G', archiveUpdate('child_group_memberships', CGM_DIRECT_G, { removed_at: "TIMESTAMPTZ '2026-11-02 10:00:00+02'", row_version: '2' })),
  asHO,
  peek('final row', 'public.child_group_memberships', CGM_DIRECT_G, ['removed_at', 'row_version']),
].join('\n'));
add('L1.class_assignment_ended.membership_exit', 'HO ends EA_A class K assignment only; EA_A queued exits for C_DIRECT (direct) and C_CLASSONLY (class path only)', [
  asHO,
  step('HO ends class K assignment', archiveUpdate('class_ea_assignments', IDS.CLA_K, { unassigned_at: "TIMESTAMPTZ '2026-11-03 09:00:00+02'", handover_reason: 'HO handover' })),
  asEA(EA_A),
  step('EA_A queued exit C_DIRECT from K', archiveUpdate('child_class_memberships', CCM_DIRECT, { exited_at: "TIMESTAMPTZ '2026-11-02 10:00:00+02'", row_version: '2' })),
  step('EA_A queued exit C_CLASSONLY from K', archiveUpdate('child_class_memberships', CCM_CLASSONLY, { exited_at: "TIMESTAMPTZ '2026-11-02 10:00:00+02'", row_version: '2' })),
  asHO,
  peek('C_DIRECT membership', 'public.child_class_memberships', CCM_DIRECT, ['exited_at', 'row_version']),
  peek('C_CLASSONLY membership', 'public.child_class_memberships', CCM_CLASSONLY, ['exited_at', 'row_version']),
].join('\n'));
// Composite: phone archiveChild (childrenRepository.js:930-972) queue, sent in ARCHIVE_PUSH_ORDER
// (offlineSync.js:202-213): children 2, enrolment 3, class membership 4, group membership 5, child_ea 7,
// after Head Office already removed every EA_A path to C_DIRECT (direct, class K, group G).
add('L1.composite.archiveChild_after_HO_removed_all_paths', 'HO ends EA_A direct + class K + group G assignments; then EA_A phone archiveChild queue for C_DIRECT drains in push order', [
  asHO,
  step('HO ends direct assignment', archiveUpdate('child_ea_assignments', IDS.CEA_DIRECT, { unassigned_at: "TIMESTAMPTZ '2026-11-03 09:00:00+02'" })),
  step('HO ends class K assignment', archiveUpdate('class_ea_assignments', IDS.CLA_K, { unassigned_at: "TIMESTAMPTZ '2026-11-03 09:00:00+02'", handover_reason: 'HO handover' })),
  step('HO ends group G assignment', archiveUpdate('group_ea_assignments', IDS.GEA_G, { unassigned_at: "TIMESTAMPTZ '2026-11-03 09:00:00+02'", handover_reason: 'HO handover' })),
  step('HO ends group GV_G1 assignment', archiveUpdate('group_ea_assignments', IDS.GEA_GV_G1, { unassigned_at: "TIMESTAMPTZ '2026-11-03 09:00:00+02'", handover_reason: 'HO handover' })),
  asEA(EA_A),
  step('2 children archive', archiveUpdate('children', C_DIRECT, { archived_at: "TIMESTAMPTZ '2026-11-02 10:00:00+02'", row_version: '2' })),
  step('3 enrolment archive', archiveUpdate('child_programme_enrollments', IDS.CPE_DIRECT, { ended_at: "TIMESTAMPTZ '2026-11-02 10:00:00+02'", row_version: '2' })),
  step('4 class membership exit', archiveUpdate('child_class_memberships', CCM_DIRECT, { exited_at: "TIMESTAMPTZ '2026-11-02 10:00:00+02'", row_version: '2' })),
  step('5 group membership G removal', archiveUpdate('child_group_memberships', CGM_DIRECT_G, { removed_at: "TIMESTAMPTZ '2026-11-02 10:00:00+02'", row_version: '2' })),
  step('5 group membership GV_G1 removal', archiveUpdate('child_group_memberships', M1, { removed_at: "TIMESTAMPTZ '2026-11-02 10:00:00+02'", row_version: '2' })),
  step('7 child_ea_assignments archive', archiveUpdate('child_ea_assignments', IDS.CEA_DIRECT, { unassigned_at: "TIMESTAMPTZ '2026-11-02 10:00:00+02'", row_version: '2' })),
  asHO,
  peek('children', 'public.children', C_DIRECT, ['archived_at', 'row_version']),
  peek('enrolment', 'public.child_programme_enrollments', IDS.CPE_DIRECT, ['ended_at']),
  peek('class membership', 'public.child_class_memberships', CCM_DIRECT, ['exited_at']),
  peek('group membership G', 'public.child_group_memberships', CGM_DIRECT_G, ['removed_at']),
  peek('child_ea', 'public.child_ea_assignments', IDS.CEA_DIRECT, ['unassigned_at', 'row_version']),
].join('\n'));

// ===== L2 EA overrides Head Office ===========================================================
const l2 = (table, rowId, extraHO = {}, extraEA = {}) => [
  asHO,
  step('HO ends assignment (row_version omitted => stays 1)', archiveUpdate(table, rowId, { unassigned_at: "TIMESTAMPTZ '2026-11-03 09:00:00+02'", ...extraHO })),
  peek('after HO', `public.${table}`, rowId, ['unassigned_at', 'row_version', ...(table === 'child_ea_assignments' ? [] : ['handover_reason'])]),
  asEA(EA_A),
  step('EA_A later-arriving archive with a different unassigned_at, row_version 2', archiveUpdate(table, rowId, { unassigned_at: "TIMESTAMPTZ '2026-10-30 07:00:00+02'", ...extraEA, row_version: '2' })),
  asHO,
  peek('final', `public.${table}`, rowId, ['unassigned_at', 'row_version', ...(table === 'child_ea_assignments' ? [] : ['handover_reason'])]),
].join('\n');
add('L2.child_ea.HO_no_version', 'HO ends EA_A child assignment without row_version; EA_A archive arrives later with a different unassigned_at', l2('child_ea_assignments', IDS.CEA_DIRECT));
add('L2.class_ea.HO_no_version', 'HO ends EA_A class K assignment without row_version; EA_A archive arrives later', l2('class_ea_assignments', IDS.CLA_K, { handover_reason: 'HO handover' }, { handover_reason: null }));
add('L2.group_ea.HO_no_version', 'HO ends EA_A group G assignment without row_version; EA_A archive arrives later', l2('group_ea_assignments', IDS.GEA_G, { handover_reason: 'HO handover' }, { handover_reason: null }));
add('L2.group_ea.restore_after_HO_end', 'HO ends EA_A group G assignment; EA_A phone restore (groupsRepository.js:149-153: unassigned_at null, handover_reason null)', [
  asHO,
  step('HO ends group assignment', archiveUpdate('group_ea_assignments', IDS.GEA_G, { unassigned_at: "TIMESTAMPTZ '2026-11-03 09:00:00+02'", handover_reason: 'HO handover' })),
  asEA(EA_A),
  step('EA_A write_for_child(C_GROUPONLY) before restore', `SELECT private.current_user_can_write_for_child('${C_GROUPONLY}') AS can_write`),
  step('EA_A restore', archiveUpdate('group_ea_assignments', IDS.GEA_G, { unassigned_at: null, handover_reason: null, row_version: '2' })),
  step('EA_A write_for_child(C_GROUPONLY) after restore', `SELECT private.current_user_can_write_for_child('${C_GROUPONLY}') AS can_write`),
  asHO,
  peek('final', 'public.group_ea_assignments', IDS.GEA_G, ['unassigned_at', 'handover_reason', 'row_version']),
].join('\n'));
add('L2.group_ea.restore_after_HO_handover_to_EA_B', 'HO ends EA_A group G assignment and gives G to EA_B; EA_A phone restore arrives', [
  asHO,
  step('HO ends EA_A group assignment', archiveUpdate('group_ea_assignments', IDS.GEA_G, { unassigned_at: "TIMESTAMPTZ '2026-11-03 09:00:00+02'", handover_reason: 'HO handover' })),
  step('HO inserts EA_B active assignment (random id)', `INSERT INTO public.group_ea_assignments (id, group_id, ea_user_id, programme_id, created_by) VALUES ('${id('8b000000', 1)}', '${G}', '${EA_B}', ${LITERACY}, '${HO}') RETURNING id`),
  asEA(EA_A),
  step('EA_A restore', archiveUpdate('group_ea_assignments', IDS.GEA_G, { unassigned_at: null, handover_reason: null, row_version: '2' })),
  asHO,
  peek('final EA_A row', 'public.group_ea_assignments', IDS.GEA_G, ['unassigned_at', 'handover_reason', 'row_version']),
].join('\n'));
add('L2.child_ea.HO_bumps_version', 'HO ends child assignment AND bumps row_version to 5; EA_A archive arrives with row_version 2', [
  asHO,
  step('HO ends assignment with row_version 5', archiveUpdate('child_ea_assignments', IDS.CEA_DIRECT, { unassigned_at: "TIMESTAMPTZ '2026-11-03 09:00:00+02'", row_version: '5' })),
  asEA(EA_A),
  step('EA_A archive row_version 2', archiveUpdate('child_ea_assignments', IDS.CEA_DIRECT, { unassigned_at: "TIMESTAMPTZ '2026-10-30 07:00:00+02'", row_version: '2' })),
  asHO,
  peek('final', 'public.child_ea_assignments', IDS.CEA_DIRECT, ['unassigned_at', 'row_version']),
].join('\n'));
add('L2.group_ea.restore_HO_bumps_version', 'HO ends group assignment with row_version 5; EA_A restore with row_version 2', [
  asHO,
  step('HO ends group assignment with row_version 5', archiveUpdate('group_ea_assignments', IDS.GEA_G, { unassigned_at: "TIMESTAMPTZ '2026-11-03 09:00:00+02'", handover_reason: 'HO handover', row_version: '5' })),
  asEA(EA_A),
  step('EA_A restore row_version 2', archiveUpdate('group_ea_assignments', IDS.GEA_G, { unassigned_at: null, handover_reason: null, row_version: '2' })),
  asHO,
  peek('final', 'public.group_ea_assignments', IDS.GEA_G, ['unassigned_at', 'row_version']),
].join('\n'));
add('L2.children.HO_unarchive_then_EA_archive', 'HO archived then un-archived children C_EA (EA-created) and C_DIRECT (HO-created, EA_A direct); EA_A queued archives arrive afterwards', [
  asHO,
  step('HO un-archives C_EA after an earlier archive', `UPDATE public.children SET archived_at = NULL, archived_by_user_id = NULL, archive_reason = NULL WHERE id = '${C_EA}' RETURNING id`),
  step('HO un-archives C_DIRECT', `UPDATE public.children SET archived_at = NULL WHERE id = '${C_DIRECT}' RETURNING id`),
  asEA(EA_A),
  step('EA_A queued archive C_EA', archiveUpdate('children', C_EA, { archived_at: "TIMESTAMPTZ '2026-11-02 10:00:00+02'", row_version: '2' })),
  step('EA_A queued archive C_DIRECT', archiveUpdate('children', C_DIRECT, { archived_at: "TIMESTAMPTZ '2026-11-02 10:00:00+02'", row_version: '2' })),
  asHO,
  peek('C_EA', 'public.children', C_EA, ['archived_at', 'row_version']),
  peek('C_DIRECT', 'public.children', C_DIRECT, ['archived_at', 'row_version']),
].join('\n'));
add('L2.raw_capability.child_and_class_restore', 'Server capability only (no phone producer found): EA_A sets unassigned_at NULL on child/class assignments HO ended', [
  asHO,
  step('HO ends child assignment', archiveUpdate('child_ea_assignments', IDS.CEA_DIRECT, { unassigned_at: "TIMESTAMPTZ '2026-11-03 09:00:00+02'" })),
  step('HO ends class assignment', archiveUpdate('class_ea_assignments', IDS.CLA_K, { unassigned_at: "TIMESTAMPTZ '2026-11-03 09:00:00+02'" })),
  asEA(EA_A),
  step('EA_A un-ends child assignment', archiveUpdate('child_ea_assignments', IDS.CEA_DIRECT, { unassigned_at: null, row_version: '2' })),
  step('EA_A un-ends class assignment', archiveUpdate('class_ea_assignments', IDS.CLA_K, { unassigned_at: null, handover_reason: null, row_version: '2' })),
].join('\n'));

// ===== L3 Clock-skew CHECKs ==================================================================
const FUTURE = "now() + interval '2 days'";
const GA = id('7a000000', 9); // EA_A-created group in KA (inserted in-transaction)
add('L3.clock_skew', 'Rows created with a phone clock 2 days fast, then ended with a corrected clock (now())', [
  asEA(EA_A),
  step('insert child_ea (insert-or-ignore) assigned_at +2d', insertOrIgnore('child_ea_assignments', { id: IDS.CEA_CEA2, user_id: EA_A, child_id: C_EA2, assigned_at: FUTURE, created_by: EA_A })),
  step('insert enrolment (merge upsert) enrolled_at +2d', mergeUpsert('child_programme_enrollments', { id: IDS.CPE_CEA2, child_id: C_EA2, programme_id: LITERACY, enrolled_at: FUTURE, created_by: EA_A, row_version: '2' })),
  step('insert class_ea KA (insert-or-ignore) assigned_at +2d', insertOrIgnore('class_ea_assignments', { id: IDS.CLA_KA, class_id: KA, ea_user_id: EA_A, programme_id: LITERACY, assigned_at: FUTURE, created_by: EA_A })),
  step('insert class membership C_EA2->KA (merge upsert) enrolled_at +2d', mergeUpsert('child_class_memberships', { id: id('9a000000', 9), child_id: C_EA2, class_id: KA, academic_year_id: ACTIVE_YEAR, enrolled_at: FUTURE, created_by: EA_A, row_version: '2' })),
  step('insert group GA (merge upsert)', mergeUpsert('groups', { id: GA, name: 'EA_A group GA', programme_id: LITERACY, class_id: KA, created_by: EA_A, row_version: '2' })),
  step('insert group_ea GA (insert-or-ignore) assigned_at +2d', insertOrIgnore('group_ea_assignments', { id: groupEaAssignmentId(GA), group_id: GA, ea_user_id: EA_A, programme_id: LITERACY, assigned_at: FUTURE, created_by: EA_A })),
  step('insert group membership C_EA2->GA (merge upsert) joined_at +2d', mergeUpsert('child_group_memberships', { id: id('9b000000', 9), child_id: C_EA2, group_id: GA, joined_at: FUTURE, created_by: EA_A, row_version: '2' })),
  step('archive enrolment ended_at now()', archiveUpdate('child_programme_enrollments', IDS.CPE_CEA2, { ended_at: 'now()', row_version: '3' })),
  step('archive class membership exited_at now()', archiveUpdate('child_class_memberships', id('9a000000', 9), { exited_at: 'now()', row_version: '3' })),
  step('archive group membership removed_at now()', archiveUpdate('child_group_memberships', id('9b000000', 9), { removed_at: 'now()', row_version: '3' })),
  step('archive group_ea unassigned_at now()', archiveUpdate('group_ea_assignments', groupEaAssignmentId(GA), { unassigned_at: 'now()', handover_reason: null, row_version: '2' })),
  step('archive class_ea unassigned_at now()', archiveUpdate('class_ea_assignments', IDS.CLA_KA, { unassigned_at: 'now()', handover_reason: null, row_version: '2' })),
  step('archive child_ea unassigned_at now()', archiveUpdate('child_ea_assignments', IDS.CEA_CEA2, { unassigned_at: 'now()', row_version: '2' })),
  asHO,
  step('HO (superuser) also tries to end child_ea at now()', archiveUpdate('child_ea_assignments', IDS.CEA_CEA2, { unassigned_at: 'now()' })),
  step('HO ends child_ea at now()+3d (only a time after assigned_at passes)', archiveUpdate('child_ea_assignments', IDS.CEA_CEA2, { unassigned_at: "now() + interval '3 days'" })),
].join('\n'));

// ===== L4 Writes into archived parents =======================================================
add('L4.catalog_archived_at_readers', 'Catalog: which live functions / policies / triggers reference archived_at or hidden_at after all migrations', [
  q('functions referencing archived_at or hidden_at', `
    SELECT n.nspname || '.' || p.proname AS fn,
      pg_catalog.pg_get_functiondef(p.oid) ILIKE '%archived_at%' AS reads_archived_at,
      pg_catalog.pg_get_functiondef(p.oid) ILIKE '%hidden_at%' AS reads_hidden_at
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private') AND p.prokind = 'f'
      AND (pg_catalog.pg_get_functiondef(p.oid) ILIKE '%archived_at%' OR pg_catalog.pg_get_functiondef(p.oid) ILIKE '%hidden_at%')
    ORDER BY 1`),
  q('policies referencing archived_at or hidden_at', `
    SELECT tablename, policyname, cmd FROM pg_catalog.pg_policies
    WHERE COALESCE(qual, '') || COALESCE(with_check, '') ILIKE '%archived_at%' OR COALESCE(qual, '') || COALESCE(with_check, '') ILIKE '%hidden_at%'`),
].join('\n'));
const S1 = id('86000000', 1);
const S2 = id('86000000', 2);
add('L4.archived_class', 'HO archives class K (archived_at set); EA_A then writes into it', [
  asHO,
  step('HO archives class K', archiveUpdate('classes', K, { archived_at: 'now()', archived_by_user_id: HO, archive_reason: 'HO closed class' })),
  asEA(EA_A),
  step('EA_A class membership C_FREE->K (merge upsert)', mergeUpsert('child_class_memberships', { id: id('9a000000', 20), child_id: C_FREE, class_id: K, academic_year_id: ACTIVE_YEAR, enrolled_at: 'now()', created_by: EA_A, row_version: '2' })),
  step('EA_A session for class K (insert-or-ignore)', insertOrIgnore('sessions', { id: S1, user_id: EA_A, programme_id: LITERACY, class_id: K, session_date: '2026-11-04' })),
  step('EA_A group in class K (merge upsert)', mergeUpsert('groups', { id: id('7a000000', 20), name: 'New group in archived class', programme_id: LITERACY, class_id: K, created_by: EA_A, row_version: '2' })),
  step('EA_A child in class K (merge upsert)', mergeUpsert('children', { id: id('5a000000', 20), first_name: 'New', last_name: 'Child', class_id: K, created_by: EA_A, row_version: '2' })),
  step('EA_A edits archived class K name (UPDATE by id)', `UPDATE public.classes SET name = 'renamed after archive', row_version = 2 WHERE id = '${K}' RETURNING id`),
  asEA(EA_B),
  step('EA_B class_ea_assignment into archived K (insert-or-ignore)', insertOrIgnore('class_ea_assignments', { id: classEaAssignmentId(K, EA_B, LITERACY_ID), class_id: K, ea_user_id: EA_B, programme_id: LITERACY, created_by: EA_B })),
].join('\n'));
add('L4.archived_group', 'HO archives group G (EA_A still holds an active group assignment); EA_A then writes into it', [
  asHO,
  step('HO archives group G', archiveUpdate('groups', G, { archived_at: 'now()', archived_by_user_id: HO, archive_reason: 'HO closed group' })),
  asEA(EA_A),
  step('EA_A group membership C_FREE->G (merge upsert)', mergeUpsert('child_group_memberships', { id: id('9b000000', 20), child_id: C_FREE, group_id: G, joined_at: 'now()', created_by: EA_A, row_version: '2' })),
  step('EA_A session for group G (insert-or-ignore)', insertOrIgnore('sessions', { id: S2, user_id: EA_A, programme_id: LITERACY, group_id: G, session_date: '2026-11-04' })),
  step('EA_A attendee C_FREE in that session with group G (merge upsert)', mergeUpsert('session_attendees', { id: id('96000000', 1), session_id: S2, child_id: C_FREE, group_id: G })),
].join('\n'));
add('L4.archived_group_after_EA_assignment_ended', 'HO archives group G AND ends EA_A group assignment (the phone archiveGroup end state); EA_A late writes', [
  asHO,
  step('HO archives group G', archiveUpdate('groups', G, { archived_at: 'now()', archived_by_user_id: HO })),
  step('HO ends EA_A group G assignment', archiveUpdate('group_ea_assignments', IDS.GEA_G, { unassigned_at: 'now()' })),
  asEA(EA_A),
  step('EA_A group membership C_FREE->G (merge upsert)', mergeUpsert('child_group_memberships', { id: id('9b000000', 21), child_id: C_FREE, group_id: G, joined_at: 'now()', created_by: EA_A, row_version: '2' })),
  step('EA_A session for group G (insert-or-ignore)', insertOrIgnore('sessions', { id: S2, user_id: EA_A, programme_id: LITERACY, group_id: G, session_date: '2026-11-04' })),
  step('EA_A attendee C_FREE (direct) with group G', mergeUpsert('session_attendees', { id: id('96000000', 2), session_id: S2, child_id: C_FREE, group_id: G })),
  step('EA_A attendee C_GROUPONLY (group-only child) with group G', mergeUpsert('session_attendees', { id: id('96000000', 3), session_id: S2, child_id: C_GROUPONLY, group_id: G })),
].join('\n'));

// ===== L5 Seeded-group remove then re-add ====================================================
add('L5.readd_same_group_before_removal', 'M1 (C_DIRECT in seeded GV_G1, version GV) active; EA_A re-add M2 (new id, same child+group+version) lands BEFORE M1 removal', [
  asEA(EA_A),
  step('M2 insert (merge upsert) while M1 active', mergeUpsert('child_group_memberships', { id: M2, child_id: C_DIRECT, group_id: GV_G1, grouping_version_id: GV, joined_at: 'now()', created_by: EA_A, row_version: '2' })),
  step('M1 removal (archive UPDATE)', archiveUpdate('child_group_memberships', M1, { removed_at: 'now()', row_version: '2' })),
  step('M2 retry after M1 removal', mergeUpsert('child_group_memberships', { id: M2, child_id: C_DIRECT, group_id: GV_G1, grouping_version_id: GV, joined_at: 'now()', created_by: EA_A, row_version: '3' })),
].join('\n'));
add('L5.move_to_sibling_group_before_removal', 'M1 active in GV_G1; EA_A adds C_DIRECT to sibling seeded GV_G2 (same version) before M1 removal lands', [
  asEA(EA_A),
  step('M2 insert into GV_G2 while M1 active', mergeUpsert('child_group_memberships', { id: M2, child_id: C_DIRECT, group_id: GV_G2, grouping_version_id: GV, joined_at: 'now()', created_by: EA_A, row_version: '2' })),
  step('M1 removal', archiveUpdate('child_group_memberships', M1, { removed_at: 'now()', row_version: '2' })),
  step('M2 retry', mergeUpsert('child_group_memberships', { id: M2, child_id: C_DIRECT, group_id: GV_G2, grouping_version_id: GV, joined_at: 'now()', created_by: EA_A, row_version: '3' })),
].join('\n'));
add('L5.reverse_order_removal_first', 'M1 removal lands first, then M2 insert (same child+group+version)', [
  asEA(EA_A),
  step('M1 removal', archiveUpdate('child_group_memberships', M1, { removed_at: 'now()', row_version: '2' })),
  step('M2 insert', mergeUpsert('child_group_memberships', { id: M2, child_id: C_DIRECT, group_id: GV_G1, grouping_version_id: GV, joined_at: 'now()', created_by: EA_A, row_version: '2' })),
].join('\n'));
add('L5.unversioned_group_duplicate_active', 'Unversioned group G (grouping_version_id NULL): C_DIRECT already active in G; EA_A adds a second active membership (new id)', [
  asEA(EA_A),
  step('second active membership same child+group', mergeUpsert('child_group_memberships', { id: M2, child_id: C_DIRECT, group_id: G, joined_at: 'now()', created_by: EA_A, row_version: '2' })),
  asHO,
  q('active memberships for C_DIRECT in G', `SELECT id, removed_at FROM public.child_group_memberships WHERE child_id = '${C_DIRECT}' AND group_id = '${G}' AND removed_at IS NULL ORDER BY id`),
].join('\n'));
add('L5.HO_seeded_handover_vs_phone', 'HO itself moves C_DIRECT from GV_G1 to GV_G2 (insert first, then end) as a seed script might', [
  asHO,
  step('HO inserts new membership in GV_G2 first', `INSERT INTO public.child_group_memberships (id, child_id, group_id, grouping_version_id, created_by) VALUES ('${id('9b000000', 30)}', '${C_DIRECT}', '${GV_G2}', '${GV}', '${HO}') RETURNING id`),
].join('\n'));

// ===== L6 Destructive deletes ================================================================
add('L6.fk_inventory', 'Every FK whose parent is auth.users/public.users/children/classes/groups (+ sessions/assessments/battery_runs chains), with ON DELETE action', [
  q('fk inventory', `
    SELECT c.confrelid::regclass::text AS parent, c.conrelid::regclass::text AS child_table,
      (SELECT string_agg(a.attname, ',') FROM unnest(c.conkey) k JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k) AS fk_columns,
      CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete,
      c.conname
    FROM pg_catalog.pg_constraint c
    WHERE c.contype = 'f' AND c.confrelid IN ('auth.users'::regclass, 'public.users'::regclass, 'public.children'::regclass,
      'public.classes'::regclass, 'public.groups'::regclass, 'public.sessions'::regclass, 'public.assessments'::regclass,
      'public.battery_runs'::regclass, 'public.grouping_versions'::regclass)
    ORDER BY 1, 2, 3`),
  q('authenticated DELETE grants', `SELECT table_name FROM information_schema.role_table_grants WHERE grantee = 'authenticated' AND table_schema = 'public' AND privilege_type = 'DELETE' ORDER BY 1`),
  q('DELETE policies', `SELECT tablename, policyname, qual FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND cmd IN ('DELETE', 'ALL') ORDER BY 1, 2`),
].join('\n'));

const doomedHistorySql = (withMastery) => `
INSERT INTO public.children (id, first_name, last_name, created_by) VALUES ('${id('5d000000', 1)}', 'Doomed', 'Child', '${EA_DOOMED}');
INSERT INTO public.child_ea_assignments (id, user_id, child_id, created_by) VALUES ('${childEaAssignmentId(EA_DOOMED, id('5d000000', 1))}', '${EA_DOOMED}', '${id('5d000000', 1)}', '${EA_DOOMED}');
INSERT INTO public.child_ea_assignments (id, user_id, child_id, created_by) VALUES ('${childEaAssignmentId(EA_DOOMED, C_DIRECT)}', '${EA_DOOMED}', '${C_DIRECT}', '${HO}');
INSERT INTO public.class_ea_assignments (id, class_id, ea_user_id, programme_id, created_by) VALUES ('${classEaAssignmentId(K, EA_DOOMED, LITERACY_ID)}', '${K}', '${EA_DOOMED}', ${LITERACY}, '${HO}');
INSERT INTO public.group_ea_assignments (id, group_id, ea_user_id, programme_id, created_by, unassigned_at) VALUES ('${id('8d000000', 1)}', '${G}', '${EA_DOOMED}', ${LITERACY}, '${HO}', now());
INSERT INTO public.sessions (id, user_id, programme_id, class_id, group_id, session_date) VALUES ('${id('86d00000', 1)}', '${EA_DOOMED}', ${LITERACY}, '${K}', '${G}', DATE '2026-10-20');
INSERT INTO public.session_attendees (id, session_id, child_id, group_id) VALUES ('${id('96d00000', 1)}', '${id('86d00000', 1)}', '${C_DIRECT}', '${G}');
INSERT INTO public.assessments (id, user_id, child_id, programme_id, assessment_type, assessment_date) VALUES ('${id('a6d00000', 1)}', '${EA_DOOMED}', '${C_DIRECT}', ${LITERACY}, 'letter_sounds', DATE '2026-10-20');
INSERT INTO public.assessment_items (id, assessment_id, item_key) VALUES ('${id('a7d00000', 1)}', '${id('a6d00000', 1)}', 'a');
INSERT INTO public.time_entries (id, user_id, sign_in_time) VALUES ('${id('7ed00000', 1)}', '${EA_DOOMED}', now() - interval '1 day');
${withMastery ? `INSERT INTO public.letter_mastery (id, child_id, programme_id, letter, language, confirmed, changed_at, correction_id, changed_by) VALUES ('${id('1ad00000', 1)}', '${C_DIRECT}', ${LITERACY}, 'a', 'en', TRUE, now(), '${id('1cd00000', 1)}', '${EA_DOOMED}');` : ''}
`;
const doomedCounts = (label) => q(label, `
  SELECT
    (SELECT count(*) FROM public.users WHERE id = '${EA_DOOMED}') AS public_users,
    (SELECT count(*) FROM public.sessions WHERE user_id = '${EA_DOOMED}') AS sessions,
    (SELECT count(*) FROM public.session_attendees WHERE session_id = '${id('86d00000', 1)}') AS attendees,
    (SELECT count(*) FROM public.assessments WHERE user_id = '${EA_DOOMED}') AS assessments,
    (SELECT count(*) FROM public.assessment_items WHERE assessment_id = '${id('a6d00000', 1)}') AS assessment_items,
    (SELECT count(*) FROM public.letter_mastery WHERE changed_by = '${EA_DOOMED}') AS letter_mastery,
    (SELECT count(*) FROM public.child_ea_assignments WHERE user_id = '${EA_DOOMED}') AS child_ea_assignments,
    (SELECT count(*) FROM public.class_ea_assignments WHERE ea_user_id = '${EA_DOOMED}') AS class_ea_assignments,
    (SELECT count(*) FROM public.group_ea_assignments WHERE ea_user_id = '${EA_DOOMED}') AS group_ea_assignments,
    (SELECT count(*) FROM public.staff_programme_assignments WHERE user_id = '${EA_DOOMED}') AS staff_programme_assignments,
    (SELECT count(*) FROM public.time_entries WHERE user_id = '${EA_DOOMED}') AS time_entries,
    (SELECT count(*) FROM public.children WHERE id = '${id('5d000000', 1)}') AS ea_created_child,
    (SELECT created_by FROM public.children WHERE id = '${id('5d000000', 1)}') AS ea_created_child_created_by`);

add('L6.delete_auth_user_with_letter_mastery', 'Delete auth.users row (auth.admin.deleteUser) for an EA with sessions, attendees, assessments, letter_mastery, assignments, time entries', [
  asHO,
  doomedHistorySql(true),
  doomedCounts('before'),
  step('DELETE auth.users', `DELETE FROM auth.users WHERE id = '${EA_DOOMED}' RETURNING id`),
  doomedCounts('after'),
].join('\n'));
add('L6.delete_auth_user_without_mastery', 'Same EA but no letter_mastery/skill_mastery/battery_runs', [
  asHO,
  doomedHistorySql(false),
  doomedCounts('before'),
  step('DELETE auth.users', `DELETE FROM auth.users WHERE id = '${EA_DOOMED}' RETURNING id`),
  doomedCounts('after'),
].join('\n'));
add('L6.delete_public_users_row_with_mastery', 'Delete only the public.users profile row (e.g. Studio) for an EA that has letter_mastery', [
  asHO,
  doomedHistorySql(true),
  doomedCounts('before'),
  step('DELETE public.users', `DELETE FROM public.users WHERE id = '${EA_DOOMED}' RETURNING id`),
  doomedCounts('after'),
].join('\n'));

const KA_SESSION = id('86a00000', 1);
add('L6.EA_hard_delete_own_class', 'EA_A (authenticated) hard-DELETEs its own class KA that has a class assignment, a group, a child and a session', [
  asHO,
  `INSERT INTO public.class_ea_assignments (id, class_id, ea_user_id, programme_id, created_by) VALUES ('${IDS.CLA_KA}', '${KA}', '${EA_A}', ${LITERACY}, '${EA_A}');`,
  `INSERT INTO public.groups (id, name, programme_id, class_id, created_by) VALUES ('${id('7a000000', 40)}', 'KA group', ${LITERACY}, '${KA}', '${EA_A}');`,
  `INSERT INTO public.sessions (id, user_id, programme_id, class_id, session_date) VALUES ('${KA_SESSION}', '${EA_A}', ${LITERACY}, '${KA}', DATE '2026-10-20');`,
  asEA(EA_A),
  step('EA_A DELETE classes KA', hardDelete('classes', KA)),
  asHO,
  peek('class KA', 'public.classes', KA, ['id']),
  peek('class assignment KA', 'public.class_ea_assignments', IDS.CLA_KA, ['id', 'unassigned_at']),
  peek('group in KA', 'public.groups', id('7a000000', 40), ['class_id']),
  peek('child C_EA (was class KA)', 'public.children', C_EA, ['class_id']),
  peek('session in KA', 'public.sessions', KA_SESSION, ['class_id']),
].join('\n'));
add('L6.EA_hard_delete_HO_class_with_memberships', 'EA_A hard-DELETEs HO class K (EA_A holds an active class assignment; K has child_class_memberships)', [
  asEA(EA_A),
  step('EA_A DELETE classes K', hardDelete('classes', K)),
].join('\n'));
add('L6.EA_hard_delete_HO_class_without_memberships', 'EA_A hard-DELETEs HO class K2 (EA_A assigned; no memberships; one session)', [
  asHO,
  `INSERT INTO public.sessions (id, user_id, programme_id, class_id, session_date) VALUES ('${id('86a00000', 2)}', '${EA_A}', ${LITERACY}, '${K2}', DATE '2026-10-20');`,
  asEA(EA_A),
  step('EA_A DELETE classes K2', hardDelete('classes', K2)),
  asHO,
  peek('class K2', 'public.classes', K2, ['id']),
  peek('EA_A class assignment K2 (held-grant evidence)', 'public.class_ea_assignments', IDS.CLA_K2, ['id']),
  peek('session for K2', 'public.sessions', id('86a00000', 2), ['class_id']),
].join('\n'));
add('L6.EA_hard_delete_rows', 'EA_A hard-DELETE attempts on membership, enrolment, assignment and group rows', [
  asEA(EA_A),
  step('DELETE child_group_memberships C_DIRECT->G', hardDelete('child_group_memberships', CGM_DIRECT_G)),
  step('DELETE child_class_memberships C_DIRECT->K', hardDelete('child_class_memberships', CCM_DIRECT)),
  step('DELETE child_programme_enrollments C_DIRECT', hardDelete('child_programme_enrollments', IDS.CPE_DIRECT)),
  step('DELETE child_class_memberships C_CLASSONLY->K', hardDelete('child_class_memberships', CCM_CLASSONLY)),
  step('DELETE child_ea_assignments (own)', hardDelete('child_ea_assignments', IDS.CEA_FREE)),
  step('DELETE class_ea_assignments (own)', hardDelete('class_ea_assignments', IDS.CLA_K)),
  step('DELETE group_ea_assignments (own)', hardDelete('group_ea_assignments', IDS.GEA_G)),
  step('DELETE groups G', hardDelete('groups', G)),
  asHO,
  peek('CGM_DIRECT_G after', 'public.child_group_memberships', CGM_DIRECT_G, ['id']),
  peek('CCM_DIRECT after', 'public.child_class_memberships', CCM_DIRECT, ['id']),
  peek('CPE_DIRECT after', 'public.child_programme_enrollments', IDS.CPE_DIRECT, ['id']),
].join('\n'));
add('L6.HO_delete_group_with_session', 'HO (superuser) deletes group G that a session references (sessions.group_id ON DELETE SET NULL vs identity trigger)', [
  asHO,
  `INSERT INTO public.sessions (id, user_id, programme_id, group_id, session_date) VALUES ('${id('86a00000', 3)}', '${EA_A}', ${LITERACY}, '${G}', DATE '2026-10-20');`,
  step('HO DELETE groups G', hardDelete('groups', G)),
].join('\n'));
add('L6.HO_delete_child', 'HO (superuser) deletes child C_DIRECT outright (bypassing delete_child_if_no_history)', [
  asHO,
  `INSERT INTO public.sessions (id, user_id, programme_id, session_date) VALUES ('${id('86a00000', 4)}', '${EA_A}', ${LITERACY}, DATE '2026-10-20');`,
  `INSERT INTO public.session_attendees (id, session_id, child_id) VALUES ('${id('96a00000', 4)}', '${id('86a00000', 4)}', '${C_DIRECT}');`,
  step('HO DELETE children C_DIRECT', hardDelete('children', C_DIRECT)),
  peek('attendee after', 'public.session_attendees', id('96a00000', 4), ['id']),
  peek('session after', 'public.sessions', id('86a00000', 4), ['id']),
].join('\n'));

// ===== L7 Re-assign after end with fixed ids =================================================
add('L7.child_ea_reassign_after_end', 'EA_A creates assignment for C_L7 (fixed id f(EA_A,C_L7)), ends it, then re-sends the insert-or-ignore', [
  asEA(EA_A),
  step('insert (insert-or-ignore) first time', insertOrIgnore('child_ea_assignments', { id: IDS.CEA_L7, user_id: EA_A, child_id: C_L7, assigned_at: "TIMESTAMPTZ '2026-10-01 08:00:00+02'", created_by: EA_A })),
  step('archive', archiveUpdate('child_ea_assignments', IDS.CEA_L7, { unassigned_at: "TIMESTAMPTZ '2026-10-15 08:00:00+02'", row_version: '2' })),
  step('re-assign: same fixed id insert-or-ignore (new assigned_at, no unassigned_at)', insertOrIgnore('child_ea_assignments', { id: IDS.CEA_L7, user_id: EA_A, child_id: C_L7, assigned_at: "TIMESTAMPTZ '2026-11-04 08:00:00+02'", created_by: EA_A })),
  step('batched form of the same insert (multi-row VALUES, ignore duplicates)', `INSERT INTO public.child_ea_assignments (id, user_id, child_id, assigned_at, created_by) VALUES ('${IDS.CEA_L7}', '${EA_A}', '${C_L7}', TIMESTAMPTZ '2026-11-04 08:00:00+02', '${EA_A}'), ('${IDS.CEA_CEA2}', '${EA_A}', '${C_EA2}', TIMESTAMPTZ '2026-11-04 08:00:00+02', '${EA_A}') ON CONFLICT (id) DO NOTHING RETURNING id`),
  asHO,
  peek('server row after re-assign', 'public.child_ea_assignments', IDS.CEA_L7, ['assigned_at', 'unassigned_at', 'row_version']),
  q('active assignments EA_A->C_L7', `SELECT id FROM public.child_ea_assignments WHERE user_id = '${EA_A}' AND child_id = '${C_L7}' AND unassigned_at IS NULL`),
  asEA(EA_A),
  step('contrast: a different id for the same pair would be accepted', insertOrIgnore('child_ea_assignments', { id: id('65000000', 77), user_id: EA_A, child_id: C_L7, assigned_at: "TIMESTAMPTZ '2026-11-04 08:00:00+02'", created_by: EA_A })),
].join('\n'));
add('L7.class_ea_reassign_after_end', 'Same for class_ea_assignments fixed id f(KA, EA_A, literacy)', [
  asEA(EA_A),
  step('insert class_ea KA', insertOrIgnore('class_ea_assignments', { id: IDS.CLA_KA, class_id: KA, ea_user_id: EA_A, programme_id: LITERACY, assigned_at: "TIMESTAMPTZ '2026-10-01 08:00:00+02'", created_by: EA_A })),
  step('archive', archiveUpdate('class_ea_assignments', IDS.CLA_KA, { unassigned_at: "TIMESTAMPTZ '2026-10-15 08:00:00+02'", handover_reason: null, row_version: '2' })),
  step('re-assign insert-or-ignore same id', insertOrIgnore('class_ea_assignments', { id: IDS.CLA_KA, class_id: KA, ea_user_id: EA_A, programme_id: LITERACY, assigned_at: "TIMESTAMPTZ '2026-11-04 08:00:00+02'", created_by: EA_A })),
  asHO,
  peek('server row', 'public.class_ea_assignments', IDS.CLA_KA, ['assigned_at', 'unassigned_at', 'row_version']),
].join('\n'));
add('L7.HO_ended_then_phone_resends_insert', 'HO ended EA_A direct assignment to C_EA (EA-created child); phone later re-sends its (lost-ack) insert for the same pair', [
  asHO,
  step('HO ends', archiveUpdate('child_ea_assignments', IDS.CEA_CEA, { unassigned_at: "TIMESTAMPTZ '2026-11-03 09:00:00+02'" })),
  asEA(EA_A),
  step('phone insert-or-ignore replay', insertOrIgnore('child_ea_assignments', { id: IDS.CEA_CEA, user_id: EA_A, child_id: C_EA, assigned_at: "TIMESTAMPTZ '2026-02-01 08:00:00+02'", created_by: EA_A })),
  asHO,
  peek('server row', 'public.child_ea_assignments', IDS.CEA_CEA, ['unassigned_at']),
].join('\n'));

return { IDS, fixtureSql, helperSql, scenarios };
};

// ---------------------------------------------------------------------------------------------
const runScenarioFile = (databaseUrl, file, label) => {
  const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-Atq', databaseUrl, '-f', file], {
    encoding: 'utf8', env: buildPsqlEnv(label), timeout: 180_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

const main = async () => {
  const noLoad = process.argv.includes('--no-load');
  const loaded = noLoad ? { databaseUrl: target().databaseUrl, migrations: [] } : loadDatabase();
  const { databaseUrl } = loaded;
  console.log(`loaded ${loaded.migrations.length} canonical migrations from ${path.join(MASI, 'supabase/migrations')} (first ${loaded.migrations[0]}, last ${loaded.migrations.at(-1)})`);
  const pgVersion = spawnSync('psql', ['-X', '-Atq', databaseUrl, '-c', 'SHOW server_version'], { encoding: 'utf8', env: buildPsqlEnv('ver') }).stdout.trim();
  console.log(`server_version ${pgVersion}`);
  // Cross-check the id formula against Masi's installed uuid package (ESM-only, so import()).
  const { v5 } = await import(path.join(MASI, 'node_modules/uuid/dist-node/index.js'));
  const masiId = v5(['child_ea_assignments', EA_A, C_L7].join('\u001f'), MASI_DOMAIN_ID_NAMESPACE);

  const literacyId = spawnSync('psql', ['-X', '-Atq', databaseUrl, '-c', "SELECT id FROM public.programmes WHERE code = 'literacy'"], { encoding: 'utf8', env: buildPsqlEnv('lit') }).stdout.trim();
  const { IDS, fixtureSql, helperSql, scenarios } = build(literacyId);
  if (masiId !== IDS.CEA_L7) throw new Error(`uuid v5 mismatch ${masiId} vs ${IDS.CEA_L7}`);
  const masiEnrollmentId = v5(['child_programme_enrollments', C_DIRECT, literacyId].join('\u001f'), MASI_DOMAIN_ID_NAMESPACE);
  if (masiEnrollmentId !== IDS.CPE_DIRECT) throw new Error('enrolment id mismatch');
  console.log(`literacy programme id=${literacyId}; uuid v5 cross-check vs Masi uuid package OK (${masiId})`);
  const setupFile = path.join(OUT_DIR, 'fixture.sql');
  if (!noLoad) {
    fs.writeFileSync(setupFile, `${helperSql}\n${fixtureSql}`);
    const setup = runScenarioFile(databaseUrl, setupFile, 'fixture');
    if (setup.status !== 0) throw new Error(`fixture failed:\n${setup.stderr}`);
  }

  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
  const results = [];
  const rawLog = [];
  fs.mkdirSync(path.join(OUT_DIR, 'sql'), { recursive: true });
  for (const scenario of scenarios) {
    if (only && !scenario.id.startsWith(only)) continue;
    const file = path.join(OUT_DIR, 'sql', `${scenario.id}.sql`);
    fs.writeFileSync(file, scenario.sql);
    const out = runScenarioFile(databaseUrl, file, scenario.id);
    const lines = out.stdout.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{'));
    const steps = lines.map((l) => JSON.parse(l));
    results.push({ id: scenario.id, title: scenario.title, psql_status: out.status, psql_stderr: out.stderr.trim() || undefined, steps });
    rawLog.push(`### ${scenario.id} — ${scenario.title}\n$ psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -Atq <db> -f sql/${scenario.id}.sql\n${out.stdout}${out.stderr ? `\n[stderr]\n${out.stderr}` : ''}\n`);
  }
  fs.writeFileSync(path.join(OUT_DIR, only ? `results-${only}.json` : 'results.json'), JSON.stringify({ ids: { HO, EA_A, EA_B, EA_DOOMED, K, KA, K2, C_DIRECT, C_CLASSONLY, C_GROUPONLY, C_EA, C_FREE, C_EA2, C_L7, G, GV_G1, GV_G2, GV, M1, M2, ...IDS }, results }, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, only ? `raw-output-${only}.log` : 'raw-output.log'), rawLog.join('\n'));
  for (const r of results) {
    console.log(`\n== ${r.id}: ${r.title}${r.psql_status !== 0 ? `  [psql exit ${r.psql_status}] ${r.psql_stderr}` : ''}`);
    for (const s of r.steps) {
      if ('ok' in s) {
        console.log(`  - ${s.step} [${s.as.role}${s.as.jwt_sub ? ` ${s.as.jwt_sub.slice(-2)}` : ''}]: ${s.ok ? `OK rows=${s.rows_affected}` : `ERR ${s.sqlstate} ${s.message}${s.constraint ? ` (constraint ${s.constraint})` : ''}${s.detail ? ` | ${s.detail}` : ''}`}`);
      } else if ('row' in s) {
        console.log(`  * ${s.step}: ${JSON.stringify(s.row)}`);
      } else {
        console.log(`  * ${s.step}: ${JSON.stringify(s.result)}`);
      }
    }
  }
};

main().catch((error) => { console.error(error); process.exit(1); });
