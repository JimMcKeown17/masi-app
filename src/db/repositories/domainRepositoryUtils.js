import {
  insertOutboxRecord,
  mapRowFromSqlite,
  syncStatusFromSynced,
  timestamp,
  upsertRecord,
} from './sqliteRepositoryUtils';

export const LEGACY_PROGRAMME_ID = 'local-legacy-programme';

export const outboxId = (tableName, recordId, operation) => `${tableName}:${recordId}:${operation}`;

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
    insert into programmes (id, code, name, is_active)
    values (?, ?, ?, 1)
    on conflict(id) do nothing
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
