#!/usr/bin/env node
// Repro repro-server-refusals: create the disposable database and load bootstrap + EVERY
// canonical migration in supabase/migrations, using Masi's own harness helpers.
// Env: HISTORY_RLS_ADMIN_DATABASE_URL (localhost /postgres), HISTORY_RLS_DATABASE_NAME
// (prefix masi_history_rls_), HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE.
// Never loads dotenv, never invokes the Supabase CLI, never touches a hosted project.
const fs = require('node:fs');
const path = require('node:path');

const HARNESS = '/Users/jimmckeown/Development/masi-app/scripts/history-authorization-postgres-harness.cjs';
const {
  MIGRATIONS_DIR, assertDisposableAdminTarget, bootstrapSql, buildDatabaseUrl, runPsql,
} = require(HARNESS);

const quoteIdentifier = (identifier) => `"${identifier.replaceAll('"', '""')}"`;

const target = () => {
  const databaseName = process.env.HISTORY_RLS_DATABASE_NAME;
  const adminUrl = assertDisposableAdminTarget({
    adminDatabaseUrl: process.env.HISTORY_RLS_ADMIN_DATABASE_URL,
    databaseName,
    confirmation: process.env.HISTORY_RLS_DISPOSABLE_CONFIRM,
  });
  return {
    databaseName,
    adminDatabaseUrl: buildDatabaseUrl(adminUrl, 'postgres').href,
    databaseUrl: buildDatabaseUrl(adminUrl, databaseName).href,
  };
};

const loadDatabase = () => {
  const { databaseName, adminDatabaseUrl, databaseUrl } = target();
  const quoted = quoteIdentifier(databaseName);
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quoted} WITH (FORCE);`, label: 'drop-stale' });
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `CREATE DATABASE ${quoted};`, label: 'create' });
  runPsql({ databaseUrl, sql: bootstrapSql, label: 'bootstrap' });
  const migrations = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const filename of migrations) {
    runPsql({ databaseUrl, file: path.join(MIGRATIONS_DIR, filename), label: `migration-${filename}` });
  }
  return { migrations, databaseUrl, adminDatabaseUrl, databaseName };
};

const dropDatabase = () => {
  const { databaseName, adminDatabaseUrl } = target();
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE);`, label: 'drop' });
};

module.exports = { loadDatabase, dropDatabase, target };

if (require.main === module) {
  const { migrations } = loadDatabase();
  process.stdout.write(`${JSON.stringify({ loaded_migrations: migrations.length, migrations })}\n`);
}
