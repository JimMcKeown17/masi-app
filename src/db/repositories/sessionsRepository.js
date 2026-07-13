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

const mapSession = (row, attendees = []) => {
  if (!row) return null;
  const mapped = mapDomainRow(row, { jsonColumns: ['activities'] });
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

const hydrateSessions = async (db, rows) => {
  if (rows.length === 0) return [];
  const placeholders = rows.map(() => '?').join(', ');
  const attendees = await db.getAllAsync(`
    select session_id, child_id, group_id
    from session_attendees
    where session_id in (${placeholders})
    order by created_at, id
  `, ...rows.map(row => row.id));
  const attendeesBySession = new Map();
  for (const attendee of attendees) {
    const current = attendeesBySession.get(attendee.session_id) || [];
    current.push(attendee);
    attendeesBySession.set(attendee.session_id, current);
  }
  return rows.map(row => mapSession(row, attendeesBySession.get(row.id) || []));
};

export const createSessionsRepository = ({ database } = {}) => {
  const runWrite = (transaction, task) => (
    transaction ? task(transaction) : runRepositoryTransaction(database, task)
  );

  const resolveActiveProgrammeId = async (db, { userId, programmeId }) => (
    programmeId || (userId ? await getActiveProgrammeId(db, userId) : null)
  );

  const getSessions = async ({
    userId,
    programmeId,
    recordedByUserId,
    sinceDate,
    order = 'asc',
  } = {}) => {
    const db = await resolveDatabase(database);
    const activeProgrammeId = await resolveActiveProgrammeId(db, { userId, programmeId });
    if (userId && !activeProgrammeId) return [];
    const clauses = [];
    const params = [];
    if (activeProgrammeId) {
      clauses.push('programme_id = ?');
      params.push(activeProgrammeId);
    }
    if (recordedByUserId) {
      clauses.push('user_id = ?');
      params.push(recordedByUserId);
    }
    if (sinceDate) {
      clauses.push('session_date >= ?');
      params.push(sinceDate);
    }
    const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
    const direction = order === 'desc' ? 'desc' : 'asc';
    const rows = await db.getAllAsync(
      `select * from sessions ${where} order by session_date ${direction}, created_at ${direction}`,
      ...params
    );
    return hydrateSessions(db, rows);
  };

  const getSessionCountsSince = async ({ userId, programmeId, sinceDate } = {}) => {
    const db = await resolveDatabase(database);
    const activeProgrammeId = await resolveActiveProgrammeId(db, { userId, programmeId });
    if (userId && !activeProgrammeId) return [];
    const clauses = [];
    const params = [];
    if (activeProgrammeId) {
      clauses.push('programme_id = ?');
      params.push(activeProgrammeId);
    }
    if (sinceDate) {
      clauses.push('session_date >= ?');
      params.push(sinceDate);
    }
    const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
    const rows = await db.getAllAsync(`
      select session_date, count(*) as count
      from sessions
      ${where}
      group by session_date
      order by session_date
    `, ...params);
    return rows.map(row => ({ ...row, count: Number(row.count) }));
  };

  const countSessionsOnDate = async ({ userId, programmeId, date } = {}) => {
    const db = await resolveDatabase(database);
    const activeProgrammeId = await resolveActiveProgrammeId(db, { userId, programmeId });
    if (userId && !activeProgrammeId) return 0;
    const clauses = ['session_date = ?'];
    const params = [date];
    if (activeProgrammeId) {
      clauses.push('programme_id = ?');
      params.push(activeProgrammeId);
    }
    if (userId) {
      clauses.push('user_id = ?');
      params.push(userId);
    }
    const row = await db.getFirstAsync(
      `select count(*) as count from sessions where ${clauses.join(' and ')}`,
      ...params
    );
    return Number(row?.count || 0);
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
    const rows = await hydrateSessions(txn, [await txn.getFirstAsync('select * from sessions where id = ?', id)].filter(Boolean));
    const existing = rows[0] || null;
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
    return hydrateSessions(db, rows);
  };

  return {
    getSessions,
    getSessionCountsSince,
    countSessionsOnDate,
    saveSession,
    updateSession,
    getUnsyncedRecords,
  };
};

export const sessionsRepository = createSessionsRepository();
