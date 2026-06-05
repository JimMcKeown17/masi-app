import { v5 as uuidv5, validate as uuidValidate } from 'uuid';
import {
  insertOutboxRecord,
  mapRowFromSqlite,
  syncStatusFromSynced,
  timestamp,
  upsertRecord,
} from './sqliteRepositoryUtils';

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
  // Pre-ADR-0004 shape used `position ?? itemKey`, dropping itemKey
  // whenever position was present. That collapsed EA/HQ Q11 rubric rows
  // (same position, different item_key prefix) into the same ID, and
  // also let two different letters at the same Pattern A position
  // collide. The fix: include itemKey in the hash whenever position is
  // present so the ea:/hq: prefix and letter content participate.
  //
  // Rows that have ONLY item_key (e.g. the SUMMARY_ITEM_KEY row with no
  // position and no isCorrect) keep the legacy 3-arg shape so already
  // persisted summary rows retain their stored IDs.
  if (position == null) {
    if (isCorrect === true) {
      return deterministicDomainId('assessment_items', assessmentId, itemKey, 'correct');
    }
    if (isCorrect === false) {
      return deterministicDomainId('assessment_items', assessmentId, itemKey, 'incorrect');
    }
    return deterministicDomainId('assessment_items', assessmentId, itemKey);
  }
  if (isCorrect === true) {
    return deterministicDomainId('assessment_items', assessmentId, position, itemKey, 'correct');
  }
  if (isCorrect === false) {
    return deterministicDomainId('assessment_items', assessmentId, position, itemKey, 'incorrect');
  }
  return deterministicDomainId('assessment_items', assessmentId, position, itemKey);
};

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

export const enqueueDomainOutbox = async (db, tableName, recordId, operation, payload = null) => (
  insertOutboxRecord(db, {
    id: outboxId(tableName, recordId, operation),
    tableName,
    recordId,
    operation,
    payload,
  })
);

export const shouldEnqueueOutbox = (record = {}) => !['synced', 'terminal'].includes(record.sync_status);

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
