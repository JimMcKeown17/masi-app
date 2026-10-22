import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import {
  assertRlsRequiredFields,
  enqueueDomainOutbox,
  getActiveProgrammeId,
  mapDomainRow,
  normalizeSyncFields,
  resolveProgrammeId,
  sessionAttendeeDomainId,
  serverPullWouldClobberPendingLocal,
  shouldEnqueueOutbox,
  upsertDomainRecord,
} from './domainRepositoryUtils';
import { syncStatusFromSynced } from './sqliteRepositoryUtils';
import { createSyncStateRepository } from './syncStateRepository';

const SESSION_COLUMNS = [
  'id',
  'user_id',
  'programme_id',
  'class_id',
  'group_id',
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
      `select * from sessions ${where} order by session_date ${direction}, created_at ${direction}, id ${direction}`,
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
      group_id: session.group_id ?? null,
      activities: buildActivitiesPayload(session),
      sync_status: session.sync_status || syncStatusFromSynced(session.synced),
    });

    if (shouldEnqueueOutbox(record) && record.group_id !== null) {
      const group = await txn.getFirstAsync('select programme_id from groups where id = ?', record.group_id);
      if (!group) throw new Error('sessions.group_id must reference a group on this phone');
      if (group.programme_id !== programmeId) {
        throw new Error('sessions.group_id must belong to the session programme');
      }
    }

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
        group_id: record.group_id,
        attendance_status: 'present',
        sync_status: session.sync_status || syncStatusFromSynced(session.synced),
        synced: record.sync_status === 'synced',
        last_sync_error: null,
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

  const HISTORY_REFERENCE_CHILD_COLUMNS = [
    'id', 'first_name', 'last_name', 'preferred_name', 'history_reference', 'sync_status',
  ];

  const existingId = async (txn, table, id) => {
    if (!id) return null;
    const row = await txn.getFirstAsync(`select id from ${table} where id = ?`, id);
    return row ? id : null;
  };

  // CAP-004: persist one parent page of hydrated session families and the traversal cursor
  // in a single transaction (spec §6.2, §12). Absence never deletes; pending local rows win.
  const saveHistoryPage = async (families, { scope, pullState, admit }) => runRepositoryTransaction(database, async (txn) => {
    // Admission is checked inside the transaction, after the writer lock is held, so a run
    // for an EA who signed out while this page waited for the writer commits nothing.
    if (admit && !admit()) {
      throw Object.assign(new Error('Session history run cancelled'), { kind: 'cancelled' });
    }
    let savedFamilies = 0;
    for (const { session, attendees } of families) {
      const parent = {
        ...session,
        class_id: await existingId(txn, 'classes', session.class_id),
        sync_status: 'synced',
        server_updated_at: session.updated_at,
      };
      if (await serverPullWouldClobberPendingLocal(txn, 'sessions', parent)) continue;
      await upsertDomainRecord(txn, {
        tableName: 'sessions',
        columns: SESSION_COLUMNS,
        jsonColumns: ['activities'],
      }, parent);

      for (const attendee of attendees) {
        if (!(await existingId(txn, 'children', attendee.child_id))) {
          await upsertDomainRecord(txn, {
            tableName: 'children',
            columns: HISTORY_REFERENCE_CHILD_COLUMNS,
          }, {
            id: attendee.child_id,
            first_name: attendee.child_first_name,
            last_name: attendee.child_last_name,
            preferred_name: attendee.child_preferred_name ?? null,
            history_reference: 1,
            sync_status: 'synced',
          });
        }
        const row = {
          id: attendee.id,
          session_id: attendee.session_id,
          child_id: attendee.child_id,
          // The session keeps its historical group id; attendees stay null when the group is missing.
          group_id: await existingId(txn, 'groups', attendee.group_id),
          attendance_status: attendee.attendance_status,
          grade_snapshot: attendee.grade_snapshot ?? null,
          notes: attendee.notes ?? null,
          created_at: attendee.created_at,
          updated_at: attendee.updated_at,
          sync_status: 'synced',
          server_updated_at: attendee.updated_at,
        };
        if (await serverPullWouldClobberPendingLocal(txn, 'session_attendees', row)) continue;
        await upsertDomainRecord(txn, { tableName: 'session_attendees', columns: ATTENDEE_COLUMNS }, row);
      }
      savedFamilies += 1;
    }
    await createSyncStateRepository({ database }).setPullState(scope, pullState, { transaction: txn });
    // Re-check after every awaited write, including the cursor. No await may follow this
    // check inside the transaction callback: an actor change must roll back the whole page.
    if (admit && !admit()) {
      throw Object.assign(new Error('Session history run cancelled'), { kind: 'cancelled' });
    }
    return { savedFamilies };
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
    saveHistoryPage,
    getUnsyncedRecords,
  };
};

export const sessionsRepository = createSessionsRepository();
