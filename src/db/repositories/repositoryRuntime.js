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

export const runBatchWithPerRowFallback = async ({
  database,
  rows,
  saveRow,
  tableName,
}) => {
  const applyRows = async (transaction) => {
    let applied = 0;
    let skipped = 0;
    for (const row of rows) {
      if (await saveRow(row, { transaction }) === false) {
        skipped += 1;
      } else {
        applied += 1;
      }
    }
    return { applied, skipped, failed: 0 };
  };

  try {
    return await runRepositoryTransaction(database, applyRows);
  } catch (_batchError) {
    let applied = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        if (await saveRow(row) === false) {
          skipped += 1;
        } else {
          applied += 1;
        }
      } catch (error) {
        failed += 1;
        console.error(
          `Pulled ${tableName} row ${row?.id || '<unknown>'} failed local persistence: ${error?.message || error}`
        );
      }
    }
    return { applied, skipped, failed };
  }
};
