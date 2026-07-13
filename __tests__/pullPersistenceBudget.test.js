jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createClassesRepository } from '../src/db/repositories/classesRepository';
import { createClassEaAssignmentsRepository } from '../src/db/repositories/classEaAssignmentsRepository';
import { createGroupsRepository } from '../src/db/repositories/groupsRepository';
import { createCountingSqliteTestDatabase } from '../test-support/countingSqliteAdapter';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const FIXED_AT = '2026-07-13T12:00:00.000Z';

const createDatabase = async () => {
  const db = createCountingSqliteTestDatabase();
  await runMigrations(db);
  await seedCoreData(db);
  return db;
};

const childRows = () => Array.from({ length: 30 }, (_, index) => ({
  id: `child-${String(index).padStart(2, '0')}`,
  first_name: 'Child',
  last_name: String(index),
  class_id: 'class-1',
  created_by: 'user-1',
  created_at: FIXED_AT,
  updated_at: FIXED_AT,
  sync_status: 'synced',
  synced: true,
}));

const staffChildRows = () => childRows().map((child, index) => ({
  id: `cea-${String(index).padStart(2, '0')}`,
  child_id: child.id,
  user_id: 'user-1',
  assigned_at: FIXED_AT,
  created_by: 'user-1',
  created_at: FIXED_AT,
  updated_at: FIXED_AT,
  sync_status: 'synced',
  synced: true,
}));

const programmeEnrollmentRows = () => childRows().map((child, index) => ({
  id: `cpe-${String(index).padStart(2, '0')}`,
  child_id: child.id,
  programme_id: 'programme-a',
  enrolled_at: FIXED_AT,
  created_by: 'user-1',
  created_at: FIXED_AT,
  updated_at: FIXED_AT,
  sync_status: 'synced',
  synced: true,
}));

const classMembershipRows = () => childRows().map((child, index) => ({
  id: `ccm-${String(index).padStart(2, '0')}`,
  child_id: child.id,
  class_id: 'class-1',
  academic_year_id: 'year-2026',
  enrolled_at: FIXED_AT,
  created_by: 'user-1',
  created_at: FIXED_AT,
  updated_at: FIXED_AT,
  sync_status: 'synced',
  synced: true,
}));

const classRows = () => Array.from({ length: 30 }, (_, index) => ({
  id: `class-${String(index).padStart(2, '0')}`,
  school_id: 'school-1',
  name: `Grade ${index}`,
  grade: String(index),
  academic_year_id: 'year-2026',
  created_by: 'user-1',
  created_at: FIXED_AT,
  updated_at: FIXED_AT,
  sync_status: 'synced',
  synced: true,
}));

const classEaAssignmentRows = () => classRows().map((classItem, index) => ({
  id: `class-ea-${String(index).padStart(2, '0')}`,
  class_id: classItem.id,
  ea_user_id: 'user-1',
  programme_id: 'programme-a',
  assigned_at: FIXED_AT,
  created_by: 'user-1',
  created_at: FIXED_AT,
  updated_at: FIXED_AT,
  sync_status: 'synced',
  synced: true,
}));

const groupRows = () => Array.from({ length: 30 }, (_, index) => ({
  id: `group-${String(index).padStart(2, '0')}`,
  name: `Group ${index}`,
  programme_id: 'programme-a',
  class_id: 'class-1',
  created_by: 'user-1',
  created_at: FIXED_AT,
  updated_at: FIXED_AT,
  sync_status: 'synced',
  synced: true,
}));

const groupMembershipRows = () => childRows().map((child, index) => ({
  id: `cgm-${String(index).padStart(2, '0')}`,
  child_id: child.id,
  group_id: groupRows()[index].id,
  joined_at: FIXED_AT,
  created_by: 'user-1',
  created_at: FIXED_AT,
  updated_at: FIXED_AT,
  sync_status: 'synced',
  synced: true,
}));

