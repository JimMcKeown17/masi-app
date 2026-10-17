#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MIGRATIONS_DIR, assertDisposableAdminTarget, bootstrapSql, buildDatabaseUrl, expectSqlState, runPsql,
} = require('./history-authorization-postgres-harness.cjs');

const ACCESS_MIGRATION = '20261018120000_ea_access_suspension.sql';
const ACTIVE = '14000000-0000-0000-0000-000000000001';
const INACTIVE = '14000000-0000-0000-0000-000000000002';
const EXTERNAL_BAN = '14000000-0000-0000-0000-000000000003';
const NO_PROFILE = '14000000-0000-0000-0000-000000000004';
const ROLLBACK = '14000000-0000-0000-0000-000000000005';
const MISSING = '14000000-0000-0000-0000-000000000099';
const asRole = (role, sql) => `BEGIN; SET LOCAL ROLE ${role}; ${sql} ROLLBACK;`;
const call = (action, id) => `private.${action}_ea('${id}', 'Harness access review', 'Disposable harness')`;

const fixtureSql = `
INSERT INTO auth.users (id, email) VALUES
  ('${ACTIVE}', 'active@example.test'), ('${INACTIVE}', 'inactive@example.test'),
  ('${EXTERNAL_BAN}', 'external@example.test'), ('${NO_PROFILE}', 'no-profile@example.test'),
  ('${ROLLBACK}', 'rollback@example.test');
INSERT INTO public.users (id, first_name, last_name, organization_id, is_active) VALUES
  ('${ACTIVE}', 'Harness', 'Active', 'a111879f-d066-47c9-95a1-bed2a400319a', true),
  ('${INACTIVE}', 'Harness', 'Inactive', 'a111879f-d066-47c9-95a1-bed2a400319a', false),
  ('${EXTERNAL_BAN}', 'Harness', 'External', 'a111879f-d066-47c9-95a1-bed2a400319a', false),
  ('${ROLLBACK}', 'Harness', 'Rollback', 'a111879f-d066-47c9-95a1-bed2a400319a', true);
UPDATE auth.users SET banned_until = now() + interval '1 year' WHERE id = '${EXTERNAL_BAN}';
`;

const installDefaultPrivileges = (databaseUrl) => {
  runPsql({ databaseUrl, label: 'private-default-acls', sql: `
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA private GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA private GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
CREATE TABLE private.ea_access_acl_control (id integer);
CREATE FUNCTION private.ea_access_acl_control() RETURNS boolean LANGUAGE sql AS 'SELECT true';
REVOKE ALL ON FUNCTION private.ea_access_acl_control() FROM PUBLIC;
` });
  assert.equal(runPsql({ databaseUrl, label: 'default-acl-control', sql: `
SELECT bool_and(has_table_privilege(r, 'private.ea_access_acl_control', p)),
       bool_and(has_function_privilege(r, 'private.ea_access_acl_control()', 'EXECUTE'))
FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) r
CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p;
` }), 't|t');
};

