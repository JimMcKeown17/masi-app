const { createBetterSqliteTestDatabase } = require('./betterSqliteAdapter');

function createCountingSqliteTestDatabase(filename = ':memory:') {
  const base = createBetterSqliteTestDatabase(filename);
  let queries = [];

  const record = (method, sql) => {
    const migrationControl = /^\s*pragma\s+user_version/i.test(sql);
    queries.push({ method, sql, migrationControl });
  };

  const adapter = {
    ...base,
    execAsync: (...args) => base.execAsync(...args),
    runAsync: async (sql, ...params) => {
      record('runAsync', sql);
      return base.runAsync(sql, ...params);
    },
    getAllAsync: async (sql, ...params) => {
      record('getAllAsync', sql);
      return base.getAllAsync(sql, ...params);
    },
    getFirstAsync: async (sql, ...params) => {
      record('getFirstAsync', sql);
      return base.getFirstAsync(sql, ...params);
    },
    withExclusiveTransactionAsync: task => {
      record('transaction', 'BEGIN EXCLUSIVE');
      return base.withExclusiveTransactionAsync(() => task(adapter));
    },
    resetQueryLog: () => {
      queries = [];
    },
    getQueryLog: ({ includeMigrationControl = false } = {}) => (
      queries.filter(query => includeMigrationControl || !query.migrationControl)
    ),
    getQueryCount: options => adapter.getQueryLog(options).length,
    getTransactionCount: () => queries.filter(query => query.method === 'transaction').length,
  };

  return adapter;
}

module.exports = { createCountingSqliteTestDatabase };
