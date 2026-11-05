import { normalizeErrorCode } from '../../utils/normalizeErrorCode';
import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import { isStampedOperation } from './rowVersion';
import { captureOperationalError } from '../../services/observability';
import {
  decodeJson,
  insertOutboxRecord,
  quoteIdentifier,
  sqlPlaceholders,
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
  outboxId: row.id,
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

// Lifecycle safety O1: the refused (terminal) rows a forced pass may send again. History is
// idempotent: every insert is an upsert or insert-or-ignore, and the history RPCs acknowledge a
// replay. The children hard_delete is decided by the server's RPC. A refused archive, restore or
// edit is never sent again: it could land on newer server state (MA-BUG-20261104-011, -018). It
// leaves the phone only through its delivered receipt (services/deliveredReceipt.js).
const HISTORY_RPC_UPDATE_TABLES = ['battery_runs', 'letter_mastery', 'skill_mastery'];
export const isResendableRefusal = ({ table_name: tableName, operation } = {}) => (
  operation === 'insert'
  || (operation === 'update' && HISTORY_RPC_UPDATE_TABLES.includes(tableName))
  || (operation === 'hard_delete' && tableName === 'children')
);
export const RESENDABLE_REFUSAL_SQL = `(operation = 'insert'
  or (operation = 'update' and table_name in (${HISTORY_RPC_UPDATE_TABLES.map((table) => `'${table}'`).join(', ')}))
  or (operation = 'hard_delete' and table_name = 'children'))`;

// Spec §7.2: the one definition of unsent work. The sign-out warning, the left-behind report
// and any future deletion rule all read it through readUnsentSummary.
export const UNSENT_STATUSES = ['pending', 'failed', 'in_flight', 'terminal'];
const UNSENT_IN = `(${UNSENT_STATUSES.map((status) => `'${status}'`).join(', ')})`;

export const readUnsentSummary = async (db) => {
  const rows = await db.getAllAsync(`
    select table_name, count(*) as count from sync_outbox
    where status in ${UNSENT_IN} group by table_name
  `);
  const oldest = await db.getFirstAsync(`
    select id, created_at from sync_outbox
    where status in ${UNSENT_IN} order by created_at, id limit 1
  `);
  return {
    total: rows.reduce((total, row) => total + row.count, 0),
    byTable: Object.fromEntries(rows.map((row) => [row.table_name, row.count])),
    oldestId: oldest?.id ?? null,
    oldestCreatedAt: oldest?.created_at ?? null,
  };
};

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
    return id;
  });

  const getById = async (id) => {
    const db = await resolveDatabase(database);
    const row = await db.getFirstAsync('select * from sync_outbox where id = ?', id);
    return toOutboxRecord(row);
  };

  const getReadyRecords = async ({
    limit = 50,
    now = timestamp(),
    includeBackedOff = false,
    includeTerminal = false,
    ownerUserId,
  } = {}) => {
    const db = await resolveDatabase(database);
    // A forced pass (Sync now, Retry, pull-to-refresh, sign-out) also sends refused history again,
    // so a server fix heals it without an app release. It never sends a refused archive, restore or
    // edit (isResendableRefusal). Auto-sync skips every terminal row so refusals do not retry-storm.
    const statuses = includeTerminal
      ? `(status in ('pending', 'failed') or (status = 'terminal' and ${RESENDABLE_REFUSAL_SQL}))`
      : "status in ('pending', 'failed')";
    const ownerScoped = ownerUserId !== undefined;
    const params = [];
    if (!includeBackedOff) params.push(now);
    if (ownerScoped) params.push(ownerUserId);
    params.push(limit);
    const rows = await db.getAllAsync(`
      select *
      from sync_outbox
      where ${statuses}
        ${includeBackedOff ? '' : 'and (next_retry_at is null or next_retry_at <= ?)'}
        ${ownerScoped ? 'and owner_user_id = ?' : ''}
      order by created_at, table_name, record_id
      limit ?
    `, ...params);
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

  // True while an outbox row for exactly this operation is still owed. Terminal rows do not count.
  const hasPendingOperation = async ({ tableName, recordId, operation }) => {
    if (!tableName || !recordId || !operation) return false;
    const db = await resolveDatabase(database);
    const row = await db.getFirstAsync(`
      select id from sync_outbox
      where table_name = ? and record_id = ? and operation = ?
        and status in ('pending', 'failed', 'in_flight')
      limit 1
    `, tableName, recordId, operation);
    return !!row;
  };

  const getPendingHardDeleteIds = async ({ tableName, ownerUserId } = {}) => {
    if (!tableName) return new Set();
    const db = await resolveDatabase(database);
    const ownerScoped = ownerUserId !== undefined;
    const rows = await db.getAllAsync(`
      select distinct record_id
      from sync_outbox
      where table_name = ?
        and operation = 'hard_delete'
        and status in ('pending', 'failed', 'in_flight')
        ${ownerScoped ? 'and owner_user_id = ?' : ''}
    `, tableName, ...(ownerScoped ? [ownerUserId] : []));
    return new Set(rows.map((row) => row.record_id));
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

  // Claims the rows for upload. A refused archive, restore or edit is never claimed (O1). The
  // claim remembers each row's status, and the domain status it flips, so a refused row that is
  // then not attempted goes back to terminal (restoreRefusedClaims, MA-BUG-20261104-021).
  const updateInFlight = async (txn, ids, now) => {
    const before = await txn.getAllAsync(`
      select id, table_name, record_id, operation, status
      from sync_outbox
      where id in (${sqlPlaceholders(ids.length)})
        and (status <> 'terminal' or ${RESENDABLE_REFUSAL_SQL})
    `, ...ids);
    const claims = new Map();
    if (before.length === 0) return claims;
    const claimable = new Set(before.map((row) => row.id));
    const claimedIds = ids.filter((id) => claimable.has(id));
    await txn.runAsync(`
      update sync_outbox
      set status = 'in_flight',
          last_error = case when table_name = 'children' and operation = 'insert'
            then coalesce(last_error, 'Upload started; server outcome unknown') else last_error end,
          updated_at = ?
      where id in (${sqlPlaceholders(claimedIds.length)})
    `, now, ...claimedIds);
    for (const row of before) {
      const claim = { claimedFromStatus: row.status, claimedDomainStatus: null };
      claims.set(row.id, claim);
      if (!isStampedOperation(row.table_name, row.operation)) continue;
      const table = quoteIdentifier(row.table_name);
      const domain = await txn.getFirstAsync(`select sync_status from ${table} where id = ?`, row.record_id);
      claim.claimedDomainStatus = domain?.sync_status ?? null;
      // A forced terminal retry must be protected from overlapping pulls until it settles.
      await txn.runAsync(`
        update ${table}
        set row_version = row_version + 1,
            sync_status = case when sync_status = 'terminal' then 'pending' else sync_status end
        where id = ?
      `, row.record_id);
      const local = await txn.getFirstAsync(`select row_version from ${table} where id = ?`, row.record_id);
      if (local) {
        await txn.runAsync(`
          update sync_outbox set payload = json_set(payload, '$.row_version', ?) where id = ?
        `, local.row_version, row.id);
      }
    }
    return claims;
  };

  const markInFlight = async (ids, { transaction } = {}) => {
    if (!ids || ids.length === 0) return true;
    return runWrite(transaction, async (txn) => {
      await updateInFlight(txn, ids, timestamp());
      return true;
    });
  };

  const markInFlightAndGet = async (ids, { transaction } = {}) => {
    if (!ids || ids.length === 0) return [];
    return runWrite(transaction, async (txn) => {
      const claims = await updateInFlight(txn, ids, timestamp());
      if (claims.size === 0) return [];
      const claimedIds = ids.filter((id) => claims.has(id));
      const rows = await txn.getAllAsync(`
        select *
        from sync_outbox
        where id in (${sqlPlaceholders(claimedIds.length)})
      `, ...claimedIds);
      const rowsById = new Map(rows.map((row) => [row.id, { ...toOutboxRecord(row), ...claims.get(row.id) }]));
      return ids.map((id) => rowsById.get(id)).filter(Boolean);
    });
  };

  // MA-BUG-20261104-021: a refused row forced into a pass and then not attempted (deferred, a
  // user switch, a throw) goes back to terminal, never pending or failed. The compare-and-set on
  // the claim's updated_at leaves a newer local revision alone. The domain row gets back the
  // status the claim flipped; its version stays equal to the payload's.
  const restoreRefusedClaims = async (claimedRecords, { transaction } = {}) => {
    const records = (claimedRecords || []).filter(Boolean);
    if (records.length === 0) return 0;
    return runWrite(transaction, async (txn) => {
      let restored = 0;
      for (const record of records) {
        const result = await txn.runAsync(`
          update sync_outbox
          set status = 'terminal', next_retry_at = null, updated_at = ?
          where id = ? and status = 'in_flight' and updated_at = ?
        `, timestamp(), record.id, record.updated_at);
        if ((result?.changes || 0) === 0) continue;
        restored += 1;
        if (record.claimedDomainStatus === 'terminal') {
          await txn.runAsync(`
            update ${quoteIdentifier(record.table_name)} set sync_status = 'terminal'
            where id = ? and sync_status = 'pending'
          `, record.record_id);
        }
      }
      return restored;
    });
  };

  const resetInFlight = async ({ ownerUserId, transaction } = {}) => runWrite(transaction, async (txn) => {
    const ownerScoped = ownerUserId !== undefined;
    await txn.runAsync(`
      update sync_outbox
      set status = 'pending',
          last_error = case when table_name = 'children' and operation = 'insert'
            then coalesce(last_error, 'Upload interrupted; server outcome unknown') else last_error end,
          updated_at = ?
      where status = 'in_flight'
        ${ownerScoped ? 'and owner_user_id = ?' : ''}
    `, ...[timestamp(), ...(ownerScoped ? [ownerUserId] : [])]);
    return true;
  });

  const quarantineForeignOwners = async ({ fileUserId, transaction }) => {
    if (!fileUserId) throw new Error('File owner is required for the outbox integrity scan');
    let result;
    await runWrite(transaction, async (txn) => {
      const now = timestamp();
      // Migration 12 blocks new ownerless inserts; existing NULLs belong to this file.
      const adopted = await txn.runAsync(`
        update sync_outbox set owner_user_id = ?, updated_at = ?
        where owner_user_id is null
          and status in ('pending', 'failed', 'in_flight', 'terminal')
      `, fileUserId, now);
      const foreign = await txn.getAllAsync(`
        select id, table_name, record_id from sync_outbox
        where status in ('pending', 'failed', 'in_flight', 'terminal')
          and owner_user_id is not null and owner_user_id <> ?
      `, fileUserId);
      const byTable = {};
      for (const row of foreign) {
        byTable[row.table_name] = (byTable[row.table_name] || 0) + 1;
        await txn.runAsync(`
          update sync_outbox
          set status = 'terminal', error_class = 'terminal', error_code = 'FOREIGN_OWNER',
              last_error = 'foreign_owner', next_retry_at = null, updated_at = ?
          where id = ?
        `, now, row.id);
        // A hard delete may already have removed its domain row; a zero-row update is fine.
        await txn.runAsync(`
          update ${quoteIdentifier(row.table_name)}
          set sync_status = 'terminal', last_sync_error = 'foreign_owner', updated_at = ?
          where id = ?
        `, now, row.record_id);
      }
      const summary = { total: foreign.length, byTable, adoptedLegacy: adopted.changes };
      if (summary.total || summary.adoptedLegacy) {
        await txn.runAsync(`
          insert into local_state (key, value, updated_at) values ('integrity_scan_last', ?, ?)
          on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at
        `, JSON.stringify({ at: now, ...summary }), now);
      }
      result = summary;
    });
    if (result.total) {
      // Counts only; observability must not undo durable quarantine or block opening a file.
      try { console.error('foreign_owner_in_file', { byTable: result.byTable }); } catch (_) { /* best effort */ }
      try {
        captureOperationalError(new Error('foreign_owner_in_file'), {
          category: 'foreign_owner_in_file', context: { byTable: result.byTable }, userId: fileUserId,
        });
      } catch (_) { /* best effort */ }
    }
    return result;
  };

  // Neither reset ever demotes a refused (terminal) row to waiting (MA-BUG-20261104-021).
  const markReady = async (id, { transaction } = {}) => runWrite(transaction, async (txn) => {
    await txn.runAsync(`
      update sync_outbox
      set status = 'pending',
          next_retry_at = null,
          updated_at = ?
      where id = ? and status <> 'terminal'
    `, timestamp(), id);
    return true;
  });

  const markReadyMany = async (ids, { transaction } = {}) => {
    if (!ids || ids.length === 0) return true;
    return runWrite(transaction, async (txn) => {
      const now = timestamp();
      for (const id of ids) {
        await txn.runAsync(`
          update sync_outbox
          set status = 'pending',
              next_retry_at = null,
              updated_at = ?
          where id = ? and status <> 'terminal'
        `, now, id);
      }
      return true;
    });
  };

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
              last_error = case when table_name = 'children' and operation = 'insert'
                then last_error else null end,
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
    errorClass = 'retryable',
    errorCode,
  } = {}, { transaction } = {}) => runWrite(transaction, async (txn) => {
    await txn.runAsync(`
      update sync_outbox
      set status = 'failed',
          error_class = ?,
          error_code = ?,
          retry_count = retry_count + 1,
          last_error = ?,
          next_retry_at = ?,
          updated_at = ?
      where id = ?
    `, ['retryable', 'needs_parent', 'needs_reauth'].includes(errorClass) ? errorClass : 'retryable', normalizeErrorCode(errorCode), errorMessage || 'Sync failed', nextRetryAt, timestamp(), id);
    return true;
  });

  const markTerminalFailure = async (id, {
    errorMessage,
    errorCode,
  } = {}, { transaction } = {}) => runWrite(transaction, async (txn) => {
    await txn.runAsync(`
      update sync_outbox
      set status = 'terminal',
          error_class = 'terminal',
          error_code = ?,
          last_error = ?,
          next_retry_at = null,
          updated_at = ?
      where id = ?
    `, normalizeErrorCode(errorCode), errorMessage || 'Terminal sync failure', timestamp(), id);
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

  // Preserve the public count shape while sharing the file-wide unsent definition.
  const countUnsent = async () => {
    const { total, byTable } = await readUnsentSummary(await resolveDatabase(database));
    return { total, byTable };
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
    let readyCount = 0;
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
      if (row.status === 'pending'
        || (row.status === 'failed' && (!row.next_retry_at || row.next_retry_at <= now))) {
        readyCount += 1;
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
      readyCount,
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
    hasPendingOperation,
    getPendingHardDeleteIds,
    getTerminalRecords,
    markInFlight,
    markInFlightAndGet,
    restoreRefusedClaims,
    resetInFlight,
    quarantineForeignOwners,
    markReady,
    markReadyMany,
    requeueTerminalRows,
    markRetriableFailure,
    markTerminalFailure,
    deleteRecord,
    getFailedItems,
    getSyncStatus,
    countUnsent,
  };
};

export const syncOutboxRepository = createSyncOutboxRepository();
