const fs = require('fs');

const { getDatabase } = require('../../src/db/client');
const { runMigrations } = require('../../src/db/migrations');

describe('SQLite integration runtime', () => {
  test('uses a file-backed database instead of the default in-memory test database', async () => {
    const db = await getDatabase();
    await runMigrations(db);

    expect(db.filename).toEqual(expect.stringMatching(/\.sqlite$/));
    expect(db.filename).not.toBe(':memory:');
    expect(fs.existsSync(db.filename)).toBe(true);

    await db.runAsync(
      'insert into local_state (key, value) values (?, ?)',
      'integration-runtime',
      'file-backed'
    );

    const row = await db.getFirstAsync(
      'select value from local_state where key = ?',
      'integration-runtime'
    );
    expect(row.value).toBe('file-backed');
  });
});
