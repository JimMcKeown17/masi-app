import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import { enqueueDomainOutbox, mapDomainRow, upsertDomainRecord } from './domainRepositoryUtils';

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
      await upsertDomainRecord(txn, {
        tableName: 'group_ea_assignments',
        columns: COLUMNS,
      }, assignment);
      await enqueueDomainOutbox(txn, 'group_ea_assignments', assignment.id, assignment.unassigned_at ? 'archive' : 'insert', assignment);
      return true;
    };

    return transaction ? write(transaction) : runRepositoryTransaction(database, write);
  };

  const getAll = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync('select * from group_ea_assignments order by assigned_at');
    return rows.map(mapDomainRow);
  };

  return { save, getAll };
};

export const groupEaAssignmentsRepository = createGroupEaAssignmentsRepository();
