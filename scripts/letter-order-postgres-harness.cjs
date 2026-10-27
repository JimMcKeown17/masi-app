#!/usr/bin/env node

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

const LETTER_ORDER_MIGRATION = '20261027120000_class_letter_order_edition.sql';
const MIGRATION_VERSION = LETTER_ORDER_MIGRATION.split('_')[0];
const HEAD_OFFICE = '16000000-0000-0000-0000-000000000001';
const EA = '16000000-0000-0000-0000-000000000002';
const SCHOOL = '26000000-0000-0000-0000-000000000001';
const classId = n => `46000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const ACTIVE_YEAR = '(SELECT id FROM public.academic_years WHERE is_active)';
const FIXTURE_UPDATED_AT = '2026-10-01T10:00:00Z';

const fixtureSql = `
INSERT INTO auth.users (id) VALUES ('${HEAD_OFFICE}'), ('${EA}');
INSERT INTO public.schools (id, name)
VALUES ('${SCHOOL}', 'Letter order harness school');
INSERT INTO public.users (id, first_name, last_name, school_id, organization_id) VALUES
  ('${HEAD_OFFICE}', 'Head', 'Office', '${SCHOOL}', 'a111879f-d066-47c9-95a1-bed2a400319a'),
  ('${EA}', 'Assigned', 'EA', '${SCHOOL}', 'a111879f-d066-47c9-95a1-bed2a400319a');
INSERT INTO public.staff_programme_assignments (user_id, programme_id, school_id, created_by)
VALUES ('${EA}', (SELECT id FROM public.programmes WHERE code = 'literacy'), '${SCHOOL}', '${HEAD_OFFICE}');
INSERT INTO public.classes (id, school_id, name, grade, academic_year_id, created_by, updated_at, row_version) VALUES
  ('${classId(1)}', '${SCHOOL}', 'Existing class one', '1', ${ACTIVE_YEAR}, '${EA}', '${FIXTURE_UPDATED_AT}', 7),
  ('${classId(2)}', '${SCHOOL}', 'Existing class two', '2', ${ACTIVE_YEAR}, '${HEAD_OFFICE}', '${FIXTURE_UPDATED_AT}', 19);
