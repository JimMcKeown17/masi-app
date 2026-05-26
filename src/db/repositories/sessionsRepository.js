import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import {
  assertRlsRequiredFields,
  enqueueDomainOutbox,
  getActiveProgrammeId,
  mapDomainRow,
  normalizeSyncFields,
  resolveProgrammeId,
  sessionAttendeeDomainId,
  shouldEnqueueOutbox,
  upsertDomainRecord,
} from './domainRepositoryUtils';
import { syncStatusFromSynced } from './sqliteRepositoryUtils';

const SESSION_COLUMNS = [
  'id',
  'user_id',
  'programme_id',
  'class_id',
  'session_date',
  'started_at',
  'ended_at',
  'activities',
  'notes',
  'created_at',
  'updated_at',
  'sync_status',
  'last_sync_error',
  'server_updated_at',
];

const ATTENDEE_COLUMNS = [
  'id',
  'session_id',
  'child_id',
  'group_id',
  'attendance_status',
  'grade_snapshot',
  'notes',
  'created_at',
  'updated_at',
  'sync_status',
  'last_sync_error',
  'server_updated_at',
];

const buildActivitiesPayload = (session) => ({
  ...(session.activities || {}),
  __legacySession: {
    session_type_id: session.session_type_id,
    session_type: session.session_type,
    _pendingJobTitleResolve: session._pendingJobTitleResolve,
    pendingSessionTypeCode: session.pendingSessionTypeCode,
    pendingSessionTypeName: session.pendingSessionTypeName,
  },
});

const stripLegacySessionPayload = (record) => {
  const activities = { ...(record.activities || {}) };
  delete activities.__legacySession;

  return {
    ...record,
    activities,
  };
};

const mapSession = async (db, row) => {
  if (!row) return null;
  const mapped = mapDomainRow(row, { jsonColumns: ['activities'] });
  const attendees = await db.getAllAsync(
    'select child_id, group_id from session_attendees where session_id = ? order by created_at, id',
    row.id
  );
  const activities = mapped.activities || {};
  const legacy = activities.__legacySession || {};
  delete activities.__legacySession;

  const result = {
    ...mapped,
    activities,
    children_ids: attendees.map((attendee) => attendee.child_id),
    group_ids: [...new Set(attendees.map((attendee) => attendee.group_id).filter(Boolean))],
  };
  for (const key of [
    'session_type_id',
    'session_type',
    '_pendingJobTitleResolve',
    'pendingSessionTypeCode',
    'pendingSessionTypeName',
  ]) {
    if (legacy[key] !== undefined) {
      result[key] = legacy[key];
    }
  }

  return result;
};

export const createSessionsRepository = ({ database } = {}) => {
  const runWrite = (transaction, task) => (
    transaction ? task(transaction) : runRepositoryTransaction(database, task)
  );

  const getSessions = async ({ userId, programmeId } = {}) => {
    const db = await resolveDatabase(database);
    const activeProgrammeId = programmeId || (userId ? await getActiveProgrammeId(db, userId) : null);
    if (userId && !activeProgrammeId) return [];
    const rows = activeProgrammeId
      ? await db.getAllAsync(
        'select * from sessions where programme_id = ? order by session_date, created_at',
        activeProgrammeId
      )
      : await db.getAllAsync('select * from sessions order by session_date, created_at');
    const mapped = [];
    for (const row of rows) {
      mapped.push(await mapSession(db, row));
    }
    return mapped;
  };

  const saveSession = async (session, { transaction } = {}) => runWrite(transaction, async (txn) => {
    assertRlsRequiredFields('sessions', session, ['user_id']);
    const programmeId = await resolveProgrammeId(txn, {
      programmeId: session.programme_id,
      userId: session.user_id,
    });
    const record = normalizeSyncFields({
      ...session,
      programme_id: programmeId,
      activities: buildActivitiesPayload(session),
      sync_status: session.sync_status || syncStatusFromSynced(session.synced),
    });

    await upsertDomainRecord(txn, {
      tableName: 'sessions',
      columns: SESSION_COLUMNS,
      jsonColumns: ['activities'],
    }, record);
    if (shouldEnqueueOutbox(record)) {
      await enqueueDomainOutbox(txn, 'sessions', session.id, 'insert', stripLegacySessionPayload(record));
    }

    const childIds = session.children_ids || [];
    for (const childId of childIds) {
      const attendeeId = sessionAttendeeDomainId(session.id, childId);
      const attendee = normalizeSyncFields({
        id: attendeeId,
        session_id: session.id,
        child_id: childId,
        group_id: (session.group_ids || [])[0] || null,
        attendance_status: 'present',
        sync_status: session.sync_status || syncStatusFromSynced(session.synced),
      });
      await upsertDomainRecord(txn, {
        tableName: 'session_attendees',
        columns: ATTENDEE_COLUMNS,
      }, attendee);
      if (shouldEnqueueOutbox(attendee)) {
        await enqueueDomainOutbox(txn, 'session_attendees', attendee.id, 'insert', attendee);
      }
    }

    return true;
  });

  const updateSession = async (id, updates, keysToRemove = [], { transaction } = {}) => runWrite(transaction, async (txn) => {
    const existing = await mapSession(txn, await txn.getFirstAsync('select * from sessions where id = ?', id));
    if (!existing) return false;
    const next = { ...existing, ...updates };
    for (const key of keysToRemove) {
      delete next[key];
    }
    await saveSession(next, { transaction: txn });
    return true;
  });

  const getUnsyncedRecords = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync("select * from sessions where sync_status <> 'synced' order by created_at");
    const mapped = [];
    for (const row of rows) {
      mapped.push(await mapSession(db, row));
    }
    return mapped;
  };

  return {
    getSessions,
    saveSession,
    updateSession,
    getUnsyncedRecords,
  };
};

export const sessionsRepository = createSessionsRepository();
