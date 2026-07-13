import { v5 as uuidv5, validate as uuidValidate } from 'uuid';
import {
  insertOutboxRecord,
  mapRowFromSqlite,
  quoteIdentifier,
  syncStatusFromSynced,
  timestamp,
  upsertRecord,
} from './sqliteRepositoryUtils';
import { resolvePrimaryOwner } from './outboxOwnership';

export const LEGACY_PROGRAMME_ID = 'local-legacy-programme';
const MASI_DOMAIN_ID_NAMESPACE = '09dcf4b2-6c53-4c46-917f-33bc7f2df4d2';

export const deterministicDomainId = (...parts) => uuidv5(
  parts.map((part) => String(part ?? '')).join('\u001f'),
  MASI_DOMAIN_ID_NAMESPACE
);

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

export const letterMasteryDomainId = ({
  userId,
  childId,
  programmeId,
  letter,
  language,
  source = 'taught',
}) => deterministicDomainId(
  'letter_mastery',
  userId,
  childId,
  programmeId,
  letter,
  language,
  source || 'taught'
);

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

export const outboxId = (tableName, recordId, operation) => `${tableName}:${recordId}:${operation}`;

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
  { ownerRow, ownerUserId } = {}
) => {
  let resolvedOwnerUserId = ownerUserId;
  if (resolvedOwnerUserId === undefined) {
    const row = ownerRow || await db.getFirstAsync(
      `select * from ${quoteIdentifier(tableName)} where id = ?`,
      recordId
    ).catch(() => null);
    resolvedOwnerUserId = await resolvePrimaryOwner({ db, tableName, row, payload });
  }

  return insertOutboxRecord(db, {
    id: outboxId(tableName, recordId, operation),
    tableName,
    recordId,
    operation,
    payload,
    ownerUserId: resolvedOwnerUserId,
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

// Pending-local-wins pull guard (ZZ F7): only server pulls hand whole rows claiming
// sync_status 'synced' to the save functions — local writes always claim 'pending',
// and push acknowledgement flips status via setRecordSyncStatus, never a row replace.
// So a 'synced' row arriving for an id whose local row still has unpushed changes is
// a pull about to clobber a pending edit, and must be skipped. Must run inside the
// same transaction as the upsert it guards.
export const serverPullWouldClobberPendingLocal = async (db, tableName, record) => {
  if (record?.sync_status !== 'synced' || record?.id == null) return false;
  const existing = await db.getFirstAsync(
    `select sync_status from ${quoteIdentifier(tableName)} where id = ?`,
    record.id
  );
  return Boolean(existing && PENDING_LOCAL_SYNC_STATUSES.includes(existing.sync_status));
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

export const upsertDomainRecord = async (db, config, record) => upsertRecord(db, {
  ...config,
  record: normalizeSyncFields(record),
});
