import { resolveDatabase } from './repositoryRuntime';
import { decodeJson, encodeJson, timestamp } from './sqliteRepositoryUtils';

export const createLocalStateRepository = ({ database } = {}) => {
  const get = async (key, fallback = null) => {
    const db = await resolveDatabase(database);
    const row = await db.getFirstAsync(
      'select value from local_state where key = ?',
      key
    );

    return row ? decodeJson(row.value, fallback) : fallback;
  };

  const set = async (key, value) => {
    const db = await resolveDatabase(database);
    const now = timestamp();
    await db.runAsync(
      `insert into local_state (key, value, updated_at)
       values (?, ?, ?)
       on conflict(key) do update set
         value = excluded.value,
         updated_at = excluded.updated_at`,
      key,
      encodeJson(value),
      now
    );
    return true;
  };

  const remove = async (key) => {
    const db = await resolveDatabase(database);
    await db.runAsync('delete from local_state where key = ?', key);
    return true;
  };

  const clear = async () => {
    const db = await resolveDatabase(database);
    await db.runAsync('delete from local_state');
    return true;
  };

  return {
    get,
    set,
    remove,
    clear,
  };
};

export const localStateRepository = createLocalStateRepository();
