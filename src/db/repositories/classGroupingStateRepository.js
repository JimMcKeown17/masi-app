import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import {
  enqueueDomainOutbox,
  mapDomainRow,
  normalizeSyncFields,
  shouldEnqueueOutbox,
  upsertDomainRecord,
} from './domainRepositoryUtils';

const COLUMNS = [
  'id',
  'class_id',
  'academic_year_id',
  'class_list_status',
  'class_list_completed_at',
  'class_list_completed_by_user_id',
  'class_list_reopened_at',
  'class_list_reopened_by_user_id',
  'active_grouping_version_id',
  'created_at',
  'updated_at',
  'sync_status',
  'last_sync_error',
  'server_updated_at',
];

export const createClassGroupingStateRepository = ({ database } = {}) => {
  const save = async (state, { transaction } = {}) => {
    const write = async (txn) => {
      const record = normalizeSyncFields(state);
      await upsertDomainRecord(txn, {
        tableName: 'class_grouping_state',
        columns: COLUMNS,
      }, record);
      if (shouldEnqueueOutbox(record)) {
        await enqueueDomainOutbox(txn, 'class_grouping_state', record.id, 'update', record);
      }
      return true;
    };

    return transaction ? write(transaction) : runRepositoryTransaction(database, write);
  };

  const getAll = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync('select * from class_grouping_state order by class_id');
    return rows.map(mapDomainRow);
  };

  return { save, getAll };
};

export const classGroupingStateRepository = createClassGroupingStateRepository();
