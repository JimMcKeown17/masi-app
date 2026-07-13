import {
  RECONCILE_BREAKER_SCOPE_PREFIX,
  resolveDatabase,
  runRepositoryTransaction,
} from './repositoryRuntime';
import {
  decodeJson,
  encodeJson,
  timestamp,
} from './sqliteRepositoryUtils';

const SYNC_META_KEY = 'sync_meta';

const DEFAULT_SYNC_META = {
  lastSyncTime: null,
  lastSuccessfulSyncTime: null,
};

const mapPullState = (row) => ({
  scope: row.scope,
  lastPulledAt: row.last_pulled_at,
  cursor: row.cursor,
});

export const createSyncStateRepository = ({ database } = {}) => {
  const runWrite = (transaction, task) => (
    transaction ? task(transaction) : runRepositoryTransaction(database, task)
  );

  const getPullState = async (scope) => {
    const db = await resolveDatabase(database);
    const row = await db.getFirstAsync('select * from sync_state where scope = ?', scope);
    return row ? mapPullState(row) : null;
  };

  const setPullState = async (scope, {
    lastPulledAt = null,
    cursor = null,
  } = {}, { transaction } = {}) => runWrite(transaction, async (txn) => {
    // Plan 4 reference pulls are full replacements; Plan 5 domain pulls will use this for cursors.
    await txn.runAsync(`
      insert into sync_state (scope, last_pulled_at, cursor, updated_at)
      values (?, ?, ?, ?)
      on conflict(scope) do update set
        last_pulled_at = excluded.last_pulled_at,
        cursor = excluded.cursor,
        updated_at = excluded.updated_at
    `, scope, lastPulledAt, cursor, timestamp());
    return true;
  });

  const getReconcileBreakerNotes = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync(`
      select cursor
      from sync_state
      where scope like ?
      order by scope
    `, `${RECONCILE_BREAKER_SCOPE_PREFIX}%`);
    return rows
      .map((row) => decodeJson(row.cursor, null))
      .filter((note) => note?.scope);
  };

  const getSyncMeta = async () => {
    const db = await resolveDatabase(database);
    const row = await db.getFirstAsync('select value from local_state where key = ?', SYNC_META_KEY);
    return {
      ...DEFAULT_SYNC_META,
      ...decodeJson(row?.value, {}),
    };
  };

  const updateSyncMeta = async (updates, { transaction } = {}) => runWrite(transaction, async (txn) => {
    const currentRow = await txn.getFirstAsync('select value from local_state where key = ?', SYNC_META_KEY);
    const next = {
      ...DEFAULT_SYNC_META,
      ...decodeJson(currentRow?.value, {}),
      ...updates,
    };

    await txn.runAsync(`
      insert into local_state (key, value, updated_at)
      values (?, ?, ?)
      on conflict(key) do update set
        value = excluded.value,
        updated_at = excluded.updated_at
    `, SYNC_META_KEY, encodeJson(next), timestamp());
    return next;
  });

  return {
    getPullState,
    setPullState,
    getReconcileBreakerNotes,
    getSyncMeta,
    updateSyncMeta,
  };
};

export const syncStateRepository = createSyncStateRepository();
