import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import {
  enqueueDomainOutbox,
  shouldEnqueueOutbox,
} from './domainRepositoryUtils';
import {
  mapRowFromSqlite,
  syncStatusFromSynced,
  timestamp,
  upsertRecord,
} from './sqliteRepositoryUtils';

const TIME_ENTRY_COLUMNS = [
  'id',
  'user_id',
  'sign_in_time',
  'sign_in_lat',
  'sign_in_lon',
  'sign_out_time',
  'sign_out_lat',
  'sign_out_lon',
  'auto_clocked_out',
  'created_at',
  'updated_at',
  'sync_status',
  'last_sync_error',
  'server_updated_at',
];

const normalizeForWrite = (entry) => {
  const now = timestamp();
  return {
    ...entry,
    auto_clocked_out: entry.auto_clocked_out || false,
    created_at: entry.created_at || now,
    updated_at: entry.updated_at || now,
    sync_status: entry.sync_status || syncStatusFromSynced(entry.synced),
  };
};

const mapTimeEntry = (row) => mapRowFromSqlite({
  row,
  booleanColumns: ['auto_clocked_out'],
});

export const createTimeEntriesRepository = ({ database } = {}) => {
  const runWrite = (transaction, task) => (
    transaction ? task(transaction) : runRepositoryTransaction(database, task)
  );

  const enqueueTimeEntryOutbox = async (txn, record) => {
    if (!shouldEnqueueOutbox(record)) return;

    const existingInsert = await txn.getFirstAsync(`
      select id
      from sync_outbox
      where table_name = 'time_entries'
        and record_id = ?
        and operation = 'insert'
      limit 1
    `, record.id);
    await enqueueDomainOutbox(txn, 'time_entries', record.id, existingInsert ? 'insert' : 'update', record);
  };

  const getTimeEntries = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync(`
      select *
      from time_entries
      order by sign_in_time, created_at
    `);
    return rows.map(mapTimeEntry);
  };

  const saveTimeEntry = async (entry, { transaction } = {}) => runWrite(transaction, async (txn) => {
    const record = normalizeForWrite(entry);
    await upsertRecord(txn, {
      tableName: 'time_entries',
      columns: TIME_ENTRY_COLUMNS,
      booleanColumns: ['auto_clocked_out'],
      record,
    });
    if (shouldEnqueueOutbox(record)) {
      await enqueueDomainOutbox(txn, 'time_entries', entry.id, 'insert', record);
    }
    return true;
  });

  const updateTimeEntry = async (id, updates, { transaction } = {}) => runWrite(transaction, async (txn) => {
    const existing = await txn.getFirstAsync('select * from time_entries where id = ?', id);
    if (!existing) {
      return false;
    }

    const next = normalizeForWrite({
      ...mapTimeEntry(existing),
      ...updates,
      id,
      updated_at: updates.updated_at || timestamp(),
      sync_status: updates.sync_status || syncStatusFromSynced(updates.synced),
      synced: updates.synced === undefined ? undefined : updates.synced,
    });

    await upsertRecord(txn, {
      tableName: 'time_entries',
      columns: TIME_ENTRY_COLUMNS,
      booleanColumns: ['auto_clocked_out'],
      record: next,
    });
    await enqueueTimeEntryOutbox(txn, next);
    return true;
  });

  const getActiveTimeEntry = async (userId) => {
    const db = await resolveDatabase(database);
    const row = await db.getFirstAsync(`
      select *
      from time_entries
      where user_id = ?
        and sign_out_time is null
      order by sign_in_time desc
      limit 1
    `, userId);

    return mapTimeEntry(row);
  };

  const getUnsyncedRecords = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync(`
      select *
      from time_entries
      where sync_status <> 'synced'
      order by created_at
    `);

    return rows.map(mapTimeEntry);
  };

  return {
    getTimeEntries,
    saveTimeEntry,
    updateTimeEntry,
    getActiveTimeEntry,
    getUnsyncedRecords,
  };
};

export const timeEntriesRepository = createTimeEntriesRepository();
