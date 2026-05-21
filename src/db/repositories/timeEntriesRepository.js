import { resolveDatabase } from './repositoryRuntime';
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
  const getTimeEntries = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync(`
      select *
      from time_entries
      order by sign_in_time, created_at
    `);
    return rows.map(mapTimeEntry);
  };

  const saveTimeEntry = async (entry, { transaction } = {}) => {
    const db = transaction || await resolveDatabase(database);
    await upsertRecord(db, {
      tableName: 'time_entries',
      columns: TIME_ENTRY_COLUMNS,
      booleanColumns: ['auto_clocked_out'],
      record: normalizeForWrite(entry),
    });
    return true;
  };

  const updateTimeEntry = async (id, updates, { transaction } = {}) => {
    const db = transaction || await resolveDatabase(database);
    const existing = await db.getFirstAsync('select * from time_entries where id = ?', id);
    if (!existing) {
      return false;
    }

    const next = normalizeForWrite({
      ...mapTimeEntry(existing),
      ...updates,
      id,
      updated_at: updates.updated_at || timestamp(),
      sync_status: updates.sync_status || existing.sync_status,
      synced: updates.synced === undefined ? undefined : updates.synced,
    });

    if (updates.synced === undefined) {
      next.sync_status = existing.sync_status;
    }

    await upsertRecord(db, {
      tableName: 'time_entries',
      columns: TIME_ENTRY_COLUMNS,
      booleanColumns: ['auto_clocked_out'],
      record: next,
    });
    return true;
  };

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
