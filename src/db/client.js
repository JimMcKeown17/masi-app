import { openDatabaseAsync } from 'expo-sqlite';
import { runMigrations } from './migrations';

export const DATABASE_NAME = 'masi.db';

// journal_mode is database-level (set once). foreign_keys + busy_timeout + query_only
// are PER-CONNECTION, which is why a persistent writer/reader fixes the historical leak.
const WRITER_PRE_MIGRATION_PRAGMAS = [
  'PRAGMA journal_mode = WAL',
  'PRAGMA busy_timeout = 5000',
  'PRAGMA foreign_keys = OFF', // migrations need FK off; flipped ON after they run
];
const READER_PRAGMAS = [
  'PRAGMA busy_timeout = 5000',
  'PRAGMA query_only = ON', // any stray write on the reader throws — see write-path audit
];

let initPromise = null;
let writerConnection = null;
let readerConnection = null;
let databaseQueue = Promise.resolve();

const applyPragmas = async (db, pragmas) => {
  for (const pragma of pragmas) {
    await db.execAsync(pragma);
  }
};

// Close any open connections and clear bootstrap state so the next access re-initializes.
// Used by the test reset, the bootstrap failure path, and a failed ROLLBACK (where the
// writer may be left in an unknown transaction state).
const disposeConnections = async () => {
  for (const conn of [writerConnection, readerConnection]) {
    if (conn && typeof conn.closeAsync === 'function') {
      try { await conn.closeAsync(); } catch (_) { /* ignore */ }
    }
  }
  initPromise = null;
  writerConnection = null;
  readerConnection = null;
};

// Single bootstrap: open the writer, migrate it (FK off), flip FK on, then open the
// read-only reader. Both getDatabase()/getWriter() await this, so no query ever sees a
// pre-migration schema. Migrations run directly on the writer (NOT via the queued
// runMigrations no-arg path) to avoid re-entering this initializer.
const initialize = async () => {
  if (!initPromise) {
    initPromise = (async () => {
      // Register each connection in its module var IMMEDIATELY after opening, BEFORE any awaited
      // pragma/migration work. If configuration then throws, the handle is already visible to
      // disposeConnections() in the catch — otherwise a writer that opened but failed its pragmas
      // or migrations would leak its native handle (it wasn't yet assigned). Nothing reads these
      // vars until initialize() resolves (every caller awaits initPromise), so early assignment
      // of a not-yet-configured connection is safe.
      writerConnection = await openDatabaseAsync(DATABASE_NAME);
      await applyPragmas(writerConnection, WRITER_PRE_MIGRATION_PRAGMAS);
      await runMigrations(writerConnection);
      await writerConnection.execAsync('PRAGMA foreign_keys = ON');

      readerConnection = await openDatabaseAsync(DATABASE_NAME, { useNewConnection: true });
      await applyPragmas(readerConnection, READER_PRAGMAS);

      return { writerConnection, readerConnection };
    })().catch(async (error) => {
      // Any bootstrap failure (writer open/pragma/migration OR reader open/pragma): close
      // whatever opened and clear state so the next access re-bootstraps instead of leaking a
      // native handle.
      await disposeConnections();
      throw error;
    });
  }
  return initPromise;
};

export async function initializeDatabase() {
  await initialize();
  return writerConnection;
}

// Reads use the read-only reader connection.
export async function getDatabase() {
  await initialize();
  return readerConnection;
}

// Writes use the writer connection.
export async function getWriter() {
  await initialize();
  return writerConnection;
}

// Serialize all writer access on the queue (the writer's mutex).
export async function withDatabaseAccess(task) {
  const runTask = async () => {
    const writer = await getWriter();
    return task(writer);
  };
  const queuedTask = databaseQueue.then(runTask, runTask);
  databaseQueue = queuedTask.catch(() => {});
  return queuedTask;
}

// Non-re-entrant BY CONTRACT: callers thread the txn handle down and must NOT call
// withTransaction inside a transaction. Nesting would deadlock on the serial queue — a
// loud, NON-corrupting dev-time failure that the positive one-transaction test guards.
// We deliberately add NO runtime nesting guard:
//   - A synchronous depth check would either sit behind the queue (too late to prevent the
//     deadlock) or, if moved before the enqueue, FALSE-REJECT legitimate concurrent writers.
//     Distinguishing nested from concurrent needs async-context tracking that Hermes lacks.
//   - A watchdog timeout is WORSE than the hang: a promise cannot be cancelled, so rolling
//     back on timeout releases the queue and lets the abandoned nested work COMMIT after the
//     caller already saw a failure (partial-commit corruption).
export async function withTransaction(task) {
  return withDatabaseAccess(async (db) => {
    await db.execAsync('BEGIN IMMEDIATE');
    try {
      const result = await task(db);
      await db.execAsync('COMMIT');
      return result;
    } catch (error) {
      try {
        await db.execAsync('ROLLBACK');
      } catch (rollbackError) {
        // Never let a ROLLBACK failure mask the original error. Commonly ROLLBACK throws
        // "no transaction is active" because SQLite already auto-rolled-back — harmless. But
        // if the writer is genuinely stuck mid-transaction, leaving it would poison every
        // later queued write (their BEGIN IMMEDIATE would throw). Dispose the connections so
        // the next access re-bootstraps a clean writer.
        await disposeConnections();
      }
      throw error;
    }
  });
}

export async function resetDatabaseConnectionForTests() {
  await disposeConnections();
  databaseQueue = Promise.resolve();
}
