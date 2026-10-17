#!/usr/bin/env node

// S2: prove the incident RPC and table grants against Supabase-style default ACLs.
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

const INCIDENT_MIGRATION = '20261017120000_mobile_support_incidents.sql';
const EA_A = '13000000-0000-0000-0000-000000000001';
const EA_B = '13000000-0000-0000-0000-000000000002';
const ORGANIZATION = 'a111879f-d066-47c9-95a1-bed2a400319a';
const SCHOOL = '21000000-0000-0000-0000-000000000001';
const quoteIdentifier = (identifier) => `"${identifier.replaceAll('"', '""')}"`;

const fixtureSql = `
INSERT INTO auth.users (id) VALUES ('${EA_A}'), ('${EA_B}');
INSERT INTO public.schools (id, name) VALUES ('${SCHOOL}', 'Support incident harness school');
INSERT INTO public.users (id, first_name, last_name, school_id, organization_id) VALUES
  ('${EA_A}', 'Incident', 'EA A', '${SCHOOL}', '${ORGANIZATION}'),
  ('${EA_B}', 'Incident', 'EA B', '${SCHOOL}', '${ORGANIZATION}');
`;

const installDefaultPrivileges = (databaseUrl) => {
  runPsql({ databaseUrl, label: 'supabase-default-privileges', sql: `
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
CREATE TABLE public.incident_harness_acl_control (id integer);
CREATE FUNCTION public.incident_harness_acl_control() RETURNS boolean
LANGUAGE sql AS 'SELECT true';
-- Remove PostgreSQL's PUBLIC function grant so the control proves the role defaults.
REVOKE ALL ON FUNCTION public.incident_harness_acl_control() FROM PUBLIC;
` });
  assert.equal(runPsql({ databaseUrl, label: 'default-acl-control', sql: `
SELECT bool_and(has_table_privilege(r.name, 'public.incident_harness_acl_control', p.name)),
       bool_and(has_function_privilege(r.name, 'public.incident_harness_acl_control()', 'EXECUTE'))
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(name)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(name);
` }), 't|t', 'default-acl-control: all three roles must inherit table writes and function execution');
  return { 'default-acl-control': 'passed' };
};

// Successful reports must survive the connection so later calls prove deduplication.
const asActor = (actorId, statement, commit = false) => `
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${actorId}';
${statement}
${commit ? 'COMMIT' : 'ROLLBACK'};
`;

const asAnon = (statement) => `
BEGIN;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claim.sub = '';
${statement}
ROLLBACK;
`;

// Match Supabase's BYPASSRLS role within this transaction only; shared bootstrap
// creates service_role as NOLOGIN, and no cluster-wide role change may survive.
const asServiceRole = (statement) => `
BEGIN;
ALTER ROLE service_role BYPASSRLS;
SET LOCAL ROLE service_role;
${statement}
ROLLBACK;
`;