const runCases = (databaseUrl) => {
  const summary = {};
  const value = (label, sql, expected) => {
    assert.equal(runPsql({ databaseUrl, label, sql }), expected, label);
    summary[label] = 'passed';
  };
  const refused = (label, sql, sqlState, message) => {
    const error = expectSqlState({ databaseUrl, label, sql, sqlState });
    if (message) assert.match(error, new RegExp(message), label);
    summary[label] = 'passed';
  };
  value('suspend-bans-deactivates-audits', `SELECT action, was_active_before, is_active_after,
    banned_until_before IS NULL, banned_until_after > now() + interval '24 hours'
    FROM ${call('suspend', ACTIVE)};`, 'suspend|t|f|t|t');
  value('suspend-persisted', `SELECT s.banned_until > now() + interval '24 hours', s.is_active,
    s.latest_event->>'reason', (SELECT count(*) FROM private.ea_access_events WHERE user_id = '${ACTIVE}')
    FROM private.ea_access_status('${ACTIVE}') s;`, 't|f|Harness access review|1');
  value('repeat-suspend-records-actual-inactive-state', `SELECT was_active_before, is_active_after,
    banned_until_after >= banned_until_before FROM ${call('suspend', ACTIVE)};`, 'f|f|t');
  value('repeat-suspend-preserves-restoration-baseline', `SELECT restore_is_active,
    latest_event->>'was_active_before' FROM private.ea_access_status('${ACTIVE}');`, 't|false');
  value('active-double-suspend-restore-ends-active', `SELECT action, was_active_before, is_active_after,
    banned_until_after IS NULL FROM ${call('restore', ACTIVE)};`, 'restore|f|t|t');
  value('restore-persisted-and-audited', `SELECT banned_until IS NULL, is_active,
    latest_event->>'action', restore_is_active IS NULL FROM private.ea_access_status('${ACTIVE}');`, 't|t|restore|t');
  refused('restore-twice-refused', `SELECT * FROM ${call('restore', ACTIVE)};`, 'PE003', 'restore_not_available');
  refused('external-ban-restore-refused', `SELECT * FROM ${call('restore', EXTERNAL_BAN)};`, 'PE003', 'restore_not_available');
  value('external-ban-unchanged', `SELECT banned_until > now(), is_active,
    latest_event IS NULL FROM private.ea_access_status('${EXTERNAL_BAN}');`, 't|f|t');

  value('inactive-double-suspend-restore-stays-inactive', `BEGIN;
    SELECT action FROM ${call('suspend', INACTIVE)};
    SELECT action FROM ${call('suspend', INACTIVE)};
    SELECT restore_is_active FROM private.ea_access_status('${INACTIVE}');
    SELECT is_active_after, banned_until_after IS NULL FROM ${call('restore', INACTIVE)};
    COMMIT;`, 'suspend\nsuspend\nf\nf|t');
  value('same-transaction-events-have-strict-order', `SELECT count(*), count(DISTINCT created_at),
    string_agg(action, ',' ORDER BY created_at) FROM private.ea_access_events WHERE user_id = '${INACTIVE}';`, '3|3|suspend,suspend,restore');
  value('new-run-uses-new-baseline', `UPDATE public.users SET is_active = false WHERE id = '${ACTIVE}';
    SELECT action FROM ${call('suspend', ACTIVE)};
    SELECT is_active_after FROM ${call('restore', ACTIVE)};`, 'suspend\nf');

  for (const action of ['suspend', 'restore']) {
    refused(`${action}-missing-auth-refused`, `SELECT * FROM ${call(action, MISSING)};`, 'PE001', 'ea_not_found');
    refused(`${action}-missing-profile-refused`, `SELECT * FROM ${call(action, NO_PROFILE)};`, 'PE002', 'ea_profile_not_found');
  }
  value('missing-profile-refusal-does-not-ban', `SELECT banned_until IS NULL FROM auth.users WHERE id = '${NO_PROFILE}';`, 't');
  for (const [label, reason, operator] of [
    ['blank-reason', "' '", "'Operator'"], ['long-reason', "repeat('x', 1001)", "'Operator'"],
    ['blank-operator', "'Review'", "''"], ['long-operator', "'Review'", "repeat('x', 201)"],
  ]) {
    refused(label, `SELECT * FROM private.suspend_ea('${ROLLBACK}', ${reason}, ${operator});`, '22023');
  }

  runPsql({ databaseUrl, label: 'inject-audit-failure', sql: `
CREATE FUNCTION private.ea_access_harness_fail() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'injected audit failure' USING ERRCODE = '23514'; END; $$;
CREATE TRIGGER ea_access_harness_fail BEFORE INSERT ON private.ea_access_events
FOR EACH ROW EXECUTE FUNCTION private.ea_access_harness_fail();` });
  try {
    refused('audit-failure-refuses-entire-suspension', `SELECT * FROM ${call('suspend', ROLLBACK)};`, '23514');
    value('audit-failure-rolls-back-auth-and-profile', `SELECT banned_until IS NULL, is_active,
      latest_event IS NULL FROM private.ea_access_status('${ROLLBACK}');`, 't|t|t');
  } finally {
    runPsql({ databaseUrl, label: 'remove-audit-failure', sql: `
DROP TRIGGER ea_access_harness_fail ON private.ea_access_events;
DROP FUNCTION private.ea_access_harness_fail();` });
  }

  value('audit-rls-without-policies', `SELECT relrowsecurity,
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'private' AND tablename = 'ea_access_events')
    FROM pg_class WHERE oid = 'private.ea_access_events'::regclass;`, 't|0');
  const functions = [
    ['suspend', `SELECT action FROM ${call('suspend', ROLLBACK)};`, 'suspend'],
    ['status', `SELECT is_active FROM private.ea_access_status('${ROLLBACK}');`, 't'],
    ['restore', `SELECT action FROM ${call('suspend', ROLLBACK)}; SELECT action FROM ${call('restore', ROLLBACK)};`, 'suspend\nrestore'],
  ];
  for (const role of ['anon', 'authenticated']) {
    refused(`${role}-audit-select-refused`, asRole(role, 'SELECT * FROM private.ea_access_events;'), '42501');
    for (const [name, sql] of functions) {
      const deniedSql = name === 'restore' ? `SELECT action FROM ${call('restore', ROLLBACK)};` : sql;
      refused(`${role}-${name}-execute-refused`, asRole(role, deniedSql), '42501');
    }
  }
  for (const [name, sql, expected] of functions) value(`service-role-${name}-executes`, asRole('service_role', sql), expected);
  for (const [name, signature] of [
    ['suspend', 'private.suspend_ea(uuid,text,text)'], ['restore', 'private.restore_ea(uuid,text,text)'],
    ['status', 'private.ea_access_status(uuid)'],
  ]) {
    value(`${name}-execute-service-only`, `SELECT ${['public', 'anon', 'authenticated', 'authenticator', 'service_role']
      .map(role => `has_function_privilege('${role}', '${signature}', 'EXECUTE')`).join(',')};`, 'f|f|f|f|t');
  }
  value('no-direct-api-role-audit-grants', `SELECT bool_and(NOT has_table_privilege(r, 'private.ea_access_events', p))
    FROM unnest(ARRAY['anon','authenticated','service_role','authenticator']) r
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p;`, 't');
  value('functions-use-definer-with-empty-search-path', `SELECT count(*) FROM pg_proc
    WHERE oid IN ('private.suspend_ea(uuid,text,text)'::regprocedure,
      'private.restore_ea(uuid,text,text)'::regprocedure, 'private.ea_access_status(uuid)'::regprocedure)
    AND prosecdef AND proconfig @> ARRAY['search_path=""'];`, '3');
  return summary;
};

