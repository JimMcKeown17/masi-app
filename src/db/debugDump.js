import { buildSyncPayload } from '../services/syncPayload';
import { StaleActorError } from '../session/staleActor';
export const assertExportHandle = (handle) => {
  if (!handle?.isOpen() || !handle.isCurrent()) throw new StaleActorError();
};
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

const wireEvidence = (row) => {
  try {
    const wirePayload = buildSyncPayload(row.table_name, parseJson(row.payload), row.operation);
    const serverRecordId = row.table_name === 'letter_mastery' ? null
      : wirePayload?.id ?? wirePayload?.p_assessment?.id ?? row.record_id;
    return { wirePayload, serverRecordId };
  } catch (error) {
    return { wirePayload: null, wirePayloadError: error.message, serverRecordId: row.record_id };
  }
};

const getSupportIncidents = async (db, tableNames) => {
  if (!tableNames.includes('support_incident_queue')) return [];
  try {
    const rows = await db.getAllAsync('select * from support_incident_queue order by created_at, id');
    return rows.map(row => ({ ...row, ...Object.fromEntries(
      ['payload', 'observed', 'first_observed', 'report_snapshot', 'last_sent_release']
        .filter(key => Object.prototype.hasOwnProperty.call(row, key))
        .map(key => [key, parseJson(row[key])])
    ) }));
  } catch (error) {
    return diagnosticError(error);
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
        error_class,
        error_code,
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
      ...wireEvidence(row),
      id: row.id,
      tableName: row.table_name,
      recordId: row.record_id,
      operation: row.operation,
      payload: parseJson(row.payload),
      status: row.status,
      retryCount: row.retry_count,
      lastError: row.last_error,
      // Export keeps its established camelCase convention for SQLite error_class/error_code.
      errorClass: row.error_class,
      errorCode: row.error_code,
      nextRetryAt: row.next_retry_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    return diagnosticError(error);
  }
};

const getLetterMastery = async (db, tableNames) => {
  if (!tableNames.includes('letter_mastery')) return [];

  try {
    const rows = await db.getAllAsync(`
      select child_id, letter, language, confirmed, changed_at, correction_id, changed_by,
             programme_id, sync_status, server_changed_at, server_correction_id
      from letter_mastery
      order by child_id, letter
    `);
    return rows.map(row => ({
      childId: row.child_id,
      letter: row.letter,
      language: row.language,
      confirmed: Boolean(row.confirmed),
      changedAt: row.changed_at,
      correctionId: row.correction_id,
      changedBy: row.changed_by,
      programmeId: row.programme_id,
      syncStatus: row.sync_status,
      serverChangedAt: row.server_changed_at,
      serverCorrectionId: row.server_correction_id,
    }));
  } catch (error) {
    return diagnosticError(error);
  }
};

export async function debugDump({ handle }) {
  assertExportHandle(handle);
  const db = await handle.getReader();
  const tableNames = await getTableNames(db);

  const result = {
    database: 'sqlite',
    releaseMetadata: getReleaseMetadata(),
    schemaVersion: await getUserVersion(db),
    migrations: await getMigrations(db),
    tableCounts: await getTableCounts(db, tableNames),
    syncState: await getSyncState(db, tableNames),
    failedOutboxRows: await getFailedOutboxRows(db, tableNames),
    supportIncidents: await getSupportIncidents(db, tableNames),
    letterMastery: await getLetterMastery(db, tableNames),
    generatedAt: new Date().toISOString(),
  };
  assertExportHandle(handle);
  return result;
}
