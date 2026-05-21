import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import { enqueueDomainOutbox, mapDomainRow, upsertDomainRecord } from './domainRepositoryUtils';

const COLUMNS = [
  'id',
  'child_id',
  'class_id',
  'academic_year_id',
  'enrolled_at',
  'exited_at',
  'created_by',
  'created_at',
  'updated_at',
  'sync_status',
  'last_sync_error',
  'server_updated_at',
];

export const createChildClassMembershipsRepository = ({ database } = {}) => {
  const save = async (membership, { transaction } = {}) => {
    const write = async (txn) => {
      await upsertDomainRecord(txn, {
        tableName: 'child_class_memberships',
        columns: COLUMNS,
      }, membership);
      await enqueueDomainOutbox(txn, 'child_class_memberships', membership.id, membership.exited_at ? 'archive' : 'insert', membership);
      return true;
    };

    return transaction ? write(transaction) : runRepositoryTransaction(database, write);
  };

  const getAll = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync('select * from child_class_memberships order by enrolled_at');
    return rows.map(mapDomainRow);
  };

  return { save, getAll };
};

export const childClassMembershipsRepository = createChildClassMembershipsRepository();
