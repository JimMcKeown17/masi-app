#!/usr/bin/env node

// Lifecycle compatibility gate (plan docs/superpowers/plans/2026-11-04-lifecycle-safety.md, T1).
//
// Two questions, answered against real PostgreSQL with every canonical migration:
//   1. Target behaviour: removing children, classes and groups never strands recorded work.
//      History lands when the EA held the child and programme on the work's SAST day, ends stay
//      where they were put, archive conflicts are decided by the server, and nothing holding
//      history can be hard-deleted.
//   2. Absorb, don't refuse: every request shape the installed 1.5.0 client (f002e08) sends gets
//      the same or a better outcome than on the server that shipped with it. "Better" is judged by
//      that client's own classifier and acknowledgement rules, frozen in
//      scripts/fixtures/lifecycle-compat/dispositions-1.5.0.json (never by the current src/).
//
// Each case runs twice, in a rolled-back transaction, against two databases: the baseline (every
// migration up to BASELINE_LAST_MIGRATION, the server 1.5.0 shipped against) and the current tree.
// Target expectations are checked on the current database; the compatibility rule compares the
// two. Never loads dotenv, never invokes the Supabase CLI, localhost-only (see
// assertDisposableAdminTarget).
//
// Run (Node 20):
//   PGTZ=UTC \
//   HISTORY_RLS_ADMIN_DATABASE_URL=postgres://postgres:<password>@127.0.0.1:<port>/postgres \
//   HISTORY_RLS_DATABASE_NAME=masi_history_rls_lifecycle \
//   HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE \
//   npm run verify:lifecycle-compat:postgres

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const {
  MIGRATIONS_DIR,
  assertDisposableAdminTarget,
  bootstrapSql,
  buildDatabaseUrl,
  buildPsqlEnv,
  runPsql,
} = require('./history-authorization-postgres-harness.cjs');

process.env.PGTZ = 'UTC';

// The last migration the 1.5.0 pilot builds shipped against. The compatibility rule compares
// every 1.5.0 request shape on the current tree with this server.
const BASELINE_LAST_MIGRATION = '20261104132732_masi_reporting_v2.sql';
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'lifecycle-compat');
const DISPOSITIONS = JSON.parse(
  fs.readFileSync(path.join(FIXTURE_DIR, 'dispositions-1.5.0.json'), 'utf8'),
);
const WIRE_DIR = path.join(FIXTURE_DIR, 'wire');
const WIRE_FILES = ['wire-C1.json', 'wire-C2.json', 'wire-C3a.json', 'wire-C3b.json', 'wire-C3c.json', 'wire-C5b.json'];

const quoteIdentifier = (identifier) => `"${identifier.replaceAll('"', '""')}"`;

// ------------------------------------------------------------------------------------ fixture
const uid = (prefix, n) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = 'a111879f-d066-47c9-95a1-bed2a400319a';
const LIT = "(SELECT id FROM public.programmes WHERE code = 'literacy')";
const NUM = "(SELECT id FROM public.programmes WHERE code = 'numeracy')";
const YEAR = '(SELECT id FROM public.academic_years WHERE is_active)';

const HO = uid('f1', 1);
const EA_A = uid('f1', 2);
const EA_B = uid('f1', 3);
const EA_C = uid('f1', 4);
const EA_DOOMED = uid('f1', 5);
const EA_UNUSED = uid('f1', 6);
const SCHOOL = uid('f2', 1);
const SPA_A = uid('f3', 1);
const SPA_A_NUM = uid('f3', 9);
const K = uid('f4', 1); // Head Office class; EA_A holds it
const KA = uid('f4', 2); // EA_A-created class; EA_A holds it
const KX = uid('f4', 3); // race: Head Office class, nobody holds it yet
const KY = uid('f4', 4); // race: EA_A-created class, EA_A its only holder
const C = uid('f5', 1); // EA_A direct + class K + group G + literacy enrolment
const D = uid('f5', 2); // group-only through G
const E = uid('f5', 3); // class-only through K
const H = uid('f5', 4); // Head Office child, EA_A direct only
const N = uid('f5', 5); // Head Office child EA_A never held
const F = uid('f5', 6); // EA_A-created child in KA
const X = uid('f5', 7); // race: EA_A direct + class KX
const Z = uid('f5', 8); // race: EA_A direct + group GZ
const CA_C = uid('f6', 1);
const CA_H = uid('f6', 2);
const CA_F = uid('f6', 3);
const CA_X = uid('f6', 4);
const CA_Z = uid('f6', 5);
const CPE_C = uid('f7', 1);
const CPE_D = uid('f7', 2);
const CPE_E = uid('f7', 3);
const CPE_H = uid('f7', 4);
const CPE_F = uid('f7', 5);
const CPE_X = uid('f7', 6);
const CPE_Z = uid('f7', 7);
const CCM_C = uid('f8', 1);
const CCM_E = uid('f8', 2);
const CCM_F = uid('f8', 3);
const CCM_X = uid('f8', 4);
const CEA_K = uid('f9', 1);
const CEA_KA = uid('f9', 2);
const CEA_KY = uid('f9', 3);
const G = uid('fa', 1); // Head Office group in K; EA_A holds it
const GZ = uid('fa', 2); // race: Head Office group; EA_A holds it
const GEA_G = uid('fb', 1);
const GEA_GZ = uid('fb', 2);
const CGM_C = uid('fc', 1);
const CGM_D = uid('fc', 2);
const CGM_Z = uid('fc', 3);

const GRANT_START = '2026-09-01T07:00:00+02:00';
const WORK_DAY = '2026-10-28';
const WORK_AT = '2026-10-28T09:00:00+02:00';
const WORK_END = '2026-10-28T09:40:00+02:00';
const ARCHIVE_AT = '2026-11-02T10:00:00+02:00'; // the phone's archive time
const HO_END = '2026-11-03T09:00:00+02:00'; // Head Office's end

const fixtureSql = `
INSERT INTO auth.users (id) VALUES ('${HO}'), ('${EA_A}'), ('${EA_B}'), ('${EA_C}'), ('${EA_DOOMED}'), ('${EA_UNUSED}');
INSERT INTO public.schools (id, name) VALUES ('${SCHOOL}', 'Lifecycle compat school');
INSERT INTO public.users (id, first_name, last_name, school_id, organization_id) VALUES
  ('${HO}', 'Head', 'Office', '${SCHOOL}', '${ORG}'),
  ('${EA_A}', 'EA', 'A', '${SCHOOL}', '${ORG}'),
  ('${EA_B}', 'EA', 'B', '${SCHOOL}', '${ORG}'),
  ('${EA_C}', 'EA', 'C', '${SCHOOL}', '${ORG}'),
  ('${EA_DOOMED}', 'EA', 'Doomed', '${SCHOOL}', '${ORG}'),
  ('${EA_UNUSED}', 'EA', 'Unused', '${SCHOOL}', '${ORG}');
INSERT INTO public.staff_programme_assignments (id, user_id, programme_id, school_id, assigned_at, created_by) VALUES
  ('${SPA_A}', '${EA_A}', ${LIT}, '${SCHOOL}', '${GRANT_START}', '${HO}'),
  ('${uid('f3', 2)}', '${EA_B}', ${LIT}, '${SCHOOL}', '${GRANT_START}', '${HO}'),
  ('${uid('f3', 3)}', '${EA_C}', ${LIT}, '${SCHOOL}', '${GRANT_START}', '${HO}'),
  ('${uid('f3', 4)}', '${EA_DOOMED}', ${LIT}, '${SCHOOL}', '${GRANT_START}', '${HO}');
INSERT INTO public.classes (id, school_id, name, grade, academic_year_id, created_by) VALUES
  ('${K}', '${SCHOOL}', 'Head Office class K', '1', ${YEAR}, '${HO}'),
  ('${KA}', '${SCHOOL}', 'EA A class KA', '1', ${YEAR}, '${EA_A}'),
  ('${KX}', '${SCHOOL}', 'Race class KX', '2', ${YEAR}, '${HO}'),
  ('${KY}', '${SCHOOL}', 'Race class KY', '2', ${YEAR}, '${EA_A}');
INSERT INTO public.children (id, first_name, last_name, class_id, created_by) VALUES
  ('${C}', 'Child', 'C', '${K}', '${HO}'),
  ('${D}', 'Child', 'D', NULL, '${HO}'),
  ('${E}', 'Child', 'E', '${K}', '${HO}'),
  ('${H}', 'Child', 'H', NULL, '${HO}'),
  ('${N}', 'Child', 'N', NULL, '${HO}'),
  ('${F}', 'Child', 'F', '${KA}', '${EA_A}'),
  ('${X}', 'Child', 'X', '${KX}', '${HO}'),
  ('${Z}', 'Child', 'Z', NULL, '${HO}');
INSERT INTO public.child_ea_assignments (id, user_id, child_id, assigned_at, created_by) VALUES
  ('${CA_C}', '${EA_A}', '${C}', '${GRANT_START}', '${HO}'),
  ('${CA_H}', '${EA_A}', '${H}', '${GRANT_START}', '${HO}'),
  ('${CA_F}', '${EA_A}', '${F}', '${GRANT_START}', '${EA_A}'),
  ('${CA_X}', '${EA_A}', '${X}', '${GRANT_START}', '${HO}'),
  ('${CA_Z}', '${EA_A}', '${Z}', '${GRANT_START}', '${HO}');
INSERT INTO public.child_programme_enrollments (id, child_id, programme_id, enrolled_at, created_by) VALUES
  ('${CPE_C}', '${C}', ${LIT}, '${GRANT_START}', '${HO}'),
  ('${CPE_D}', '${D}', ${LIT}, '${GRANT_START}', '${HO}'),
  ('${CPE_E}', '${E}', ${LIT}, '${GRANT_START}', '${HO}'),
  ('${CPE_H}', '${H}', ${LIT}, '${GRANT_START}', '${HO}'),
  ('${CPE_F}', '${F}', ${LIT}, '${GRANT_START}', '${EA_A}'),
  ('${CPE_X}', '${X}', ${LIT}, '${GRANT_START}', '${HO}'),
  ('${CPE_Z}', '${Z}', ${LIT}, '${GRANT_START}', '${HO}');
INSERT INTO public.class_ea_assignments (id, class_id, ea_user_id, programme_id, assigned_at, created_by) VALUES
  ('${CEA_K}', '${K}', '${EA_A}', ${LIT}, '${GRANT_START}', '${HO}'),
  ('${CEA_KA}', '${KA}', '${EA_A}', ${LIT}, '${GRANT_START}', '${EA_A}'),
  ('${CEA_KY}', '${KY}', '${EA_A}', ${LIT}, '${GRANT_START}', '${EA_A}');
INSERT INTO public.child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at, created_by) VALUES
  ('${CCM_C}', '${C}', '${K}', ${YEAR}, '${GRANT_START}', '${HO}'),
  ('${CCM_E}', '${E}', '${K}', ${YEAR}, '${GRANT_START}', '${HO}'),
  ('${CCM_F}', '${F}', '${KA}', ${YEAR}, '${GRANT_START}', '${EA_A}'),
  ('${CCM_X}', '${X}', '${KX}', ${YEAR}, '${GRANT_START}', '${HO}');
INSERT INTO public.groups (id, name, programme_id, class_id, created_by) VALUES
  ('${G}', 'Group G', ${LIT}, '${K}', '${HO}'),
  ('${GZ}', 'Race group GZ', ${LIT}, NULL, '${HO}');
INSERT INTO public.group_ea_assignments (id, group_id, ea_user_id, programme_id, assigned_at, created_by) VALUES
  ('${GEA_G}', '${G}', '${EA_A}', ${LIT}, '${GRANT_START}', '${HO}'),
  ('${GEA_GZ}', '${GZ}', '${EA_A}', ${LIT}, '${GRANT_START}', '${HO}');
INSERT INTO public.child_group_memberships (id, child_id, group_id, joined_at, created_by) VALUES
  ('${CGM_C}', '${C}', '${G}', '${GRANT_START}', '${HO}'),
  ('${CGM_D}', '${D}', '${G}', '${GRANT_START}', '${HO}'),
  ('${CGM_Z}', '${Z}', '${GZ}', '${GRANT_START}', '${HO}');
`;

// Harness-only helpers. step() runs one client request as the CURRENT role in its own
// subtransaction (a refused request rolls back only itself, like a separate HTTP request) and
// reports what the client sees: the returned rows or the SQLSTATE. check() reads as postgres.
const helperSql = `
CREATE SCHEMA harness;
CREATE FUNCTION harness.step(p_label text, p_sql text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER AS $fn$
DECLARE v_count bigint; v_rows jsonb; v_state text; v_msg text;
BEGIN
  BEGIN
    EXECUTE 'WITH pgrst_source AS (' || p_sql || ') SELECT pg_catalog.count(*), '
      || 'coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(pgrst_source)), ''[]''::jsonb) FROM pgrst_source'
      INTO v_count, v_rows;
    RETURN pg_catalog.jsonb_build_object('label', p_label, 'ok', true, 'rows', v_count, 'returned', v_rows)::text;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    RETURN pg_catalog.jsonb_build_object('label', p_label, 'ok', false, 'sqlstate', v_state, 'message', v_msg)::text;
  END;
END $fn$;
CREATE FUNCTION harness.check(p_label text, p_sql text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER AS $fn$
DECLARE v_rows jsonb;
BEGIN
  EXECUTE 'SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)), ''[]''::jsonb) FROM (' || p_sql || ') r'
    INTO v_rows;
  RETURN pg_catalog.jsonb_build_object('label', p_label, 'check', true, 'returned', v_rows)::text;
END $fn$;
GRANT USAGE ON SCHEMA harness TO authenticated;
GRANT EXECUTE ON FUNCTION harness.step(text, text) TO authenticated;
`;

// Hosted Supabase grants ALL on new public objects to the API roles; model it so a migration
// that forgets to revoke is caught by the catalog assertions.
const hostedDefaultPrivilegesSql = `
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
`;

// --------------------------------------------------------------------- PostgREST translations
const STEP_TAG = '$step$';
const sqlLiteral = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object' && value.sql) return value.sql;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') return `'${JSON.stringify(value).replaceAll("'", "''")}'`;
  return `'${String(value).replaceAll("'", "''")}'`;
};
const sqlNow = (offset = '') => ({ sql: offset ? `(pg_catalog.now() + interval '${offset}')` : 'pg_catalog.now()' });
const jsonLiteral = (value) => {
  const text = JSON.stringify(value);
  assert.ok(!text.includes('$j$'));
  return `$j$${text}$j$`;
};

