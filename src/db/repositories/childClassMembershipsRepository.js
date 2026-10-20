import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import {
  assertRlsRequiredFields,
  enqueueDomainOutbox,
  mapDomainRow,
  normalizeSyncFields,
  shouldEnqueueOutbox,
  upsertDomainRecord,
} from './domainRepositoryUtils';

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
  'row_version',
];

const REQUIRED_RLS_FIELDS = ['child_id', 'class_id', 'created_by'];

export const createChildClassMembershipsRepository = ({ database } = {}) => {
  const save = async (membership, { transaction } = {}) => {
    assertRlsRequiredFields('child_class_memberships', membership, REQUIRED_RLS_FIELDS);
    const write = async (txn) => {
      const record = normalizeSyncFields(membership);
      await upsertDomainRecord(txn, {
        tableName: 'child_class_memberships',
        columns: COLUMNS,
      }, record);
      if (shouldEnqueueOutbox(record)) {
        await enqueueDomainOutbox(txn, 'child_class_memberships', record.id, record.exited_at ? 'archive' : 'insert', record);
      }
      return true;
    };

    return transaction ? write(transaction) : runRepositoryTransaction(database, write);
  };

  const getAll = async () => {
    const db = await resolveDatabase(database);
    // Historical memberships must retain their class grade even when the class
    // is archived or no longer belongs to the EA's active classes context.
    const rows = await db.getAllAsync(`
      select membership.*, classes.grade as class_grade
      from child_class_memberships membership
      left join classes on classes.id = membership.class_id
      order by membership.enrolled_at
    `);
    return rows.map(mapDomainRow);
  };

  return { save, getAll };
};

export const childClassMembershipsRepository = createChildClassMembershipsRepository();
