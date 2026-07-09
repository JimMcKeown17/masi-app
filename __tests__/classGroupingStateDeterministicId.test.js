jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

const { runMigrations } = require('../src/db/migrations');
const { createClassGroupingStateRepository } = require('../src/db/repositories/classGroupingStateRepository');
const {
  classGroupingStateDomainId,
  deterministicDomainId,
} = require('../src/db/repositories/domainRepositoryUtils');
const {
  createMigratedDatabase,
  seedCoreData,
} = require('../test-support/sqliteRepositoryTestUtils');

describe('class_grouping_state deterministic id (#46)', () => {
  test('helper uses the class/year singleton key', () => {
    expect(classGroupingStateDomainId({ classId: 'c1', academicYearId: 'ay1' }))
      .toBe(deterministicDomainId('class_grouping_state', 'c1', 'ay1'));
  });

  test('sync payload remaps class grouping state id to the singleton id', () => {
    const { _testBuildSyncPayload } = require('../src/services/offlineSync');
    const expectedId = classGroupingStateDomainId({
      classId: 'class-1',
      academicYearId: 'year-2026',
    });

    const payload = _testBuildSyncPayload('class_grouping_state', {
      id: 'random-state-id',
      class_id: 'class-1',
      academic_year_id: 'year-2026',
      class_list_status: 'building',
      synced: false,
    });

    expect(payload.id).toBe(expectedId);
    expect(payload.id).not.toBe('random-state-id');
  });

  test('repository save forces the class/year singleton id', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createClassGroupingStateRepository({ database: db });
      const expectedId = classGroupingStateDomainId({
        classId: 'class-1',
        academicYearId: 'year-2026',
      });

      await repository.save({
        id: 'random-state-id',
        class_id: 'class-1',
        academic_year_id: 'year-2026',
        synced: false,
      });

      const row = await db.getFirstAsync(`
        select id, class_id, academic_year_id
        from class_grouping_state
        where class_id = ? and academic_year_id = ?
      `, 'class-1', 'year-2026');

      expect(row).toEqual({
        id: expectedId,
        class_id: 'class-1',
        academic_year_id: 'year-2026',
      });
      expect(row.id).not.toBe('random-state-id');
    } finally {
      await db.closeAsync();
    }
  });
});
