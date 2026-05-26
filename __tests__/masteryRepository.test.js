jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createMasteryRepository } from '../src/db/repositories/masteryRepository';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';

describe('masteryRepository', () => {
  test('letter mastery uses its natural active key and allows re-teach after soft delete', async () => {
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

      const repository = createMasteryRepository({ database: db });
      await repository.saveLetterMasteryRecord({
        id: 'mastery-1',
        user_id: 'user-1',
        child_id: 'child-1',
        programme_id: 'programme-a',
        letter: 'a',
        language: 'isiXhosa',
        source: 'taught',
        synced: false,
      });
      await repository.saveLetterMasteryRecord({
        id: 'mastery-duplicate',
        user_id: 'user-1',
        child_id: 'child-1',
        programme_id: 'programme-a',
        letter: 'a',
        language: 'isiXhosa',
        source: 'taught',
        mastered_at: '2026-05-21T09:00:00.000Z',
        synced: false,
      });

      expect(await db.getFirstAsync('select count(*) as count from letter_mastery where deleted_at is null'))
        .toEqual({ count: 1 });
      expect(await db.getFirstAsync('select id, mastered_at from letter_mastery where deleted_at is null'))
        .toEqual({ id: 'mastery-1', mastered_at: '2026-05-21T09:00:00.000Z' });

      await repository.updateLetterMasteryRecord('mastery-1', {
        _deleted: true,
        synced: false,
        updated_at: '2026-05-22T00:00:00.000Z',
      });
      await repository.saveLetterMasteryRecord({
        id: 'mastery-2',
        user_id: 'user-1',
        child_id: 'child-1',
        programme_id: 'programme-a',
        letter: 'a',
        language: 'isiXhosa',
        source: 'taught',
        synced: false,
      });

      expect(await repository.getLetterMastery()).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'mastery-1', _deleted: true }),
        expect.objectContaining({ id: 'mastery-2', _deleted: false }),
      ]));
    } finally {
      await db.closeAsync();
    }
  });

  test('letter mastery saves require an active programme assignment when programme_id is omitted', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      await db.runAsync("update staff_programme_assignments set ended_at = '2026-05-21T00:00:00.000Z'");
      const repository = createMasteryRepository({ database: db });

      await expect(repository.saveLetterMasteryRecord({
        id: 'mastery-without-programme',
        user_id: 'user-1',
        child_id: 'child-1',
        letter: 'a',
        language: 'isiXhosa',
        source: 'taught',
        synced: false,
      })).rejects.toThrow(/No active programme assignment/i);

      expect(await db.getFirstAsync('select count(*) as count from letter_mastery')).toEqual({ count: 0 });
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('user-scoped letter mastery reads only return records in the active programme', async () => {
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
      const repository = createMasteryRepository({ database: db });

      await repository.saveLetterMasteryRecord({
        id: 'mastery-literacy',
        user_id: 'user-1',
        child_id: 'child-1',
        programme_id: 'programme-a',
        letter: 'a',
        language: 'isiXhosa',
        source: 'taught',
        synced: false,
      });
      await repository.saveLetterMasteryRecord({
        id: 'mastery-numeracy',
        user_id: 'user-1',
        child_id: 'child-1',
        programme_id: 'programme-b',
        letter: 'a',
        language: 'isiXhosa',
        source: 'taught',
        synced: false,
      });

      expect((await repository.getLetterMastery()).map(record => record.id))
        .toEqual(['mastery-literacy', 'mastery-numeracy']);
      expect(await repository.getLetterMastery({ userId: 'user-1' })).toEqual([
        expect.objectContaining({ id: 'mastery-literacy', programme_id: 'programme-a' }),
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('saveLetterMasteryRecord throws when user_id is missing (RLS contract guard)', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createMasteryRepository({ database: db });

      await expect(repository.saveLetterMasteryRecord({
        id: 'mastery-no-user',
        child_id: 'child-1',
        programme_id: 'programme-a',
        letter: 'a',
        language: 'isiXhosa',
        source: 'taught',
        synced: false,
      })).rejects.toThrow(/letter_mastery\.user_id is required/i);

      expect(await db.getFirstAsync('select count(*) as count from letter_mastery')).toEqual({ count: 0 });
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });
});
