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

const positiveLimit = n => Math.max(1, Math.floor(Number(n) || 1));
// SQLite clips before crossing the native bridge. Four bytes per code point keeps this
// prefix within the byte budget even when the cut falls inside a JSON string.
const boundedText = (column, maxBytes) => `substr(${column},1,${Math.floor(positiveLimit(maxBytes)/4)})`;
const truncationColumns = column => `length(${column}) as ${column}_chars,
  length(cast(${column} as blob)) as ${column}_original_bytes`;
const boundedMarkers = (row, source, target, options) => options && row[`${source}_chars`] > Math.floor(options.payloadMaxBytes/4)
  ? { [`${target}Truncated`]: true, [`${target}OriginalBytes`]: row[`${source}_original_bytes`] } : {};

const getSyncState = async (db, tableNames, options) => {
  if (!tableNames.includes('sync_state')) return [];

  try {
    const rows = await db.getAllAsync(`
      select scope, last_pulled_at, ${options ? boundedText('cursor', options.payloadMaxBytes) : 'cursor'} as cursor, updated_at ${options ? `,${truncationColumns('cursor')}` : ''}
      from sync_state
      order by scope ${options ? `limit ${positiveLimit(options.sectionLimit)}` : ''}
    `);

    return rows.map((row) => ({
      scope: row.scope,
      lastPulledAt: row.last_pulled_at,
      cursor: row.cursor,
      ...boundedMarkers(row,'cursor','cursor',options),
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
    const serverRecordId = ['letter_mastery', 'skill_mastery'].includes(row.table_name) ? null
      : wirePayload?.id ?? wirePayload?.p_assessment?.id ?? row.record_id;
    return { wirePayload, serverRecordId };
  } catch (error) {
    return { wirePayload: null, wirePayloadError: error.message, serverRecordId: row.record_id };
  }
};

const getSupportIncidents = async (db, tableNames, options) => {
  if (!tableNames.includes('support_incident_queue')) return [];
  try {
    const rows = await db.getAllAsync(options ? `select id,kind,repeat_key,schema_version,status,report_generation,
      occurrence_count,bundle_state,created_at,updated_at,
      ${boundedText('payload',options.payloadMaxBytes)} as payload,
      ${boundedText('observed',options.payloadMaxBytes)} as observed,
      ${truncationColumns('payload')},${truncationColumns('observed')},
      1 as reportSnapshotOmitted from support_incident_queue order by created_at desc,id limit ${positiveLimit(options.sectionLimit)}`
      : 'select * from support_incident_queue order by created_at, id');
    return rows.map(row => ({
      ...Object.fromEntries(Object.entries(row).filter(([key]) => !key.endsWith('_chars') && !key.endsWith('_original_bytes'))),
      ...boundedMarkers(row,'payload','payload',options), ...boundedMarkers(row,'observed','observed',options),
      ...Object.fromEntries(
      ['payload', 'observed', 'first_observed', 'report_snapshot', 'last_sent_release']
        .filter(key => Object.prototype.hasOwnProperty.call(row, key))
        .map(key => [key, parseJson(row[key])])
    ) }));
  } catch (error) {
    return diagnosticError(error);
  }
};

const getFailedOutboxRows = async (db, tableNames, options) => {
  if (!tableNames.includes('sync_outbox')) return [];

  try {
    const rows = await db.getAllAsync(`
      select
        id,
        table_name,
        record_id,
        operation,
        ${options ? boundedText('payload', options.payloadMaxBytes) : 'payload'} as payload,
        ${options ? `length(cast(payload as blob))` : '0'} as payloadOriginalBytes,
        ${options ? 'length(payload)' : '0'} as payloadChars,
        status,
        retry_count,
        ${options ? boundedText('last_error', options.payloadMaxBytes) : 'last_error'} as last_error,
        ${options ? `${truncationColumns('last_error')},` : ''}
        error_class,
        error_code,
        next_retry_at,
        created_at,
        updated_at
      from sync_outbox
      where status in ('failed', 'terminal')
      order by ${options ? `updated_at desc, id limit ${positiveLimit(options.outboxLimit)}` : `
        case status when 'failed' then 0 else 1 end, updated_at, table_name, record_id`}
    `);

    return rows.map((row) => ({
      ...(options && row.payloadChars > Math.floor(options.payloadMaxBytes/4)
        ? { wirePayload: null, wirePayloadError: 'Payload bounded before parsing', serverRecordId: row.record_id,
          payloadTruncated: true, payloadOriginalBytes: row.payloadOriginalBytes }
        : wireEvidence(row)),
      id: row.id,
      tableName: row.table_name,
      recordId: row.record_id,
      operation: row.operation,
      payload: parseJson(row.payload),
      status: row.status,
      retryCount: row.retry_count,
      lastError: row.last_error,
      ...boundedMarkers(row,'last_error','lastError',options),
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

const getLetterMastery = async (db, tableNames, options) => {
  if (!tableNames.includes('letter_mastery')) return [];

  try {
    const rows = await db.getAllAsync(`
      select child_id, letter, language, confirmed, changed_at, correction_id, changed_by,
             programme_id, sync_status, server_changed_at, server_correction_id
      from letter_mastery
      order by ${options ? `changed_at desc limit ${positiveLimit(options.masteryLimit)}` : 'child_id, letter'}
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

const getSkillMastery = async (db, tableNames, options) => {
  if (!tableNames.includes('skill_mastery')) return [];

  try {
    const rows = await db.getAllAsync(`
      select child_id, step_key, confirmed, changed_at, correction_id, changed_by,
             programme_id, sync_status, server_changed_at, server_correction_id
      from skill_mastery
      order by ${options ? `changed_at desc limit ${positiveLimit(options.masteryLimit)}` : 'child_id, step_key'}
    `);
    return rows.map(row => ({
      childId: row.child_id,
      stepKey: row.step_key,
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

export async function debugDump({ handle }, limits) {
  const options = limits ? {outboxLimit:200,payloadMaxBytes:20480,masteryLimit:500,sectionLimit:200,...limits} : null;
  assertExportHandle(handle);
  const db = await handle.getReader();
  const tableNames = await getTableNames(db);

  const result = {
    database: 'sqlite',
    releaseMetadata: getReleaseMetadata(),
    schemaVersion: await getUserVersion(db),
    migrations: await getMigrations(db),
    tableCounts: await getTableCounts(db, tableNames),
    syncState: await getSyncState(db, tableNames, options),
    failedOutboxRows: await getFailedOutboxRows(db, tableNames, options),
    supportIncidents: await getSupportIncidents(db, tableNames, options),
    letterMastery: await getLetterMastery(db, tableNames, options),
    skillMastery: await getSkillMastery(db, tableNames, options),
    generatedAt: new Date().toISOString(),
  };
  assertExportHandle(handle);
  return result;
}
