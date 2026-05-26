import { getDatabase } from './client';
import { getReleaseMetadata } from '../utils/releaseMetadata';

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

const diagnosticError = (error) => ({
  error: String(error),
});

const getSyncState = async (db, tableNames) => {
  if (!tableNames.includes('sync_state')) return [];

  try {
    const rows = await db.getAllAsync(`
      select scope, last_pulled_at, cursor, updated_at
      from sync_state
      order by scope
    `);

    return rows.map((row) => ({
      scope: row.scope,
      lastPulledAt: row.last_pulled_at,
      cursor: row.cursor,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    return diagnosticError(error);
  }
};

const parseJson = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const getFailedOutboxRows = async (db, tableNames) => {
  if (!tableNames.includes('sync_outbox')) return [];

  try {
    const rows = await db.getAllAsync(`
      select
        id,
        table_name,
        record_id,
        operation,
        payload,
        status,
        retry_count,
        last_error,
        next_retry_at,
        created_at,
        updated_at
      from sync_outbox
      where status in ('failed', 'terminal')
      order by
        case status when 'failed' then 0 else 1 end,
        updated_at,
        table_name,
        record_id
    `);

    return rows.map((row) => ({
      id: row.id,
      tableName: row.table_name,
      recordId: row.record_id,
      operation: row.operation,
      payload: parseJson(row.payload),
      status: row.status,
      retryCount: row.retry_count,
      lastError: row.last_error,
      nextRetryAt: row.next_retry_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    return diagnosticError(error);
  }
};

export async function debugDump(database) {
  const db = database || await getDatabase();
  const tableNames = await getTableNames(db);

  return {
    database: 'sqlite',
    releaseMetadata: getReleaseMetadata(),
    schemaVersion: await getUserVersion(db),
    migrations: await getMigrations(db),
    tableCounts: await getTableCounts(db, tableNames),
    syncState: await getSyncState(db, tableNames),
    failedOutboxRows: await getFailedOutboxRows(db, tableNames),
    generatedAt: new Date().toISOString(),
  };
}
