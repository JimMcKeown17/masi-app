import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
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

  const saveServerRows = async (rows = []) => runRepositoryTransaction(database, async (txn) => {
    let applied = 0;
    let skipped = 0;
    for (const row of rows) {
      if (await save(row, { transaction: txn }) === false) {
        skipped += 1;
      } else {
        applied += 1;
      }
    }
    return { applied, skipped };
  });

  return { save, saveServerRows, getAll };
};

export const classEaAssignmentsRepository = createClassEaAssignmentsRepository();
