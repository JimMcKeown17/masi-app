jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { __reset as resetExpoSQLiteMock } from 'expo-sqlite';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { resetDatabaseConnectionForTests } from '../src/db/client';
import { runMigrations } from '../src/db/migrations';
import { createReferenceDataRepository } from '../src/db/repositories/referenceDataRepository';

describe('programmes reference sync — daily session target', () => {
  beforeEach(() => {
    resetExpoSQLiteMock();
    resetDatabaseConnectionForTests();
  });

  test('persists daily_session_target and daily_session_ceiling pulled from the server', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      const programmes = createReferenceDataRepository({ database: db, tableName: 'programmes' });

      await programmes.replaceFromServer([
        { id: 'p-num', code: 'numeracy', name: 'Numeracy', daily_session_target: 5, daily_session_ceiling: 5 },
        { id: 'p-1ks', code: 'one_thousand_stories', name: '1000 Stories', daily_session_target: null, daily_session_ceiling: null },
      ]);

      const numeracy = await db.getFirstAsync(
        "select daily_session_target, daily_session_ceiling from programmes where code = 'numeracy'"
      );
      expect(numeracy).toEqual({ daily_session_target: 5, daily_session_ceiling: 5 });

      const stories = await db.getFirstAsync(
        "select daily_session_target, daily_session_ceiling from programmes where code = 'one_thousand_stories'"
      );
      expect(stories).toEqual({ daily_session_target: null, daily_session_ceiling: null });
    } finally {
      await db.closeAsync();
    }
  });
});
