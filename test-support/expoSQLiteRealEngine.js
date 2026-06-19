// expo-sqlite shim backed by better-sqlite3, used by opt-in integration tests.
// Production code never imports this. Lives in test-support/.
//
// Persistence model:
//   - One temp file per database name under ${os.tmpdir()}/masi-tests/<name>-<pid>.db
//   - Plain openDatabaseAsync(name) returns the registry-owned handle backed by
//     that file. Subsequent plain opens of the same name reuse that handle unless
//     it was closed, so close+reopen preserves data (matches real expo-sqlite).
//   - openDatabaseAsync(name, { useNewConnection: true }) returns a distinct
//     better-sqlite3 handle to the SAME file. Connection-local PRAGMAs such as
//     query_only affect only that handle, matching Masi's writer/reader split.
//   - deleteDatabaseAsync removes the .db file plus its .db-wal and .db-shm
//     sidecars (the app enables WAL mode in production, so sidecars can exist).
//
// Compatibility note: better-sqlite3 is a real SQLite C binding, not the same
// build as expo-sqlite. Compile-time options (FTS5, JSON1) may differ. If a
// test depends on a feature better-sqlite3 doesn't ship, mark it mock-only.

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const TMP_ROOT = path.join(os.tmpdir(), 'masi-tests');

const ensureTmpRoot = () => {
  if (!fs.existsSync(TMP_ROOT)) {
    fs.mkdirSync(TMP_ROOT, { recursive: true });
  }
};

// registry: name -> { filePath, handle: Database | null, transientHandles: Set<Database> }
const registry = new Map();

const filePathFor = (name) =>
  path.join(TMP_ROOT, `${name}-${process.pid}.db`);

const removeDbFiles = (filePath) => {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${filePath}${suffix}`, { force: true });
  }
};

const normalizeParams = (rest) => {
  if (rest.length === 0) return undefined;
  if (rest.length === 1 && (Array.isArray(rest[0]) || typeof rest[0] === 'object')) {
    return rest[0];
  }
  return rest;
};

const closeHandle = (handle) => {
  if (handle && handle.open) {
    handle.close();
  }
};

const wrapDatabase = ({ handle, name, isRegistryHandle }) => {
  // Async-shaped wrappers so callers (production + tests) get the expo-sqlite
  // API surface unchanged. better-sqlite3 itself is sync; async functions match
  // expected Promise-returning types.
  return {
    async runAsync(sql, ...rest) {
      const params = normalizeParams(rest);
      const stmt = handle.prepare(sql);
      const info = params === undefined ? stmt.run() : stmt.run(params);
      return {
        changes: info.changes,
        lastInsertRowId: info.lastInsertRowid,
      };
    },
    async getFirstAsync(sql, ...rest) {
      const params = normalizeParams(rest);
      const stmt = handle.prepare(sql);
      const row = params === undefined ? stmt.get() : stmt.get(params);
      return row ?? null;
    },
    async getAllAsync(sql, ...rest) {
      const params = normalizeParams(rest);
      const stmt = handle.prepare(sql);
      return params === undefined ? stmt.all() : stmt.all(params);
    },
    async execAsync(source) {
      handle.exec(source);
    },
    async withTransactionAsync(task) {
      handle.exec('BEGIN');
      try {
        // Real expo-sqlite resolves void: the task's return value is discarded.
        await task(this);
        handle.exec('COMMIT');
      } catch (error) {
        handle.exec('ROLLBACK');
        throw error;
      }
    },
    async withExclusiveTransactionAsync(task) {
      handle.exec('BEGIN EXCLUSIVE');
      try {
        await task(this);
        handle.exec('COMMIT');
      } catch (error) {
        handle.exec('ROLLBACK');
        throw error;
      }
    },
    async closeAsync() {
      closeHandle(handle);
      const entry = registry.get(name);
      if (!entry) return;
      if (isRegistryHandle && entry.handle === handle) {
        entry.handle = null;
      } else {
        entry.transientHandles.delete(handle);
      }
    },
  };
};

const openDatabaseAsync = jest.fn(async (name, options = {}) => {
  ensureTmpRoot();
  let entry = registry.get(name);
  if (!entry) {
    entry = { filePath: filePathFor(name), handle: null, transientHandles: new Set() };
    registry.set(name, entry);
  }

  if (options?.useNewConnection) {
    const transientHandle = new Database(entry.filePath);
    entry.transientHandles.add(transientHandle);
    return wrapDatabase({ handle: transientHandle, name, isRegistryHandle: false });
  }

  if (!entry.handle || !entry.handle.open) {
    entry.handle = new Database(entry.filePath);
  }
  return wrapDatabase({ handle: entry.handle, name, isRegistryHandle: true });
});

const deleteDatabaseAsync = jest.fn(async (name) => {
  const entry = registry.get(name);
  if (!entry) return;

  closeHandle(entry.handle);
  for (const handle of entry.transientHandles) {
    closeHandle(handle);
  }
  removeDbFiles(entry.filePath);
  registry.delete(name);
});

const __resetMockDatabases = async () => {
  for (const [name] of [...registry.entries()]) {
    await deleteDatabaseAsync(name);
  }
  openDatabaseAsync.mockClear();
  deleteDatabaseAsync.mockClear();
};

// Best-effort cleanup if the process crashes mid-suite.
process.on('exit', () => {
  for (const [, entry] of registry.entries()) {
    try {
      closeHandle(entry.handle);
      for (const handle of entry.transientHandles) {
        closeHandle(handle);
      }
      removeDbFiles(entry.filePath);
    } catch (_) {
      /* ignore: already exiting */
    }
  }
});

module.exports = {
  openDatabaseAsync,
  deleteDatabaseAsync,
  __resetMockDatabases,
  __usesRealEngine: true,
};
