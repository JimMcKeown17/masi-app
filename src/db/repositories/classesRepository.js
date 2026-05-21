import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import {
  enqueueDomainOutbox,
  mapDomainRow,
  normalizeSyncFields,
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

export const createClassesRepository = ({ database } = {}) => {
  const runWrite = (transaction, task) => (
    transaction ? task(transaction) : runRepositoryTransaction(database, task)
  );

  const getClasses = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync('select * from classes where archived_at is null order by name');
    return rows.map(mapDomainRow);
  };

  const saveClass = async (classData, { transaction } = {}) => runWrite(transaction, async (txn) => {
    const record = normalizeSyncFields({
      ...classData,
      sync_status: classData.sync_status || syncStatusFromSynced(classData.synced),
    });
    await upsertDomainRecord(txn, {
      tableName: 'classes',
      columns: CLASS_COLUMNS,
    }, record);
    if (shouldEnqueueOutbox(record)) {
      await enqueueDomainOutbox(txn, 'classes', classData.id, 'insert', record);
    }
    return true;
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

    return true;
  });

  const deleteClass = async (id, options = {}) => archiveClass(id, options);

  return {
    getClasses,
    saveClass,
    updateClass,
    deleteClass,
    getUnsyncedClasses,
    archiveClass,
  };
};

export const classesRepository = createClassesRepository();
