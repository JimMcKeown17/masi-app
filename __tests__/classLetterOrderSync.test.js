jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {},
}));

import { runMigrations } from '../src/db/migrations';
import { createClassesRepository } from '../src/db/repositories/classesRepository';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

test('a class renamed before its first upload sends no edition and takes the pulled server edition', async () => {
  const db = await createMigratedDatabase(runMigrations);
  try {
    await seedCoreData(db);
    const repository = createClassesRepository({ database: db });
    const newClass = {
      id: 'class-created-offline', school_id: 'school-1', name: 'Original class name', grade: '1',
      academic_year_id: 'year-2026', created_by: 'user-1',
    };
    await repository.saveClass(newClass);
    await repository.updateClass(newClass.id, { name: 'Renamed before upload' });
    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({
      database: db, supabaseClient,
      enqueueRequest: task => task(),
      getAuthSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }),
    });

    expect(await engine.syncAll({ tableName: 'classes' })).toMatchObject({ success: true, totalFailed: 0 });
    const classCalls = calls.filter(call => call.tableName === 'classes');
    expect(classCalls.length).toBeGreaterThan(0);
    const payloads = classCalls.flatMap(call => Array.isArray(call.payload) ? call.payload : [call.payload]);
    for (const payload of payloads) expect(payload).not.toHaveProperty('letter_order_edition');
    expect(payloads[payloads.length - 1]).toMatchObject({ name: 'Renamed before upload' });
    expect(await db.getAllAsync("select * from sync_outbox where table_name = 'classes' and record_id = ?", newClass.id))
      .toEqual([]);
    expect(await repository.getClassById(newClass.id)).toMatchObject({ sync_status: 'synced' });

    await repository.saveClass({
      ...newClass, name: 'Renamed before upload', letter_order_edition: '2099-01-01', sync_status: 'synced',
    });
    expect(await repository.getClassById(newClass.id)).toMatchObject({
      name: 'Renamed before upload', letter_order_edition: '2099-01-01', sync_status: 'synced',
    });
  } finally {
    await db.closeAsync();
  }
});
