import { getDatabase, withTransaction } from '../client';
import { runMigrations } from '../migrations';
import { runWithTransaction } from './sqliteRepositoryUtils';

export const resolveDatabase = async (database) => {
  if (database) {
    // Test / injected-db path: migrate the supplied connection.
    await runMigrations(database);
    return database;
  }
  // Production: client.initialize() already ran migrations on the writer during bootstrap;
  // getDatabase() returns the read-only reader. Do NOT run migrations here (the reader is
  // query_only and would throw).
  return getDatabase();
};

export const runRepositoryTransaction = async (database, task) => {
  if (database) {
    const db = await resolveDatabase(database);
    return runWithTransaction(db, task);
  }
  // Production writes go through the persistent writer.
  return withTransaction(async (txn) => task(txn));
};
