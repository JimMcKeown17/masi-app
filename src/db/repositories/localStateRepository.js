import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import { decodeJson, encodeJson, timestamp } from './sqliteRepositoryUtils';

export const createLocalStateRepository = ({ database } = {}) => {
  const runWrite = (transaction, task) => (
    transaction ? task(transaction) : runRepositoryTransaction(database, task)
  );

  const get = async (key, fallback = null) => {
    const db = await resolveDatabase(database); // read — stays on the reader
    const row = await db.getFirstAsync('select value from local_state where key = ?', key);
    return row ? decodeJson(row.value, fallback) : fallback;
  };

  const set = async (key, value, { transaction } = {}) => {
    const now = timestamp();
    await runWrite(transaction, async (txn) => {
      await txn.runAsync(
        `insert into local_state (key, value, updated_at)
         values (?, ?, ?)
         on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`,
        key, encodeJson(value), now
      );
    });
    return true;
  };

  const remove = async (key, { transaction } = {}) => {
    await runWrite(transaction, async (txn) => {
      await txn.runAsync('delete from local_state where key = ?', key);
    });
    return true;
  };

  const clear = async ({ transaction } = {}) => {
    await runWrite(transaction, async (txn) => {
      await txn.runAsync('delete from local_state');
    });
    return true;
  };

  return { get, set, remove, clear };
};

export const localStateRepository = createLocalStateRepository();