describe('batched pull persistence budgets', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(FIXED_AT));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('saveServerChildRows uses one transaction and matches per-row persistence', async () => {
    const batchDb = await createDatabase();
    const perRowDb = await createDatabase();
    try {
      const batchRepository = createChildrenRepository({ database: batchDb });
      const perRowRepository = createChildrenRepository({ database: perRowDb });
      const rows = childRows();

      batchDb.resetQueryLog();
      await expect(batchRepository.saveServerChildRows(rows)).resolves.toEqual({
        applied: 30,
        skipped: 0,
        failed: 0,
      });
      expect(batchDb.getTransactionCount()).toBe(1);

      for (const row of rows) {
        await perRowRepository.saveChildRecord(row);
      }

      expect(await batchDb.getAllAsync('select * from children order by id'))
        .toEqual(await perRowDb.getAllAsync('select * from children order by id'));
      expect(await batchDb.getFirstAsync(
        "select count(*) as count from local_state where key like 'storage_payload:%'"
      )).toEqual({ count: 0 });
    } finally {
      await batchDb.closeAsync();
      await perRowDb.closeAsync();
    }
  });

  test('saveServerChildRows nulls an unresolved class reference instead of failing the batch', async () => {
    const db = await createDatabase();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const repository = createChildrenRepository({ database: db });
      const row = {
        ...childRows()[0],
        id: 'child-missing-class',
        class_id: 'class-not-pulled',
      };

      await expect(repository.saveServerChildRows([row])).resolves.toEqual({
        applied: 1,
        skipped: 0,
        failed: 0,
      });
      expect(await db.getFirstAsync(
        'select id, class_id from children where id = ?',
        row.id
      )).toEqual({ id: row.id, class_id: null });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('class-not-pulled'));
    } finally {
      warn.mockRestore();
      await db.closeAsync();
    }
  });

  test('saveServerStaffChildRows uses one transaction and matches per-row persistence', async () => {
    const batchDb = await createDatabase();
    const perRowDb = await createDatabase();
    try {
      const batchRepository = createChildrenRepository({ database: batchDb });
      const perRowRepository = createChildrenRepository({ database: perRowDb });
      const children = childRows();
      for (const child of children) {
        await batchRepository.saveChildRecord(child);
        await perRowRepository.saveChildRecord(child);
      }
      const rows = staffChildRows();

      batchDb.resetQueryLog();
      await expect(batchRepository.saveServerStaffChildRows(rows)).resolves.toEqual({
        applied: 30,
        skipped: 0,
        failed: 0,
      });
      expect(batchDb.getTransactionCount()).toBe(1);
      for (const row of rows) {
        await perRowRepository.saveStaffChild(row);
      }

      expect(await batchDb.getAllAsync('select * from child_ea_assignments order by id'))
        .toEqual(await perRowDb.getAllAsync('select * from child_ea_assignments order by id'));
    } finally {
      await batchDb.closeAsync();
      await perRowDb.closeAsync();
    }
  });

  test('saveServerChildProgrammeEnrollmentRows uses one transaction and matches per-row persistence', async () => {
    const batchDb = await createDatabase();
    const perRowDb = await createDatabase();
    try {
      const batchRepository = createChildrenRepository({ database: batchDb });
      const perRowRepository = createChildrenRepository({ database: perRowDb });
      for (const child of childRows()) {
        await batchRepository.saveChildRecord(child);
        await perRowRepository.saveChildRecord(child);
      }
      const rows = programmeEnrollmentRows();

      batchDb.resetQueryLog();
      await expect(batchRepository.saveServerChildProgrammeEnrollmentRows(rows)).resolves.toEqual({
        applied: 30,
        skipped: 0,
        failed: 0,
      });
      expect(batchDb.getTransactionCount()).toBe(1);
      for (const row of rows) {
        await perRowRepository.saveChildProgrammeEnrollment(row);
      }

      expect(await batchDb.getAllAsync('select * from child_programme_enrollments order by id'))
        .toEqual(await perRowDb.getAllAsync('select * from child_programme_enrollments order by id'));
    } finally {
      await batchDb.closeAsync();
      await perRowDb.closeAsync();
    }
  });

  test('saveServerChildClassMembershipRows uses one transaction and matches per-row persistence', async () => {
    const batchDb = await createDatabase();
    const perRowDb = await createDatabase();
    try {
      const batchRepository = createChildrenRepository({ database: batchDb });
      const perRowRepository = createChildrenRepository({ database: perRowDb });
      for (const child of childRows()) {
        await batchRepository.saveChildRecord(child);
        await perRowRepository.saveChildRecord(child);
      }
      const rows = classMembershipRows();

      batchDb.resetQueryLog();
      await expect(batchRepository.saveServerChildClassMembershipRows(rows)).resolves.toEqual({
        applied: 30,
        skipped: 0,
        failed: 0,
      });
      expect(batchDb.getTransactionCount()).toBe(1);
      for (const row of rows) {
        await perRowRepository.saveChildClassMembership(row);
      }

      expect(await batchDb.getAllAsync('select * from child_class_memberships order by id'))
        .toEqual(await perRowDb.getAllAsync('select * from child_class_memberships order by id'));
    } finally {
      await batchDb.closeAsync();
      await perRowDb.closeAsync();
    }
  });

  test('saveServerChildClassMembershipRows isolates a row whose academic year is missing', async () => {
    const db = await createDatabase();
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const repository = createChildrenRepository({ database: db });
      const children = childRows().slice(0, 3);
      for (const child of children) {
        await repository.saveChildRecord(child);
      }
      const rows = [
        { ...classMembershipRows()[0], id: 'ccm-valid-a' },
        {
          ...classMembershipRows()[1],
          id: 'ccm-missing-year',
          academic_year_id: 'year-not-pulled',
        },
        { ...classMembershipRows()[2], id: 'ccm-valid-b' },
      ];

      await expect(repository.saveServerChildClassMembershipRows(rows)).resolves.toEqual({
        applied: 2,
        skipped: 0,
        failed: 1,
      });
      expect(await db.getAllAsync(
        "select id from child_class_memberships where id like 'ccm-valid-%' order by id"
      )).toEqual([
        { id: 'ccm-valid-a' },
        { id: 'ccm-valid-b' },
      ]);
      expect(await db.getFirstAsync(
        "select id from child_class_memberships where id = 'ccm-missing-year'"
      )).toBeNull();
      expect(error).toHaveBeenCalledWith(expect.stringContaining('ccm-missing-year'));
    } finally {
      error.mockRestore();
      await db.closeAsync();
    }
  });

  test('saveServerChildRows skips a pending local child without touching its row or outbox payload', async () => {
    const db = await createDatabase();
    try {
      const repository = createChildrenRepository({ database: db });
      const rows = childRows();
      await repository.saveChildRecord(rows[0]);
      await repository.updateChild(rows[0].id, {
        first_name: 'Local edit',
        updated_at: FIXED_AT,
        synced: false,
      }, { actorUserId: 'user-1' });
      const outboxBefore = await db.getFirstAsync(
        "select payload from sync_outbox where table_name = 'children' and record_id = ?",
        rows[0].id
      );

      db.resetQueryLog();
      await expect(repository.saveServerChildRows(rows)).resolves.toEqual({
        applied: 29,
        skipped: 1,
        failed: 0,
      });
      expect(db.getTransactionCount()).toBe(1);
      expect(await db.getFirstAsync(
        'select first_name, sync_status from children where id = ?',
        rows[0].id
      )).toEqual({ first_name: 'Local edit', sync_status: 'pending' });
      expect(await db.getFirstAsync(
        "select payload from sync_outbox where table_name = 'children' and record_id = ?",
        rows[0].id
      )).toEqual(outboxBefore);
    } finally {
      await db.closeAsync();
    }
  });

  test('saveServerClassRows uses one transaction and matches per-row persistence', async () => {
    const batchDb = await createDatabase();
    const perRowDb = await createDatabase();
    try {
      const batchRepository = createClassesRepository({ database: batchDb });
      const perRowRepository = createClassesRepository({ database: perRowDb });
      const rows = classRows();

      batchDb.resetQueryLog();
      await expect(batchRepository.saveServerClassRows(rows)).resolves.toEqual({
        applied: 30,
        skipped: 0,
        failed: 0,
      });
      expect(batchDb.getTransactionCount()).toBe(1);
      for (const row of rows) {
        await perRowRepository.saveClass(row);
      }

      expect(await batchDb.getAllAsync("select * from classes where id <> 'class-1' order by id"))
        .toEqual(await perRowDb.getAllAsync("select * from classes where id <> 'class-1' order by id"));
    } finally {
      await batchDb.closeAsync();
      await perRowDb.closeAsync();
    }
  });

  test('saveServerClassRows isolates a row whose teacher is missing', async () => {
    const db = await createDatabase();
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const repository = createClassesRepository({ database: db });
      const rows = [
        { ...classRows()[0], id: 'class-valid-a' },
        { ...classRows()[1], id: 'class-missing-teacher', teacher_id: 'teacher-not-pulled' },
        { ...classRows()[2], id: 'class-valid-b' },
      ];

      await expect(repository.saveServerClassRows(rows)).resolves.toEqual({
        applied: 2,
        skipped: 0,
        failed: 1,
      });
      expect(await db.getAllAsync(
        "select id from classes where id like 'class-valid-%' order by id"
      )).toEqual([
        { id: 'class-valid-a' },
        { id: 'class-valid-b' },
      ]);
      expect(await db.getFirstAsync(
        "select id from classes where id = 'class-missing-teacher'"
      )).toBeNull();
      expect(error).toHaveBeenCalledWith(expect.stringContaining('class-missing-teacher'));
    } finally {
      error.mockRestore();
      await db.closeAsync();
    }
  });

  test('class assignment saveServerRows uses one transaction and matches per-row persistence', async () => {
    const batchDb = await createDatabase();
    const perRowDb = await createDatabase();
    try {
      const batchClasses = createClassesRepository({ database: batchDb });
      const perRowClasses = createClassesRepository({ database: perRowDb });
      await batchClasses.saveServerClassRows(classRows());
      for (const row of classRows()) {
        await perRowClasses.saveClass(row);
      }
      const batchRepository = createClassEaAssignmentsRepository({ database: batchDb });
      const perRowRepository = createClassEaAssignmentsRepository({ database: perRowDb });
      const rows = classEaAssignmentRows();

      batchDb.resetQueryLog();
      await expect(batchRepository.saveServerRows(rows)).resolves.toEqual({
        applied: 30,
        skipped: 0,
        failed: 0,
      });
      expect(batchDb.getTransactionCount()).toBe(1);
      for (const row of rows) {
        await perRowRepository.save(row);
      }

      expect(await batchDb.getAllAsync('select * from class_ea_assignments order by id'))
        .toEqual(await perRowDb.getAllAsync('select * from class_ea_assignments order by id'));
    } finally {
      await batchDb.closeAsync();
      await perRowDb.closeAsync();
    }
  });

  test('saveServerGroupRows uses one transaction and matches per-row persistence', async () => {
    const batchDb = await createDatabase();
    const perRowDb = await createDatabase();
    try {
      const batchRepository = createGroupsRepository({ database: batchDb });
      const perRowRepository = createGroupsRepository({ database: perRowDb });
      const rows = groupRows();

      batchDb.resetQueryLog();
      await expect(batchRepository.saveServerGroupRows(rows)).resolves.toEqual({
        applied: 30,
        skipped: 0,
        failed: 0,
      });
      expect(batchDb.getTransactionCount()).toBe(1);
      for (const row of rows) {
        await perRowRepository.saveGroup(row);
      }

      expect(await batchDb.getAllAsync('select * from groups order by id'))
        .toEqual(await perRowDb.getAllAsync('select * from groups order by id'));
    } finally {
      await batchDb.closeAsync();
      await perRowDb.closeAsync();
    }
  });

  test('saveServerChildrenGroupRows uses one transaction and matches per-row persistence', async () => {
    const batchDb = await createDatabase();
    const perRowDb = await createDatabase();
    try {
      const batchChildren = createChildrenRepository({ database: batchDb });
      const perRowChildren = createChildrenRepository({ database: perRowDb });
      const batchRepository = createGroupsRepository({ database: batchDb });
      const perRowRepository = createGroupsRepository({ database: perRowDb });
      for (const child of childRows()) {
        await batchChildren.saveChildRecord(child);
        await perRowChildren.saveChildRecord(child);
      }
      await batchRepository.saveServerGroupRows(groupRows());
      for (const group of groupRows()) {
        await perRowRepository.saveGroup(group);
      }
      const rows = groupMembershipRows();

      batchDb.resetQueryLog();
      await expect(batchRepository.saveServerChildrenGroupRows(rows)).resolves.toEqual({
        applied: 30,
        skipped: 0,
        failed: 0,
      });
      expect(batchDb.getTransactionCount()).toBe(1);
      for (const row of rows) {
        await perRowRepository.addChildToGroup(row);
      }

      expect(await batchDb.getAllAsync('select * from child_group_memberships order by id'))
        .toEqual(await perRowDb.getAllAsync('select * from child_group_memberships order by id'));
    } finally {
      await batchDb.closeAsync();
      await perRowDb.closeAsync();
    }
  });

  test('the fixed pull order persists a fresh FK graph that is visible through getMyChildren', async () => {
    const db = await createDatabase();
    try {
      await db.runAsync("delete from classes where id = 'class-1'");
      await db.execAsync('PRAGMA foreign_keys = ON');
      const childrenRepository = createChildrenRepository({ database: db });
      const classesRepository = createClassesRepository({ database: db });
      const groupsRepository = createGroupsRepository({ database: db });
      const child = {
        ...childRows()[0],
        id: 'child-pulled',
        class_id: 'class-pulled',
      };
      const classItem = {
        ...classRows()[0],
        id: 'class-pulled',
      };
      const staffAssignment = {
        ...staffChildRows()[0],
        id: 'cea-pulled',
        child_id: child.id,
      };
      const enrollment = {
        ...programmeEnrollmentRows()[0],
        id: 'cpe-pulled',
        child_id: child.id,
      };
      const classMembership = {
        ...classMembershipRows()[0],
        id: 'ccm-pulled',
        child_id: child.id,
        class_id: classItem.id,
      };
      const group = {
        ...groupRows()[0],
        id: 'group-pulled',
        class_id: classItem.id,
      };
      const groupMembership = {
        ...groupMembershipRows()[0],
        id: 'cgm-pulled',
        child_id: child.id,
        group_id: group.id,
      };

      await classesRepository.saveServerClassRows([classItem]);
      await childrenRepository.saveServerChildRows([child]);
      await childrenRepository.saveServerStaffChildRows([staffAssignment]);
      await childrenRepository.saveServerChildProgrammeEnrollmentRows([enrollment]);
      await childrenRepository.saveServerChildClassMembershipRows([classMembership]);
      await groupsRepository.saveServerGroupRows([group]);
      await groupsRepository.saveServerChildrenGroupRows([groupMembership]);

      await expect(childrenRepository.getMyChildren('user-1')).resolves.toEqual([
        expect.objectContaining({
          id: child.id,
          class_id: classItem.id,
          synced: true,
        }),
      ]);
      expect(await db.getAllAsync('PRAGMA foreign_key_check')).toEqual([]);
    } finally {
      await db.closeAsync();
    }
  });
});
