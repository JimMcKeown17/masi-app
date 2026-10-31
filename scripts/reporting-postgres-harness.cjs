#!/usr/bin/env node
// Local PostgreSQL 17 only. No hosted database or credentials are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MIGRATIONS_DIR, assertDisposableAdminTarget, buildDatabaseUrl,
  bootstrapSql, runPsql, expectSqlState,
} = require('./history-authorization-postgres-harness.cjs');
const { installDefaultPrivileges } = require('./support-incident-postgres-harness.cjs');

// Fixed fixture identities; later tasks extend this block and seedFixture.
const UUID_EA_A = '14000000-0000-0000-0000-000000000001';
const UUID_EA_B = '14000000-0000-0000-0000-000000000002';
const UUID_EA_LATE = '14000000-0000-0000-0000-000000000003';
const UUID_EA_LEDGER = '14000000-0000-0000-0000-000000000004';
const UUID_EA_SUSP = '14000000-0000-0000-0000-000000000005';
const UUID_EA_TEST = '14000000-0000-0000-0000-000000000006';
const UUID_EA_NOPROG = '14000000-0000-0000-0000-000000000007';
const UUID_SCHOOL_1 = '24000000-0000-0000-0000-000000000001';
const UUID_SCHOOL_2 = '24000000-0000-0000-0000-000000000002';
const UUID_C1 = '54000000-0000-0000-0000-000000000001';
const UUID_CORRECTION = '64000000-0000-0000-0000-000000000001';
const UUID_CURRENT_CORRECTION = '64000000-0000-0000-0000-000000000002';
const UUID_SESSION_A = '84000000-0000-0000-0000-000000000001';
const UUID_SESSION_LATE = '84000000-0000-0000-0000-000000000002';
const UUID_ORGANIZATION = 'a111879f-d066-47c9-95a1-bed2a400319a';

const REPORTING_FUNCTIONS = ['public.masi_reporting_accounts_v1()'];
// Computed on a fully replayed schema (2026-10-31): the only non-reporting function the reader can
// EXECUTE is the PUBLIC-executable trigger function below; the reader has no USAGE on private and
// trigger functions cannot be called directly. Each entry has a refusal case in runCases.
const AUTH_GUARDED_ALLOWLIST = ['private.set_updated_at()'];
const T_LEDGER = '2026-10-29T09:00:00Z';
const READER_SQL = (sql) => `BEGIN READ ONLY; SET LOCAL ROLE masi_reporting_reader; ${sql}\nROLLBACK;`;
// runPsql and expectSqlState inherit PGTZ through their shared buildPsqlEnv.
process.env.PGTZ = 'UTC';
const asReader = (databaseUrl, sql) => runPsql({ databaseUrl, sql: READER_SQL(sql), label: 'as-reader' });

