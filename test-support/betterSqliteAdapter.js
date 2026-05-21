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

    withExclusiveTransactionAsync: async (task) => {
      database.exec('BEGIN');
      try {
        await task(adapter);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },

    closeAsync: async () => {
      database.close();
    },

    raw: database,
  };

  return adapter;
}

module.exports = {
  createBetterSqliteTestDatabase,
};