// supabase-js .update(patch).eq('id', id).select('id'): UPDATE ... RETURNING id. 1.5.0 needs
// exactly one returned id (ARCHIVE_/RESTORE_/UPDATE_NOT_APPLIED otherwise).
const patchRequest = (kind, table, id, patch) => ({
  kind,
  table,
  recordId: id,
  sql: `UPDATE public.${table} SET ${Object.entries(patch).map(([column, value]) => `${quoteIdentifier(column)} = ${sqlLiteral(value)}`).join(', ')} WHERE id = '${id}' RETURNING id`,
});
const archive = (table, id, patch) => patchRequest('archive', table, id, patch);
const restore = (table, id, patch) => patchRequest('restore', table, id, patch);
const edit = (table, id, patch) => patchRequest('update', table, id, patch);

// supabase-js .upsert(rows, { onConflict: 'id', ignoreDuplicates }) with no select: PostgREST
// INSERT ... ON CONFLICT (id) DO NOTHING (assignments, sessions) or DO UPDATE SET <payload>.
const upsert = (table, rowOrRows, { ignoreDuplicates = false } = {}) => {
  const list = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
  const columns = [...new Set(list.flatMap((row) => Object.keys(row)))];
  const values = list.map((row) => `(${columns.map((column) => (
    Object.prototype.hasOwnProperty.call(row, column) ? sqlLiteral(row[column]) : 'DEFAULT'
  )).join(', ')})`);
  const conflict = ignoreDuplicates
    ? 'DO NOTHING'
    : `DO UPDATE SET ${columns.filter((c) => c !== 'id').map((c) => `${quoteIdentifier(c)} = EXCLUDED.${quoteIdentifier(c)}`).join(', ')}`;
  return {
    kind: 'insert',
    table,
    sql: `INSERT INTO public.${table} (${columns.map(quoteIdentifier).join(', ')}) VALUES ${values.join(', ')} ON CONFLICT (id) ${conflict} RETURNING 1`,
  };
};
const insertOrIgnore = (table, rowOrRows) => upsert(table, rowOrRows, { ignoreDuplicates: true });

// supabase-js .rpc(name, args): PostgREST calls the function with named arguments.
const rpcDeleteChild = (childId) => ({
  kind: 'rpc', rpc: 'delete_child_if_no_history', table: 'children',
  sql: `SELECT public.delete_child_if_no_history(p_child_id := '${childId}'::uuid) AS result`,
});
const rpcSubmit = (family) => ({
  kind: 'rpc', rpc: 'submit_assessment', table: 'assessments',
  sql: `SELECT public.submit_assessment(p_assessment := ${jsonLiteral(family.assessment)}::jsonb, p_items := ${jsonLiteral(family.items)}::jsonb) AS result`,
});
const rpcRun = (run) => ({
  kind: 'rpc', rpc: 'save_battery_run', table: 'battery_runs',
  sql: `SELECT public.save_battery_run(p_run := ${jsonLiteral(run)}::jsonb) AS result`,
});
const rpcLetter = (c) => ({
  kind: 'rpc', rpc: 'set_letter_mastery', table: 'letter_mastery',
  sql: `SELECT * FROM public.set_letter_mastery(p_correction_id := '${c.correction_id}'::uuid, p_child_id := '${c.child_id}'::uuid, p_letter := '${c.letter}', p_language := '${c.language}', p_confirmed := ${c.confirmed}, p_changed_at := '${c.changed_at}'::timestamptz)`,
});
// Numeracy ticks have no 1.5.0 producer (f002e08 predates skill_mastery); judged on the
// "no new SQLSTATE" rule and their target only.
const rpcSkill = (c) => ({
  kind: 'rpc', rpc: 'set_skill_mastery', table: 'skill_mastery', noProducer: true,
  sql: `SELECT * FROM public.set_skill_mastery(p_correction_id := '${c.correction_id}'::uuid, p_child_id := '${c.child_id}'::uuid, p_step_key := '${c.step_key}', p_confirmed := ${c.confirmed}, p_changed_at := '${c.changed_at}'::timestamptz)`,
});
// No 1.5.0 producer sends a DELETE (children use the RPC); a raw token could.
const rawDelete = (table, id) => ({
  kind: 'delete', table, recordId: id, noProducer: true,
  sql: `DELETE FROM public.${table} WHERE id = '${id}' RETURNING id`,
});
const readAs = (sql) => ({ kind: 'read', noProducer: true, sql });

// ---------------------------------------------------------------------------- payloads
const sessionPayload = ({ id, group = G, cls = K, programme = LIT, date = WORK_DAY, at = WORK_AT, end = WORK_END }) => ({
  id, user_id: EA_A, programme_id: { sql: programme }, class_id: cls, group_id: group,
  session_date: date, started_at: at, ended_at: end, activities: {}, notes: '',
  created_at: at, updated_at: end,
});
const attendeePayload = ({ id, session, child, group = G }) => ({
  id, session_id: session, child_id: child, group_id: group, attendance_status: 'present',
  created_at: WORK_AT, updated_at: WORK_END,
});
const runPayload = ({ id, child, cls = K, programme, at = WORK_AT, end = WORK_END }) => ({
  id, user_id: EA_A, child_id: child, programme_id: programme, class_id: cls,
  battery_code: 'wela_plus_full', battery_version: '2024.1', assessment_purpose: 'progress_check',
  assessment_window_id: null, language: 'en', started_at: at, completed_at: end,
  status: 'completed', notes: null, created_at: at,
});
const familyPayload = ({ id, itemBase, child, programme, date = WORK_DAY }) => ({
  assessment: {
    id, user_id: EA_A, child_id: child, programme_id: programme, battery_run_id: null,
    question_code: 'letter_sounds', question_version: '2026.1', item_set_id: 'letter_sounds@2026.1.en',
    language: 'en', stopped_reason: 'completed', duration_ms: 1200,
    derived: { total_correct: 2, total_attempted: 3, capture_mode: 'sequential' },
    assessment_type: 'letter_sounds', score: 2, total_items: 3, capture_mode: 'sequential',
    assessment_purpose: 'progress_check', assessment_window_id: null, assessment_date: date,
    created_at: WORK_AT, updated_at: WORK_END,
  },
  items: [0, 1, 2].map((position) => ({
    id: itemBase(position), assessment_id: id, position,
    item_key: ['a', 'b', 'c'][position], prompt: ['a', 'b', 'c'][position],
    is_correct: position !== 1, metadata: { row: 0, reached: true },
    created_at: WORK_AT, updated_at: WORK_END,
  })),
});
const letterPayload = ({ id, child, at = WORK_AT }) => ({
  correction_id: id, child_id: child, letter: 'k', language: 'xh', confirmed: true, changed_at: at,
});
const skillPayload = ({ id, child, at = WORK_AT }) => ({
  correction_id: id, child_id: child, step_key: 'counting.1', confirmed: true, changed_at: at,
});

// ---------------------------------------------------------------------------- case DSL
const asHO = (label, sql, expect) => ({ actor: 'HO', label, req: { kind: 'ho', sql }, expect });
// Head Office setup made of several single statements (each needs RETURNING for the wrapper).
const hoSeed = (label, statements) => statements.map((sql, i) => asHO(`${label} #${i + 1}`, sql, OK));
const asEA = (actor, label, req, expect) => ({ actor, label, req, expect });
const check = (label, sql, expect) => ({ check: true, label, sql, expect });
const rows = (n) => ({ rows: n });
const value = (v) => ({ value: v });
const outcome = (o) => ({ outcome: o });
const sqlstate = (s) => ({ sqlstate: s });
const OK = { ok: true };

// One bundle of history ids per case number (n < 256).
const bundle = (n) => ({
  groupSession: uid('e1', n * 16 + 1),
  classSession: uid('e1', n * 16 + 2),
  attendee: (child, which = 'group') => uid('e2', n * 64 + (which === 'class' ? 32 : 0) + Number(child.slice(-2))),
  run: (child) => uid('e3', n * 16 + Number(child.slice(-2))),
  assessment: (child) => uid('e4', n * 16 + Number(child.slice(-2))),
  item: (child) => (position) => uid('e5', (n * 16 + Number(child.slice(-2))) * 4 + position),
  letter: (child) => uid('e6', n * 16 + Number(child.slice(-2))),
  skill: (child) => uid('e7', n * 16 + Number(child.slice(-2))),
});

// The history one offline lesson day produces, in 1.5.0 push order (sessions 12, attendees 13,
// runs 14, assessments 15, letter ticks 16); numeracy ticks (17) have no 1.5.0 producer.
const historySteps = (b, child, programmeId, {
  session = 'group', withSession = true, items = ['run', 'assessment', 'letter', 'skill'], expect = {}, tag = '',
} = {}) => {
  const sessionId = session === 'group' ? b.groupSession : b.classSession;
  const group = session === 'group' ? G : null;
  const steps = [];
  if (withSession) {
    steps.push(asEA(EA_A, `session.${session}${tag}`, insertOrIgnore('sessions', sessionPayload({ id: sessionId, group })), expect.session ?? rows(1)));
  }
  steps.push(asEA(EA_A, `attendee.${session}.${child}${tag}`, upsert('session_attendees', attendeePayload({ id: b.attendee(child, session), session: sessionId, child, group })), expect.attendee ?? rows(1)));
  if (items.includes('run')) {
    const cls = child === D ? null : K;
    steps.push(asEA(EA_A, `run.${child}${tag}`, rpcRun(runPayload({ id: b.run(child), child, cls, programme: programmeId })), expect.run ?? value('inserted')));
  }
  if (items.includes('assessment')) {
    steps.push(asEA(EA_A, `assessment.${child}${tag}`, rpcSubmit(familyPayload({ id: b.assessment(child), itemBase: b.item(child), child, programme: programmeId })), expect.assessment ?? value('inserted')));
  }
  if (items.includes('letter')) {
    steps.push(asEA(EA_A, `letter.${child}${tag}`, rpcLetter(letterPayload({ id: b.letter(child), child })), expect.letter ?? outcome('applied')));
  }
  if (items.includes('skill')) {
    steps.push(asEA(EA_A, `skill.${child}${tag}`, rpcSkill(skillPayload({ id: b.skill(child), child })), expect.skill ?? outcome('applied')));
  }
  return steps;
};

// The archive chain embedded 1.5.0 sends for Delete child (childrenRepository.archiveChild),
// in ARCHIVE_PUSH_ORDER: children 2, enrolment 3, class membership 4, group membership 5,
// direct assignment 7. Each PATCH carries the claimed row_version.
const archiveChildC = (expect = {}) => [
  asEA(EA_A, 'archive.children.C', archive('children', C, { archived_at: ARCHIVE_AT, row_version: 2 }), expect.children ?? rows(1)),
  asEA(EA_A, 'archive.enrolment.C', archive('child_programme_enrollments', CPE_C, { ended_at: ARCHIVE_AT, row_version: 2 }), expect.enrolment ?? rows(1)),
  asEA(EA_A, 'archive.class_membership.C', archive('child_class_memberships', CCM_C, { exited_at: ARCHIVE_AT, row_version: 2 }), expect.classMembership ?? rows(1)),
  asEA(EA_A, 'archive.group_membership.C', archive('child_group_memberships', CGM_C, { removed_at: ARCHIVE_AT, row_version: 2 }), expect.groupMembership ?? rows(1)),
  asEA(EA_A, 'archive.direct_assignment.C', archive('child_ea_assignments', CA_C, { unassigned_at: ARCHIVE_AT, row_version: 2 }), expect.direct ?? rows(1)),
];
const hoEndC = () => [
  asHO('ho.end.direct.C', `UPDATE public.child_ea_assignments SET unassigned_at = '${ARCHIVE_AT}' WHERE id = '${CA_C}' RETURNING id`, rows(1)),
  asHO('ho.end.class_membership.C', `UPDATE public.child_class_memberships SET exited_at = '${ARCHIVE_AT}' WHERE id = '${CCM_C}' RETURNING id`, rows(1)),
  asHO('ho.end.group_membership.C', `UPDATE public.child_group_memberships SET removed_at = '${ARCHIVE_AT}' WHERE id = '${CGM_C}' RETURNING id`, rows(1)),
];
const hoProgrammeSwitch = () => [
  asHO('ho.end.literacy_programme', `UPDATE public.staff_programme_assignments SET ended_at = '${ARCHIVE_AT}' WHERE id = '${SPA_A}' RETURNING id`, rows(1)),
  asHO('ho.open.numeracy_programme', `INSERT INTO public.staff_programme_assignments (id, user_id, programme_id, school_id, assigned_at, created_by) VALUES ('${SPA_A_NUM}', '${EA_A}', ${NUM}, '${SCHOOL}', '${ARCHIVE_AT}', '${HO}') RETURNING id`, rows(1)),
];
const hoYearRollover = () => [
  asHO('ho.year.deactivate', 'UPDATE public.academic_years SET is_active = false WHERE is_active RETURNING id', rows(1)),
  asHO('ho.year.activate_next', `INSERT INTO public.academic_years (id, label, starts_on, ends_on, is_active) VALUES ('${uid('fd', 1)}', '2027', '2027-01-15', '2027-12-15', true) RETURNING id`, rows(1)),
];
const programmeOf = (table, id) => `SELECT p.code FROM public.${table} t JOIN public.programmes p ON p.id = t.programme_id WHERE t.${table.includes('mastery') ? 'correction_id' : 'id'} = '${id}'`;
const historyLanded = (b, child, { session = 'group' } = {}) => check(
  `history landed for ${child}`,
  `SELECT
     (SELECT count(*) FROM public.session_attendees WHERE id = '${b.attendee(child, session)}') AS attendee,
     (SELECT count(*) FROM public.letter_mastery WHERE correction_id = '${b.letter(child)}') AS letter,
     (SELECT count(*) FROM public.skill_mastery WHERE correction_id = '${b.skill(child)}') AS skill`,
  [{ attendee: 1, letter: 1, skill: 1 }],
);

