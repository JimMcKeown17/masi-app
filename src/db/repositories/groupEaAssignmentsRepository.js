import {
  resolveDatabase,
  runBatchWithPerRowFallback,
  runReconcileWithMassEndBreaker,
  runRepositoryTransaction,
} from './repositoryRuntime';
import {
  enqueueDomainOutbox,
  enqueueLifecycleOutbox,
  mapDomainRow,
  normalizeSyncFields,
  serverPullWouldClobberPendingLocal,
  shouldEnqueueOutbox,
  supersedeStaleActivePairRow,
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
  'row_version',
];

export const createGroupEaAssignmentsRepository = ({ database } = {}) => {
  const buildReconcile = ({
    acknowledgedGroupIds,
    userId,
    programmeId,
    pulledAt,
    bypassBreaker = false,
  } = {}) => {
    if (!Array.isArray(acknowledgedGroupIds) || !userId || !programmeId || !pulledAt) {
      throw new Error(
        'groupEaAssignments reconcile requires acknowledgedGroupIds, userId, programmeId, and pulledAt'
      );
    }
    const acknowledgedGroupIdsJson = JSON.stringify(acknowledgedGroupIds);
    const activeScopeSql = `
      from group_ea_assignments
      where ea_user_id = ?
        and programme_id = ?
        and unassigned_at is null
        and sync_status = 'synced'
    `;
    const absentSql = `${activeScopeSql}
      and group_id not in (select value from json_each(?))
    `;
    return (transaction) => runReconcileWithMassEndBreaker({
      transaction,
      scope: 'groupEaAssignments',
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
          acknowledgedGroupIdsJson
        )
      )?.count,
      apply: async (txn) => (
        await txn.runAsync(`
          update group_ea_assignments
          set unassigned_at = ?,
              updated_at = ?
          where ea_user_id = ?
            and programme_id = ?
            and unassigned_at is null
            and sync_status = 'synced'
            and group_id not in (select value from json_each(?))
        `, pulledAt, pulledAt, userId, programmeId, acknowledgedGroupIdsJson)
      ).changes,
    });
  };

  const save = async (assignment, { transaction } = {}) => {
    const write = async (txn) => {
      const record = normalizeSyncFields(assignment);
      if (await serverPullWouldClobberPendingLocal(txn, 'group_ea_assignments', record)) {
        return false;
      }
      const existing = await txn.getFirstAsync(
        'select * from group_ea_assignments where id = ?',
        record.id
      );
      const supersede = await supersedeStaleActivePairRow(txn, {
        tableName: 'group_ea_assignments',
        pairColumns: ['group_id'],
        endColumn: 'unassigned_at',
        record,
      });
      if (supersede.action === 'skip') {
        return false;
      }
      await upsertDomainRecord(txn, {
        tableName: 'group_ea_assignments',
        columns: COLUMNS,
      }, record);
      if (shouldEnqueueOutbox(record)) {
        if (record.unassigned_at != null) {
          await enqueueLifecycleOutbox(
            txn,
            'group_ea_assignments',
            record.id,
            'archive',
            {
              id: record.id,
              unassigned_at: record.unassigned_at,
              handover_reason: record.handover_reason ?? null,
            }
          );
        } else if (existing?.unassigned_at != null) {
          await enqueueLifecycleOutbox(
            txn,
            'group_ea_assignments',
            record.id,
            'restore',
            {
              id: record.id,
              unassigned_at: null,
              handover_reason: null,
            }
          );
          const insertStillOwed = await txn.getFirstAsync(`
            select 1 as owed from sync_outbox
            where table_name = 'group_ea_assignments'
              and record_id = ?
              and operation = 'insert'
              and status in ('pending', 'failed', 'in_flight')
            limit 1
          `, record.id);
          if (insertStillOwed) {
            await enqueueDomainOutbox(
              txn,
              'group_ea_assignments',
              record.id,
              'insert',
              record
            );
          }
        } else {
          await enqueueDomainOutbox(
            txn,
            'group_ea_assignments',
            record.id,
            'insert',
            record
          );
        }
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

  const saveServerRows = async (rows = [], { reconcile } = {}) => runBatchWithPerRowFallback({
    database,
    rows,
    saveRow: saveServerRow,
    tableName: 'group_ea_assignments',
    reconcile: reconcile ? buildReconcile(reconcile) : undefined,
  });

  return { save, saveServerRows, getAll };
};

export const groupEaAssignmentsRepository = createGroupEaAssignmentsRepository();
