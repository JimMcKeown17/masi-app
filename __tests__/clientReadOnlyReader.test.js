jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import BetterSqlite3 from 'better-sqlite3';

// PRAGMA query_only semantics: better-sqlite3 honors it on its single connection, so we
// prove the MECHANISM (a write on a query_only handle throws) here. The two-connection
// isolation is device-verified (spec AC #10 / Task 12).
it('a write on a query_only connection throws (proves reader enforcement)', () => {
  const db = new BetterSqlite3(':memory:');
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');
  db.exec('PRAGMA query_only = ON');
  expect(() => db.prepare('INSERT INTO t (id) VALUES (1)').run()).toThrow(/readonly|query_only|attempt to write/i);
});
