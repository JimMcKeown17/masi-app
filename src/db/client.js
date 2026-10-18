import { openDatabaseAsync } from 'expo-sqlite';
import { readSupportedSchemaVersion, runMigrations } from './migrations';

export const DATABASE_FILE_PREFIX = 'masi-';
export const LEGACY_DATABASE_NAME = 'masi.db';

export const databaseNameForUser = (userId) => {
  if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new Error('A UUID-shaped EA userId is required for a database file');
  }
  return `${DATABASE_FILE_PREFIX}${userId}.db`;
};

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

const applyPragmas = async (db, pragmas) => {
  for (const pragma of pragmas) {
    await db.execAsync(pragma);
  }
};

// Open the writer, migrate it (FK off), flip FK on, then open the read-only reader.
// Migrations run on the supplied writer, never through the ambient migration queue.
export const openConfiguredConnections = async ({ name, openDatabase = openDatabaseAsync }) => {
  let writer = null;
  let reader = null;
  try {
    // Register each connection IMMEDIATELY after opening, BEFORE any awaited pragma or
    // migration work. Otherwise configuration failure leaks an opened native connection.
    // Neither connection is exposed to callers until configuration has completed.
    writer = await openDatabase(name);
    // Refuse a newer file before journal_mode can change its persistent header.
    await readSupportedSchemaVersion(writer);
    await applyPragmas(writer, WRITER_PRE_MIGRATION_PRAGMAS);
    await runMigrations(writer);
    await writer.execAsync('PRAGMA foreign_keys = ON');
    reader = await openDatabase(name, { useNewConnection: true });
    await applyPragmas(reader, READER_PRAGMAS);
    return { writer, reader };
  } catch (cause) {
    // Any bootstrap failure disposes whatever opened, including a reader whose pragmas
    // failed. Attempt both closes even if one fails; handle callers fence an unsafe file.
    const error = cause instanceof Error ? cause : new Error(String(cause));
    for (const connection of [writer, reader]) {
      if (!connection) continue;
      try { await connection.closeAsync(); } catch (_) { error.connectionDisposalFailed = true; }
    }
    throw error;
  }
};
