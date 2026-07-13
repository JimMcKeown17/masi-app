import {
  resolveDatabase,
  runBatchWithPerRowFallback,
  runRepositoryTransaction,
} from './repositoryRuntime';
import {
  classEaAssignmentDomainId,
  enqueueDomainOutbox,
  getActiveProgrammeId,
  mapDomainRow,
  normalizeSyncFields,
  serverPullWouldClobberPendingLocal,
  shouldEnqueueOutbox,
  upsertDomainRecord,
} from './domainRepositoryUtils';
import { syncStatusFromSynced } from './sqliteRepositoryUtils';

const CLASS_COLUMNS = [
  'id',
  'school_id',
  'name',
  'grade',
  'teacher',
  'teacher_id',
  'home_language',
  'academic_year',
  'academic_year_id',
  'archived_at',
  'archived_by_user_id',
  'archive_reason',
  'created_by',
  'created_at',
  'updated_at',
  'sync_status',
  'last_sync_error',
  'server_updated_at',
];

const CLASS_EA_ASSIGNMENT_COLUMNS = [
  'id',
  'class_id',
  'ea_user_id',
  'programme_id',
  'assigned_at',
  'unassigned_at',
  'handover_reason',
  'created_by',
  'created_at',
  'updated_at',
  'sync_status',
  'last_sync_error',
  'server_updated_at',
];

