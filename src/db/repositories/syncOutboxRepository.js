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
  nextRetryAt: row.next_retry_at || null,
  retryCount: row.retry_count || 0,
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

  const getReadyRecords = async ({ limit = 50, now = timestamp(), includeBackedOff = false, includeTerminal = false } = {}) => {
    const db = await resolveDatabase(database);
    // A forced ("Sync Now") pass also resurrects terminal rows so the user can clear a stuck
    // dependency chain (e.g. assessment_items that 42501'd because their parent had not synced yet);
    // auto-sync (includeTerminal=false) keeps skipping terminal rows so genuine permission failures
    // do not retry-storm.
    const statuses = includeTerminal ? "('pending', 'failed', 'terminal')" : "('pending', 'failed')";
    const rows = await db.getAllAsync(`
      select *
      from sync_outbox
      where status in ${statuses}
        ${includeBackedOff ? '' : 'and (next_retry_at is null or next_retry_at <= ?)'}
      order by created_at, table_name, record_id
      limit ?
    `, ...(includeBackedOff ? [limit] : [now, limit]));
    return rows.map(toOutboxRecord);
  };

  const hasPendingRecord = async ({ tableName, recordId }) => {
    if (!tableName || !recordId) return false;
    const db = await resolveDatabase(database);
    // "Still owed" means the outbox row has not been acknowledged. Terminal rows do not count.
    const row = await db.getFirstAsync(`
      select id from sync_outbox
      where table_name = ? and record_id = ?
        and status in ('pending', 'failed', 'in_flight')
      limit 1
    `, tableName, recordId);
    return !!row;
  };

  const getTerminalRecords = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync(`
      select *
      from sync_outbox
      where status = 'terminal'
      order by created_at, table_name, record_id
    `);
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

  const resetInFlight = async ({ transaction } = {}) => runWrite(transaction, async (txn) => {
    await txn.runAsync(`
      update sync_outbox
      set status = 'pending',
          updated_at = ?
      where status = 'in_flight'
    `, timestamp());
    return true;
  });

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

  const requeueTerminalRows = async (ids, { transaction } = {}) => {
    if (!ids || ids.length === 0) return 0;
    return runWrite(transaction, async (txn) => {
      let count = 0;
      for (const id of ids) {
        const result = await txn.runAsync(`
          update sync_outbox
          set status = 'pending',
              retry_count = 0,
              next_retry_at = null,
              last_error = null,
              updated_at = ?
          where id = ?
            and status = 'terminal'
        `, timestamp(), id);
        count += result?.changes || 0;
      }
      return count;
    });
  };

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
    // ONE statement = one snapshot (R1): counts and itemized lists must never disagree.
    // Separate queries can interleave with a sync pass finalizing rows, yielding e.g.
    // needsAttentionCount 1 with an empty needsAttentionItems. The outbox is a small,
    // bounded backlog, so loading it whole is cheap.
    const rows = await db.getAllAsync('select * from sync_outbox');
    const now = timestamp();

    const breakdown = {};
    let unsyncedCount = 0;
    let failedCount = 0;
    let inFlightCount = 0;
    let needsAttentionCount = 0;
    let backedOffCount = 0;
    let nextRetryAt = null;

    for (const row of rows) {
      if (!(row.table_name in breakdown)) {
        breakdown[row.table_name] = 0;
      }

      if (row.status === 'pending' || row.status === 'failed') {
        breakdown[row.table_name] += 1;
        unsyncedCount += 1;
      }
      if (row.status === 'failed' || row.status === 'terminal') {
        failedCount += 1;
      }
      if (row.status === 'in_flight') {
        inFlightCount += 1;
      }
      if (row.status === 'terminal') {
        needsAttentionCount += 1;
      }
      // Backed-off subset of waiting: retriable failures whose next attempt is in the
      // future. ISO-8601 UTC strings compare correctly as text.
      if (row.status === 'failed' && row.next_retry_at && row.next_retry_at > now) {
        backedOffCount += 1;
        if (!nextRetryAt || row.next_retry_at < nextRetryAt) {
          nextRetryAt = row.next_retry_at;
        }
      }
    }

    // Same ordering as getFailedItems (failed first, then updated_at, table, record).
    const failedItems = rows
      .filter((row) => row.status === 'failed' || row.status === 'terminal')
      .sort((a, b) => (
        ((a.status === 'failed' ? 0 : 1) - (b.status === 'failed' ? 0 : 1))
        || (a.updated_at || '').localeCompare(b.updated_at || '')
        || a.table_name.localeCompare(b.table_name)
        || a.record_id.localeCompare(b.record_id)
      ))
      .map(toFailedItem);

    return {
      unsyncedCount,
      failedCount,
      inFlightCount,
      // Everything still owed except terminal (R5): a row stranded in_flight by a killed
      // pass must read as waiting, not as synced. resetInFlight only runs at the start of
      // the NEXT pass, which never comes while offline.
      waitingCount: unsyncedCount + inFlightCount,
      needsAttentionCount,
      backedOffCount,
      nextRetryAt,
      breakdown,
      failedItems,
      needsAttentionItems: failedItems.filter((item) => item.terminal),
    };
  };

  return {
    enqueue,
    getById,
    getReadyRecords,
    hasPendingRecord,
    getTerminalRecords,
    markInFlight,
    resetInFlight,
    markReady,
    requeueTerminalRows,
    markRetriableFailure,
    markTerminalFailure,
    deleteRecord,
    getFailedItems,
    getSyncStatus,
  };
};

export const syncOutboxRepository = createSyncOutboxRepository();