function seedFixture(databaseUrl) {
  const ids = [UUID_EA_A, UUID_EA_B, UUID_EA_LATE, UUID_EA_LEDGER, UUID_EA_SUSP, UUID_EA_TEST, UUID_EA_NOPROG];
  runPsql({ databaseUrl, label: 'reporting-fixture', sql: `
INSERT INTO auth.users(id) VALUES ${ids.map((id) => `('${id}')`).join(',')};
UPDATE auth.users SET banned_until = '2099-01-01T00:00:00Z' WHERE id = '${UUID_EA_SUSP}';
UPDATE auth.users SET raw_app_meta_data = '{"is_test_account":true}' WHERE id = '${UUID_EA_TEST}';
INSERT INTO public.schools(id,name,school_uid) VALUES
 ('${UUID_SCHOOL_1}','Reporting school 1','REPORTING-001'), ('${UUID_SCHOOL_2}','Reporting school 2',NULL);
INSERT INTO public.users(id,first_name,last_name,organization_id,school_id)
VALUES ${ids.map((id, i) => `('${id}','Reporting','EA ${i}','${UUID_ORGANIZATION}','${UUID_SCHOOL_1}')`).join(',')};
UPDATE public.academic_years SET is_active = false WHERE is_active AND label <> '2026';
INSERT INTO public.academic_years(label,starts_on,ends_on,is_active) VALUES ('2026','2026-01-01','2026-12-31',true)
ON CONFLICT(label) DO UPDATE SET starts_on=excluded.starts_on, ends_on=excluded.ends_on, is_active=true;
UPDATE public.programmes SET daily_session_target = CASE code WHEN 'literacy' THEN 3 WHEN 'numeracy' THEN 5 WHEN 'yeboneer' THEN 1 END
WHERE code IN ('literacy','numeracy','yeboneer');
INSERT INTO public.staff_programme_assignments(user_id,programme_id,school_id,assigned_at)
VALUES ('${UUID_EA_A}',(SELECT id FROM public.programmes WHERE code='literacy'),'${UUID_SCHOOL_1}','2026-09-01T00:00:00Z');
INSERT INTO public.children(id,first_name,last_name,created_by) VALUES ('${UUID_C1}','Reporting','Child','${UUID_EA_A}');
INSERT INTO public.letter_mastery_corrections(correction_id,child_id,letter,language,confirmed,requested_at,effective_at,changed_by,received_at)
VALUES ('${UUID_CORRECTION}','${UUID_C1}','s','en',true,'${T_LEDGER}','${T_LEDGER}','${UUID_EA_LEDGER}','${T_LEDGER}');
INSERT INTO public.letter_mastery(id,child_id,letter,language,confirmed,changed_at,correction_id,changed_by)
VALUES (private.letter_mastery_id('${UUID_C1}','s','en'),'${UUID_C1}','s','en',false,'2026-10-30T09:00:00Z','${UUID_CURRENT_CORRECTION}','${UUID_EA_B}');
INSERT INTO public.mobile_support_incidents(reporter_id,kind,repeat_key,report_id,payload,observed)
VALUES ('${UUID_EA_A}','diagnostics_sent','reporting-fixture',gen_random_uuid(),'{}',
 '{"application":{"version":"1.5.0","build":"55"},"device":{"platform":"android"}}');
INSERT INTO public.sessions(id,user_id,programme_id,session_date,created_at)
VALUES ('${UUID_SESSION_A}','${UUID_EA_A}',(SELECT id FROM public.programmes WHERE code='literacy'),'2026-10-20','2026-10-20T08:00:00Z');
` });
  // INSERT and SELECT share a transaction: server INSERT stamp and captured now()
  // are exactly equal, including microseconds (no JavaScript date round-trip).
  const T_LATE = runPsql({ databaseUrl, label: 'late-upload-fixture', sql: `BEGIN;
INSERT INTO public.sessions(id,user_id,programme_id,session_date,created_at)
VALUES ('${UUID_SESSION_LATE}','${UUID_EA_LATE}',(SELECT id FROM public.programmes WHERE code='literacy'),'2026-10-13','2026-10-13T08:00:00Z');
SELECT pg_catalog.now()::text;
COMMIT;` });
  return { T_LATE };
}

