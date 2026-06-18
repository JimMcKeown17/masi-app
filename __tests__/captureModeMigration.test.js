jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import { runMigrations } from '../src/db/migrations';
import { createAssessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';

describe('capture_mode assessment migration', () => {
  test('adds nullable capture_mode with mode validation and repository round-trip', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      const columns = await db.getAllAsync("PRAGMA table_info('assessments')");
      const captureModeColumn = columns.find((column) => column.name === 'capture_mode');
      expect(captureModeColumn).toEqual(expect.objectContaining({ notnull: 0 }));

      await seedCoreData(db);
      await createChildrenRepository({ database: db }).save({
        id: 'child-1',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        class_id: 'class-1',
        programme_id: 'programme-a',
        created_by: 'user-1',
        synced: false,
      }, { actorUserId: 'user-1' });

      const repository = createAssessmentsRepository({ database: db });
      await repository.saveAssessment({
        id: 'assessment-1',
        user_id: 'user-1',
        child_id: 'child-1',
        programme_id: 'programme-a',
        assessment_type: 'letter_egra',
        date_assessed: '2026-06-18',
        capture_mode: 'sequential',
        correction_count: 4,
        items_tested: ['a', 'm'],
        correct_letters: [{ index: 0, letter: 'a' }],
        incorrect_letters: [{ index: 1, letter: 'm' }],
        letters_attempted: 2,
        correct_responses: 1,
        accuracy: 50,
        letter_language: 'isiXhosa',
        attempt_number: 1,
        synced: false,
      });

      await expect(db.runAsync(`
        insert into assessments (
          id,
          user_id,
          child_id,
          programme_id,
          assessment_type,
          assessment_date,
          capture_mode
        )
        values (
          'assessment-bogus',
          'user-1',
          'child-1',
          'programme-a',
          'letter_egra',
          '2026-06-18',
          'bogus'
        )
      `)).rejects.toThrow();

      await expect(repository.getAssessments({ userId: 'user-1', childId: 'child-1' }))
        .resolves.toEqual([
          expect.objectContaining({
            id: 'assessment-1',
            capture_mode: 'sequential',
            correction_count: 4,
          }),
        ]);
    } finally {
      await db.closeAsync();
    }
  });
});

describe('capture_mode push allowlist', () => {
  test('assessments SERVER_COLUMNS includes capture_mode', () => {
    const offlineSync = require('../src/services/offlineSync');
    expect(offlineSync.SERVER_COLUMNS.assessments).toContain('capture_mode');
  });
});
