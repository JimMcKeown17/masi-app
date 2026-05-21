import { openDatabaseAsync } from 'expo-sqlite';

export const DATABASE_NAME = 'masi.db';

let databasePromise = null;
let transactionQueue = Promise.resolve();

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

export async function withTransaction(task) {
  const runTransaction = async () => {
    const db = await initializeDatabase();

    if (typeof db.withExclusiveTransactionAsync === 'function') {
      return db.withExclusiveTransactionAsync(task);
    }

    return db.withTransactionAsync(task);
  };

  const queuedTransaction = transactionQueue.then(runTransaction, runTransaction);
  transactionQueue = queuedTransaction.catch(() => {});

  return queuedTransaction;
}

export function resetDatabaseConnectionForTests() {
  databasePromise = null;
  transactionQueue = Promise.resolve();
}