`;

const asRole = (role, sql) => `
BEGIN;
SET LOCAL ROLE ${role};
SET LOCAL request.jwt.claim.sub = '${EA}';
${sql}
ROLLBACK;
`;

const insertClass = (id, edition) => `
INSERT INTO public.classes (id, school_id, name, grade, academic_year_id, created_by${edition === undefined ? '' : ', letter_order_edition'})
VALUES ('${id}', '${SCHOOL}', 'New letter order class', '1', ${ACTIVE_YEAR}, '${EA}'${edition === undefined ? '' : `, '${edition}'`})
`;

const runCases = databaseUrl => {
  const summary = {};
  const value = (label, sql, expected) => {
    assert.equal(runPsql({ databaseUrl, label, sql }), expected, label);
    summary[label] = 'passed';
  };

  value('existing-classes-backfilled', `
    SELECT count(*), bool_and(letter_order_edition = '2026-10-23'),
      bool_and(updated_at = '${FIXTURE_UPDATED_AT}'::timestamptz),
      bool_and(row_version = CASE id WHEN '${classId(1)}'::uuid THEN 7 ELSE 19 END)
    FROM public.classes WHERE id IN ('${classId(1)}', '${classId(2)}');
  `, '2|t|t|t');

  value('column-has-no-default', `
    SELECT data_type, is_nullable, column_default IS NULL
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'classes' AND column_name = 'letter_order_edition';
  `, 'text|NO|t');

  value('app-insert-gets-edition', asRole('authenticated', `
    ${insertClass(classId(3))} RETURNING letter_order_edition;
  `), '2026-10-23');

  value('app-insert-value-ignored', asRole('authenticated', `
    ${insertClass(classId(3), 'legacy')} RETURNING letter_order_edition;
  `), '2026-10-23');

  const retry = `${insertClass(classId(3))} ON CONFLICT (id) DO UPDATE SET name = excluded.name RETURNING letter_order_edition;`;
  value('app-upsert-retry-idempotent', asRole('authenticated', `
    ${retry}
    ${retry}
    SELECT count(*), min(letter_order_edition) FROM public.classes WHERE id = '${classId(3)}';
  `), '2026-10-23\n2026-10-23\n1|2026-10-23');

  value('app-update-cannot-change', asRole('authenticated', `
    UPDATE public.classes SET letter_order_edition = 'legacy'
    WHERE id = '${classId(1)}' RETURNING letter_order_edition;
    SELECT letter_order_edition FROM public.classes WHERE id = '${classId(1)}';
  `), '2026-10-23\n2026-10-23');

  value('admin-insert-explicit', asRole('service_role', `
    ${insertClass(classId(3), '2026-10-23')} RETURNING letter_order_edition;
    ${insertClass(classId(4))} RETURNING letter_order_edition;
  `), '2026-10-23\n2026-10-23');

  for (const edition of ['legacy', 'bogus']) {
    const error = expectSqlState({
      databaseUrl,
      label: `check-rejects-${edition}`,
      sql: asRole('service_role', `${insertClass(classId(3), edition)};`),
      sqlState: '23514',
    });
    assert.match(error, /classes_letter_order_edition_known/);
  }
  summary['check-rejects-unknown'] = 'passed';

  value('function-not-executable', `
    SELECT has_function_privilege('anon', 'private.classes_letter_order_edition()', 'EXECUTE'),
      has_function_privilege('authenticated', 'private.classes_letter_order_edition()', 'EXECUTE');
  `, 'f|f');

  return summary;
};

const main = () => {
  const baseName = process.env.HISTORY_RLS_DATABASE_NAME;
  const databaseName = baseName ? `${baseName}_letter_order` : baseName;
  const adminUrl = assertDisposableAdminTarget({
    adminDatabaseUrl: process.env.HISTORY_RLS_ADMIN_DATABASE_URL,
    databaseName,
    confirmation: process.env.HISTORY_RLS_DISPOSABLE_CONFIRM,
  });
  const adminDatabaseUrl = buildDatabaseUrl(adminUrl, 'postgres').href;
  const databaseUrl = buildDatabaseUrl(adminUrl, databaseName).href;
  const quotedDatabase = `"${databaseName}"`;

  runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-stale-database' });
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `CREATE DATABASE ${quotedDatabase};`, label: 'create-database' });
  try {
    runPsql({ databaseUrl, sql: bootstrapSql, label: 'bootstrap' });
    runPsql({ databaseUrl, label: 'supabase-default-privileges', sql: `
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
      ALTER ROLE service_role BYPASSRLS;
    ` });
    const migrations = fs.readdirSync(MIGRATIONS_DIR)
      .filter(name => name.endsWith('.sql') && name.split('_')[0] < MIGRATION_VERSION)
      .sort();
    for (const filename of migrations) {
      runPsql({ databaseUrl, file: path.join(MIGRATIONS_DIR, filename), label: `migration-${filename}` });
    }
    runPsql({ databaseUrl, sql: fixtureSql, label: 'letter-order-fixture' });
    const file = path.join(MIGRATIONS_DIR, LETTER_ORDER_MIGRATION);
    runPsql({ databaseUrl, file, label: 'letter-order-migration' });
    const summary = runCases(databaseUrl);
    const snapshotSql = 'SELECT coalesce(jsonb_agg(c ORDER BY id), \'[]\'::jsonb)::text FROM public.classes c;';
    const before = runPsql({ databaseUrl, sql: snapshotSql, label: 'classes-before-replay' });
    runPsql({ databaseUrl, file, label: 'letter-order-migration-idempotent-replay' });
    assert.equal(runPsql({ databaseUrl, sql: snapshotSql, label: 'classes-after-replay' }), before);
    summary['migration-idempotent-replay'] = 'passed';
    process.stdout.write(`${JSON.stringify({ checks: Object.keys(summary).length, results: summary })}\n`);
  } finally {
    runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-database' });
  }
};

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { LETTER_ORDER_MIGRATION, fixtureSql, runCases };
