jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { __contract } from '../src/services/offlineSync';

let db;
beforeAll(async () => { db = createBetterSqliteTestDatabase(':memory:'); await runMigrations(db); });

const schemaColumns = async (table) => {
  const info = await db.getAllAsync(`PRAGMA table_info(${table})`);
  return info.map((c) => c.name); // includes CREATE-TABLE and ALTER-ADDED columns
};

it('every PUSH_ORDER table column is synced, intentionally-unsynced, or local-only (exactly one)', async () => {
  const { SERVER_COLUMNS, PUSH_ORDER, INTENTIONALLY_UNSYNCED, LOCAL_ONLY_COLUMNS } = __contract;
  for (const table of PUSH_ORDER) {
    const cols = await schemaColumns(table);
    expect(cols.length).toBeGreaterThan(0); // table exists in the migrated schema
    for (const col of cols) {
      const inServer = (SERVER_COLUMNS[table] || []).includes(col);
      const inIntentional = Boolean((INTENTIONALLY_UNSYNCED[table] || {})[col]);
      const inLocalOnly = LOCAL_ONLY_COLUMNS.includes(col);
      const count = [inServer, inIntentional, inLocalOnly].filter(Boolean).length;
      expect({ table, col, count }).toEqual({ table, col, count: 1 });
    }
  }
});

it('sessions.group_id and sessions.state are documented as intentionally unsynced', () => {
  const { INTENTIONALLY_UNSYNCED } = __contract;
  expect(INTENTIONALLY_UNSYNCED.sessions?.group_id).toBeTruthy();
  expect(INTENTIONALLY_UNSYNCED.sessions?.state).toBeTruthy();
});
