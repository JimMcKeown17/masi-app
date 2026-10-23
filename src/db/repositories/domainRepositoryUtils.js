import { validate as uuidValidate } from 'uuid';
import { deterministicDomainId } from '../domainId';
export { deterministicDomainId, letterMasteryDomainId } from '../domainId';
import {
  insertOutboxRecord,
  mapRowFromSqlite,
  quoteIdentifier,
  syncStatusFromSynced,
  timestamp,
  upsertRecord,
} from './sqliteRepositoryUtils';
import { outboxRecordId } from './syncOutboxRepository';
import { VERSIONED_TABLES } from './rowVersion';

export const LEGACY_PROGRAMME_ID = 'local-legacy-programme';
export const sessionAttendeeDomainId = (sessionId, childId) => (
  deterministicDomainId('session_attendees', sessionId, childId)
);

export const assessmentItemDomainId = ({
  assessmentId,
  itemKey,
  position,
  isCorrect,
}) => {
  const key = position ?? itemKey;
  if (isCorrect === true) {
    return deterministicDomainId('assessment_items', assessmentId, key, 'correct');
  }
  if (isCorrect === false) {
    return deterministicDomainId('assessment_items', assessmentId, key, 'incorrect');
  }
  return deterministicDomainId('assessment_items', assessmentId, key);
};

export const childEaAssignmentDomainId = ({ userId, childId }) => (
  deterministicDomainId('child_ea_assignments', userId, childId)
);

export const childProgrammeEnrollmentDomainId = ({ childId, programmeId }) => (
  deterministicDomainId('child_programme_enrollments', childId, programmeId)
);

export const classEaAssignmentDomainId = ({ classId, eaUserId, programmeId }) => (
  deterministicDomainId('class_ea_assignments', classId, eaUserId, programmeId)
);

export const groupEaAssignmentDomainId = ({ groupId }) => (
  deterministicDomainId('group_ea_assignments', groupId)
);

export const classGroupingStateDomainId = ({ classId, academicYearId }) => (
  deterministicDomainId('class_grouping_state', classId, academicYearId)
);

export const ensureServerUuid = (id, ...fallbackParts) => {
  if (uuidValidate(id)) return id;
  if (fallbackParts.length === 1 && uuidValidate(fallbackParts[0])) {
    return fallbackParts[0];
  }
  return deterministicDomainId(...fallbackParts);
};

export const outboxId = outboxRecordId;

export const assertRlsRequiredFields = (tableName, record, fields) => {
  for (const field of fields) {
    const value = record?.[field];
    if (value === null || value === undefined || value === '') {
      throw new Error(`${tableName}.${field} is required (RLS contract)`);
    }
  }
};

export const normalizeSyncFields = (record = {}) => {
  const now = timestamp();
  return {
    ...record,
    created_at: record.created_at || now,
    updated_at: record.updated_at || now,
    sync_status: record.sync_status || syncStatusFromSynced(record.synced),
  };
};

export const enqueueDomainOutbox = async (
  db,
  tableName,
  recordId,
  operation,
  payload = null,
  { outboxId: outboxIdOverride } = {}
) => {
  return insertOutboxRecord(db, {
    id: outboxIdOverride || outboxRecordId(tableName, recordId, operation),
    tableName,
    recordId,
    operation,
    payload,
  });
};

// Lifecycle intents are one replaceable stream per record. Reusing the slot id lets a newer intent
// replace an in-flight payload; the engine's updated_at CAS then prevents the stale request from
// finalizing over it. Clean up operation-keyed rows left by older app builds before using the slot.
export const enqueueLifecycleOutbox = async (db, tableName, recordId, operation, payload) => {
  if (operation !== 'archive' && operation !== 'restore') {
    throw new Error(`enqueueLifecycleOutbox: unsupported operation ${operation}`);
  }
  const legacyArchiveId = outboxRecordId(tableName, recordId, 'archive');
  const legacyRestoreId = outboxRecordId(tableName, recordId, 'restore');
  await db.runAsync(`
    delete from sync_outbox
    where id in (?, ?)
      and status in ('pending', 'failed', 'terminal')
  `, legacyArchiveId, legacyRestoreId);
  return enqueueDomainOutbox(db, tableName, recordId, operation, payload, {
    outboxId: outboxRecordId(tableName, recordId, 'lifecycle'),
  });
};

export const shouldEnqueueOutbox = (record = {}) => !['synced', 'terminal'].includes(record.sync_status);

// Statuses that mean "this row has local changes the server has not acknowledged".
// 'terminal' is deliberately excluded: a quarantined row has no queued push, so a
// server copy arriving under the same id is strictly better data and may overwrite it.
export const PENDING_LOCAL_SYNC_STATUSES = ['pending', 'failed'];