function runCases(databaseUrl, { T_LATE }) {
  const summary = {};
  const c = {
    value(name, sql, expected) {
      assert.equal(runPsql({ databaseUrl, sql, label: name }), expected, name);
      summary[name] = 'passed';
    },
    state(name, sql, sqlState) {
      expectSqlState({ databaseUrl, sql, label: name, sqlState });
      summary[name] = 'passed';
    },
  };
  const account = (id, expression) => `SELECT ${expression} FROM
jsonb_array_elements(public.masi_reporting_accounts_v1()->'accounts') a WHERE a->>'user_id'='${id}';`;
  c.value('accounts-shape', `SELECT jsonb_agg(k ORDER BY k)::text FROM
jsonb_object_keys(public.masi_reporting_accounts_v1()) k;`, '["academic_year", "accounts", "function_version", "generated_at", "programmes", "schools"]');
  c.value('accounts-ea-a', account(UUID_EA_A, "a#>>'{assignment,programme_code}'"), 'literacy');
  c.value('accounts-received-uses-server-time', account(UUID_EA_LATE,
    `(a#>>'{activity,last_data_received_at}')::timestamptz = '${T_LATE}'::timestamptz`), 't');
  c.value('accounts-received-ledger', account(UUID_EA_LEDGER,
    `(a#>>'{activity,last_data_received_at}')::timestamptz = '${T_LEDGER}'::timestamptz`), 't');
  c.value('accounts-received-never', account(UUID_EA_NOPROG, "a#>'{activity,last_data_received_at}' = 'null'::jsonb"), 't');
  c.value('accounts-test-flag', account(UUID_EA_TEST, "a#>>'{auth,is_test_flag}'"), 'true');
  c.value('accounts-release', account(UUID_EA_A, "a#>>'{last_receipt,app_version}'"), '1.5.0');
  c.value('accounts-noprog', account(UUID_EA_NOPROG, "a->'assignment' = 'null'::jsonb"), 't');
  assert.equal(asReader(databaseUrl, "SELECT public.masi_reporting_accounts_v1()->>'function_version';"), 'masi_reporting_accounts_v1');
  summary['reader-exec'] = 'passed';
  for (const role of ['anon', 'authenticated', 'service_role']) {
    c.value(`${role.replaceAll('_', '-')}-denied`, `SELECT has_function_privilege('${role}','public.masi_reporting_accounts_v1()','EXECUTE');`, 'f');
  }
  c.value('reader-no-table-select', `SELECT count(*) FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname IN ('public','private','auth','storage') AND t.relkind IN ('r','p','v','m','f')
AND has_table_privilege('masi_reporting_reader',t.oid,'SELECT,INSERT,UPDATE,DELETE');`, '0');
  c.value('reader-executable-functions', `SELECT coalesce(jsonb_agg(signature ORDER BY signature),'[]') =
'${JSON.stringify([...REPORTING_FUNCTIONS, ...AUTH_GUARDED_ALLOWLIST].sort())}'::jsonb FROM
(SELECT n.nspname || '.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','private') AND has_function_privilege('masi_reporting_reader',p.oid,'EXECUTE')) f;`,
    't');
  // This RPC is explicitly revoked from PUBLIC, so the expected refusal is ACL denial.
  c.state('reader-submit-assessment-refused', READER_SQL("SELECT public.submit_assessment('{}','[]');"), '42501');
  c.state('reader-set-updated-at-refused', READER_SQL('SELECT private.set_updated_at();'), '42501');
  // Each future allowlist entry must also add an explicit auth-null refusal case.
  c.value('audit-atomic-bodies', `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname LIKE 'masi\\_reporting\\_%\\_v1' AND p.prosqlbody IS NULL;`, '0');
  const dependencies = `SELECT count(*) FROM pg_depend d JOIN pg_proc f ON f.oid=d.objid
WHERE d.classid='pg_proc'::regclass AND f.proname LIKE 'masi\\_reporting\\_%' AND d.refclassid='pg_proc'::regclass;`;
  c.value('audit-no-user-function-deps', dependencies, '0');
  c.value('audit-denylist', `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname LIKE 'masi\\_reporting\\_%\\_v1'
AND lower(pg_get_functiondef(p.oid)) ~ '(nextval|setval|set_config|pg_advisory|lo_|pg_notify|dblink|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_read_file|pg_ls_dir|pg_stat_reset)';`, '0');
  c.value('audit-negative-control', `BEGIN;
CREATE FUNCTION public.masi_reporting_probe_v0() RETURNS void LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
BEGIN ATOMIC SELECT private.close_overdue_time_entries(); END;
${dependencies}
DROP FUNCTION public.masi_reporting_probe_v0(); ROLLBACK;`, '1');
  c.value('reader-login-no-password', "SELECT rolpassword IS NULL AND rolcanlogin AND NOT rolinherit FROM pg_authid WHERE rolname='masi_reporting_reader';", 't');
  c.value('reader-role-settings', `SELECT count(*) FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole
WHERE r.rolname='masi_reporting_reader' AND s.setdatabase=0
AND s.setconfig @> ARRAY['default_transaction_read_only=on','statement_timeout=15s'];`, '1');
  return summary;
}

function main() {
  const databaseName = process.env.MASI_REPORTING_DATABASE_NAME;
  const adminUrl = assertDisposableAdminTarget({
    adminDatabaseUrl: process.env.MASI_REPORTING_ADMIN_DATABASE_URL,
    databaseName, confirmation: process.env.MASI_REPORTING_DISPOSABLE_CONFIRM,
  });
  const adminDatabaseUrl = buildDatabaseUrl(adminUrl, 'postgres').href;
  const databaseUrl = buildDatabaseUrl(adminUrl, databaseName).href;
  // assertDisposableAdminTarget has already restricted the identifier alphabet.
  const quotedDatabase = `"${databaseName}"`;
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-stale-database' });
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `CREATE DATABASE ${quotedDatabase};`, label: 'create-database' });
  try {
    runPsql({ databaseUrl, sql: `${bootstrapSql}
ALTER TABLE auth.users ADD COLUMN raw_app_meta_data jsonb NOT NULL DEFAULT '{}',
ADD COLUMN last_sign_in_at timestamptz, ADD COLUMN email_confirmed_at timestamptz;`, label: 'bootstrap' });
    // Model Supabase's API-role default ACLs with the existing harness helper.
    installDefaultPrivileges(databaseUrl);
    for (const filename of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
      runPsql({ databaseUrl, file: path.join(MIGRATIONS_DIR, filename), label: `migration-${filename}` });
    }
    const fixture = seedFixture(databaseUrl);
    const summary = runCases(databaseUrl, fixture);
    process.stdout.write(`${JSON.stringify({ cases: Object.keys(summary).length, ...summary })}\n`);
  } finally {
    runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-database' });
  }
}
if (require.main === module) main();
module.exports = { seedFixture, asReader, runCases, main, REPORTING_FUNCTIONS, AUTH_GUARDED_ALLOWLIST };
