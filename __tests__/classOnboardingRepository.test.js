jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createClassesRepository } from '../src/db/repositories/classesRepository';
import { createLocalStateRepository } from '../src/db/repositories/localStateRepository';
import { createClassOnboardingRepository } from '../src/db/repositories/classOnboardingRepository';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';

const classData = {
  id: 'class-onboarding',
  school_id: 'school-1',
  name: 'Grade 1 Onboarding',
  grade: '1',
  teacher: 'Ms Ndlovu',
  academic_year_id: 'year-2026',
  created_by: 'user-1',
  synced: false,
};

describe('classOnboardingRepository', () => {
  test('persists the class and user-scoped incomplete step atomically across restarts', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createClassOnboardingRepository({
        database: db,
        classes: createClassesRepository({ database: db }),
        localState: createLocalStateRepository({ database: db }),
      });

      await repository.start({ userId: 'user-1', classData });

      const afterRestart = createClassOnboardingRepository({
        database: db,
        classes: createClassesRepository({ database: db }),
        localState: createLocalStateRepository({ database: db }),
      });
      expect(await afterRestart.getPendingClassId('user-1')).toBe('class-onboarding');
      expect(await afterRestart.getPendingClassId('user-2')).toBeNull();
      expect(await db.getFirstAsync('select id from classes where id = ?', 'class-onboarding'))
        .toEqual({ id: 'class-onboarding' });

      await afterRestart.complete({ userId: 'user-1', classId: 'class-onboarding' });
      expect(await afterRestart.getPendingClassId('user-1')).toBeNull();
    } finally {
      await db.closeAsync();
    }
  });

  test('rolls the class and outbox back when the onboarding marker cannot be saved', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const localState = createLocalStateRepository({ database: db });
      const repository = createClassOnboardingRepository({
        database: db,
        classes: createClassesRepository({ database: db }),
        localState: {
          ...localState,
          set: jest.fn(async () => {
            throw new Error('marker write failed');
          }),
        },
      });

      await expect(repository.start({ userId: 'user-1', classData }))
        .rejects.toThrow('marker write failed');
      expect(await db.getFirstAsync('select id from classes where id = ?', 'class-onboarding'))
        .toBeNull();
      expect(await db.getFirstAsync(
        'select count(*) as count from sync_outbox where record_id = ?',
        'class-onboarding'
      )).toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });
});
