import { openDatabaseAsync } from 'expo-sqlite';

export const DATABASE_NAME = 'masi.db';

let databasePromise = null;
let databaseQueue = Promise.resolve();

export async function initializeDatabase() {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DATABASE_NAME).catch((error) => {
      databasePromise = null;
      throw error;
    });
  }

  return databasePromise;
}

export async function getDatabase() {
  return initializeDatabase();
}

export async function withDatabaseAccess(task) {
  const runTask = async () => {
    const db = await initializeDatabase();
    return task(db);
  };

  const queuedTask = databaseQueue.then(runTask, runTask);
  databaseQueue = queuedTask.catch(() => {});

  return queuedTask;
}

export async function withTransaction(task) {
  return withDatabaseAccess(async (db) => {
    if (typeof db.withExclusiveTransactionAsync === 'function') {
      return db.withExclusiveTransactionAsync(task);
    }

    return db.withTransactionAsync(task);
  });
}

export function resetDatabaseConnectionForTests() {
  databasePromise = null;
  databaseQueue = Promise.resolve();
}