export const createClassesRepository = ({ database } = {}) => {
  const runWrite = (transaction, task) => (
    transaction ? task(transaction) : runRepositoryTransaction(database, task)
  );

  const getClasses = async ({ userId, programmeId } = {}) => {
    const db = await resolveDatabase(database);
    const activeProgrammeId = programmeId || (userId ? await getActiveProgrammeId(db, userId) : null);
    if (userId && !activeProgrammeId) return [];
    const rows = userId
      ? await db.getAllAsync(`
        select distinct classes.*
        from classes
        join class_ea_assignments cea
          on cea.class_id = classes.id
         and cea.ea_user_id = ?
         and cea.programme_id = ?
         and cea.unassigned_at is null
        where classes.archived_at is null
        order by classes.name
      `, userId, activeProgrammeId)
      : await db.getAllAsync('select * from classes where archived_at is null order by name');
    return rows.map(mapDomainRow);
  };

  const saveClass = async (classData, { transaction } = {}) => runWrite(transaction, async (txn) => {
    const incomingSyncStatus = classData.sync_status || syncStatusFromSynced(classData.synced);
    const isLocalWrite = !['synced', 'terminal'].includes(incomingSyncStatus);

    const ownerUserId = classData.created_by || classData.staff_id || classData.user_id || null;
    if (isLocalWrite && !ownerUserId) {
      throw new Error('classes.created_by is required (RLS contract)');
    }

    const programmeId = classData.programme_id
      || (ownerUserId ? await getActiveProgrammeId(txn, ownerUserId) : null);
    if (isLocalWrite && !programmeId && !classData.archived_at) {
      throw new Error('classes.programme_id is required (no active programme assignment for owner)');
    }

    const record = normalizeSyncFields({
      ...classData,
      created_by: classData.created_by || ownerUserId,
      sync_status: incomingSyncStatus,
    });
    if (await serverPullWouldClobberPendingLocal(txn, 'classes', record)) {
      return false;
    }
    await upsertDomainRecord(txn, {
      tableName: 'classes',
      columns: CLASS_COLUMNS,
    }, record);
    if (shouldEnqueueOutbox(record)) {
      await enqueueDomainOutbox(txn, 'classes', classData.id, 'insert', record);
    }

    if (isLocalWrite && ownerUserId && programmeId && !record.archived_at) {
      const activeAssignment = await txn.getFirstAsync(`
        select id
        from class_ea_assignments
        where class_id = ?
          and ea_user_id = ?
          and programme_id = ?
          and unassigned_at is null
      `, classData.id, ownerUserId, programmeId);

      if (!activeAssignment) {
        const assignment = normalizeSyncFields({
          id: activeAssignment?.id || classEaAssignmentDomainId({
            classId: classData.id,
            eaUserId: ownerUserId,
            programmeId,
          }),
          class_id: classData.id,
          ea_user_id: ownerUserId,
          programme_id: programmeId,
          assigned_at: record.created_at,
          created_by: ownerUserId,
          sync_status: record.sync_status,
        });
        await upsertDomainRecord(txn, {
          tableName: 'class_ea_assignments',
          columns: CLASS_EA_ASSIGNMENT_COLUMNS,
        }, assignment);
        await enqueueDomainOutbox(txn, 'class_ea_assignments', assignment.id, 'insert', assignment);
      }
    }
    return true;
  });

  const saveServerClassRows = async (rows = []) => runBatchWithPerRowFallback({
    database,
    rows,
    saveRow: saveClass,
    tableName: 'classes',
  });

  const updateClass = async (id, updates, { transaction } = {}) => runWrite(transaction, async (txn) => {
    const existing = await txn.getFirstAsync('select * from classes where id = ?', id);
    if (!existing) return false;
    const record = normalizeSyncFields({
      ...mapDomainRow(existing),
      ...updates,
      id,
      sync_status: updates.sync_status || syncStatusFromSynced(updates.synced),
    });
    await upsertDomainRecord(txn, {
      tableName: 'classes',
      columns: CLASS_COLUMNS,
    }, record);
    if (shouldEnqueueOutbox(record)) {
      await enqueueDomainOutbox(txn, 'classes', id, 'update', record);
    }
    return true;
  });

  const getUnsyncedClasses = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync("select * from classes where sync_status <> 'synced' order by created_at");
    return rows.map(mapDomainRow);
  };

  const archiveClass = async (classId, {
    actorUserId,
    archivedAt = new Date().toISOString(),
    archiveReason = null,
    transaction,
  } = {}) => runWrite(transaction, async (txn) => {
    await txn.runAsync(`
      update classes
      set archived_at = ?,
          archived_by_user_id = ?,
          archive_reason = ?,
          sync_status = 'pending',
          updated_at = ?
      where id = ?
    `, archivedAt, actorUserId || null, archiveReason, archivedAt, classId);
    await enqueueDomainOutbox(txn, 'classes', classId, 'archive', { id: classId, archived_at: archivedAt });

    const assignments = await txn.getAllAsync(
      'select id from class_ea_assignments where class_id = ? and unassigned_at is null',
      classId
    );
    await txn.runAsync(`
      update class_ea_assignments
      set unassigned_at = ?,
          sync_status = 'pending',
          updated_at = ?
      where class_id = ?
        and unassigned_at is null
    `, archivedAt, archivedAt, classId);

    for (const assignment of assignments) {
      await enqueueDomainOutbox(txn, 'class_ea_assignments', assignment.id, 'archive', {
        id: assignment.id,
        unassigned_at: archivedAt,
      });
    }

    const childClassRows = await txn.getAllAsync(
      'select id from child_class_memberships where class_id = ? and exited_at is null',
      classId
    );
    await txn.runAsync(`
      update child_class_memberships
      set exited_at = ?,
          sync_status = 'pending',
          updated_at = ?
      where class_id = ?
        and exited_at is null
    `, archivedAt, archivedAt, classId);
    for (const membership of childClassRows) {
      await enqueueDomainOutbox(txn, 'child_class_memberships', membership.id, 'archive', {
        id: membership.id,
        exited_at: archivedAt,
      });
    }

    const childRows = await txn.getAllAsync(
      'select * from children where class_id = ? and archived_at is null',
      classId
    );
    await txn.runAsync(`
      update children
      set class_id = null,
          sync_status = 'pending',
          updated_at = ?
      where class_id = ?
        and archived_at is null
    `, archivedAt, classId);
    for (const child of childRows) {
      const payload = normalizeSyncFields({
        ...mapDomainRow(child),
        class_id: null,
        updated_at: archivedAt,
        sync_status: 'pending',
      });
      await enqueueDomainOutbox(txn, 'children', child.id, 'update', payload);
    }

    return true;
  });

  const deleteClass = async (id, options = {}) => archiveClass(id, options);

  return {
    getClasses,
    saveClass,
    saveServerClassRows,
    updateClass,
    deleteClass,
    getUnsyncedClasses,
    archiveClass,
  };
};

export const classesRepository = createClassesRepository();
