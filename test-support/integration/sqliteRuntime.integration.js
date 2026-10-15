const fs = require('fs');

const { getTestWriter, TEST_ACTOR_ID } = require('../testDatabase');

describe('SQLite integration runtime', () => {
  test('uses a file-backed database instead of the default in-memory test database', async () => {
    const db = await getTestWriter();
    const { file } = await db.getFirstAsync('PRAGMA database_list');
    expect(file).toEqual(expect.stringContaining(`masi-${TEST_ACTOR_ID}.db`));
    expect(file).not.toBe(':memory:');
    expect(fs.existsSync(file)).toBe(true);

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
