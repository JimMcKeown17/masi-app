jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createClassEaAssignmentsRepository } from '../src/db/repositories/classEaAssignmentsRepository';
import { createChildClassMembershipsRepository } from '../src/db/repositories/childClassMembershipsRepository';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';

describe('class_ea_assignments junction guards (RLS contract)', () => {
  test.each([
    ['ea_user_id', { class_id: 'class-1', programme_id: 'programme-a', created_by: 'user-1' }],
    ['created_by', { class_id: 'class-1', ea_user_id: 'user-1', programme_id: 'programme-a' }],
    ['programme_id', { class_id: 'class-1', ea_user_id: 'user-1', created_by: 'user-1' }],
    ['class_id', { ea_user_id: 'user-1', programme_id: 'programme-a', created_by: 'user-1' }],
  ])('save throws when %s is missing', async (missing, partial) => {
    const db = await createMigratedDatabase(runMigrations);
    try {
      await seedCoreData(db);
      const repository = createClassEaAssignmentsRepository({ database: db });
      await expect(repository.save({
        id: `assignment-missing-${missing}`,
        assigned_at: '2026-05-21T08:00:00.000Z',
        ...partial,
      })).rejects.toThrow(new RegExp(`class_ea_assignments\\.${missing} is required`, 'i'));
      expect(await db.getFirstAsync('select count(*) as count from class_ea_assignments')).toEqual({ count: 0 });
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('save with all required fields succeeds', async () => {
    const db = await createMigratedDatabase(runMigrations);
    try {
      await seedCoreData(db);
      const repository = createClassEaAssignmentsRepository({ database: db });
      await expect(repository.save({
        id: 'assignment-1',
        class_id: 'class-1',
        ea_user_id: 'user-1',
        programme_id: 'programme-a',
        created_by: 'user-1',
        assigned_at: '2026-05-21T08:00:00.000Z',
      })).resolves.toBe(true);
      expect(await db.getFirstAsync('select id, class_id, ea_user_id from class_ea_assignments'))
        .toEqual({ id: 'assignment-1', class_id: 'class-1', ea_user_id: 'user-1' });
    } finally {
      await db.closeAsync();
    }
  });

  test('a synced server assignment may retain a null created_by without enqueueing', async () => {
    const db = await createMigratedDatabase(runMigrations);
    try {
      await seedCoreData(db);
      const repository = createClassEaAssignmentsRepository({ database: db });

      await expect(repository.save({
        id: 'server-assignment-1',
        class_id: 'class-1',
        ea_user_id: 'user-1',
        programme_id: 'programme-a',
        assigned_at: '2026-05-21T08:00:00.000Z',
        created_by: null,
        sync_status: 'synced',
      })).resolves.toBe(true);

      expect(await db.getFirstAsync(
        'select id, created_by, sync_status from class_ea_assignments where id = ?',
        'server-assignment-1'
      )).toEqual({
        id: 'server-assignment-1',
        created_by: null,
        sync_status: 'synced',
      });
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox'))
        .toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });
});

describe('child_class_memberships junction guards (RLS contract)', () => {
  test.each([
    ['child_id', { class_id: 'class-1', created_by: 'user-1' }],
    ['class_id', { child_id: 'child-1', created_by: 'user-1' }],
    ['created_by', { child_id: 'child-1', class_id: 'class-1' }],
  ])('save throws when %s is missing', async (missing, partial) => {
    const db = await createMigratedDatabase(runMigrations);
    try {
      await seedCoreData(db);
      const repository = createChildClassMembershipsRepository({ database: db });
      await expect(repository.save({
        id: `membership-missing-${missing}`,
        academic_year_id: 'year-2026',
        enrolled_at: '2026-05-21T08:00:00.000Z',
        ...partial,
      })).rejects.toThrow(new RegExp(`child_class_memberships\\.${missing} is required`, 'i'));
      expect(await db.getFirstAsync('select count(*) as count from child_class_memberships')).toEqual({ count: 0 });
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });
});
