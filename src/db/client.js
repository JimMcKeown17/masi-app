import { openDatabaseAsync } from 'expo-sqlite';

export const DATABASE_NAME = 'masi.db';
export const CONNECTION_PRAGMAS = [
  'PRAGMA foreign_keys = ON',
  'PRAGMA journal_mode = WAL',
  'PRAGMA busy_timeout = 5000',
];

let databasePromise = null;
let databaseQueue = Promise.resolve();

export async function configureDatabaseConnection(db) {
  for (const pragma of CONNECTION_PRAGMAS) {
    await db.execAsync(pragma);
  }

  return db;
}

export async function initializeDatabase() {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DATABASE_NAME)
      .then(configureDatabaseConnection)
      .catch((error) => {
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