const runCases = (databaseUrl) => {
  const summary = {};
  const checkValue = (label, sql, expected) => {
    assert.equal(runPsql({ databaseUrl, sql, label }), expected, label);
    summary[label] = 'passed';
  };
  const checkSqlState = (label, sql, sqlState) => {
    expectSqlState({ databaseUrl, sql, label, sqlState });
    summary[label] = 'passed';
  };
  const reportSql = `SELECT public.report_mobile_support_incident(
    'left_behind_unsent_work', 'i1:u1:o1',
    '{"strandedUserId":"u1","unsentByTable":{"children":2}}'::jsonb
  );`;
  const checkReport = (label, actorId, expectedResult, expectedCount) => {
    assert.equal(runPsql({ databaseUrl, label, sql: asActor(actorId, reportSql, true) }),
      expectedResult, `${label}: RPC result`);
    assert.equal(runPsql({ databaseUrl, label: `${label}-count`,
      sql: 'SELECT count(*) FROM public.mobile_support_incidents;',
    }), expectedCount, `${label}: persisted row count`);
    summary[label] = 'passed';
  };

  checkSqlState('anon-execute-refused', asAnon(
    "SELECT public.report_mobile_support_incident('left_behind_unsent_work', 'k1', '{}');"
  ), '42501');
  checkSqlState('no-subject-refused', asActor('',
    "SELECT public.report_mobile_support_incident('left_behind_unsent_work', 'k1', '{}');"
  ), '28000');
  checkReport('accepted', EA_A, 't', '1');
  checkReport('duplicate-recorded-once', EA_A, 'f', '1');
  checkReport('other-reporter-separate', EA_B, 't', '2');

  checkSqlState('unknown-kind-refused', asActor(EA_A,
    "SELECT public.report_mobile_support_incident('child_names', 'k1', '{}');"
  ), '22023');
  checkSqlState('blank-key-refused', asActor(EA_A,
    "SELECT public.report_mobile_support_incident('left_behind_unsent_work', '', '{}');"
  ), '22023');
  checkSqlState('long-key-refused', asActor(EA_A,
    "SELECT public.report_mobile_support_incident('left_behind_unsent_work', repeat('x', 513), '{}');"
  ), '22023');
  checkSqlState('non-object-refused', asActor(EA_A,
    "SELECT public.report_mobile_support_incident('left_behind_unsent_work', 'k1', '[1,2]');"
  ), '22023');
  checkSqlState('oversize-refused', asActor(EA_A,
    "SELECT public.report_mobile_support_incident('left_behind_unsent_work', 'k1', jsonb_build_object('p', repeat('x', 8200)));"
  ), '22023');

  checkSqlState('authenticated-select-refused', asActor(EA_A,
    'SELECT * FROM public.mobile_support_incidents;'
  ), '42501');
  checkSqlState('anon-select-refused', asAnon(
    'SELECT * FROM public.mobile_support_incidents;'
  ), '42501');
  for (const [label, role, expected] of [
    ['authenticated-no-table-grants', 'authenticated', 'f|f|f|f'],
    ['service-role-select-only', 'service_role', 't|f|f|f'],
  ]) {
    checkValue(label, `SELECT ${['SELECT', 'INSERT', 'UPDATE', 'DELETE'].map((privilege) =>
      `has_table_privilege('${role}', 'public.mobile_support_incidents', '${privilege}')`
    ).join(', ')};`, expected);
  }
  // Only authenticated may execute; the default ACL granted it to all three roles.
  checkValue('rpc-execute-authenticated-only', `SELECT ${['anon', 'authenticated', 'service_role', 'public'].map((role) =>
    `has_function_privilege('${role}', 'public.report_mobile_support_incident(text, text, jsonb)', 'EXECUTE')`
  ).join(', ')};`, 'f|t|f|f');
  checkValue('service-role-reads', asServiceRole(
    'SELECT count(*) FROM public.mobile_support_incidents;'
  ), '2');
  checkValue('stored-reporter', asServiceRole(
    "SELECT reporter_id FROM public.mobile_support_incidents WHERE repeat_key = 'i1:u1:o1' ORDER BY reporter_id;"
  ), `${EA_A}\n${EA_B}`);
  return summary;
};

const main = () => {
  const baseName = process.env.HISTORY_RLS_DATABASE_NAME;
  const databaseName = baseName ? `${baseName}_incident` : baseName;
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
    const aclSummary = installDefaultPrivileges(databaseUrl);
    const priorMigrations = fs.readdirSync(MIGRATIONS_DIR)
      .filter((filename) => filename.endsWith('.sql') && filename < INCIDENT_MIGRATION)
      .sort();
    for (const filename of priorMigrations) {
      runPsql({ databaseUrl, file: path.join(MIGRATIONS_DIR, filename), label: `migration-${filename}` });
    }
    runPsql({ databaseUrl, sql: fixtureSql, label: 'support-incident-fixture' });
    // Explicit read preserves the required missing-migration RED failure.
    const migrationSql = fs.readFileSync(path.join(MIGRATIONS_DIR, INCIDENT_MIGRATION), 'utf8');
    // The brief requires this atomic harness wrapper. CLI application itself is
    // outside an explicit transaction, so the migration uses session SET/RESET.
    runPsql({ databaseUrl, sql: `BEGIN;\n${migrationSql}\nCOMMIT;\n`, label: `migration-${INCIDENT_MIGRATION}` });
    process.stdout.write(`${JSON.stringify({ ...aclSummary, ...runCases(databaseUrl) })}\n`);
  } finally {
    runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-database' });
  }
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { INCIDENT_MIGRATION, fixtureSql, installDefaultPrivileges, runCases };
