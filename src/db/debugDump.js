import { getDatabase } from './client';

const quoteIdentifier = (identifier) => `"${String(identifier).replace(/"/g, '""')}"`;

const getUserVersion = async (db) => {
  const row = await db.getFirstAsync('PRAGMA user_version');
  return row?.user_version || 0;
};

const getMigrations = async (db) => {
  try {
    return await db.getAllAsync('select version, name from schema_migrations order by version');
  } catch {
    return [];
  }
};

const getTableNames = async (db) => {
  const rows = await db.getAllAsync(`
    select name
    from sqlite_master
    where type = 'table'
      and name not like 'sqlite_%'
    order by name
  `);

  return rows.map((row) => row.name);
};

const getTableCounts = async (db, tableNames) => {
  const counts = {};

  for (const tableName of tableNames) {
    const row = await db.getFirstAsync(
      `select count(*) as count from ${quoteIdentifier(tableName)}`
    );
    counts[tableName] = row?.count || 0;
  }

  return counts;
};

export async function debugDump(database) {
  const db = database || await getDatabase();
  const tableNames = await getTableNames(db);

  return {
    database: 'sqlite',
    schemaVersion: await getUserVersion(db),
    migrations: await getMigrations(db),
    tableCounts: await getTableCounts(db, tableNames),
    generatedAt: new Date().toISOString(),
  };
}
