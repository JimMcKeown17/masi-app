#!/usr/bin/env node

// Task 1: replay up to the organisation-label migration with a pre-existing EA,
// then prove the backfill, required identity, grants, and unchanged profile read.
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

const ORGANISATION_MIGRATION = '20261014120000_organisation_label_v1.sql';
const ORGANIZATION = 'a111879f-d066-47c9-95a1-bed2a400319a';
const FIXTURE_USER = '12000000-0000-0000-0000-000000000001';
const NEW_USER = '12000000-0000-0000-0000-000000000002';
const UNKNOWN_ORGANIZATION = '12000000-0000-0000-0000-000000000099';
const SCHOOL = '21000000-0000-0000-0000-000000000001';
const quoteIdentifier = (identifier) => `"${identifier.replaceAll('"', '""')}"`;

// The user must exist before the new column does. In particular, do not UPDATE
// the fixture to set its timestamp: users has a before-update timestamp trigger.
const fixtureSql = `
INSERT INTO auth.users (id) VALUES ('${FIXTURE_USER}');
INSERT INTO public.schools (id, name) VALUES ('${SCHOOL}', 'Upload contract harness school');
INSERT INTO public.users (id, first_name, last_name, school_id, updated_at)
VALUES ('${FIXTURE_USER}', 'Organisation', 'EA', '${SCHOOL}', '2026-01-01T00:00:00Z');
`;

const asActor = (actorId, statement) => `
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${actorId}';
${statement}
ROLLBACK;
`;

// Supabase's service_role has BYPASSRLS. The shared bootstrap only creates a
// NOLOGIN role, so model that attribute in this transaction and roll it back
// with the query; no cluster-wide role change survives the check.
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

  checkValue(
    'existing-user-organization',
    `SELECT organization_id FROM public.users WHERE id = '${FIXTURE_USER}';`,
    ORGANIZATION,
  );
  checkValue(
    'existing-user-updated-at-unchanged',
    `SELECT updated_at FROM public.users WHERE id = '${FIXTURE_USER}';`,
    '2026-01-01 00:00:00+00',
  );
  checkValue(
    'organization-not-null',
    `SELECT is_nullable FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'organization_id';`,
    'NO',
  );
  checkValue(
    'organization-no-default',
    `SELECT column_default IS NULL FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'organization_id';`,
    't',
  );

  // Each rejected insert has a real auth parent and all other required fields.
  // A psql error closes the connection and rolls back the transaction too.
  checkSqlState('missing-organization-refused', `
BEGIN;
INSERT INTO auth.users (id) VALUES ('${NEW_USER}');
INSERT INTO public.users (id, first_name, last_name, school_id)
VALUES ('${NEW_USER}', 'Missing', 'Organisation', '${SCHOOL}');
ROLLBACK;
`, '23502');
  checkSqlState('unknown-organization-refused', `
BEGIN;
INSERT INTO auth.users (id) VALUES ('${NEW_USER}');
INSERT INTO public.users (id, first_name, last_name, school_id, organization_id)
VALUES ('${NEW_USER}', 'Unknown', 'Organisation', '${SCHOOL}', '${UNKNOWN_ORGANIZATION}');
ROLLBACK;
`, '23503');

  checkSqlState(
    'authenticated-organizations-refused',
    asActor(FIXTURE_USER, 'SELECT * FROM public.organizations;'),
    '42501',
  );
  checkSqlState('anon-organizations-refused', `
BEGIN;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claim.sub = '';
SELECT * FROM public.organizations;
ROLLBACK;
`, '42501');
  checkValue(
    'service-role-organization-slug',
    asServiceRole('SELECT slug FROM public.organizations;'),
    'masinyusane',
  );

  for (const role of ['authenticated', 'anon', 'authenticator']) {
    checkValue(
      `${role}-no-select-grant`,
      `SELECT has_table_privilege('${role}', 'public.organizations', 'SELECT');`,
      'f',
    );
  }
  for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
    checkValue(
      `service-role-${privilege.toLowerCase()}-grant`,
      asServiceRole(`SELECT has_table_privilege('service_role', 'public.organizations', '${privilege}');`),
      privilege === 'SELECT' ? 't' : 'f',
    );
  }

  // Preserve the app's full users projection and both LEFT JOINs. row_to_json
  // only transports the result to Node; organization_id must come from u.*.
  const profileRows = runPsql({
    databaseUrl,
    label: 'authenticated-profile-read',
    sql: asActor(FIXTURE_USER, `
SELECT row_to_json(profile) FROM (
  SELECT u.*, s.id, s.name, j.id, j.name, j.code
  FROM public.users u
  LEFT JOIN public.schools s ON s.id = u.school_id
  LEFT JOIN public.job_titles j ON j.id = u.job_title_id
  WHERE u.id = '${FIXTURE_USER}'
) profile;
`),
  }).split('\n').filter(Boolean).map((row) => JSON.parse(row));
  assert.equal(profileRows.length, 1, 'The authenticated EA must read exactly one own profile');
  summary['authenticated-profile-one-row'] = 'passed';
  assert.equal(profileRows[0].organization_id, ORGANIZATION, 'The full profile must include organization_id');
  summary['authenticated-profile-organization'] = 'passed';
  return summary;
};

const main = () => {
  const baseName = process.env.HISTORY_RLS_DATABASE_NAME;
  const databaseName = baseName ? `${baseName}_org` : baseName;
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
    const priorMigrations = fs.readdirSync(MIGRATIONS_DIR)
      .filter((filename) => filename.endsWith('.sql') && filename < ORGANISATION_MIGRATION)
      .sort();
    for (const filename of priorMigrations) {
      runPsql({ databaseUrl, file: path.join(MIGRATIONS_DIR, filename), label: `migration-${filename}` });
    }
    runPsql({ databaseUrl, sql: fixtureSql, label: 'organisation-label-fixture' });
    // Apply explicitly so the RED run fails if this file is absent. Later
    // migrations are excluded: these checks pin this migration's own effect.
    runPsql({ databaseUrl, file: path.join(MIGRATIONS_DIR, ORGANISATION_MIGRATION), label: `migration-${ORGANISATION_MIGRATION}` });
    process.stdout.write(`${JSON.stringify(runCases(databaseUrl))}\n`);
  } finally {
    runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-database' });
  }
};

if (require.main === module) {
  main();
}

module.exports = { ORGANISATION_MIGRATION, fixtureSql, runCases };
