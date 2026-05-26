jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createAssessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { validate as uuidValidate } from 'uuid';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';

describe('assessmentsRepository', () => {
  test('assessment save writes parent and assessment items in one transaction and returns legacy EGRA summary fields', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      await createChildrenRepository({ database: db }).save({
        id: 'child-1',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        class_id: 'class-1',
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
        date_assessed: '2026-05-21',
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

      expect(await db.getFirstAsync('select count(*) as count from assessments')).toEqual({ count: 1 });
      expect(await db.getFirstAsync("select count(*) as count from assessment_items where assessment_id = 'assessment-1'"))
        .toEqual({ count: 3 });
      const items = await db.getAllAsync('select id from assessment_items order by item_key');
      expect(items).toHaveLength(3);
      for (const item of items) {
        expect(uuidValidate(item.id)).toBe(true);
        expect(item.id).not.toContain(':');
      }
      const outboxItems = await db.getAllAsync(`
        select record_id, payload
        from sync_outbox
        where table_name = 'assessment_items'
        order by record_id
      `);
      expect(outboxItems).toHaveLength(3);
      for (const item of outboxItems) {
        expect(uuidValidate(item.record_id)).toBe(true);
        expect(uuidValidate(JSON.parse(item.payload).id)).toBe(true);
      }
      expect(await repository.getAssessments()).toEqual([
        expect.objectContaining({
          id: 'assessment-1',
          date_assessed: '2026-05-21',
          correct_letters: [{ index: 0, letter: 'a' }],
          incorrect_letters: [{ index: 1, letter: 'm' }],
          letters_attempted: 2,
          correct_responses: 1,
          accuracy: 50,
          letter_language: 'isiXhosa',
          synced: false,
        }),
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('assessment saves require an active programme assignment when programme_id is omitted', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      await db.runAsync("update staff_programme_assignments set ended_at = '2026-05-21T00:00:00.000Z'");
      const repository = createAssessmentsRepository({ database: db });

      await expect(repository.saveAssessment({
        id: 'assessment-without-programme',
        user_id: 'user-1',
        child_id: 'child-1',
        assessment_type: 'letter_egra',
        date_assessed: '2026-05-21',
        synced: false,
      })).rejects.toThrow(/No active programme assignment/i);

      expect(await db.getFirstAsync('select count(*) as count from assessments')).toEqual({ count: 0 });
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('user-scoped assessment reads only return assessments in the active programme', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      await createChildrenRepository({ database: db }).save({
        id: 'child-1',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        class_id: 'class-1',
        created_by: 'user-1',
        synced: false,
      }, { actorUserId: 'user-1' });
      const repository = createAssessmentsRepository({ database: db });

      await repository.saveAssessment({
        id: 'assessment-literacy',
        user_id: 'user-1',
        child_id: 'child-1',
        programme_id: 'programme-a',
        assessment_type: 'letter_egra',
        date_assessed: '2026-05-21',
        synced: false,
      });
      await repository.saveAssessment({
        id: 'assessment-numeracy',
        user_id: 'user-1',
        child_id: 'child-1',
        programme_id: 'programme-b',
        assessment_type: 'letter_egra',
        date_assessed: '2026-05-22',
        synced: false,
      });

      expect((await repository.getAssessments()).map(assessment => assessment.id))
        .toEqual(['assessment-literacy', 'assessment-numeracy']);
      expect(await repository.getAssessments({ userId: 'user-1' })).toEqual([
        expect.objectContaining({ id: 'assessment-literacy', programme_id: 'programme-a' }),
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('saveAssessment throws when user_id is missing (RLS contract guard)', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createAssessmentsRepository({ database: db });

      await expect(repository.saveAssessment({
        id: 'assessment-no-user',
        child_id: 'child-1',
        programme_id: 'programme-a',
        assessment_type: 'letter_egra',
        date_assessed: '2026-05-21',
        synced: false,
      })).rejects.toThrow(/assessments\.user_id is required/i);

      expect(await db.getFirstAsync('select count(*) as count from assessments')).toEqual({ count: 0 });
      expect(await db.getFirstAsync('select count(*) as count from assessment_items')).toEqual({ count: 0 });
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });
});
