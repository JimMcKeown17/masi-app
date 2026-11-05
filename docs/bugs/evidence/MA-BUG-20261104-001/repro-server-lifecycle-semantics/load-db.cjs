#!/usr/bin/env node
// Creates the disposable database and loads bootstrap + EVERY canonical migration.
// Reuses the Masi disposable-target guard; never loads dotenv or the Supabase CLI.
const fs = require('node:fs');
const path = require('node:path');
const MASI = '/Users/jimmckeown/Development/masi-app';
const {
  MIGRATIONS_DIR,
  assertDisposableAdminTarget,
  bootstrapSql,
  buildDatabaseUrl,
  runPsql,
} = require(path.join(MASI, 'scripts/history-authorization-postgres-harness.cjs'));

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
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE);`, label: 'drop' });
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `CREATE DATABASE ${quoteIdentifier(databaseName)};`, label: 'create' });
  runPsql({ databaseUrl, sql: bootstrapSql, label: 'bootstrap' });
  const migrations = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const filename of migrations) {
    runPsql({ databaseUrl, file: path.join(MIGRATIONS_DIR, filename), label: `migration-${filename}` });
  }
  return { databaseUrl, migrations };
};

module.exports = { target, loadDatabase };

if (require.main === module) {
  const { migrations } = loadDatabase();
  console.log(`loaded ${migrations.length} migrations:`);
  for (const m of migrations) console.log(`  ${m}`);
}
