const BetterSqlite3 = require('better-sqlite3');

const normalizeParams = (params) => {
  if (params.length === 0) return [];
  if (params.length === 1 && (Array.isArray(params[0]) || typeof params[0] === 'object')) {
    return params[0];
  }
  return params;
};

function createBetterSqliteTestDatabase(filename = ':memory:') {
  const database = new BetterSqlite3(filename);

  // Serializes concurrent withExclusiveTransactionAsync calls, mirroring the real
  // expo-sqlite behaviour where a second exclusive-transaction request queues behind
  // the first. Without this, Promise.all batches that each trigger a repository
  // transaction (via runRepositoryTransaction → runWithTransaction) would race at
  // the SQLite-level BEGIN, producing "cannot start a transaction within a
  // transaction" errors that do not occur on real devices.
  let exclusiveTransactionQueue = Promise.resolve();

  const adapter = {
    execAsync: async (sql) => {
      database.exec(sql);
    },

    runAsync: async (sql, ...params) => {
      const result = database.prepare(sql).run(normalizeParams(params));
      return {
        changes: result.changes,
        lastInsertRowId: result.lastInsertRowid,
      };
    },

    getAllAsync: async (sql, ...params) => (
      database.prepare(sql).all(normalizeParams(params))
    ),

    getFirstAsync: async (sql, ...params) => (
      database.prepare(sql).get(normalizeParams(params)) || null
    ),

    withExclusiveTransactionAsync: (task) => {
      const slot = exclusiveTransactionQueue.then(async () => {
        database.exec('BEGIN');
        try {
          const result = await task(adapter);
          database.exec('COMMIT');
          return result;
        } catch (error) {
          try {
            database.exec('ROLLBACK');
          } catch (rollbackError) {
            // swallow — original error is the actionable one
          }
          throw error;
        }
      });
      // Chain so the next caller waits for this slot to settle.
      exclusiveTransactionQueue = slot.then(() => {}, () => {});
      return slot;
    },

    closeAsync: async () => {
      database.close();
    },

    filename,
    raw: database,
  };

  return adapter;
}

module.exports = {
  createBetterSqliteTestDatabase,
};
