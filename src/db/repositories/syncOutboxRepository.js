import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import {
  decodeJson,
  insertOutboxRecord,
  timestamp,
} from './sqliteRepositoryUtils';

const toOutboxRecord = (row) => {
  if (!row) return null;
  return {
    ...row,
    tableName: row.table_name,
    recordId: row.record_id,
    payload: decodeJson(row.payload, null),
  };
};

const toFailedItem = (row) => ({
  table: row.table_name,
  id: row.record_id,
  operation: row.operation,
  reason: row.last_error || 'Sync failed',
  failedAt: row.updated_at,
  terminal: row.status === 'terminal',
});

export const outboxRecordId = (tableName, recordId, operation) => (
  `${tableName}:${recordId}:${operation}`
);

export const createSyncOutboxRepository = ({ database } = {}) => {
  const runWrite = (transaction, task) => (
    transaction ? task(transaction) : runRepositoryTransaction(database, task)
  );

  const enqueue = async ({
    tableName,
    recordId,
    operation,
    payload = null,
    id = outboxRecordId(tableName, recordId, operation),
  }, { transaction } = {}) => runWrite(transaction, async (txn) => {
    await insertOutboxRecord(txn, {
      id,
      tableName,
      recordId,
      operation,
      payload,
      status: 'pending',
    });
    await txn.runAsync(`
      update sync_outbox
      set retry_count = 0,
          last_error = null,
          next_retry_at = null,
          status = 'pending',
          updated_at = ?
      where id = ?
    `, timestamp(), id);
    return id;
  });

  const getById = async (id) => {
    const db = await resolveDatabase(database);
    const row = await db.getFirstAsync('select * from sync_outbox where id = ?', id);
    return toOutboxRecord(row);
  };

  const getReadyRecords = async ({ limit = 50, now = timestamp() } = {}) => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync(`
      select *
      from sync_outbox
      where status in ('pending', 'failed')
        and (next_retry_at is null or next_retry_at <= ?)
      order by created_at, table_name, record_id
      limit ?
    `, now, limit);
    return rows.map(toOutboxRecord);
  };

  const markInFlight = async (ids, { transaction } = {}) => {
    if (!ids || ids.length === 0) return true;
    return runWrite(transaction, async (txn) => {
      const now = timestamp();
      for (const id of ids) {
        await txn.runAsync(`
          update sync_outbox
          set status = 'in_flight',
              updated_at = ?
          where id = ?
        `, now, id);
      }
      return true;
    });
  };

  const markReady = async (id, { transaction } = {}) => runWrite(transaction, async (txn) => {
    await txn.runAsync(`
      update sync_outbox
      set status = 'pending',
          next_retry_at = null,
          updated_at = ?
      where id = ?
    `, timestamp(), id);
    return true;
  });

  const markRetriableFailure = async (id, {
    errorMessage,
    nextRetryAt = null,
  } = {}, { transaction } = {}) => runWrite(transaction, async (txn) => {
    await txn.runAsync(`
      update sync_outbox
      set status = 'failed',
          retry_count = retry_count + 1,
          last_error = ?,
          next_retry_at = ?,
          updated_at = ?
      where id = ?
    `, errorMessage || 'Sync failed', nextRetryAt, timestamp(), id);
    return true;
  });

  const markTerminalFailure = async (id, {
    errorMessage,
  } = {}, { transaction } = {}) => runWrite(transaction, async (txn) => {
    await txn.runAsync(`
      update sync_outbox
      set status = 'terminal',
          last_error = ?,
          next_retry_at = null,
          updated_at = ?
      where id = ?
    `, errorMessage || 'Terminal sync failure', timestamp(), id);
    return true;
  });

  const deleteRecord = async (id, { transaction } = {}) => runWrite(transaction, async (txn) => {
    await txn.runAsync('delete from sync_outbox where id = ?', id);
    return true;
  });

  const getFailedItems = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync(`
      select *
      from sync_outbox
      where status in ('failed', 'terminal')
      order by
        case status when 'failed' then 0 else 1 end,
        updated_at,
        table_name,
        record_id
    `);
    return rows.map(toFailedItem);
  };

  const getSyncStatus = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync(`
      select table_name, status, count(*) as count
      from sync_outbox
      group by table_name, status
    `);
    const breakdown = {};
    let unsyncedCount = 0;
    let failedCount = 0;
    let inFlightCount = 0;

    for (const row of rows) {
      if (!(row.table_name in breakdown)) {
        breakdown[row.table_name] = 0;
      }

      if (row.status === 'pending' || row.status === 'failed') {
        breakdown[row.table_name] += row.count;
        unsyncedCount += row.count;
      }
      if (row.status === 'failed' || row.status === 'terminal') {
        failedCount += row.count;
      }
      if (row.status === 'in_flight') {
        inFlightCount += row.count;
      }
    }

    return {
      unsyncedCount,
      failedCount,
      inFlightCount,
      breakdown,
      failedItems: await getFailedItems(),
    };
  };

  return {
    enqueue,
    getById,
    getReadyRecords,
    markInFlight,
    markReady,
    markRetriableFailure,
    markTerminalFailure,
    deleteRecord,
    getFailedItems,
    getSyncStatus,
  };
};

export const syncOutboxRepository = createSyncOutboxRepository();
