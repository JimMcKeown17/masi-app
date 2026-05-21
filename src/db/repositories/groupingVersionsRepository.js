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
  'version_number',
  'status',
  'accepted_at',
  'accepted_by_user_id',
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

export const createGroupingVersionsRepository = ({ database } = {}) => {
  const save = async (groupingVersion, { transaction } = {}) => {
    const write = async (txn) => {
      if ((groupingVersion.status || 'active') === 'active') {
        const existingActive = await txn.getFirstAsync(`
          select id
          from grouping_versions
          where class_id = ?
            and academic_year_id = ?
            and status = 'active'
            and id <> ?
          limit 1
        `, groupingVersion.class_id, groupingVersion.academic_year_id, groupingVersion.id);

        if (existingActive) {
          throw new Error('unique active grouping version per class and academic year');
        }
      }

      const record = normalizeSyncFields(groupingVersion);
      await upsertDomainRecord(txn, {
        tableName: 'grouping_versions',
        columns: COLUMNS,
      }, record);
      if (shouldEnqueueOutbox(record)) {
        await enqueueDomainOutbox(txn, 'grouping_versions', record.id, record.status === 'archived' ? 'archive' : 'insert', record);
      }
      return true;
    };

    return transaction ? write(transaction) : runRepositoryTransaction(database, write);
  };

  const getAll = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync('select * from grouping_versions order by class_id, version_number');
    return rows.map(mapDomainRow);
  };

  return { save, getAll };
};

export const groupingVersionsRepository = createGroupingVersionsRepository();
