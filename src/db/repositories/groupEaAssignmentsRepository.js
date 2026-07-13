import {
  resolveDatabase,
  runBatchWithPerRowFallback,
  runRepositoryTransaction,
} from './repositoryRuntime';
import {
  enqueueDomainOutbox,
  mapDomainRow,
  normalizeSyncFields,
  serverPullWouldClobberPendingLocal,
  shouldEnqueueOutbox,
  upsertDomainRecord,
} from './domainRepositoryUtils';

const COLUMNS = [
  'id',
  'group_id',
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

export const createGroupEaAssignmentsRepository = ({ database } = {}) => {
  const save = async (assignment, { transaction } = {}) => {
    const write = async (txn) => {
      const record = normalizeSyncFields(assignment);
      if (await serverPullWouldClobberPendingLocal(txn, 'group_ea_assignments', record)) {
        return false;
      }
      await upsertDomainRecord(txn, {
        tableName: 'group_ea_assignments',
        columns: COLUMNS,
      }, record);
      if (shouldEnqueueOutbox(record)) {
        await enqueueDomainOutbox(txn, 'group_ea_assignments', record.id, record.unassigned_at ? 'archive' : 'insert', record);
      }
      return true;
    };

    return transaction ? write(transaction) : runRepositoryTransaction(database, write);
  };

  const getAll = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync('select * from group_ea_assignments order by assigned_at');
    return rows.map(mapDomainRow);
  };

  const saveServerRow = async (row, { transaction } = {}) => save({
    ...row,
    synced: true,
    sync_status: 'synced',
  }, { transaction });

  const saveServerRows = async (rows = []) => runBatchWithPerRowFallback({
    database,
    rows,
    saveRow: saveServerRow,
    tableName: 'group_ea_assignments',
  });

  return { save, saveServerRows, getAll };
};

export const groupEaAssignmentsRepository = createGroupEaAssignmentsRepository();
