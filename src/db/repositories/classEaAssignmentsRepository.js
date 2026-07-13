import {
  resolveDatabase,
  runBatchWithPerRowFallback,
  runReconcileWithMassEndBreaker,
  runRepositoryTransaction,
} from './repositoryRuntime';
import {
  assertRlsRequiredFields,
  enqueueDomainOutbox,
  mapDomainRow,
  normalizeSyncFields,
  serverPullWouldClobberPendingLocal,
  shouldEnqueueOutbox,
  upsertDomainRecord,
} from './domainRepositoryUtils';

const COLUMNS = [
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

const REQUIRED_RLS_FIELDS = ['class_id', 'ea_user_id', 'programme_id', 'created_by'];

export const createClassEaAssignmentsRepository = ({ database } = {}) => {
  const buildReconcile = ({
    acknowledgedClassIds,
    userId,
    programmeId,
    pulledAt,
    bypassBreaker = false,
  } = {}) => {
    if (!Array.isArray(acknowledgedClassIds) || !userId || !programmeId || !pulledAt) {
      throw new Error(
        'classEaAssignments reconcile requires acknowledgedClassIds, userId, programmeId, and pulledAt'
      );
    }
    const acknowledgedClassIdsJson = JSON.stringify(acknowledgedClassIds);
    const activeScopeSql = `
      from class_ea_assignments
      where ea_user_id = ?
        and programme_id = ?
        and unassigned_at is null
        and sync_status = 'synced'
    `;
    const absentSql = `${activeScopeSql}
      and class_id not in (select value from json_each(?))
    `;
    return (transaction) => runReconcileWithMassEndBreaker({
      transaction,
      scope: 'classEaAssignments',
      pulledAt,
      bypassBreaker,
      countCandidates: async (txn) => (
        await txn.getFirstAsync(
          `select count(*) as count ${activeScopeSql}`,
          userId,
          programmeId
        )
      )?.count,
      countWouldEnd: async (txn) => (
        await txn.getFirstAsync(
          `select count(*) as count ${absentSql}`,
          userId,
          programmeId,
          acknowledgedClassIdsJson
        )
      )?.count,
      apply: async (txn) => (
        await txn.runAsync(`
          update class_ea_assignments
          set unassigned_at = ?,
              updated_at = ?
          where ea_user_id = ?
            and programme_id = ?
            and unassigned_at is null
            and sync_status = 'synced'
            and class_id not in (select value from json_each(?))
        `, pulledAt, pulledAt, userId, programmeId, acknowledgedClassIdsJson)
      ).changes,
    });
  };

  const save = async (assignment, { transaction } = {}) => {
    const write = async (txn) => {
      const record = normalizeSyncFields(assignment);
      if (await serverPullWouldClobberPendingLocal(txn, 'class_ea_assignments', record)) {
        return false;
      }
      if (shouldEnqueueOutbox(record)) {
        assertRlsRequiredFields('class_ea_assignments', record, REQUIRED_RLS_FIELDS);
      }
      await upsertDomainRecord(txn, {
        tableName: 'class_ea_assignments',
        columns: COLUMNS,
      }, record);
      if (shouldEnqueueOutbox(record)) {
        await enqueueDomainOutbox(txn, 'class_ea_assignments', record.id, record.unassigned_at ? 'archive' : 'insert', record);
      }
      return true;
    };

    return transaction ? write(transaction) : runRepositoryTransaction(database, write);
  };

  const getAll = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync('select * from class_ea_assignments order by assigned_at');
    return rows.map(mapDomainRow);
  };

  const saveServerRows = async (rows = [], { reconcile } = {}) => runBatchWithPerRowFallback({
    database,
    rows,
    saveRow: save,
    tableName: 'class_ea_assignments',
    reconcile: reconcile ? buildReconcile(reconcile) : undefined,
  });

  return { save, saveServerRows, getAll };
};

export const classEaAssignmentsRepository = createClassEaAssignmentsRepository();