const main = () => {
  const databaseName = process.env.HISTORY_RLS_DATABASE_NAME && `${process.env.HISTORY_RLS_DATABASE_NAME}_ea_access`;
  const adminUrl = assertDisposableAdminTarget({
    adminDatabaseUrl: process.env.HISTORY_RLS_ADMIN_DATABASE_URL, databaseName,
    confirmation: process.env.HISTORY_RLS_DISPOSABLE_CONFIRM,
  });
  const adminDatabaseUrl = buildDatabaseUrl(adminUrl, 'postgres').href;
  const databaseUrl = buildDatabaseUrl(adminUrl, databaseName).href;
  const quotedDatabase = `"${databaseName}"`;
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-stale-database' });
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `CREATE DATABASE ${quotedDatabase};`, label: 'create-database' });
  try {
    runPsql({ databaseUrl, sql: bootstrapSql + '\nALTER TABLE auth.users ADD COLUMN email text, ADD COLUMN banned_until timestamptz;', label: 'bootstrap' });
    for (const filename of fs.readdirSync(MIGRATIONS_DIR).filter(name => name.endsWith('.sql') && name < ACCESS_MIGRATION).sort()) {
      runPsql({ databaseUrl, file: path.join(MIGRATIONS_DIR, filename), label: `migration-${filename}` });
    }
    installDefaultPrivileges(databaseUrl);
    // Explicit read keeps a missing migration a hard failure rather than a skipped case.
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, ACCESS_MIGRATION), 'utf8');
    runPsql({ databaseUrl, sql, label: 'ea-access-migration' });
    runPsql({ databaseUrl, sql, label: 'ea-access-migration-idempotent-replay' });
    runPsql({ databaseUrl, sql: fixtureSql, label: 'ea-access-fixture' });
    const summary = { 'default-acl-control': 'passed', 'migration-idempotent-replay': 'passed', ...runCases(databaseUrl) };
    const eventsBefore = runPsql({ databaseUrl, sql: 'SELECT jsonb_agg(e ORDER BY created_at, id) FROM private.ea_access_events e;', label: 'audit-before-replay' });
    runPsql({ databaseUrl, sql, label: 'migration-replay-with-audit-history' });
    assert.equal(runPsql({ databaseUrl, sql: 'SELECT jsonb_agg(e ORDER BY created_at, id) FROM private.ea_access_events e;', label: 'audit-after-replay' }), eventsBefore);
    summary['migration-replay-preserves-audit-history'] = 'passed';
    process.stdout.write(`${JSON.stringify({ checks: Object.keys(summary).length, results: summary })}\n`);
  } finally {
    runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-database' });
  }
};

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { ACCESS_MIGRATION, fixtureSql, installDefaultPrivileges, runCases };
