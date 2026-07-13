jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { runMigrations } from '../src/db/migrations';
import { getWriter } from '../src/db/client';
import {
  childrenRepository,
  createChildrenRepository,
} from '../src/db/repositories/childrenRepository';
import { createGroupsRepository } from '../src/db/repositories/groupsRepository';
import { createClassesRepository } from '../src/db/repositories/classesRepository';
import { createClassEaAssignmentsRepository } from '../src/db/repositories/classEaAssignmentsRepository';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';

const serverChild = (overrides = {}) => ({
  id: 'child-1',
  first_name: 'Amahle',
  last_name: 'Dlamini',
  class_id: 'class-1',
  created_by: 'user-1',
  synced: true,
  sync_status: 'synced',
  created_at: '2026-07-01T08:00:00.000Z',
  updated_at: '2026-07-01T08:00:00.000Z',
  ...overrides,
});

describe('server pull guard — pending-local-wins (issue #42, ZZ F7)', () => {
  test('a pulled children row does not overwrite a pending local edit, and the queued outbox payload survives', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });

      // A child the server already acknowledged, exactly as a pull creates it.
      await repository.saveChildRecord(serverChild());

      // The EA edits the child while offline — pending local edit + queued update.
      await repository.updateChild('child-1', { first_name: 'Amahle-Edited', synced: false });

      // A background pull returns the stale server copy of the same row.
      const applied = await repository.saveChildRecord(serverChild());

      expect(applied).toBe(false);
      expect(await db.getFirstAsync('select first_name, sync_status from children where id = ?', 'child-1'))
        .toEqual({ first_name: 'Amahle-Edited', sync_status: 'pending' });

      const outboxRow = await db.getFirstAsync(`
        select payload
        from sync_outbox
        where table_name = 'children'
          and record_id = 'child-1'
          and operation = 'update'
      `);
      expect(JSON.parse(outboxRow.payload).first_name).toBe('Amahle-Edited');
    } finally {
      await db.closeAsync();
    }
  });

  test('a pulled children row still updates a synced local row (server stays authoritative for acknowledged data)', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });

      await repository.saveChildRecord(serverChild());

      const applied = await repository.saveChildRecord(serverChild({
        first_name: 'Amahle-Renamed',
        updated_at: '2026-07-02T08:00:00.000Z',
      }));

      expect(applied).toBe(true);
      expect(await db.getFirstAsync('select first_name, sync_status from children where id = ?', 'child-1'))
        .toEqual({ first_name: 'Amahle-Renamed', sync_status: 'synced' });
    } finally {
      await db.closeAsync();
    }
  });

  test('a pulled groups row does not overwrite a pending local rename', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createGroupsRepository({ database: db });
      const serverGroup = {
        id: 'group-1',
        name: 'Blue Group',
        programme_id: 'programme-a',
        created_by: 'user-1',
        synced: true,
        sync_status: 'synced',
        created_at: '2026-07-01T08:00:00.000Z',
        updated_at: '2026-07-01T08:00:00.000Z',
      };

      await repository.saveGroup(serverGroup);
      await repository.updateGroup('group-1', { name: 'Blue Group Renamed', synced: false });

      const applied = await repository.saveGroup(serverGroup);

      expect(applied).toBe(false);
      expect(await db.getFirstAsync('select name, sync_status from groups where id = ?', 'group-1'))
        .toEqual({ name: 'Blue Group Renamed', sync_status: 'pending' });
    } finally {
      await db.closeAsync();
    }
  });

  test('a pulled membership row does not resurrect a membership removed offline', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const childrenRepository = createChildrenRepository({ database: db });
      const groupsRepository = createGroupsRepository({ database: db });

      await childrenRepository.saveChildRecord(serverChild());
      await groupsRepository.saveGroup({
        id: 'group-1',
        name: 'Blue Group',
        programme_id: 'programme-a',
        created_by: 'user-1',
        synced: true,
        sync_status: 'synced',
      });
      const serverMembership = {
        id: 'cgm-1',
        child_id: 'child-1',
        group_id: 'group-1',
        joined_at: '2026-07-01T08:00:00.000Z',
        created_by: 'user-1',
        synced: true,
        sync_status: 'synced',
      };
      await groupsRepository.addChildToGroup(serverMembership);

      // The EA removes the child from the group while offline.
      await groupsRepository.removeChildFromGroup('child-1', 'group-1', {
        removedAt: '2026-07-03T08:00:00.000Z',
      });

      // A pull still returns the membership as active on the server.
      const applied = await groupsRepository.addChildToGroup(serverMembership);

      expect(applied).toBe(false);
      expect(await db.getFirstAsync('select removed_at, sync_status from child_group_memberships where id = ?', 'cgm-1'))
        .toEqual({ removed_at: '2026-07-03T08:00:00.000Z', sync_status: 'pending' });

      const outboxRow = await db.getFirstAsync(`
        select payload
        from sync_outbox
        where table_name = 'child_group_memberships'
          and record_id = 'cgm-1'
          and operation = 'archive'
      `);
      expect(JSON.parse(outboxRow.payload).removed_at).toBe('2026-07-03T08:00:00.000Z');
    } finally {
      await db.closeAsync();
    }
  });

  test('a pulled classes row does not overwrite a pending local rename', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createClassesRepository({ database: db });
      const serverClass = {
        id: 'class-2',
        school_id: 'school-1',
        name: 'Grade 2B',
        grade: '2',
        academic_year_id: 'year-2026',
        created_by: 'user-1',
        synced: true,
        sync_status: 'synced',
      };

      await repository.saveClass(serverClass);
      await repository.updateClass('class-2', { name: 'Grade 2B Renamed', synced: false });

      const applied = await repository.saveClass(serverClass);

      expect(applied).toBe(false);
      expect(await db.getFirstAsync('select name, sync_status from classes where id = ?', 'class-2'))
        .toEqual({ name: 'Grade 2B Renamed', sync_status: 'pending' });
    } finally {
      await db.closeAsync();
    }
  });

  test('a pulled child EA assignment does not resurrect an assignment unassigned offline', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });
      await repository.saveChildRecord(serverChild());
      const serverAssignment = {
        id: 'cea-1',
        user_id: 'user-1',
        child_id: 'child-1',
        assigned_at: '2026-07-01T08:00:00.000Z',
        unassigned_at: null,
        created_by: 'user-1',
        synced: true,
        sync_status: 'synced',
      };

      await repository.saveStaffChild(serverAssignment);
      await repository.saveStaffChild({
        ...serverAssignment,
        unassigned_at: '2026-07-03T08:00:00.000Z',
        synced: false,
        sync_status: 'pending',
      });

      const applied = await repository.saveStaffChild(serverAssignment);

      expect(applied).toBe(false);
      expect(await db.getFirstAsync('select unassigned_at, sync_status from child_ea_assignments where id = ?', 'cea-1'))
        .toEqual({ unassigned_at: '2026-07-03T08:00:00.000Z', sync_status: 'pending' });
    } finally {
      await db.closeAsync();
    }
  });

  test('a pulled programme enrollment does not resurrect an enrollment ended offline', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });
      await repository.saveChildRecord(serverChild());
      const serverEnrollment = {
        id: 'cpe-1',
        child_id: 'child-1',
        programme_id: 'programme-a',
        enrolled_at: '2026-07-01T08:00:00.000Z',
        ended_at: null,
        created_by: 'user-1',
        synced: true,
        sync_status: 'synced',
      };

      await repository.saveChildProgrammeEnrollment(serverEnrollment);
      await repository.saveChildProgrammeEnrollment({
        ...serverEnrollment,
        ended_at: '2026-07-03T08:00:00.000Z',
        synced: false,
        sync_status: 'pending',
      });

      const applied = await repository.saveChildProgrammeEnrollment(serverEnrollment);

      expect(applied).toBe(false);
      expect(await db.getFirstAsync('select ended_at, sync_status from child_programme_enrollments where id = ?', 'cpe-1'))
        .toEqual({ ended_at: '2026-07-03T08:00:00.000Z', sync_status: 'pending' });
    } finally {
      await db.closeAsync();
    }
  });

  test('a pulled class membership does not resurrect a membership exited offline', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });
      await repository.saveChildRecord(serverChild());
      const serverMembership = {
        id: 'ccm-1',
        child_id: 'child-1',
        class_id: 'class-1',
        academic_year_id: 'year-2026',
        enrolled_at: '2026-07-01T08:00:00.000Z',
        exited_at: null,
        created_by: 'user-1',
        synced: true,
        sync_status: 'synced',
      };

      await repository.saveChildClassMembership(serverMembership);
      await repository.saveChildClassMembership({
        ...serverMembership,
        exited_at: '2026-07-03T08:00:00.000Z',
        synced: false,
        sync_status: 'pending',
      });

      const applied = await repository.saveChildClassMembership(serverMembership);

      expect(applied).toBe(false);
      expect(await db.getFirstAsync('select exited_at, sync_status from child_class_memberships where id = ?', 'ccm-1'))
        .toEqual({ exited_at: '2026-07-03T08:00:00.000Z', sync_status: 'pending' });
    } finally {
      await db.closeAsync();
    }
  });

  test('a pulled class EA assignment does not resurrect an assignment unassigned offline', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createClassEaAssignmentsRepository({ database: db });
      const serverAssignment = {
        id: 'clea-1',
        class_id: 'class-1',
        ea_user_id: 'user-1',
        programme_id: 'programme-a',
        assigned_at: '2026-07-01T08:00:00.000Z',
        unassigned_at: null,
        created_by: 'user-1',
        synced: true,
        sync_status: 'synced',
      };

      await repository.save(serverAssignment);
      await repository.save({
        ...serverAssignment,
        unassigned_at: '2026-07-03T08:00:00.000Z',
        synced: false,
        sync_status: 'pending',
      });

      const applied = await repository.save(serverAssignment);

      expect(applied).toBe(false);
      expect(await db.getFirstAsync('select unassigned_at, sync_status from class_ea_assignments where id = ?', 'clea-1'))
        .toEqual({ unassigned_at: '2026-07-03T08:00:00.000Z', sync_status: 'pending' });
    } finally {
      await db.closeAsync();
    }
  });
});

describe('server pull guard repository reads stay consistent with SQLite', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await seedCoreData(await getWriter());
  });

  test('after a pull, repository reads still show the pending local edit', async () => {
    const serverRow = serverChild();

    await childrenRepository.saveChildRecord(serverRow);
    await childrenRepository.updateChild(
      'child-1',
      { first_name: 'Amahle-Edited', synced: false },
      { actorUserId: 'user-1' }
    );

    await childrenRepository.saveChildRecord(serverRow);

    const children = await childrenRepository.getChildren();
    const child = children.find((row) => row.id === 'child-1');
    expect(child.first_name).toBe('Amahle-Edited');
    expect(child.synced).toBe(false);
  });

  test('repository reads report the current sync_status', async () => {
    await childrenRepository.saveChildRecord(serverChild());
    await childrenRepository.updateChild(
      'child-1',
      { first_name: 'Amahle-Edited', synced: false },
      { actorUserId: 'user-1' }
    );

    const children = await childrenRepository.getChildren();
    const child = children.find((row) => row.id === 'child-1');
    expect(child.sync_status).toBe('pending');
    expect(child.synced).toBe(false);
  });
});
