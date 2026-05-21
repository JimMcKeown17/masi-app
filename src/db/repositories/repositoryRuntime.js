import { getDatabase, withTransaction } from '../client';
import { runMigrations } from '../migrations';
import { runWithTransaction } from './sqliteRepositoryUtils';

export const resolveDatabase = async (database) => {
  const db = database || await getDatabase();
  await runMigrations(db);
  return db;
};

export const runRepositoryTransaction = async (database, task) => {
  if (database) {
    const db = await resolveDatabase(database);
    return runWithTransaction(db, task);
  }

  const db = await resolveDatabase();
  return withTransaction(async (txn) => task(txn || db));
};
