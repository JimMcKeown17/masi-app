jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import {
  createReferenceDataRepository,
  createSchoolsRepository,
} from '../src/db/repositories/referenceDataRepository';

describe('reference data repositories', () => {
  test('reference table replacement is all-or-nothing per table', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      const schoolsRepository = createSchoolsRepository({ database: db });

      await schoolsRepository.replaceAll([{ id: 'school-1', name: 'Cached School' }]);

      await expect(schoolsRepository.replaceAll([
        { id: 'school-2', name: 'Valid School' },
        { id: 'school-3', name: null },
      ])).rejects.toThrow(/not.*null/i);

      expect(await schoolsRepository.getAll()).toEqual([
        expect.objectContaining({
          id: 'school-1',
          name: 'Cached School',
          synced: true,
        }),
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('failed server preload does not wipe the existing cache', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      const schoolsRepository = createSchoolsRepository({ database: db });

      await schoolsRepository.replaceAll([{ id: 'school-1', name: 'Cached School' }]);

      await schoolsRepository.replaceFromServer(null);
      await schoolsRepository.replaceFromServer(undefined);

      expect(await schoolsRepository.getAll()).toHaveLength(1);
      expect((await schoolsRepository.getAll())[0].name).toBe('Cached School');
    } finally {
      await db.closeAsync();
    }
  });

  test('pull-only repositories cover academic years, assessment windows, and teachers', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      const academicYearsRepository = createReferenceDataRepository({
        database: db,
        tableName: 'academic_years',
        columns: ['id', 'label', 'starts_on', 'ends_on', 'is_active'],
        booleanColumns: ['is_active'],
      });

      await academicYearsRepository.replaceAll([
        {
          id: 'year-2026',
          label: '2026',
          starts_on: '2026-01-15',
          ends_on: '2026-12-15',
          is_active: true,
        },
      ]);

      expect(await academicYearsRepository.getActive()).toEqual(expect.objectContaining({
        id: 'year-2026',
        label: '2026',
        is_active: true,
        synced: true,
      }));
    } finally {
      await db.closeAsync();
    }
  });
});