// ---------------------------------------------------------------------------- cases
const buildCases = ({ literacyId, numeracyId }) => {
  const cases = [];
  const add = (id, plan, title, steps) => cases.push({ id, plan, title, steps });

  // ===== History lands (MA-BUG-001 .. -005)
  {
    const b = bundle(1);
    add('S0', 'control', 'No lifecycle change: every payload below is valid', [
      ...historySteps(b, C, literacyId),
      ...historySteps(b, D, literacyId, { withSession: false, items: ['assessment', 'letter'], expect: { letter: sqlstate('42501') } }),
      ...historySteps(b, E, literacyId, { session: 'class', items: ['assessment', 'letter'], expect: { letter: sqlstate('42501') } }),
    ]);
  }
  {
    const b = bundle(2);
    add('S1', 'T1 history lands', "The EA's own Delete child (archive chain) uploads before the earlier lesson", [
      ...archiveChildC(),
      ...historySteps(b, C, literacyId),
      ...historySteps(b, C, literacyId, { session: 'class', items: [] }),
      historyLanded(b, C),
      check('child archived by the sole holder', `SELECT archived_at IS NOT NULL AS archived FROM public.children WHERE id = '${C}'`, [{ archived: true }]),
    ]);
  }
  {
    const b = bundle(3);
    add('S1-control', 'control', 'Same work, history uploads before the archive chain', [
      ...historySteps(b, C, literacyId),
      ...historySteps(b, C, literacyId, { session: 'class', items: [] }),
      ...archiveChildC(),
    ]);
  }
  {
    const b = bundle(4);
    add('S1b', 'T1 history lands', 'S1 with the child created by the EA (creator arm)', [
      asHO('ho.creator.C', `UPDATE public.children SET created_by = '${EA_A}' WHERE id = '${C}' RETURNING id`, rows(1)),
      ...archiveChildC(),
      ...historySteps(b, C, literacyId),
      historyLanded(b, C),
    ]);
  }
  {
    const b = bundle(5);
    add('S2', 'T1 history lands', "Head Office ends the child's direct assignment and memberships before the lesson uploads", [
      ...hoEndC(),
      ...historySteps(b, C, literacyId),
      ...historySteps(b, C, literacyId, { session: 'class', items: [] }),
      historyLanded(b, C),
    ]);
  }
  {
    const b = bundle(6);
    const batch = [C, D].map((child) => attendeePayload({ id: b.attendee(child), session: b.groupSession, child }));
    add('S3', 'T1 history lands', 'Group-only child D: the EA archives group G, then the earlier group lesson uploads', [
      asEA(EA_A, 'archive.groups.G', archive('groups', G, { archived_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
      asEA(EA_A, 'archive.group_membership.C', archive('child_group_memberships', CGM_C, { removed_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
      asEA(EA_A, 'archive.group_membership.D', archive('child_group_memberships', CGM_D, { removed_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
      asEA(EA_A, 'archive.group_assignment.G', archive('group_ea_assignments', GEA_G, { unassigned_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
      asEA(EA_A, 'session.group', insertOrIgnore('sessions', sessionPayload({ id: b.groupSession })), rows(1)),
      asEA(EA_A, 'attendees.batch[C,D]', upsert('session_attendees', batch), rows(2)),
      asEA(EA_A, 'attendee.C (single fallback)', upsert('session_attendees', batch[0]), rows(1)),
      asEA(EA_A, 'attendee.D (single fallback)', upsert('session_attendees', batch[1]), rows(1)),
      asEA(EA_A, 'run.D', rpcRun(runPayload({ id: b.run(D), child: D, cls: null, programme: literacyId })), value('inserted')),
      asEA(EA_A, 'assessment.D', rpcSubmit(familyPayload({ id: b.assessment(D), itemBase: b.item(D), child: D, programme: literacyId })), value('inserted')),
      check('group G archived by its only holder', `SELECT archived_at IS NOT NULL AS archived FROM public.groups WHERE id = '${G}'`, [{ archived: true }]),
    ]);
  }
  {
    const b = bundle(7);
    add('S4', 'T1 history lands (D7)', "Programme switch: Head Office ends the EA's literacy programme before the lesson uploads", [
      ...hoProgrammeSwitch(),
      ...historySteps(b, C, literacyId),
      check('ticks stamped with the programme held that day', `SELECT (${programmeOf('letter_mastery_corrections', b.letter(C))}) AS letter, (${programmeOf('skill_mastery_corrections', b.skill(C))}) AS skill, (${programmeOf('sessions', b.groupSession)}) AS session`, [{ letter: 'literacy', skill: 'literacy', session: 'literacy' }]),
    ]);
  }
  {
    const b = bundle(8);
    add('S4b', 'T1 history lands (D7)', 'Programme switch after the session landed: attendee and RPC uploads', [
      asEA(EA_A, 'session.group (before switch)', insertOrIgnore('sessions', sessionPayload({ id: b.groupSession })), rows(1)),
      ...hoProgrammeSwitch(),
      ...historySteps(b, C, literacyId, { withSession: false }),
      check('ticks stamped literacy', `SELECT (${programmeOf('letter_mastery_corrections', b.letter(C))}) AS letter, (${programmeOf('skill_mastery_corrections', b.skill(C))}) AS skill`, [{ letter: 'literacy', skill: 'literacy' }]),
    ]);
  }
  {
    const b = bundle(9);
    const s = sessionPayload({ id: b.groupSession });
    const a = attendeePayload({ id: b.attendee(C), session: b.groupSession, child: C });
    const family = familyPayload({ id: b.assessment(C), itemBase: b.item(C), child: C, programme: literacyId });
    const run = runPayload({ id: b.run(C), child: C, programme: literacyId });
    add('S5', 'T1 history lands', "Lost-response replay after the child's grants end (rows already on the server)", [
      asEA(EA_A, 'first.session', insertOrIgnore('sessions', s), rows(1)),
      asEA(EA_A, 'first.attendee', upsert('session_attendees', a), rows(1)),
      asEA(EA_A, 'first.run', rpcRun(run), value('inserted')),
      asEA(EA_A, 'first.assessment', rpcSubmit(family), value('inserted')),
      asEA(EA_A, 'first.letter', rpcLetter(letterPayload({ id: b.letter(C), child: C })), outcome('applied')),
      asEA(EA_A, 'first.skill', rpcSkill(skillPayload({ id: b.skill(C), child: C })), outcome('applied')),
      ...hoEndC(),
      asEA(EA_A, 'replay.session (insert-or-ignore)', insertOrIgnore('sessions', s), rows(0)),
      asEA(EA_A, 'replay.attendee (merge upsert)', upsert('session_attendees', a), rows(1)),
      asEA(EA_A, 'replay.run', rpcRun(run), value('unchanged')),
      asEA(EA_A, 'replay.assessment', rpcSubmit(family), value('already_present')),
      asEA(EA_A, 'replay.letter', rpcLetter(letterPayload({ id: b.letter(C), child: C })), outcome('applied')),
      asEA(EA_A, 'replay.skill', rpcSkill(skillPayload({ id: b.skill(C), child: C })), outcome('applied')),
    ]);
  }
  {
    const b = bundle(10);
    const s = sessionPayload({ id: b.groupSession });
    const a = attendeePayload({ id: b.attendee(C), session: b.groupSession, child: C });
    const family = familyPayload({ id: b.assessment(C), itemBase: b.item(C), child: C, programme: literacyId });
    add('S5b', 'T1 history lands (D7)', 'Lost-response replay after a programme switch', [
      asEA(EA_A, 'first.session', insertOrIgnore('sessions', s), rows(1)),
      asEA(EA_A, 'first.attendee', upsert('session_attendees', a), rows(1)),
      asEA(EA_A, 'first.assessment', rpcSubmit(family), value('inserted')),
      ...hoProgrammeSwitch(),
      asEA(EA_A, 'replay.session (insert-or-ignore)', insertOrIgnore('sessions', s), rows(0)),
      asEA(EA_A, 'replay.attendee (merge upsert)', upsert('session_attendees', a), rows(1)),
      asEA(EA_A, 'replay.assessment', rpcSubmit(family), value('already_present')),
    ]);
  }
  {
    const b = bundle(11);
    add('S6a', 'control', 'Academic-year rollover while the EA still holds the child', [
      ...hoYearRollover(),
      ...historySteps(b, C, literacyId),
    ]);
  }
  {
    const b = bundle(12);
    add('S6b', 'T1 history lands (D2)', "Academic-year rollover after the child's grants ended", [
      ...hoEndC(),
      ...hoYearRollover(),
      ...historySteps(b, C, literacyId),
      historyLanded(b, C),
    ]);
  }
  {
    const b = bundle(13);
    const batch = [C, E].map((child) => attendeePayload({ id: b.attendee(child, 'class'), session: b.classSession, child, group: null }));
    add('S7', 'T1 history lands', 'Class-only child E: the EA deletes the shared Head Office class K, then the earlier lesson uploads', [
      asEA(EA_A, 'archive.classes.K', archive('classes', K, { archived_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
      asEA(EA_A, 'edit.children.C.class_id_null', edit('children', C, { first_name: 'Child', last_name: 'C', class_id: null, updated_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
      asEA(EA_A, 'archive.class_membership.C', archive('child_class_memberships', CCM_C, { exited_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
      asEA(EA_A, 'archive.class_assignment.K', archive('class_ea_assignments', CEA_K, { unassigned_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
      asEA(EA_A, 'session.class', insertOrIgnore('sessions', sessionPayload({ id: b.classSession, group: null })), rows(1)),
      asEA(EA_A, 'attendees.batch[C,E]', upsert('session_attendees', batch), rows(2)),
      asEA(EA_A, 'attendee.C (single fallback)', upsert('session_attendees', batch[0]), rows(1)),
      asEA(EA_A, 'attendee.E (single fallback)', upsert('session_attendees', batch[1]), rows(1)),
      asEA(EA_A, 'run.E', rpcRun(runPayload({ id: b.run(E), child: E, programme: literacyId })), value('inserted')),
      asEA(EA_A, 'assessment.E', rpcSubmit(familyPayload({ id: b.assessment(E), itemBase: b.item(E), child: E, programme: literacyId })), value('inserted')),
      asEA(EA_A, 'letter.E (class-only: no direct delivery)', rpcLetter(letterPayload({ id: b.letter(E), child: E })), sqlstate('42501')),
      check('Head Office class K is not archived by an EA (D4)', `SELECT archived_at IS NULL AS live FROM public.classes WHERE id = '${K}'`, [{ live: true }]),
    ]);
  }
  {
    // Review round 1: a fast phone clock under an OPEN programme assignment must keep landing.
    const b = bundle(14);
    const future = { sql: "((pg_catalog.now() AT TIME ZONE 'Africa/Johannesburg')::date + 2)" };
    const futureAt = sqlNow('2 days');
    const s = { ...sessionPayload({ id: b.groupSession, at: futureAt, end: futureAt }), session_date: future };
    const family = familyPayload({ id: b.assessment(C), itemBase: b.item(C), child: C, programme: literacyId });
    family.assessment.assessment_date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const runAt = new Date(Date.now() + 2 * 86400000).toISOString();
    add('F1', 'T1 compat (review round 1)', "Fast phone clock: session, attendee, run and assessment dated in the phone's future, open programme", [
      asEA(EA_A, 'first.session (future)', insertOrIgnore('sessions', s), rows(1)),
      asEA(EA_A, 'replay.session (future)', insertOrIgnore('sessions', s), rows(0)),
      asEA(EA_A, 'attendee (future session)', upsert('session_attendees', attendeePayload({ id: b.attendee(C), session: b.groupSession, child: C })), rows(1)),
      asEA(EA_A, 'run (future started_at)', rpcRun(runPayload({ id: b.run(C), child: C, programme: literacyId, at: runAt, end: runAt })), value('inserted')),
      asEA(EA_A, 'assessment (future date)', rpcSubmit(family), value('inserted')),
    ]);
  }

  // ===== Ends stay put (MA-BUG-006, -007)
  const hoEnd = (label, table, id, column, extra = '') => asHO(label, `UPDATE public.${table} SET ${column} = '${HO_END}'${extra} WHERE id = '${id}' RETURNING id`, rows(1));
  const endIs = (table, id, column, at) => check(`${table}.${column} unchanged`, `SELECT ${column} = TIMESTAMPTZ '${at}' AS kept FROM public.${table} WHERE id = '${id}'`, [{ kept: true }]);
  add('L1.class_membership.direct_path', 'T1 ends stay put', 'Head Office exits C from K; the EA (still direct) sends its queued exit', [
    hoEnd('ho.exit', 'child_class_memberships', CCM_C, 'exited_at'),
    asEA(EA_A, 'queued exit', archive('child_class_memberships', CCM_C, { exited_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
    endIs('child_class_memberships', CCM_C, 'exited_at', HO_END),
  ]);
  add('L1.class_membership.class_only_path', 'T1 residual (review finding 2)', 'Head Office exits class-only E; RLS hides the row from the EA, so the queued exit still returns 0 rows', [
    hoEnd('ho.exit', 'child_class_memberships', CCM_E, 'exited_at'),
    asEA(EA_A, 'queued exit (hidden by UPDATE USING)', archive('child_class_memberships', CCM_E, { exited_at: ARCHIVE_AT, row_version: 2 }), rows(0)),
    endIs('child_class_memberships', CCM_E, 'exited_at', HO_END),
  ]);
  add('L1.group_membership.direct_path', 'T1 ends stay put', 'Head Office removes C from G; the EA sends its queued removal', [
    hoEnd('ho.remove', 'child_group_memberships', CGM_C, 'removed_at'),
    asEA(EA_A, 'queued removal', archive('child_group_memberships', CGM_C, { removed_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
    endIs('child_group_memberships', CGM_C, 'removed_at', HO_END),
  ]);
  add('L1.group_membership.group_only_path', 'T1 residual (review finding 2)', 'Head Office removes group-only D; RLS hides the row from the EA', [
    hoEnd('ho.remove', 'child_group_memberships', CGM_D, 'removed_at'),
    asEA(EA_A, 'queued removal (hidden by UPDATE USING)', archive('child_group_memberships', CGM_D, { removed_at: ARCHIVE_AT, row_version: 2 }), rows(0)),
    endIs('child_group_memberships', CGM_D, 'removed_at', HO_END),
  ]);
  add('L1.enrollment.direct_path', 'T1 ends stay put', "Head Office ends C's enrolment; the EA sends its queued end", [
    hoEnd('ho.end', 'child_programme_enrollments', CPE_C, 'ended_at'),
    asEA(EA_A, 'queued end', archive('child_programme_enrollments', CPE_C, { ended_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
    endIs('child_programme_enrollments', CPE_C, 'ended_at', HO_END),
  ]);
  add('L1.enrollment.class_only_path', 'T1 ends stay put', "Head Office ends class-only E's enrolment; the EA still reaches it through K", [
    hoEnd('ho.end', 'child_programme_enrollments', CPE_E, 'ended_at'),
    asEA(EA_A, 'queued end', archive('child_programme_enrollments', CPE_E, { ended_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
    endIs('child_programme_enrollments', CPE_E, 'ended_at', HO_END),
  ]);
  add('L1.direct_assignment', 'T1 ends stay put', "Head Office ends the EA's direct assignment; the EA sends its queued end", [
    hoEnd('ho.end', 'child_ea_assignments', CA_C, 'unassigned_at'),
    asEA(EA_A, 'queued end', archive('child_ea_assignments', CA_C, { unassigned_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
    endIs('child_ea_assignments', CA_C, 'unassigned_at', HO_END),
  ]);
  add('L1.group_assignment_ended.membership_removal', 'T1 residual (review finding 2)', "Head Office ends the EA's group assignment; the EA's queued removal is hidden by UPDATE USING", [
    hoEnd('ho.end group', 'group_ea_assignments', GEA_G, 'unassigned_at', ", handover_reason = 'HO handover'"),
    asEA(EA_A, 'queued removal of C from G', archive('child_group_memberships', CGM_C, { removed_at: ARCHIVE_AT, row_version: 2 }), rows(0)),
    check('membership still open', `SELECT removed_at IS NULL AS open FROM public.child_group_memberships WHERE id = '${CGM_C}'`, [{ open: true }]),
  ]);
  add('L1.class_assignment_ended.membership_exit', 'T1 ends stay put + residual', "Head Office ends the EA's class assignment; direct child C exits (first end), class-only E is hidden", [
    hoEnd('ho.end class', 'class_ea_assignments', CEA_K, 'unassigned_at', ", handover_reason = 'HO handover'"),
    asEA(EA_A, 'queued exit C', archive('child_class_memberships', CCM_C, { exited_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
    asEA(EA_A, 'queued exit E (hidden)', archive('child_class_memberships', CCM_E, { exited_at: ARCHIVE_AT, row_version: 2 }), rows(0)),
    endIs('child_class_memberships', CCM_C, 'exited_at', ARCHIVE_AT),
  ]);
  add('L1.composite.archiveChild_after_HO_removed_all_paths', 'T1 residual + ends stay put', 'Head Office removed every EA path to C; the phone archive chain then drains', [
    hoEnd('ho.end direct', 'child_ea_assignments', CA_C, 'unassigned_at'),
    hoEnd('ho.end class', 'class_ea_assignments', CEA_K, 'unassigned_at', ", handover_reason = 'HO handover'"),
    hoEnd('ho.end group', 'group_ea_assignments', GEA_G, 'unassigned_at', ", handover_reason = 'HO handover'"),
    ...archiveChildC({ children: rows(0), enrolment: rows(0), classMembership: rows(0), groupMembership: rows(0), direct: rows(1) }),
    check('child not archived, direct end kept', `SELECT c.archived_at IS NULL AS live, a.unassigned_at = TIMESTAMPTZ '${HO_END}' AS ho_end_kept FROM public.children c, public.child_ea_assignments a WHERE c.id = '${C}' AND a.id = '${CA_C}'`, [{ live: true, ho_end_kept: true }]),
  ]);

  const l2 = (id, table, rowId, withReason) => add(id, 'T1 ends stay put (L2a)', `Head Office ends ${table} without a row_version bump; the EA's later archive must not overwrite it`, [
    hoEnd('ho.end', table, rowId, 'unassigned_at', withReason ? ", handover_reason = 'HO handover'" : ''),
    asEA(EA_A, 'later archive with an earlier end', archive(table, rowId, { unassigned_at: '2026-10-30T07:00:00+02:00', ...(withReason ? { handover_reason: null } : {}), row_version: 2 }), rows(1)),
    check('end and reason kept', `SELECT unassigned_at = TIMESTAMPTZ '${HO_END}' AS end_kept${withReason ? ", handover_reason = 'HO handover' AS reason_kept" : ''} FROM public.${table} WHERE id = '${rowId}'`, [withReason ? { end_kept: true, reason_kept: true } : { end_kept: true }]),
  ]);
  l2('L2a.child_ea', 'child_ea_assignments', CA_C, false);
  l2('L2a.class_ea', 'class_ea_assignments', CEA_K, true);
  l2('L2a.group_ea', 'group_ea_assignments', GEA_G, true);
  add('L2b.group_ea.restore_after_HO_end', 'T1 ends stay put (L2b, D5)', "The phone's group restore after Head Office ended the assignment is a one-row no-op", [
    hoEnd('ho.end group', 'group_ea_assignments', GEA_G, 'unassigned_at', ", handover_reason = 'HO handover'"),
    asEA(EA_A, 'write_for_child(D) before', readAs(`SELECT private.current_user_can_write_for_child('${D}') AS can_write`), { ok: true, returned: [{ can_write: false }] }),
    asEA(EA_A, 'restore', restore('group_ea_assignments', GEA_G, { unassigned_at: null, handover_reason: null, row_version: 2 }), rows(1)),
    asEA(EA_A, 'write_for_child(D) after', readAs(`SELECT private.current_user_can_write_for_child('${D}') AS can_write`), { ok: true, returned: [{ can_write: false }] }),
    check('end and reason kept', `SELECT unassigned_at = TIMESTAMPTZ '${HO_END}' AS end_kept, handover_reason = 'HO handover' AS reason_kept FROM public.group_ea_assignments WHERE id = '${GEA_G}'`, [{ end_kept: true, reason_kept: true }]),
  ]);
  add('L2b.group_ea.restore_after_handover_to_B', 'T1 ends stay put (L2b)', 'Head Office gave G to EA_B; the phone restore is a no-op instead of a 23505', [
    hoEnd('ho.end group', 'group_ea_assignments', GEA_G, 'unassigned_at', ", handover_reason = 'HO handover'"),
    asHO('ho.successor (fresh id)', `INSERT INTO public.group_ea_assignments (id, group_id, ea_user_id, programme_id, created_by) VALUES ('${uid('fb', 9)}', '${G}', '${EA_B}', ${LIT}, '${HO}') RETURNING id`, rows(1)),
    asEA(EA_A, 'restore', restore('group_ea_assignments', GEA_G, { unassigned_at: null, handover_reason: null, row_version: 2 }), rows(1)),
    check('EA_A stays ended, EA_B keeps G', `SELECT (SELECT unassigned_at IS NOT NULL FROM public.group_ea_assignments WHERE id = '${GEA_G}') AS a_ended, (SELECT unassigned_at IS NULL FROM public.group_ea_assignments WHERE id = '${uid('fb', 9)}') AS b_active`, [{ a_ended: true, b_active: true }]),
  ]);
  add('L2d.raw_un_end', 'T1 ends stay put (L2d, D5)', 'An EA token clearing ends Head Office set (no 1.5.0 producer) is a one-row no-op', [
    hoEnd('ho.end direct H', 'child_ea_assignments', CA_H, 'unassigned_at'),
    hoEnd('ho.end class K', 'class_ea_assignments', CEA_K, 'unassigned_at'),
    asEA(EA_A, 'un-end direct H', { ...restore('child_ea_assignments', CA_H, { unassigned_at: null, row_version: 2 }), noProducer: true }, rows(1)),
    asEA(EA_A, 'un-end class K', { ...restore('class_ea_assignments', CEA_K, { unassigned_at: null, handover_reason: null, row_version: 2 }), noProducer: true }, rows(1)),
    asEA(EA_A, 'write_for_child(H) after', readAs(`SELECT private.current_user_can_write_for_child('${H}') AS can_write`), { ok: true, returned: [{ can_write: false }] }),
    asEA(EA_A, 'write_for_child(E) after', readAs(`SELECT private.current_user_can_write_for_child('${E}') AS can_write`), { ok: true, returned: [{ can_write: false }] }),
  ]);
  add('L2.HO_bumps_version', 'preserved (MV001 unchanged)', 'Head Office bumped row_version on its end: the stale archive keeps today\'s MV001 refusal and changes nothing', [
    asHO('ho.end with row_version 5', `UPDATE public.child_ea_assignments SET unassigned_at = '${HO_END}', row_version = 5 WHERE id = '${CA_C}' RETURNING id`, rows(1)),
    asEA(EA_A, 'archive row_version 2', archive('child_ea_assignments', CA_C, { unassigned_at: ARCHIVE_AT, row_version: 2 }), sqlstate('MV001')),
    endIs('child_ea_assignments', CA_C, 'unassigned_at', HO_END),
  ]);
  add('L2.children.reopened_then_sole_holder_archive', 'decided (D3; B3 operating rule)', 'Head Office reopened a child while the phone still held a queued archive: the sole holder\'s archive applies', [
    asEA(EA_A, 'queued archive of H', archive('children', H, { archived_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
    check('archived by the sole holder', `SELECT archived_at = TIMESTAMPTZ '${ARCHIVE_AT}' AS archived, archived_by_user_id = '${EA_A}' AS by_caller FROM public.children WHERE id = '${H}'`, [{ archived: true, by_caller: true }]),
  ]);
  add('L3.clock_skew', 'T1 ends stay put (L3, MA-BUG-007)', 'Rows created with a phone clock 2 days fast, ended with a corrected clock: no 23514 for the EA or Head Office', (() => {
    const child = uid('f5', 20);
    const cea = uid('f6', 20); const cpe = uid('f7', 20); const ccm = uid('f8', 20); const kb = uid('f4', 20);
    const kbAssignment = uid('f9', 20); const ga = uid('fa', 20); const gaAssignment = uid('fb', 20); const cgm = uid('fc', 20);
    const fast = sqlNow('2 days');
    const now = sqlNow();
    return [
      ...hoSeed('ho.seed EA-created class and child', [
        `INSERT INTO public.classes (id, school_id, name, grade, academic_year_id, created_by) VALUES ('${kb}', '${SCHOOL}', 'EA class KB', '1', ${YEAR}, '${EA_A}') RETURNING id`,
        `INSERT INTO public.children (id, first_name, last_name, created_by) VALUES ('${child}', 'Fast', 'Clock', '${EA_A}') RETURNING id`,
      ]),
      asEA(EA_A, 'insert direct assignment +2d', insertOrIgnore('child_ea_assignments', { id: cea, user_id: EA_A, child_id: child, assigned_at: fast, created_by: EA_A }), rows(1)),
      asEA(EA_A, 'insert enrolment +2d', upsert('child_programme_enrollments', { id: cpe, child_id: child, programme_id: { sql: LIT }, enrolled_at: fast, created_by: EA_A, row_version: 2 }), rows(1)),
      asEA(EA_A, 'insert class assignment +2d', insertOrIgnore('class_ea_assignments', { id: kbAssignment, class_id: kb, ea_user_id: EA_A, programme_id: { sql: LIT }, assigned_at: fast, created_by: EA_A }), rows(1)),
      asEA(EA_A, 'insert class membership +2d', upsert('child_class_memberships', { id: ccm, child_id: child, class_id: kb, academic_year_id: { sql: YEAR }, enrolled_at: fast, created_by: EA_A, row_version: 2 }), rows(1)),
      asEA(EA_A, 'insert group', upsert('groups', { id: ga, name: 'EA group GA', programme_id: { sql: LIT }, class_id: kb, created_by: EA_A, row_version: 2 }), rows(1)),
      asEA(EA_A, 'insert group assignment +2d', insertOrIgnore('group_ea_assignments', { id: gaAssignment, group_id: ga, ea_user_id: EA_A, programme_id: { sql: LIT }, assigned_at: fast, created_by: EA_A }), rows(1)),
      asEA(EA_A, 'insert group membership +2d', upsert('child_group_memberships', { id: cgm, child_id: child, group_id: ga, joined_at: fast, created_by: EA_A, row_version: 2 }), rows(1)),
      asEA(EA_A, 'end enrolment now', archive('child_programme_enrollments', cpe, { ended_at: now, row_version: 3 }), rows(1)),
      asEA(EA_A, 'exit class membership now', archive('child_class_memberships', ccm, { exited_at: now, row_version: 3 }), rows(1)),
      asEA(EA_A, 'remove group membership now', archive('child_group_memberships', cgm, { removed_at: now, row_version: 3 }), rows(1)),
      asEA(EA_A, 'end group assignment now', archive('group_ea_assignments', gaAssignment, { unassigned_at: now, handover_reason: null, row_version: 2 }), rows(1)),
      asEA(EA_A, 'end class assignment now', archive('class_ea_assignments', kbAssignment, { unassigned_at: now, handover_reason: null, row_version: 2 }), rows(1)),
      asEA(EA_A, 'end direct assignment now', archive('child_ea_assignments', cea, { unassigned_at: now, row_version: 2 }), rows(1)),
      asHO('ho.end the fast-clock class assignment at now()', `UPDATE public.class_ea_assignments SET unassigned_at = pg_catalog.now() WHERE id = '${kbAssignment}' RETURNING id`, rows(1)),
      asHO('ho.end the fast-clock direct assignment at now()', `UPDATE public.child_ea_assignments SET unassigned_at = pg_catalog.now() WHERE id = '${cea}' RETURNING id`, rows(1)),
      check('every end equals its start', `SELECT (SELECT unassigned_at = assigned_at FROM public.child_ea_assignments WHERE id = '${cea}') AS direct, (SELECT ended_at = enrolled_at FROM public.child_programme_enrollments WHERE id = '${cpe}') AS enrolment, (SELECT exited_at = enrolled_at FROM public.child_class_memberships WHERE id = '${ccm}') AS class_membership`, [{ direct: true, enrolment: true, class_membership: true }]),
    ];
  })());

  // ===== Archives decided by the server (MA-BUG-011, -012, -013)
  add('E1a.class_archive_replay_after_reassign', 'T1 archives (E1a)', "Head Office handed K to EA_B, then reopened EA_A's assignment; EA_A's stale class archive is a no-op", [
    hoEnd('ho.end EA_A on K', 'class_ea_assignments', CEA_K, 'unassigned_at', ", handover_reason = 'HO handover'"),
    asHO('ho.EA_B on K', `INSERT INTO public.class_ea_assignments (id, class_id, ea_user_id, programme_id, created_by) VALUES ('${uid('f9', 9)}', '${K}', '${EA_B}', ${LIT}, '${HO}') RETURNING id`, rows(1)),
    asHO('ho.reopen EA_A on K', `UPDATE public.class_ea_assignments SET unassigned_at = NULL, handover_reason = NULL WHERE id = '${CEA_K}' RETURNING id`, rows(1)),
    asEA(EA_A, 'replayed class archive', archive('classes', K, { archived_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
    check('K live, EA_B still holds it', `SELECT (SELECT archived_at IS NULL FROM public.classes WHERE id = '${K}') AS live, (SELECT unassigned_at IS NULL FROM public.class_ea_assignments WHERE id = '${uid('f9', 9)}') AS b_holds`, [{ live: true, b_holds: true }]),
  ]);
  add('E1a.ea_class_shared', 'T1 archives (D4)', "EA_A created KA and shares it with EA_B: EA_A's Delete class means leave", [
    asHO('ho.EA_B on KA', `INSERT INTO public.class_ea_assignments (id, class_id, ea_user_id, programme_id, created_by) VALUES ('${uid('f9', 10)}', '${KA}', '${EA_B}', ${LIT}, '${HO}') RETURNING id`, rows(1)),
    asEA(EA_A, 'class archive', archive('classes', KA, { archived_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
    asEA(EA_A, 'own class assignment end', archive('class_ea_assignments', CEA_KA, { unassigned_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
    check('KA live, EA_B holds, EA_A left', `SELECT (SELECT archived_at IS NULL FROM public.classes WHERE id = '${KA}') AS live, (SELECT unassigned_at IS NULL FROM public.class_ea_assignments WHERE id = '${uid('f9', 10)}') AS b_holds, (SELECT unassigned_at IS NOT NULL FROM public.class_ea_assignments WHERE id = '${CEA_KA}') AS a_left`, [{ live: true, b_holds: true, a_left: true }]),
  ]);
  add('E1a.ea_class_sole_holder', 'control (D4)', 'EA_A created KA and is its only holder: Delete class archives it', [
    asEA(EA_A, 'class archive', archive('classes', KA, { archived_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
    check('KA archived by EA_A', `SELECT archived_at = TIMESTAMPTZ '${ARCHIVE_AT}' AS archived, archived_by_user_id = '${EA_A}' AS by_caller FROM public.classes WHERE id = '${KA}'`, [{ archived: true, by_caller: true }]),
  ]);
  add('E5.co_ea_class_archive', 'T1 archives (E5)', "EA_A and EA_B share Head Office class K; EA_A's Delete class chain leaves EA_B's class and children intact", [
    asHO('ho.EA_B on K', `INSERT INTO public.class_ea_assignments (id, class_id, ea_user_id, programme_id, created_by) VALUES ('${uid('f9', 11)}', '${K}', '${EA_B}', ${LIT}, '${HO}') RETURNING id`, rows(1)),
    asHO('ho.EA_B delivers E', `INSERT INTO public.child_ea_assignments (id, user_id, child_id, created_by) VALUES ('${uid('f6', 11)}', '${EA_B}', '${E}', '${HO}') RETURNING id`, rows(1)),
    asEA(EA_A, 'class archive', archive('classes', K, { archived_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
    asEA(EA_A, 'own child C class_id null', edit('children', C, { first_name: 'Child', last_name: 'C', class_id: null, updated_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
    asEA(EA_A, 'own child C exits K', archive('child_class_memberships', CCM_C, { exited_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
    asEA(EA_A, 'own class assignment end', archive('class_ea_assignments', CEA_K, { unassigned_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
    check('K live; EA_B keeps K and E', `SELECT (SELECT archived_at IS NULL FROM public.classes WHERE id = '${K}') AS class_live, (SELECT unassigned_at IS NULL FROM public.class_ea_assignments WHERE id = '${uid('f9', 11)}') AS b_class, (SELECT exited_at IS NULL FROM public.child_class_memberships WHERE id = '${CCM_E}') AS e_membership, (SELECT unassigned_at IS NULL FROM public.child_ea_assignments WHERE id = '${uid('f6', 11)}') AS b_delivers_e`, [{ class_live: true, b_class: true, e_membership: true, b_delivers_e: true }]),
  ]);
  add('E1c.child_archive_after_HO_handover', 'T1 residual + ends stay put', "Head Office handed H to EA_B; EA_A's archive chain is hidden except its own assignment, whose end stays", [
    hoEnd('ho.end EA_A on H', 'child_ea_assignments', CA_H, 'unassigned_at'),
    asHO('ho.EA_B on H', `INSERT INTO public.child_ea_assignments (id, user_id, child_id, created_by) VALUES ('${uid('f6', 12)}', '${EA_B}', '${H}', '${HO}') RETURNING id`, rows(1)),
    asEA(EA_A, 'children archive (hidden)', archive('children', H, { archived_at: ARCHIVE_AT, row_version: 2 }), rows(0)),
    asEA(EA_A, 'enrolment end (hidden)', archive('child_programme_enrollments', CPE_H, { ended_at: ARCHIVE_AT, row_version: 2 }), rows(0)),
    asEA(EA_A, 'own direct end', archive('child_ea_assignments', CA_H, { unassigned_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
    check('H live, EA_B holds, HO end kept', `SELECT (SELECT archived_at IS NULL FROM public.children WHERE id = '${H}') AS live, (SELECT unassigned_at IS NULL FROM public.child_ea_assignments WHERE id = '${uid('f6', 12)}') AS b_holds, (SELECT unassigned_at = TIMESTAMPTZ '${HO_END}' FROM public.child_ea_assignments WHERE id = '${CA_H}') AS ho_end_kept`, [{ live: true, b_holds: true, ho_end_kept: true }]),
  ]);
  add('E1c.child_archive_co_held', 'T1 archives (D3)', "EA_B also delivers to C: EA_A's archive chain means leave", [
    asHO('ho.EA_B delivers C', `INSERT INTO public.child_ea_assignments (id, user_id, child_id, created_by) VALUES ('${uid('f6', 13)}', '${EA_B}', '${C}', '${HO}') RETURNING id`, rows(1)),
    asEA(EA_A, 'children archive (leave)', archive('children', C, { archived_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
    asEA(EA_A, 'own direct end', archive('child_ea_assignments', CA_C, { unassigned_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
    check('C live, EA_B holds', `SELECT (SELECT archived_at IS NULL FROM public.children WHERE id = '${C}') AS live, (SELECT unassigned_at IS NULL FROM public.child_ea_assignments WHERE id = '${uid('f6', 13)}') AS b_holds`, [{ live: true, b_holds: true }]),
  ]);
  {
    const child = uid('f5', 30); const assignment = uid('f6', 30);
    const created = { id: child, first_name: 'New', last_name: 'Child', class_id: null, archived_at: null, archived_by_user_id: null, archive_reason: null, created_by: EA_A, created_at: WORK_AT, updated_at: WORK_AT, row_version: 1 };
    add('E.children_insert_replay_after_archive', 'T1 archives', "A lost-ack replay of the child's create (merge upsert) after its archive keeps archived_at", [
      asEA(EA_A, 'create child', upsert('children', created), rows(1)),
      asEA(EA_A, 'create direct assignment', insertOrIgnore('child_ea_assignments', { id: assignment, user_id: EA_A, child_id: child, assigned_at: WORK_AT, created_by: EA_A }), rows(1)),
      asEA(EA_A, 'archive child', archive('children', child, { archived_at: ARCHIVE_AT, row_version: 2 }), rows(1)),
      // 1.5.0 stamps the send-time row_version onto the re-sent insert (rowVersion.isStampedOperation).
      asEA(EA_A, 'replayed create (merge upsert)', upsert('children', { ...created, row_version: 2 }), rows(1)),
      check('still archived', `SELECT archived_at = TIMESTAMPTZ '${ARCHIVE_AT}' AS archived FROM public.children WHERE id = '${child}'`, [{ archived: true }]),
    ]);
  }
  // ===== Review follow-up 1: an EA write cannot move a kept end by moving the start.
  add('L3b.start_move_keeps_end', 'T1 ends stay put (review follow-up 1, exp1)', "Head Office ended H's enrolment; the EA's re-enrol upsert with a later start must not move the end", [
    asHO('ho.end enrolment', `UPDATE public.child_programme_enrollments SET ended_at = '2026-10-01T09:00:00+02:00' WHERE id = '${CPE_H}' RETURNING id`, rows(1)),
    asEA(EA_A, 're-enrol merge upsert, later start', upsert('child_programme_enrollments', {
      id: CPE_H, child_id: H, programme_id: { sql: LIT }, enrolled_at: '2026-11-03T08:00:00+02:00', ended_at: null, created_by: EA_A,
    }), rows(1)),
    check('start and end unchanged', `SELECT enrolled_at = TIMESTAMPTZ '${GRANT_START}' AS start_kept, ended_at = TIMESTAMPTZ '2026-10-01T09:00:00+02:00' AS end_kept FROM public.child_programme_enrollments WHERE id = '${CPE_H}'`, [{ start_kept: true, end_kept: true }]),
  ]);
  {
    const session = uid('e1', 4100); const attendee = uid('e2', 4100); const eaBOnK = uid('f9', 41);
    add('L3c.start_move_cannot_shrink_other_ea_history', 'T1 history lands (review follow-up 1, exp2c)', "EA_A moves C's class-membership start past Head Office's end; EA_B's late attendee for the day it held K must still land", [
      asHO('ho.EA_B held K until the handover', `INSERT INTO public.class_ea_assignments (id, class_id, ea_user_id, programme_id, assigned_at, unassigned_at, created_by) VALUES ('${eaBOnK}', '${K}', '${EA_B}', ${LIT}, '${GRANT_START}', '${HO_END}', '${HO}') RETURNING id`, rows(1)),
      hoEnd('ho.exit C from K', 'child_class_memberships', CCM_C, 'exited_at'),
      asHO('ho.EA_B session landed', `INSERT INTO public.sessions (id, user_id, programme_id, class_id, session_date, started_at, ended_at, activities, notes) VALUES ('${session}', '${EA_B}', ${LIT}, '${K}', DATE '${WORK_DAY}', '${WORK_AT}', '${WORK_END}', '{}', '') RETURNING id`, rows(1)),
      asEA(EA_A, 'membership merge upsert, later start', upsert('child_class_memberships', {
        id: CCM_C, child_id: C, class_id: K, academic_year_id: { sql: YEAR }, enrolled_at: '2026-11-04T08:00:00+02:00', exited_at: null, created_by: EA_A,
      }), rows(1)),
      asEA(EA_B, 'EA_B late attendee for C', upsert('session_attendees', attendeePayload({ id: attendee, session, child: C, group: null })), rows(1)),
      check('membership interval unchanged', `SELECT enrolled_at = TIMESTAMPTZ '${GRANT_START}' AS start_kept, exited_at = TIMESTAMPTZ '${HO_END}' AS end_kept FROM public.child_class_memberships WHERE id = '${CCM_C}'`, [{ start_kept: true, end_kept: true }]),
    ]);
  }
  {
    const replay = { id: CCM_F, child_id: F, class_id: KA, academic_year_id: { sql: YEAR }, enrolled_at: GRANT_START, exited_at: null, created_by: EA_A, row_version: 2 };
    add('L3d.replay_with_original_start_unchanged', 'preserved (review follow-up 1)', "A 1.5.0 merge-upsert replay of the EA's own membership with its original start changes nothing, open or ended", [
      asEA(EA_A, 'replay while open', upsert('child_class_memberships', replay), rows(1)),
      check('open row unchanged', `SELECT enrolled_at = TIMESTAMPTZ '${GRANT_START}' AS start_kept, exited_at IS NULL AS open FROM public.child_class_memberships WHERE id = '${CCM_F}'`, [{ start_kept: true, open: true }]),
      hoEnd('ho.exit F', 'child_class_memberships', CCM_F, 'exited_at'),
      asEA(EA_A, 'replay after Head Office ended it', upsert('child_class_memberships', replay), rows(1)),
      check('ended row unchanged', `SELECT enrolled_at = TIMESTAMPTZ '${GRANT_START}' AS start_kept, exited_at = TIMESTAMPTZ '${HO_END}' AS end_kept FROM public.child_class_memberships WHERE id = '${CCM_F}'`, [{ start_kept: true, end_kept: true }]),
    ]);
  }
  add('E.group_handover_bare_id_archive', 'T1 other (H1 group handover)', "Head Office hands G to EA_B with a fresh-id row; EA_A's 1.5.0 archiveGroup chain converges", [
    hoEnd('ho.end EA_A on G', 'group_ea_assignments', GEA_G, 'unassigned_at', ", handover_reason = 'HO handover'"),
    asHO('ho.EA_B on G (fresh id)', `INSERT INTO public.group_ea_assignments (id, group_id, ea_user_id, programme_id, created_by) VALUES ('${uid('fb', 10)}', '${G}', '${EA_B}', ${LIT}, '${HO}') RETURNING id`, rows(1)),
    asEA(EA_A, 'groups archive (hidden)', archive('groups', G, { archived_at: ARCHIVE_AT, row_version: 2 }), rows(0)),
    asEA(EA_A, 'membership C removal (hidden)', archive('child_group_memberships', CGM_C, { removed_at: ARCHIVE_AT, row_version: 2 }), rows(0)),
    asEA(EA_A, 'membership D removal (hidden)', archive('child_group_memberships', CGM_D, { removed_at: ARCHIVE_AT, row_version: 2 }), rows(0)),
    asEA(EA_A, 'own group assignment archive (bare id)', archive('group_ea_assignments', GEA_G, { unassigned_at: ARCHIVE_AT, handover_reason: null, row_version: 2 }), rows(1)),
    check('EA_B keeps G and its children', `SELECT (SELECT archived_at IS NULL FROM public.groups WHERE id = '${G}') AS group_live, (SELECT unassigned_at IS NULL FROM public.group_ea_assignments WHERE id = '${uid('fb', 10)}') AS b_holds, (SELECT count(*) FROM public.child_group_memberships WHERE group_id = '${G}' AND removed_at IS NULL) AS open_memberships, (SELECT unassigned_at = TIMESTAMPTZ '${HO_END}' AND handover_reason = 'HO handover' FROM public.group_ea_assignments WHERE id = '${GEA_G}') AS a_end_kept`, [{ group_live: true, b_holds: true, open_memberships: 2, a_end_kept: true }]),
  ]);

  // ===== Delete child (MA-BUG-012, -014)
  {
    const b = bundle(20);
    add('E2.sole_holder_with_history', 'T1 delete child (S3)', 'Delete child with history by its only holder: true, archived, never deleted', [
      ...hoSeed('ho.history by EA_B', [
        `INSERT INTO public.sessions (id, user_id, programme_id, session_date) VALUES ('${b.groupSession}', '${EA_B}', ${LIT}, DATE '${WORK_DAY}') RETURNING id`,
        `INSERT INTO public.session_attendees (id, session_id, child_id) VALUES ('${b.attendee(C)}', '${b.groupSession}', '${C}') RETURNING id`,
      ]),
      asEA(EA_A, 'delete_child_if_no_history', rpcDeleteChild(C), value(true)),
      check('archived, relationships ended, attendee kept', `SELECT c.archived_at IS NOT NULL AS archived, c.archived_by_user_id = '${EA_A}' AS by_caller, c.archive_reason = 'removed_by_ea' AS reason, (SELECT count(*) FROM public.child_ea_assignments WHERE child_id = c.id AND unassigned_at IS NULL) AS open_direct, (SELECT count(*) FROM public.child_programme_enrollments WHERE child_id = c.id AND ended_at IS NULL) AS open_enrolments, (SELECT count(*) FROM public.child_class_memberships WHERE child_id = c.id AND exited_at IS NULL) AS open_class, (SELECT count(*) FROM public.child_group_memberships WHERE child_id = c.id AND removed_at IS NULL) AS open_group, (SELECT count(*) FROM public.session_attendees WHERE child_id = c.id) AS attendees FROM public.children c WHERE c.id = '${C}'`, [{ archived: true, by_caller: true, reason: true, open_direct: 0, open_enrolments: 0, open_class: 0, open_group: 0, attendees: 1 }]),
    ]);
  }
  add('E2.another_holder', 'T1 delete child (D3)', "EA_B also delivers to C: EA_A's Delete child means leave", [
    asHO('ho.EA_B delivers C', `INSERT INTO public.child_ea_assignments (id, user_id, child_id, created_by) VALUES ('${uid('f6', 14)}', '${EA_B}', '${C}', '${HO}') RETURNING id`, rows(1)),
    asEA(EA_A, 'delete_child_if_no_history', rpcDeleteChild(C), value(true)),
    check('C live; only EA_A left', `SELECT c.archived_at IS NULL AS live, (SELECT unassigned_at IS NOT NULL FROM public.child_ea_assignments WHERE id = '${CA_C}') AS a_left, (SELECT unassigned_at IS NULL FROM public.child_ea_assignments WHERE id = '${uid('f6', 14)}') AS b_holds, (SELECT ended_at IS NULL FROM public.child_programme_enrollments WHERE id = '${CPE_C}') AS enrolment_open, (SELECT exited_at IS NULL FROM public.child_class_memberships WHERE id = '${CCM_C}') AS class_open, (SELECT removed_at IS NOT NULL FROM public.child_group_memberships WHERE id = '${CGM_C}') AS a_group_left FROM public.children c WHERE c.id = '${C}'`, [{ live: true, a_left: true, b_holds: true, enrolment_open: true, class_open: true, a_group_left: true }]),
  ]);
  add('E2.class_path_co_holder', 'T1 delete child (D3, lock protocol predicate)', "EA_B holds class K, where C is a member: EA_A's Delete child means leave", [
    asHO('ho.EA_B on K', `INSERT INTO public.class_ea_assignments (id, class_id, ea_user_id, programme_id, created_by) VALUES ('${uid('f9', 12)}', '${K}', '${EA_B}', ${LIT}, '${HO}') RETURNING id`, rows(1)),
    asEA(EA_A, 'delete_child_if_no_history', rpcDeleteChild(C), value(true)),
    check('C live, class membership open', `SELECT (SELECT archived_at IS NULL FROM public.children WHERE id = '${C}') AS live, (SELECT exited_at IS NULL FROM public.child_class_memberships WHERE id = '${CCM_C}') AS class_open`, [{ live: true, class_open: true }]),
  ]);
  // ===== Review follow-up 4: Delete child before the EA's own group assignment INSERT landed.
  const createdUnheldGroup = (label) => hoSeed(label, [
    `INSERT INTO public.groups (id, name, programme_id, created_by) VALUES ('${uid('fa', 40)}', 'EA A new group', ${LIT}, '${EA_A}') RETURNING id`,
    `INSERT INTO public.child_group_memberships (id, child_id, group_id, joined_at, created_by) VALUES ('${uid('fc', 40)}', '${H}', '${uid('fa', 40)}', '${GRANT_START}', '${EA_A}') RETURNING id`,
  ]);
  add('E2.created_unheld_group_sole_holder', 'T1 delete child (review follow-up 4a)', "EA_A's group assignment INSERT has not landed; the sole holder's Delete child ends H's membership in that group and archives H", [
    ...createdUnheldGroup('ho.EA_A created group, membership only'),
    asEA(EA_A, 'delete_child_if_no_history', rpcDeleteChild(H), value(true)),
    check('membership ended, H archived', `SELECT (SELECT removed_at IS NOT NULL FROM public.child_group_memberships WHERE id = '${uid('fc', 40)}') AS membership_ended, (SELECT archived_at IS NOT NULL FROM public.children WHERE id = '${H}') AS archived`, [{ membership_ended: true, archived: true }]),
  ]);
  add('E2.created_unheld_group_co_held', 'T1 delete child (review follow-up 4b)', "Same, but EA_B delivers to H: EA_A leaves, including H's membership in EA_A's own unheld group", [
    ...createdUnheldGroup('ho.EA_A created group, membership only'),
    asHO('ho.EA_B delivers H', `INSERT INTO public.child_ea_assignments (id, user_id, child_id, created_by) VALUES ('${uid('f6', 41)}', '${EA_B}', '${H}', '${HO}') RETURNING id`, rows(1)),
    asEA(EA_A, 'delete_child_if_no_history', rpcDeleteChild(H), value(true)),
    check('EA_A left completely; H live for EA_B', `SELECT (SELECT removed_at IS NOT NULL FROM public.child_group_memberships WHERE id = '${uid('fc', 40)}') AS membership_ended, (SELECT archived_at IS NULL FROM public.children WHERE id = '${H}') AS live, (SELECT unassigned_at IS NOT NULL FROM public.child_ea_assignments WHERE id = '${CA_H}') AS a_left, (SELECT unassigned_at IS NULL FROM public.child_ea_assignments WHERE id = '${uid('f6', 41)}') AS b_holds`, [{ membership_ended: true, live: true, a_left: true, b_holds: true }]),
  ]);
  add('E2.no_history_control', 'T1 delete child (B1)', 'Delete child with no history: true and archived, never hard-deleted', [
    asEA(EA_A, 'delete_child_if_no_history', rpcDeleteChild(F), value(true)),
    check('row kept and archived', `SELECT count(*) AS rows, bool_and(archived_at IS NOT NULL) AS archived FROM public.children WHERE id = '${F}'`, [{ rows: 1, archived: true }]),
  ]);
  add('E2.after_handover', 'T1 delete child (MA-BUG-012)', 'Head Office handed H to EA_B; the former holder\'s Delete child returns true and changes nothing', [
    hoEnd('ho.end EA_A on H', 'child_ea_assignments', CA_H, 'unassigned_at'),
    asHO('ho.EA_B on H', `INSERT INTO public.child_ea_assignments (id, user_id, child_id, created_by) VALUES ('${uid('f6', 15)}', '${EA_B}', '${H}', '${HO}') RETURNING id`, rows(1)),
    asEA(EA_A, 'delete_child_if_no_history', rpcDeleteChild(H), value(true)),
    check('H unchanged', `SELECT (SELECT archived_at IS NULL FROM public.children WHERE id = '${H}') AS live, (SELECT unassigned_at IS NULL FROM public.child_ea_assignments WHERE id = '${uid('f6', 15)}') AS b_holds, (SELECT ended_at IS NULL FROM public.child_programme_enrollments WHERE id = '${CPE_H}') AS enrolment_open`, [{ live: true, b_holds: true, enrolment_open: true }]),
  ]);
  add('E2.never_held', 'preserved denial', 'A child the EA never held or created: 42501 as today', [
    asEA(EA_A, 'delete_child_if_no_history', rpcDeleteChild(N), sqlstate('42501')),
  ]);
  add('E2.missing_child', 'preserved', 'A child the server does not have: true as today', [
    asEA(EA_A, 'delete_child_if_no_history', rpcDeleteChild(uid('f5', 99)), value(true)),
  ]);

  // ===== Destructive capabilities (MA-BUG-008, -009)
  {
    const sessionId = uid('e1', 4000); const attendee = uid('e2', 4000);
    add('L6c.ea_delete_denied', 'T1 destructive capabilities (L6c)', 'An EA token cannot DELETE any lifecycle or history row (no 1.5.0 producer)', [
      ...hoSeed('ho.own session + attendee', [
        `INSERT INTO public.sessions (id, user_id, programme_id, class_id, session_date) VALUES ('${sessionId}', '${EA_A}', ${LIT}, '${K}', DATE '${WORK_DAY}') RETURNING id`,
        `INSERT INTO public.session_attendees (id, session_id, child_id) VALUES ('${attendee}', '${sessionId}', '${C}') RETURNING id`,
      ]),
      asEA(EA_A, 'DELETE child_group_memberships', rawDelete('child_group_memberships', CGM_C), sqlstate('42501')),
      asEA(EA_A, 'DELETE child_class_memberships', rawDelete('child_class_memberships', CCM_C), sqlstate('42501')),
      asEA(EA_A, 'DELETE child_programme_enrollments', rawDelete('child_programme_enrollments', CPE_C), sqlstate('42501')),
      asEA(EA_A, 'DELETE classes (own)', rawDelete('classes', KA), sqlstate('42501')),
      asEA(EA_A, 'DELETE session_attendees (own)', rawDelete('session_attendees', attendee), sqlstate('42501')),
      asEA(EA_A, 'DELETE sessions (own)', rawDelete('sessions', sessionId), sqlstate('42501')),
      check('nothing deleted', `SELECT (SELECT count(*) FROM public.child_group_memberships WHERE id = '${CGM_C}') + (SELECT count(*) FROM public.child_class_memberships WHERE id = '${CCM_C}') + (SELECT count(*) FROM public.classes WHERE id = '${KA}') + (SELECT count(*) FROM public.sessions WHERE id = '${sessionId}') AS kept`, [{ kept: 4 }]),
    ]);
  }
  {
    const history = hoSeed('ho.history', [
      `INSERT INTO public.sessions (id, user_id, programme_id, class_id, group_id, session_date) VALUES ('${uid('e1', 4001)}', '${EA_DOOMED}', ${LIT}, '${K}', '${G}', DATE '${WORK_DAY}') RETURNING id`,
      `INSERT INTO public.session_attendees (id, session_id, child_id, group_id) VALUES ('${uid('e2', 4001)}', '${uid('e1', 4001)}', '${C}', '${G}') RETURNING id`,
      `INSERT INTO public.child_ea_assignments (id, user_id, child_id, created_by) VALUES ('${uid('f6', 40)}', '${EA_DOOMED}', '${C}', '${HO}') RETURNING id`,
      `INSERT INTO public.time_entries (id, user_id, sign_in_time) VALUES ('${uid('e8', 1)}', '${EA_DOOMED}', pg_catalog.now() - interval '1 day') RETURNING id`,
    ]);
    const kept = check('history kept', `SELECT (SELECT count(*) FROM public.users WHERE id = '${EA_DOOMED}') AS profile, (SELECT count(*) FROM public.sessions WHERE user_id = '${EA_DOOMED}') AS sessions, (SELECT count(*) FROM public.session_attendees WHERE id = '${uid('e2', 4001)}') AS attendees, (SELECT count(*) FROM public.child_ea_assignments WHERE user_id = '${EA_DOOMED}') AS assignments, (SELECT count(*) FROM public.time_entries WHERE user_id = '${EA_DOOMED}') AS time_entries`, [{ profile: 1, sessions: 1, attendees: 1, assignments: 1, time_entries: 1 }]);
    add('L6b.delete_auth_user_with_history', 'T1 destructive capabilities (L6b)', 'Deleting the auth user of an EA with history fails under RESTRICT', [
      ...history,
      asHO('ho.DELETE auth.users', `DELETE FROM auth.users WHERE id = '${EA_DOOMED}' RETURNING id`, sqlstate('23503')),
      kept,
    ]);
    add('L6b.delete_public_user_with_history', 'T1 destructive capabilities (L6b)', 'Deleting the profile row of an EA with history fails under RESTRICT', [
      ...history,
      asHO('ho.DELETE public.users', `DELETE FROM public.users WHERE id = '${EA_DOOMED}' RETURNING id`, sqlstate('23503')),
      kept,
    ]);
    add('L6b.never_used_account_still_deletes', 'preserved (auth.users -> public.users CASCADE kept)', 'A never-used test account (profile only) still deletes', [
      asHO('ho.DELETE auth.users', `DELETE FROM auth.users WHERE id = '${EA_UNUSED}' RETURNING id`, rows(1)),
      check('profile cascaded', `SELECT count(*) AS profile FROM public.users WHERE id = '${EA_UNUSED}'`, [{ profile: 0 }]),
    ]);
    add('L6b.HO_delete_child_with_history', 'T1 destructive capabilities', 'A Head Office DELETE of a child with history fails under RESTRICT', [
      ...history,
      asHO('ho.DELETE children', `DELETE FROM public.children WHERE id = '${C}' RETURNING id`, sqlstate('23503')),
    ]);
    add('L6b.HO_delete_group_with_members', 'T1 destructive capabilities', 'A Head Office DELETE of a group with memberships fails under RESTRICT', [
      asHO('ho.DELETE groups', `DELETE FROM public.groups WHERE id = '${G}' RETURNING id`, sqlstate('23503')),
    ]);
    add('L6b.HO_delete_class_with_assignments', 'T1 destructive capabilities', 'A Head Office DELETE of a class holding only assignment evidence fails under RESTRICT', [
      asHO('ho.DELETE classes', `DELETE FROM public.classes WHERE id = '${KY}' RETURNING id`, sqlstate('23503')),
    ]);
  }
  {
    const b = bundle(30);
    const s = sessionPayload({ id: b.groupSession });
    add('S4.sessions_insert_or_ignore', 'T1 destructive capabilities (S4b)', 'Sessions first send and replay land with authenticated UPDATE revoked', [
      asEA(EA_A, 'first send', insertOrIgnore('sessions', s), rows(1)),
      asEA(EA_A, 'replay', insertOrIgnore('sessions', s), rows(0)),
      check('authenticated has no UPDATE on sessions', "SELECT pg_catalog.has_any_column_privilege('authenticated', 'public.sessions', 'UPDATE') AS can_update", [{ can_update: false }]),
    ]);
  }
  return cases;
};

// ------------------------------------------------------------------------- 1.5.0 dispositions
const RANK = {
  synced: 4,
  retry_until_reauth: 3,
  retry_needs_parent: 3,
  retry_then_terminal: 2,
  terminal: 2,
  retry_forever: 0,
};
const classifyCode = (table, code) => {
  const byCode = DISPOSITIONS.classify[table];
  assert.ok(byCode, `no 1.5.0 classifier entry for table ${table}`);
  return (byCode[code] ?? byCode.ZZ_UNLISTED_CODE).steady;
};
const typeOf = (v) => (v === null ? 'null' : typeof v);
// The 1.5.0 disposition of one server answer, or null when 1.5.0 has no producer for it.
const disposition1_5_0 = (req, result) => {
  if (req.noProducer || req.kind === 'ho' || req.kind === 'read') return null;
  if (!result.ok) return { label: classifyCode(req.table, result.sqlstate), code: result.sqlstate };
  let ack;
  if (['archive', 'restore', 'update'].includes(req.kind)) {
    const ids = result.returned.map((row) => row.id);
    const key = ids.length === 0 ? 'none'
      : ids.length === 1 ? (ids[0] === req.recordId ? 'own' : 'other')
        : 'own+own';
    ack = DISPOSITIONS.ack[req.kind][req.table]?.[key];
    assert.ok(ack, `no 1.5.0 ${req.kind} acknowledgement rule for ${req.table}`);
  } else if (req.kind === 'insert') {
    ack = DISPOSITIONS.ack.insert[req.table]?.ok;
    assert.ok(ack, `no 1.5.0 insert acknowledgement rule for ${req.table}`);
  } else if (req.kind === 'rpc' && req.rpc === 'set_letter_mastery') {
    const rowsOut = result.returned;
    if (rowsOut.length !== 1) {
      ack = DISPOSITIONS.ack.rpc.set_letter_mastery.rowCounts[rowsOut.length === 0 ? '0' : '2'];
    } else {
      const r = rowsOut[0];
      const signature = [r.outcome, typeOf(r.confirmed), typeOf(r.changed_at), typeOf(r.correction_id), typeOf(r.changed_by)].join('|');
      ack = DISPOSITIONS.ack.rpc.set_letter_mastery.rows[signature]
        ?? DISPOSITIONS.ack.rpc.set_letter_mastery.rows[`other|${signature.split('|').slice(1).join('|')}`];
    }
  } else if (req.kind === 'rpc') {
    const literal = JSON.stringify(result.returned[0]?.result ?? null);
    ack = DISPOSITIONS.ack.rpc[req.rpc]?.[literal];
    assert.ok(ack, `1.5.0 fixture has no answer for ${req.rpc} returning ${literal}; extend the probe`);
  } else {
    throw new Error(`unknown request kind ${req.kind}`);
  }
  if (ack.success) return { label: 'synced', code: null };
  return { label: classifyCode(req.table, ack.code), code: ack.code };
};

// ------------------------------------------------------------------------------- execution
const runScript = ({ databaseUrl, sql, label }) => {
  const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-Atq', databaseUrl], {
    input: sql, encoding: 'utf8', env: buildPsqlEnv(label), timeout: 180_000, maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${label} failed:\n${(result.stderr || result.stdout || '').trim()}`);
  return result.stdout.split('\n').filter(Boolean).map((line) => JSON.parse(line));
};

const roleSql = (actor) => (actor === 'HO'
  ? "RESET ROLE;\nSET LOCAL request.jwt.claim.sub = '';\nSET LOCAL request.jwt.claims = '';"
  : `SET LOCAL ROLE authenticated;\nSET LOCAL request.jwt.claim.sub = '${actor}';\nSET LOCAL request.jwt.claims = '${JSON.stringify({ sub: actor, role: 'authenticated' })}';`);

const caseSql = (steps, prelude = '') => {
  const lines = ['BEGIN;', "SET LOCAL TimeZone = 'UTC';"];
  if (prelude) lines.push(prelude);
  for (const s of steps) {
    assert.ok(!s.label.includes("'"), `label must not contain a quote: ${s.label}`);
    const sql = s.check ? s.sql : s.req.sql;
    assert.ok(!sql.includes(STEP_TAG), `${s.label} contains ${STEP_TAG}`);
    if (s.check) {
      lines.push(roleSql('HO'), `SELECT harness.check('${s.label}', ${STEP_TAG}${sql}${STEP_TAG});`);
    } else {
      lines.push(roleSql(s.actor), `SELECT harness.step('${s.label}', ${STEP_TAG}${sql}${STEP_TAG});`);
    }
  }
  lines.push('ROLLBACK;');
  return `${lines.join('\n')}\n`;
};

const describe = (r) => (r.ok
  ? `ok rows=${r.rows}${r.returned?.length && r.returned[0] && 'result' in r.returned[0] ? ` result=${JSON.stringify(r.returned[0].result)}` : ''}${r.returned?.[0]?.outcome ? ` outcome=${r.returned[0].outcome}` : ''}`
  : `ERR ${r.sqlstate} ${r.message}`);

const meets = (r, expect) => {
  if (!expect) return true;
  if (expect.sqlstate) return !r.ok && r.sqlstate === expect.sqlstate;
  if (!r.ok) return false;
  if ('rows' in expect && r.rows !== expect.rows) return false;
  if ('value' in expect && r.returned[0]?.result !== expect.value) return false;
  if ('outcome' in expect && r.returned[0]?.outcome !== expect.outcome) return false;
  if ('returned' in expect) return JSON.stringify(r.returned) === JSON.stringify(expect.returned);
  return true;
};
const checkMeets = (returned, expected) => (
  returned.length === expected.length
  && expected.every((row, i) => Object.entries(row).every(([k, v]) => JSON.stringify(returned[i][k]) === JSON.stringify(v)))
);

// The "absorb, don't refuse" rule for one 1.5.0 request: never a worse disposition, never a new
// SQLSTATE, never zero rows where 1.5.0 needs one (that surfaces as a worse disposition).
const compatViolation = (req, base, cur) => {
  if (req.kind === 'ho' || req.kind === 'read') return null;
  if (!cur.ok && (base.ok || base.sqlstate !== cur.sqlstate) && !(req.noProducer && req.kind === 'delete')) {
    return `new SQLSTATE ${cur.sqlstate} (baseline: ${describe(base)})`;
  }
  const b = disposition1_5_0(req, base);
  const c = disposition1_5_0(req, cur);
  if (b && c && RANK[c.label] < RANK[b.label]) {
    return `1.5.0 disposition worse: ${b.label} -> ${c.label} (baseline ${describe(base)}; now ${describe(cur)})`;
  }
  return null;
};

const evaluateCase = (testCase, baseOut, curOut, failures, summary) => {
  const byLabel = (out) => new Map(out.map((r) => [r.label, r]));
  const base = byLabel(baseOut);
  const cur = byLabel(curOut);
  let caseFailures = 0;
  const fail = (message) => { failures.push(`${testCase.id}: ${message}`); caseFailures += 1; };
  for (const s of testCase.steps) {
    const c = cur.get(s.label);
    const b = base.get(s.label);
    assert.ok(c && b, `${testCase.id}: missing output for ${s.label}`);
    if (s.check) {
      if (!checkMeets(c.returned, s.expect)) fail(`check "${s.label}" expected ${JSON.stringify(s.expect)}, got ${JSON.stringify(c.returned)}`);
      continue;
    }
    if (!meets(c, s.expect)) fail(`"${s.label}" expected ${JSON.stringify(s.expect)}, got ${describe(c)}`);
    const violation = compatViolation(s.req, b, c);
    if (violation) fail(`"${s.label}" compat: ${violation}`);
  }
  summary.push({ id: testCase.id, plan: testCase.plan, status: caseFailures ? 'FAIL' : 'pass', failures: caseFailures });
};

// ------------------------------------------------------------------------------- wire corpus
const WIRE_TABLE_ORDER = [
  'staff_programme_assignments', 'classes', 'class_ea_assignments', 'groups', 'group_ea_assignments',
  'children', 'child_ea_assignments', 'child_programme_enrollments', 'child_class_memberships', 'child_group_memberships',
];
const wireCase = (file, { literacyId, yearId, columnsByTable }) => {
  const raw = fs.readFileSync(path.join(WIRE_DIR, file), 'utf8');
  const first = JSON.parse(raw);
  // Fixture programme and year ids map onto this database's seeded reference rows.
  const wire = JSON.parse(raw.replaceAll(first.ids.PROG, literacyId).replaceAll(first.ids.YEAR, yearId));
  const seed = [
    `INSERT INTO auth.users (id) VALUES ('${wire.actor}'), ('${wire.headOffice}');`,
    `INSERT INTO public.schools (id, name) VALUES ('${wire.ids.SCHOOL}', 'Wire corpus school');`,
    `INSERT INTO public.users (id, first_name, last_name, school_id, organization_id) VALUES ('${wire.actor}', 'Field', 'EA', '${wire.ids.SCHOOL}', '${ORG}'), ('${wire.headOffice}', 'Head', 'Office', '${wire.ids.SCHOOL}', '${ORG}');`,
  ];
  for (const table of WIRE_TABLE_ORDER) {
    const seedRows = wire.seed[table] || [];
    if (!seedRows.length) continue;
    const columns = [...new Set(seedRows.flatMap((row) => Object.keys(row)))]
      .filter((column) => columnsByTable.get(table).has(column));
    const list = columns.map(quoteIdentifier).join(', ');
    seed.push(`INSERT INTO public.${table} (${list}) SELECT ${list} FROM pg_catalog.json_populate_recordset(NULL::public.${table}, ${jsonLiteral(seedRows)}::json);`);
  }
  // Head Office ends without a row_version bump (the bump rule is retired; the guard protects ends).
  for (const action of wire.hoActions || []) {
    seed.push(`UPDATE public.${action.table} SET ${Object.entries(action.set).map(([k, v]) => `${quoteIdentifier(k)} = ${sqlLiteral(v)}`).join(', ')} WHERE id = '${action.id}';`);
  }
  const steps = [];
  for (const r of wire.requests) {
    const label = `${r.seq} ${r.method} ${r.target}`;
    if (r.target.startsWith('rpc/')) {
      if (r.target !== 'rpc/set_letter_mastery') continue; // support receipts are not lifecycle requests
      const a = r.body;
      steps.push(asEA(wire.actor, label, rpcLetter({
        correction_id: a.p_correction_id, child_id: a.p_child_id, letter: a.p_letter,
        language: a.p_language, confirmed: a.p_confirmed, changed_at: a.p_changed_at,
      })));
      continue;
    }
    if (r.method === 'POST') {
      steps.push(asEA(wire.actor, label, upsert(r.target, r.body, {
        ignoreDuplicates: r.prefer.includes('resolution=ignore-duplicates'),
      })));
      continue;
    }
    assert.equal(r.method, 'PATCH', `unexpected wire method ${r.method}`);
    const id = new URLSearchParams(r.query).get('id').replace(/^eq\./, '');
    const lifecycle = DISPOSITIONS.archiveServerColumns[r.target] || [];
    const keys = Object.keys(r.body).filter((k) => k !== 'row_version');
    const kind = !keys.every((k) => lifecycle.includes(k)) ? 'update'
      : keys.every((k) => r.body[k] === null) ? 'restore' : 'archive';
    steps.push(asEA(wire.actor, label, patchRequest(kind, r.target, id, r.body)));
  }
  return {
    id: `wire.${wire.label}`,
    plan: 'T1 history lands (frozen 1.5.0 corpus)',
    title: file,
    prelude: seed.join('\n'),
    steps,
  };
};

const evaluateWireCase = (testCase, baseOut, curOut, failures, summary) => {
  const { steps } = testCase;
  const byLabel = (out) => new Map(out.map((r) => [r.label, r]));
  const base = byLabel(baseOut);
  const cur = byLabel(curOut);
  let caseFailures = 0;
  for (const s of steps) {
    const c = cur.get(s.label);
    const b = base.get(s.label);
    const d = disposition1_5_0(s.req, c);
    if (d.label !== 'synced') {
      failures.push(`${testCase.id}: "${s.label}" expected the 1.5.0 client to mark it synced, got ${d.label} (${describe(c)})`);
      caseFailures += 1;
    }
    const violation = compatViolation(s.req, b, c);
    if (violation) {
      failures.push(`${testCase.id}: "${s.label}" compat: ${violation}`);
      caseFailures += 1;
    }
  }
  summary.push({ id: testCase.id, plan: testCase.plan, status: caseFailures ? 'FAIL' : 'pass', failures: caseFailures });
};

// ---------------------------------------------------------------------------- catalog checks
const catalogChecks = (databaseUrl, failures, summary) => {
  const q = (sql, label) => runPsql({ databaseUrl, sql, label }).split('\n').filter(Boolean);
  const results = [];
  const record = (id, ok, detail) => {
    results.push(id);
    summary.push({ id, plan: 'T1 catalog', status: ok ? 'pass' : 'FAIL', failures: ok ? 0 : 1 });
    if (!ok) failures.push(`${id}: ${detail}`);
  };

  const deleteGrants = q(`
    SELECT c.relname || ':' || r.rolname FROM pg_catalog.pg_class c
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
      AND (pg_catalog.has_table_privilege(r.rolname, c.oid, 'DELETE')
        OR pg_catalog.has_table_privilege(r.rolname, c.oid, 'TRUNCATE'))
    ORDER BY 1`, 'catalog-delete-grants');
  const deletePolicies = q(`
    SELECT tablename || ':' || policyname FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND cmd IN ('DELETE', 'ALL')
      AND (roles && ARRAY['authenticated', 'anon', 'public']::name[])
    ORDER BY 1`, 'catalog-delete-policies');
  record('catalog.no_ea_delete', deleteGrants.length === 0 && deletePolicies.length === 0,
    `EA roles still hold DELETE/TRUNCATE grants ${JSON.stringify(deleteGrants)} or DELETE policies ${JSON.stringify(deletePolicies)}`);

  // Nothing holding history or authority evidence may be cascade-wiped. The parents are the
  // people and lifecycle entities; Supabase's own auth.* tables are outside this schema scan.
  const allowed = new Set([
    'auth.users->public.users', // never-used test accounts still delete
    'public.sessions->public.session_attendees', // a session and its attendees are one aggregate
    'public.assessments->public.assessment_items', // an assessment and its items are one aggregate
  ]);
  const cascades = q(`
    SELECT pn.nspname || '.' || p.relname || '->' || cn.nspname || '.' || ch.relname
    FROM pg_catalog.pg_constraint k
    JOIN pg_catalog.pg_class ch ON ch.oid = k.conrelid
    JOIN pg_catalog.pg_namespace cn ON cn.oid = ch.relnamespace
    JOIN pg_catalog.pg_class p ON p.oid = k.confrelid
    JOIN pg_catalog.pg_namespace pn ON pn.oid = p.relnamespace
    WHERE k.contype = 'f' AND k.confdeltype = 'c' AND cn.nspname IN ('public', 'private')
    ORDER BY 1`, 'catalog-cascades');
  const unexpected = cascades.filter((edge) => !allowed.has(edge));
  record('catalog.no_history_cascade', unexpected.length === 0,
    `ON DELETE CASCADE into history or authority evidence: ${JSON.stringify(unexpected)}`);

  // The guard fires after the row-version and identity triggers (alphabetical BEFORE order).
  const guarded = {
    child_ea_assignments: 'INSERT,UPDATE', class_ea_assignments: 'INSERT,UPDATE', group_ea_assignments: 'INSERT,UPDATE',
    child_programme_enrollments: 'INSERT,UPDATE', child_class_memberships: 'INSERT,UPDATE', child_group_memberships: 'INSERT,UPDATE',
    children: 'UPDATE', classes: 'UPDATE', groups: 'UPDATE',
  };
  const triggerRows = q(`
    SELECT c.relname || '|' || t.tgname || '|' || (t.tgtype & 2 > 0)::text || '|' || (t.tgtype & 4 > 0)::text || '|' || (t.tgtype & 16 > 0)::text
    FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace
      AND c.relname IN (${Object.keys(guarded).map((t) => `'${t}'`).join(', ')})
    ORDER BY c.relname, t.tgname`, 'catalog-triggers');
  const problems = [];
  for (const [table, events] of Object.entries(guarded)) {
    const rowsForTable = triggerRows.map((line) => line.split('|')).filter(([t]) => t === table)
      .map(([, name, before, insert, update]) => ({ name, before: before === 'true', insert: insert === 'true', update: update === 'true' }));
    const guard = rowsForTable.find((t) => t.name === `${table}_zz_lifecycle_guard`);
    if (!guard || !guard.before) { problems.push(`${table}: no BEFORE ${table}_zz_lifecycle_guard`); continue; }
    if (events.includes('INSERT') !== guard.insert || !guard.update) problems.push(`${table}: guard events wrong`);
    const beforeUpdate = rowsForTable.filter((t) => t.before && t.update).map((t) => t.name).sort();
    if (beforeUpdate[beforeUpdate.length - 1] !== guard.name) problems.push(`${table}: guard does not fire last (${beforeUpdate.join(', ')})`);
  }
  record('catalog.guard_trigger_order', problems.length === 0, problems.join('; '));
  return results;
};

// ---------------------------------------------------------------- overlapping transactions
// Two real sessions: Head Office holds the lock-protocol locks (children -> classes -> groups)
// while granting a new holder; the EA's removal must wait for them and then see the new holder.
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const runAsync = ({ databaseUrl, sql, label }) => new Promise((resolve) => {
  const child = spawn('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-Atq', databaseUrl], { env: buildPsqlEnv(label) });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (status) => resolve({ status, stdout, stderr }));
  child.stdin.end(sql);
});
const waitFor = async (databaseUrl, sql, label, timeoutMs = 20_000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (runPsql({ databaseUrl, sql, label }) === 't') return true;
    await sleep(100);
  }
  return false;
};

const raceCases = [
  {
    id: 'race.delete_child_vs_class_grant',
    plan: 'T1 overlapping transactions (review finding 4)',
    child: X,
    // Head Office locks only the class row (a class grant touches no child row), so the EA's
    // Delete child can block only through other_active_holder's class lock.
    holderSql: `
      SELECT id FROM public.classes WHERE id = '${KX}' FOR UPDATE;
      INSERT INTO public.class_ea_assignments (id, class_id, ea_user_id, programme_id, created_by) VALUES ('${uid('f9', 30)}', '${KX}', '${EA_B}', ${LIT}, '${HO}');`,
    eaSql: `SELECT public.delete_child_if_no_history('${X}'::uuid);`,
    eaExpect: 't',
    after: `SELECT (SELECT archived_at IS NULL FROM public.children WHERE id = '${X}')
      AND (SELECT exited_at IS NULL FROM public.child_class_memberships WHERE id = '${CCM_X}')
      AND (SELECT ended_at IS NULL FROM public.child_programme_enrollments WHERE id = '${CPE_X}')
      AND (SELECT unassigned_at IS NULL FROM public.class_ea_assignments WHERE id = '${uid('f9', 30)}')
      AND (SELECT unassigned_at IS NOT NULL FROM public.child_ea_assignments WHERE id = '${CA_X}')`,
    afterDescription: 'X stays live in KX for EA_B; only EA_A left',
  },
  {
    id: 'race.delete_child_vs_group_handover',
    plan: 'T1 overlapping transactions (review finding 4)',
    child: Z,
    // Only the group row is locked, so the wait proves other_active_holder's group lock.
    holderSql: `
      SELECT id FROM public.groups WHERE id = '${GZ}' FOR UPDATE;
      UPDATE public.group_ea_assignments SET unassigned_at = pg_catalog.now(), handover_reason = 'HO handover' WHERE id = '${GEA_GZ}';
      INSERT INTO public.group_ea_assignments (id, group_id, ea_user_id, programme_id, created_by) VALUES ('${uid('fb', 30)}', '${GZ}', '${EA_B}', ${LIT}, '${HO}');`,
    eaSql: `SELECT public.delete_child_if_no_history('${Z}'::uuid);`,
    eaExpect: 't',
    after: `SELECT (SELECT archived_at IS NULL FROM public.children WHERE id = '${Z}')
      AND (SELECT removed_at IS NULL FROM public.child_group_memberships WHERE id = '${CGM_Z}')
      AND (SELECT ended_at IS NULL FROM public.child_programme_enrollments WHERE id = '${CPE_Z}')
      AND (SELECT unassigned_at IS NULL FROM public.group_ea_assignments WHERE id = '${uid('fb', 30)}')`,
    afterDescription: 'Z stays live in GZ for EA_B',
  },
  {
    id: 'race.class_archive_vs_new_holder',
    plan: 'T1 overlapping transactions (review finding 4)',
    holderSql: `
      SELECT id FROM public.classes WHERE id = '${KY}' FOR UPDATE;
      INSERT INTO public.class_ea_assignments (id, class_id, ea_user_id, programme_id, created_by) VALUES ('${uid('f9', 31)}', '${KY}', '${EA_B}', ${LIT}, '${HO}');`,
    eaSql: `WITH r AS (UPDATE public.classes SET archived_at = '${ARCHIVE_AT}', row_version = 2 WHERE id = '${KY}' RETURNING id) SELECT count(*) FROM r;`,
    eaExpect: '1',
    after: `SELECT (SELECT archived_at IS NULL FROM public.classes WHERE id = '${KY}')
      AND (SELECT unassigned_at IS NULL FROM public.class_ea_assignments WHERE id = '${uid('f9', 31)}')`,
    afterDescription: 'KY stays live for EA_B',
  },
];

const runRaces = async (databaseUrl, failures, summary) => {
  for (const [index, race] of raceCases.entries()) {
    // application_name is capped at 63 bytes; keep the polled labels short.
    const holderLabel = `race-holder-${index}`;
    const eaLabel = `race-ea-${index}`;
    const holder = runAsync({
      databaseUrl,
      label: holderLabel,
      sql: `BEGIN;\n${race.holderSql}\nSELECT pg_catalog.pg_sleep(3);\nCOMMIT;\n`,
    });
    const holderReady = await waitFor(databaseUrl, `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name = 'masi-history-rls-${holderLabel}' AND wait_event = 'PgSleep')`, `${race.id}-poll-holder`);
    const ea = runAsync({
      databaseUrl,
      label: eaLabel,
      sql: `BEGIN;\nSET LOCAL ROLE authenticated;\nSET LOCAL request.jwt.claim.sub = '${EA_A}';\n${race.eaSql}\nCOMMIT;\n`,
    });
    const eaBlocked = holderReady && await waitFor(databaseUrl, `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name = 'masi-history-rls-${eaLabel}' AND wait_event_type = 'Lock')`, `${race.id}-poll-ea`);
    const [holderResult, eaResult] = await Promise.all([holder, ea]);
    const eaValue = eaResult.stdout.split('\n').filter(Boolean).pop();
    const after = runPsql({ databaseUrl, sql: race.after, label: `${race.id}-after` });
    const problems = [];
    if (holderResult.status !== 0) problems.push(`holder failed: ${holderResult.stderr.trim()}`);
    if (!holderReady) problems.push('holder never reached its sleep');
    if (!eaBlocked) problems.push('the EA request did not wait on the holder\'s lock');
    if (eaResult.status !== 0) problems.push(`EA request failed: ${eaResult.stderr.trim()}`);
    else if (eaValue !== race.eaExpect) problems.push(`EA request returned ${eaValue}, expected ${race.eaExpect}`);
    if (after !== 't') problems.push(`final state wrong: expected ${race.afterDescription}`);
    summary.push({ id: race.id, plan: race.plan, status: problems.length ? 'FAIL' : 'pass', failures: problems.length });
    for (const p of problems) failures.push(`${race.id}: ${p}`);
  }
};

// ---------------------------------------------------------------------------------- main
const loadDatabase = ({ adminDatabaseUrl, databaseUrl, databaseName, lastMigration }) => {
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE);`, label: 'drop-stale-database' });
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `CREATE DATABASE ${quoteIdentifier(databaseName)};`, label: 'create-database' });
  runPsql({ databaseUrl, sql: bootstrapSql, label: 'bootstrap' });
  runPsql({ databaseUrl, sql: hostedDefaultPrivilegesSql, label: 'hosted-default-privileges' });
  const migrations = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
    .filter((f) => !lastMigration || f <= lastMigration);
  for (const filename of migrations) {
    runPsql({ databaseUrl, file: path.join(MIGRATIONS_DIR, filename), label: `migration-${filename}` });
  }
  runPsql({ databaseUrl, sql: helperSql, label: 'harness-helpers' });
  runPsql({ databaseUrl, sql: fixtureSql, label: 'fixture' });
  return migrations;
};

const main = async () => {
  const databaseName = process.env.HISTORY_RLS_DATABASE_NAME;
  const adminUrl = assertDisposableAdminTarget({
    adminDatabaseUrl: process.env.HISTORY_RLS_ADMIN_DATABASE_URL,
    databaseName,
    confirmation: process.env.HISTORY_RLS_DISPOSABLE_CONFIRM,
  });
  const baselineName = `${databaseName.slice(0, 58)}_base`;
  const adminDatabaseUrl = buildDatabaseUrl(adminUrl, 'postgres').href;
  const current = buildDatabaseUrl(adminUrl, databaseName).href;
  const baseline = buildDatabaseUrl(adminUrl, baselineName).href;
  const failures = [];
  const summary = [];
  try {
    const all = loadDatabase({ adminDatabaseUrl, databaseUrl: current, databaseName });
    const base = loadDatabase({ adminDatabaseUrl, databaseUrl: baseline, databaseName: baselineName, lastMigration: BASELINE_LAST_MIGRATION });
    assert.ok(base.length > 0 && base[base.length - 1] === BASELINE_LAST_MIGRATION, 'baseline migration missing');
    const referenceIds = (databaseUrl, label) => ({
      literacyId: runPsql({ databaseUrl, sql: "SELECT id FROM public.programmes WHERE code = 'literacy'", label: `${label}-literacy` }),
      numeracyId: runPsql({ databaseUrl, sql: "SELECT id FROM public.programmes WHERE code = 'numeracy'", label: `${label}-numeracy` }),
      yearId: runPsql({ databaseUrl, sql: 'SELECT id FROM public.academic_years WHERE is_active', label: `${label}-year` }),
      columnsByTable: runPsql({ databaseUrl, label: `${label}-columns`, sql: "SELECT table_name || '|' || column_name FROM information_schema.columns WHERE table_schema = 'public'" })
        .split('\n').reduce((map, line) => {
          const [table, column] = line.split('|');
          if (!map.has(table)) map.set(table, new Set());
          map.get(table).add(column);
          return map;
        }, new Map()),
    });
    // Programme and year ids are generated per database, so each database gets the same requests
    // built with its own reference ids.
    const baseIds = referenceIds(baseline, 'base');
    const curIds = referenceIds(current, 'current');
    const baseCases = [...buildCases(baseIds), ...WIRE_FILES.map((f) => wireCase(f, baseIds))];
    const curCases = [...buildCases(curIds), ...WIRE_FILES.map((f) => wireCase(f, curIds))];
    curCases.forEach((testCase, i) => {
      const baseCase = baseCases[i];
      assert.equal(baseCase.id, testCase.id);
      const baseOut = runScript({ databaseUrl: baseline, sql: caseSql(baseCase.steps, baseCase.prelude), label: `${testCase.id}-base` });
      const curOut = runScript({ databaseUrl: current, sql: caseSql(testCase.steps, testCase.prelude), label: testCase.id });
      if (testCase.id.startsWith('wire.')) evaluateWireCase(testCase, baseOut, curOut, failures, summary);
      else evaluateCase(testCase, baseOut, curOut, failures, summary);
    });
    catalogChecks(current, failures, summary);
    // Review follow-up 2: the plan lets S2 ship before S1/S3/S4, so it must apply alone onto the
    // baseline server (in a rolled-back transaction).
    {
      const s2 = fs.readFileSync(path.join(MIGRATIONS_DIR, '20261105120200_held_at_time_history_authority.sql'), 'utf8');
      const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-Atq', baseline], {
        input: `BEGIN;\n${s2}\nROLLBACK;\n`, encoding: 'utf8', env: buildPsqlEnv('s2-alone'), timeout: 180_000,
      });
      const ok = result.status === 0;
      summary.push({ id: 'migration.s2_applies_alone_on_baseline', plan: 'T1 review follow-up 2', status: ok ? 'pass' : 'FAIL', failures: ok ? 0 : 1 });
      if (!ok) failures.push(`migration.s2_applies_alone_on_baseline: ${(result.stderr || '').split('\n').filter((line) => /ERROR|DETAIL|HINT/.test(line)).join(' ')}`);
    }
    await runRaces(current, failures, summary);

    const passed = summary.filter((s) => s.status === 'pass').length;
    for (const s of summary) process.stdout.write(`${s.status === 'pass' ? 'pass' : 'FAIL'}  ${s.id}  [${s.plan}]\n`);
    process.stdout.write(`\n${passed}/${summary.length} lifecycle-compat cases passed (${all.length} migrations; baseline through ${BASELINE_LAST_MIGRATION})\n`);
    if (failures.length) {
      process.stdout.write(`\n${failures.length} failed assertions:\n${failures.map((f) => `  - ${f}`).join('\n')}\n`);
      process.exitCode = 1;
    }
  } finally {
    for (const name of [databaseName, baselineName]) {
      runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE);`, label: 'drop-database' });
    }
  }
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { BASELINE_LAST_MIGRATION, disposition1_5_0, compatViolation };