// Either dirty signal keeps the local row: legacy facade payloads can carry a
// stale sync_status ('synced' from pull time) under a fresh synced: false, and
// trusting the stale status over the dirty flag re-opens the F7 clobber in UI
// state. Erring dirty is the safe direction — worst case a quarantined row
// stays visible one cycle while SQLite already holds the server copy.
export const hasUnpushedLocalChanges = (row) => (
  row?.synced === false
  || PENDING_LOCAL_SYNC_STATUSES.includes(row?.sync_status)
);

// Server pulls hand whole rows claiming 'synced' to these savers. Local edits are
// pending; acknowledgement and reconcile patch existing rows without replacing versions.
// Skip pulls over pending/failed changes, and older versions over acknowledged rows.
// Equal versions may carry server edits; terminal rows still converge to the server.
// Must run inside the same transaction as the upsert it guards.
export const serverPullWouldClobberPendingLocal = async (db, tableName, record) => {
  if (record?.sync_status !== 'synced' || record?.id == null) return false;
  const versioned = VERSIONED_TABLES.has(tableName);
  const existing = await db.getFirstAsync(
    `select sync_status${versioned ? ', row_version' : ''} from ${quoteIdentifier(tableName)} where id = ?`,
    record.id
  );
  return Boolean(existing && (
    PENDING_LOCAL_SYNC_STATUSES.includes(existing.sync_status)
    || (versioned
      && existing.sync_status === 'synced'
      && typeof record.row_version === 'number'
      && record.row_version < existing.row_version)
  ));
};

export const supersedeStaleActivePairRow = async (
  db,
  { tableName, pairColumns, endColumn, record }
) => {
  if (
    record?.sync_status !== 'synced'
    || (record?.[endColumn] !== null && record?.[endColumn] !== undefined)
  ) {
    return { action: 'proceed' };
  }

  const quotedTableName = quoteIdentifier(tableName);
  const quotedEndColumn = quoteIdentifier(endColumn);
  const pairPredicate = pairColumns
    .map((column) => `${quoteIdentifier(column)} = ?`)
    .join(' and ');
  const existing = await db.getFirstAsync(`
    select id, sync_status
    from ${quotedTableName}
    where ${pairPredicate}
      and ${quotedEndColumn} is null
      and id != ?
    limit 1
  `, ...pairColumns.map((column) => record[column]), record.id);

  if (!existing) return { action: 'proceed' };
  if (existing.sync_status !== 'synced') return { action: 'skip' };

  const supersededAt = timestamp();
  await db.runAsync(`
    update ${quotedTableName}
    set ${quotedEndColumn} = ?,
        updated_at = ?,
        sync_status = 'synced'
    where id = ?
      and ${quotedEndColumn} is null
      and sync_status = 'synced'
  `, supersededAt, supersededAt, existing.id);

  return { action: 'proceed', supersededId: existing.id };
};

export const getActiveProgrammeAssignment = async (db, userId) => db.getFirstAsync(`
  select *
  from staff_programme_assignments
  where user_id = ?
    and ended_at is null
  order by assigned_at desc
  limit 1
`, userId);

export const getActiveProgrammeId = async (db, userId) => {
  const assignment = userId ? await getActiveProgrammeAssignment(db, userId) : null;
  return assignment?.programme_id || null;
};

export const hasActiveProgrammeAssignment = async (db, userId, programmeId) => Boolean(await db.getFirstAsync(`
  select 1 from staff_programme_assignments
  where user_id = ? and programme_id = ? and ended_at is null
  limit 1
`, userId, programmeId));

export const ensureLegacyProgramme = async (db) => {
  await db.runAsync(`
    insert into programmes (id, code, name, is_active, sync_status)
    values (?, ?, ?, 1, 'terminal')
    on conflict(id) do update set
      sync_status = 'terminal',
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `, LEGACY_PROGRAMME_ID, 'legacy-local', 'Legacy Local Programme');
  return LEGACY_PROGRAMME_ID;
};

export const resolveProgrammeId = async (db, { programmeId, userId, allowLegacyFallback = false }) => {
  if (programmeId) return programmeId;

  const activeProgrammeId = await getActiveProgrammeId(db, userId);
  if (activeProgrammeId) return activeProgrammeId;

  if (allowLegacyFallback) {
    return ensureLegacyProgramme(db);
  }

  throw new Error(`No active programme assignment found for user ${userId}`);
};

export const getActiveAcademicYear = async (db) => db.getFirstAsync(`
  select *
  from academic_years
  where is_active = 1
  limit 1
`);

export const mapDomainRow = (row, options = {}) => mapRowFromSqlite({
  row,
  ...options,
});

export const upsertDomainRecord = async (db, config, record) => {
  const normalized = normalizeSyncFields(record);
  if (VERSIONED_TABLES.has(config.tableName) && normalized.sync_status !== 'synced') {
    delete normalized.row_version;
  }
  return upsertRecord(db, { ...config, record: normalized });
};
