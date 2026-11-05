jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import {
  childEaAssignmentDomainId,
  childProgrammeEnrollmentDomainId,
} from '../src/db/repositories/domainRepositoryUtils';
import { createGroupsRepository } from '../src/db/repositories/groupsRepository';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';

const makeChild = (overrides = {}) => ({
  id: 'child-1',
  first_name: 'Amahle',
  last_name: 'Dlamini',
  class_id: 'class-1',
  created_by: 'user-1',
  synced: false,
  created_at: '2026-05-21T08:00:00.000Z',
  updated_at: '2026-05-21T08:00:00.000Z',
  ...overrides,
});

const FIXED_NOW = new Date('2026-05-21T08:00:00.000Z');

describe('childrenRepository', () => {
  test('getChildrenByIds batches participants including hidden history references and current levels', async () => {
    const db = await createMigratedDatabase(runMigrations);
    try {
      await seedCoreData(db);
      await db.runAsync(`insert into children (id, first_name, last_name, class_id, reading_level, history_reference, hidden_at)
        values ('c1', 'Amahle', 'Dlamini', 'class-1', '3 Letter Blends', 0, null),
          ('c2', 'Lulu', 'Zulu', null, null, 1, '2026-10-21')`);
      const repository = createChildrenRepository({ database: db });
      const read = jest.spyOn(db, 'getAllAsync');
      expect(await repository.getChildrenByIds([])).toEqual({});
      expect(read).not.toHaveBeenCalled();
      const ids = ['c1', 'c2', ...Array.from({ length: 399 }, (_, i) => `missing-${i}`), 'c1'];
      expect(await repository.getChildrenByIds(ids)).toEqual({
        c1: { id: 'c1', first_name: 'Amahle', last_name: 'Dlamini', reading_level: '3 Letter Blends',
          class_id: 'class-1', history_reference: 0, hidden_at: null },
        c2: { id: 'c2', first_name: 'Lulu', last_name: 'Zulu', reading_level: null,
          class_id: null, history_reference: 1, hidden_at: '2026-10-21' },
      });
      expect(read.mock.calls.filter(([sql]) => /from children where id in/.test(sql))).toHaveLength(3);
    } finally {
      jest.restoreAllMocks();
      await db.closeAsync();
    }
  });

  test('editing a full mapped synced child ignores caller sync bookkeeping and queues one update', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });
      await repository.saveChildRecord(makeChild({ synced: true }));
      const [current] = await repository.getChildren();
      expect(current).toEqual(expect.objectContaining({ sync_status: 'synced', synced: true }));
      expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);

      await repository.updateChild(current.id, {
        ...current,
        first_name: 'Updated child',
        last_sync_error: 'stale caller error',
      });

      const [updated] = await repository.getChildren();
      expect(updated).toEqual(expect.objectContaining({
        first_name: 'Updated child', sync_status: 'pending', synced: false, last_sync_error: null,
      }));
      const outbox = await db.getAllAsync('select table_name, record_id, operation, payload from sync_outbox');
      expect(outbox).toHaveLength(1);
      expect(outbox[0]).toEqual(expect.objectContaining({
        table_name: 'children', record_id: current.id, operation: 'update',
      }));
      expect(JSON.parse(outbox[0].payload)).toEqual(expect.objectContaining({
        first_name: 'Updated child', sync_status: 'pending', synced: false, last_sync_error: null,
      }));
    } finally {
      await db.closeAsync();
    }
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('saving a child creates child, EA assignment, programme enrollment, class membership, and outbox rows atomically', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });

      await repository.save(makeChild(), { actorUserId: 'user-1' });

      expect(await db.getFirstAsync('select id, first_name, sync_status from children where id = ?', 'child-1'))
        .toEqual({ id: 'child-1', first_name: 'Amahle', sync_status: 'pending' });
      expect(await db.getFirstAsync('select user_id, child_id from child_ea_assignments'))
        .toEqual({ user_id: 'user-1', child_id: 'child-1' });
      expect(await db.getFirstAsync('select child_id, programme_id from child_programme_enrollments'))
        .toEqual({ child_id: 'child-1', programme_id: 'programme-a' });
      expect(await db.getFirstAsync('select child_id, class_id, academic_year_id from child_class_memberships'))
        .toEqual({ child_id: 'child-1', class_id: 'class-1', academic_year_id: 'year-2026' });

      const outboxRows = await db.getAllAsync('select table_name, record_id, operation from sync_outbox order by table_name');
      expect(outboxRows).toEqual([
        { table_name: 'child_class_memberships', record_id: expect.any(String), operation: 'insert' },
        { table_name: 'child_ea_assignments', record_id: expect.any(String), operation: 'insert' },
        { table_name: 'child_programme_enrollments', record_id: expect.any(String), operation: 'insert' },
        { table_name: 'children', record_id: 'child-1', operation: 'insert' },
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('a new child self-assignment uses the deterministic child_ea id (#47)', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });

      await repository.save(makeChild(), { actorUserId: 'user-1' });

      const assignment = await db.getFirstAsync(`
        select id, user_id, child_id
        from child_ea_assignments
        where child_id = ?
      `, 'child-1');

      expect(assignment.id).toBe(childEaAssignmentDomainId({
        userId: assignment.user_id,
        childId: assignment.child_id,
      }));
    } finally {
      await db.closeAsync();
    }
  });

  test('a new child programme enrollment uses the deterministic child_programme_enrollment id (#47)', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });

      await repository.save(makeChild(), { actorUserId: 'user-1' });

      const enrollment = await db.getFirstAsync(`
        select id, child_id, programme_id
        from child_programme_enrollments
        where child_id = ?
      `, 'child-1');

      expect(enrollment.id).toBe(childProgrammeEnrollmentDomainId({
        childId: enrollment.child_id,
        programmeId: enrollment.programme_id,
      }));
    } finally {
      await db.closeAsync();
    }
  });

  test('saving a child canonicalizes display gender labels before local persistence', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });

      await repository.save(makeChild({ gender: 'Male' }), { actorUserId: 'user-1' });

      expect(await db.getFirstAsync('select gender from children where id = ?', 'child-1'))
        .toEqual({ gender: 'male' });
      const outboxRow = await db.getFirstAsync(`
        select payload
        from sync_outbox
        where table_name = 'children'
          and record_id = 'child-1'
          and operation = 'insert'
      `);
      expect(JSON.parse(outboxRow.payload)).toEqual(expect.objectContaining({
        gender: 'male',
      }));
    } finally {
      await db.closeAsync();
    }
  });

  test('saving a child throws before enqueueing when no owner can satisfy RLS', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });

      await expect(repository.save(
        makeChild({
          created_by: null,
          programme_id: 'programme-a',
        }),
        { actorUserId: null }
      )).rejects.toThrow(/children\.created_by is required/i);

      expect(await db.getFirstAsync('select count(*) as count from children')).toEqual({ count: 0 });
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('reassigning a child to a different EA after ended relationships preserves supported historical rows', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });

      await repository.save(makeChild(), { actorUserId: 'user-1' });

      const originalAssignment = await db.getFirstAsync('select id from child_ea_assignments where child_id = ?', 'child-1');
      const originalEnrollment = await db.getFirstAsync('select id from child_programme_enrollments where child_id = ?', 'child-1');
      const originalClassMembership = await db.getFirstAsync('select id from child_class_memberships where child_id = ?', 'child-1');

      await repository.deleteStaffChild('user-1', 'child-1');
      await db.runAsync(`
        update child_programme_enrollments
        set ended_at = '2026-05-22T00:00:00.000Z'
        where child_id = 'child-1'
      `);
      await db.runAsync(`
        update child_class_memberships
        set exited_at = '2026-05-22T00:00:00.000Z'
        where child_id = 'child-1'
      `);
      await db.runAsync(`
        insert into staff_programme_assignments (
          id,
          user_id,
          programme_id,
          school_id,
          assigned_at
        )
        values (
          'spa-user-2',
          'user-2',
          'programme-a',
          'school-1',
          '2026-05-22T00:00:01.000Z'
        )
      `);

      await repository.save(makeChild({ updated_at: '2026-05-23T00:00:00.000Z' }), { actorUserId: 'user-2' });

      const assignments = await db.getAllAsync('select id, unassigned_at from child_ea_assignments order by assigned_at, id');
      const enrollments = await db.getAllAsync('select id, ended_at from child_programme_enrollments order by enrolled_at, id');
      const classMemberships = await db.getAllAsync('select id, exited_at from child_class_memberships order by enrolled_at, id');

      expect(assignments).toHaveLength(2);
      expect(assignments).toEqual(expect.arrayContaining([
        { id: originalAssignment.id, unassigned_at: expect.any(String) },
        { id: expect.not.stringMatching(originalAssignment.id), unassigned_at: null },
      ]));
      expect(enrollments).toEqual([
        { id: originalEnrollment.id, ended_at: null },
      ]);
      expect(classMemberships).toHaveLength(2);
      expect(classMemberships).toEqual(expect.arrayContaining([
        { id: originalClassMembership.id, exited_at: '2026-05-22T00:00:00.000Z' },
        { id: expect.not.stringMatching(originalClassMembership.id), exited_at: null },
      ]));

      const insertOutboxRows = await db.getAllAsync(`
        select table_name, record_id, operation
        from sync_outbox
        where operation = 'insert'
          and table_name in (
            'child_ea_assignments',
            'child_programme_enrollments',
            'child_class_memberships'
          )
        order by table_name, record_id
      `);
      expect(insertOutboxRows).toEqual(expect.arrayContaining([
        { table_name: 'child_ea_assignments', record_id: originalAssignment.id, operation: 'insert' },
        { table_name: 'child_programme_enrollments', record_id: originalEnrollment.id, operation: 'insert' },
        { table_name: 'child_class_memberships', record_id: originalClassMembership.id, operation: 'insert' },
      ]));
      expect(insertOutboxRows).toHaveLength(5);
    } finally {
      await db.closeAsync();
    }
  });

  test('child save rollback leaves no domain or outbox rows', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });

      await expect(db.withExclusiveTransactionAsync(async (txn) => {
        await repository.save(makeChild(), { actorUserId: 'user-1', transaction: txn });
        throw new Error('forced rollback');
      })).rejects.toThrow('forced rollback');

      for (const tableName of [
        'children',
        'child_ea_assignments',
        'child_programme_enrollments',
        'child_class_memberships',
        'sync_outbox',
      ]) {
        expect(await db.getFirstAsync(`select count(*) as count from ${tableName}`)).toEqual({ count: 0 });
      }
    } finally {
      await db.closeAsync();
    }
  });

  test('getMyChildren is scoped to the user active programme', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });
      await repository.save(makeChild(), { actorUserId: 'user-1' });

      await db.runAsync(`
        update staff_programme_assignments
        set ended_at = '2026-05-22T00:00:00.000Z'
        where id = 'spa-user-1'
      `);
      await db.runAsync(`
        insert into staff_programme_assignments (
          id,
          user_id,
          programme_id,
          school_id,
          assigned_at
        )
        values (
          'spa-user-1-b',
          'user-1',
          'programme-b',
          'school-1',
          '2026-05-22T00:00:01.000Z'
        )
      `);

      expect(await repository.getMyChildren('user-1')).toEqual([]);
    } finally {
      await db.closeAsync();
    }
  });

  test('synced server-pulled child junctions make a handover child visible offline without outbox rows', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });

      await repository.saveChildRecord({
        id: 'handover-child',
        first_name: 'Handover',
        last_name: 'Child',
        class_id: 'class-1',
        created_by: 'admin-user',
        sync_status: 'synced',
      });
      await repository.saveStaffChild({
        id: 'server-cea-1',
        user_id: 'user-1',
        child_id: 'handover-child',
        assigned_at: '2026-05-22T08:00:00.000Z',
        sync_status: 'synced',
      });
      await repository.saveChildProgrammeEnrollment({
        id: 'server-cpe-1',
        child_id: 'handover-child',
        programme_id: 'programme-a',
        enrolled_at: '2026-05-22T08:00:00.000Z',
        sync_status: 'synced',
      });
      await repository.saveChildClassMembership({
        id: 'server-ccm-1',
        child_id: 'handover-child',
        class_id: 'class-1',
        academic_year_id: 'year-2026',
        enrolled_at: '2026-05-22T08:00:00.000Z',
        sync_status: 'synced',
      });

      expect(await repository.getMyChildren('user-1')).toEqual([
        expect.objectContaining({ id: 'handover-child' }),
      ]);
      expect(await db.getFirstAsync(`
        select count(*) as count
        from sync_outbox
        where record_id in ('handover-child', 'server-cea-1', 'server-cpe-1', 'server-ccm-1')
      `)).toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('getMyChildren excludes children whose active class is archived', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });
      await repository.save(makeChild(), { actorUserId: 'user-1' });

      expect(await repository.getMyChildren('user-1')).toHaveLength(1);

      await db.runAsync("update classes set archived_at = '2026-05-24T00:00:00.000Z' where id = 'class-1'");

      expect(await repository.getMyChildren('user-1')).toEqual([]);
    } finally {
      await db.closeAsync();
    }
  });

  // Delete child (plan O2 item 2; MA-BUG-20261104-012, -014). The phone states intent with the
  // existing children hard_delete; the server ends only this EA's grants and archives the child
  // only when nobody else holds it. Shared rows (programme enrollments, class memberships) and
  // other EAs' rows never end on the phone, and no per-relationship archive row is queued.
  describe('removeChild (Delete child)', () => {
    const REMOVED_AT = '2026-05-23T00:00:00.000Z';
    const outboxRows = db => db.getAllAsync(
      'select id, table_name, record_id, operation, status, payload from sync_outbox order by id'
    );
    const seedAssessment = db => db.runAsync(`
      insert into assessments (id, user_id, child_id, programme_id, assessment_type, assessment_date)
      values ('assessment-1', 'user-1', 'child-1', 'programme-a', 'letter_egra', '2026-05-21')
    `);

    test('with local history, archives the child locally and queues only the hard_delete; owed INSERTs stay as they are', async () => {
      const db = await createMigratedDatabase(runMigrations);
      try {
        await seedCoreData(db);
        const repository = createChildrenRepository({ database: db });
        const groups = createGroupsRepository({ database: db });
        await repository.save(makeChild(), { actorUserId: 'user-1' });
        await groups.saveGroup({ id: 'group-1', name: 'Group 1', programme_id: 'programme-a', class_id: 'class-1', created_by: 'user-1', synced: false });
        await groups.addChildToGroup({ id: 'membership-1', child_id: 'child-1', group_id: 'group-1', synced: false });
        await seedAssessment(db);
        const before = await outboxRows(db);

        expect(await repository.removeChild('child-1', { actorUserId: 'user-1', removedAt: REMOVED_AT })).toBe(true);

        expect(await db.getFirstAsync('select archived_at, archived_by_user_id, archive_reason from children where id = ?', 'child-1'))
          .toEqual({ archived_at: REMOVED_AT, archived_by_user_id: 'user-1', archive_reason: 'removed_by_ea' });
        // The relationship INSERTs upload open: they carry the authority the rest of the family and
        // the queued history need, and the server's actor-scoped removal ends them afterwards.
        expect(await outboxRows(db)).toEqual([
          ...before,
          {
            id: 'children:child-1:hard_delete', table_name: 'children', record_id: 'child-1',
            operation: 'hard_delete', status: 'pending', payload: JSON.stringify({ id: 'child-1' }),
          },
        ].sort((left, right) => left.id.localeCompare(right.id)));
        for (const [table, column] of [
          ['child_ea_assignments', 'unassigned_at'], ['child_programme_enrollments', 'ended_at'],
          ['child_class_memberships', 'exited_at'], ['child_group_memberships', 'removed_at'],
        ]) {
          expect(await db.getFirstAsync(`select ${column} as ended from ${table} where child_id = 'child-1'`))
            .toEqual({ ended: null });
        }
        expect(await repository.getMyChildren('user-1')).toEqual([]);
      } finally {
        await db.closeAsync();
      }
    });

    test('with local history, ends only this EA\'s own acknowledged assignment and its held-group memberships, on the phone only', async () => {
      const db = await createMigratedDatabase(runMigrations);
      try {
        await seedCoreData(db);
        const repository = createChildrenRepository({ database: db });
        await db.runAsync(`insert into children (id, first_name, last_name, class_id, created_by, sync_status)
          values ('child-1', 'Thandi', 'Mokoena', 'class-1', 'head-office', 'synced')`);
        await db.runAsync(`insert into child_ea_assignments (id, user_id, child_id, assigned_at, created_by, sync_status) values
          ('own-assignment', 'user-1', 'child-1', '2026-01-15', 'head-office', 'synced'),
          ('other-assignment', 'other-ea', 'child-1', '2026-01-15', 'head-office', 'synced')`);
        await db.runAsync(`insert into child_programme_enrollments (id, child_id, programme_id, enrolled_at, created_by, sync_status)
          values ('enrollment-1', 'child-1', 'programme-a', '2026-01-15', 'head-office', 'synced')`);
        await db.runAsync(`insert into child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at, created_by, sync_status)
          values ('class-membership-1', 'child-1', 'class-1', 'year-2026', '2026-01-15', 'head-office', 'synced')`);
        await db.runAsync(`insert into groups (id, name, programme_id, class_id, created_by, sync_status) values
          ('own-group', 'Group 1', 'programme-a', 'class-1', 'user-1', 'synced'),
          ('other-group', 'Group 2', 'programme-a', 'class-1', 'other-ea', 'synced')`);
        await db.runAsync(`insert into group_ea_assignments (id, group_id, ea_user_id, programme_id, assigned_at, created_by, sync_status) values
          ('own-group-grant', 'own-group', 'user-1', 'programme-a', '2026-01-15', 'user-1', 'synced'),
          ('other-group-grant', 'other-group', 'other-ea', 'programme-a', '2026-01-15', 'other-ea', 'synced')`);
        await db.runAsync(`insert into child_group_memberships (id, child_id, group_id, joined_at, created_by, sync_status) values
          ('own-group-membership', 'child-1', 'own-group', '2026-01-15', 'user-1', 'synced'),
          ('other-group-membership', 'child-1', 'other-group', '2026-01-15', 'other-ea', 'synced')`);
        await seedAssessment(db);

        expect(await repository.removeChild('child-1', { actorUserId: 'user-1', removedAt: REMOVED_AT })).toBe(true);

        const ends = await db.getAllAsync(`
          select id, unassigned_at as ended, sync_status from child_ea_assignments
          union all select id, ended_at, sync_status from child_programme_enrollments
          union all select id, exited_at, sync_status from child_class_memberships
          union all select id, removed_at, sync_status from child_group_memberships
          order by id
        `);
        expect(ends).toEqual([
          { id: 'class-membership-1', ended: null, sync_status: 'synced' },
          { id: 'enrollment-1', ended: null, sync_status: 'synced' },
          { id: 'other-assignment', ended: null, sync_status: 'synced' },
          { id: 'other-group-membership', ended: null, sync_status: 'synced' },
          { id: 'own-assignment', ended: REMOVED_AT, sync_status: 'synced' },
          { id: 'own-group-membership', ended: REMOVED_AT, sync_status: 'synced' },
        ]);
        expect(await db.getAllAsync('select table_name, record_id, operation, status from sync_outbox')).toEqual([
          { table_name: 'children', record_id: 'child-1', operation: 'hard_delete', status: 'pending' },
        ]);
      } finally {
        await db.closeAsync();
      }
    });

    test('without local history, deletes the child locally and still asks the server to remove it', async () => {
      const db = await createMigratedDatabase(runMigrations);
      try {
        await seedCoreData(db);
        const repository = createChildrenRepository({ database: db });
        await repository.saveChildRecord(makeChild({ synced: true }));

        expect(await repository.removeChild('child-1', { actorUserId: 'user-1' })).toBe(true);

        expect(await db.getFirstAsync("select id from children where id = 'child-1'")).toBeNull();
        expect(await db.getAllAsync('select table_name, record_id, operation, status from sync_outbox')).toEqual([
          { table_name: 'children', record_id: 'child-1', operation: 'hard_delete', status: 'pending' },
        ]);
      } finally {
        await db.closeAsync();
      }
    });

    test('a child that never reached the server and has no history is purged with no request', async () => {
      const db = await createMigratedDatabase(runMigrations);
      try {
        await seedCoreData(db);
        const repository = createChildrenRepository({ database: db });
        await repository.save(makeChild(), { actorUserId: 'user-1' });

        expect(await repository.removeChild('child-1', { actorUserId: 'user-1' })).toBe(true);

        expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
        expect(await db.getAllAsync('select id from children')).toEqual([]);
      } finally {
        await db.closeAsync();
      }
    });
  });

  test.each(['pending', 'failed', 'terminal'])('deleting a server child after a %s edit supersedes the edit with hard_delete', async (status) => {
    const db = await createMigratedDatabase(runMigrations);
    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });
      await repository.saveChildRecord(makeChild({ synced: true }));
      await repository.updateChild('child-1', { first_name: 'Edited' });
      await db.runAsync('update children set sync_status = ? where id = ?', status, 'child-1');
      await db.runAsync('update sync_outbox set status = ?', status);

      expect(await repository.deleteIfNoHistory('child-1')).toBe(true);

      expect(await repository.getChildren()).toEqual([]);
      const rows = await db.getAllAsync('select operation, status, owner_user_id, payload from sync_outbox');
      expect(rows).toEqual([{
        operation: 'hard_delete', status: 'pending', owner_user_id: 'user-1',
        payload: JSON.stringify({ id: 'child-1' }),
      }]);
    } finally {
      await db.closeAsync();
    }
  });

  test('deleting a local child with a never-dispatched insert removes its entire queued family', async () => {
    const db = await createMigratedDatabase(runMigrations);
    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });
      await repository.save(makeChild(), { actorUserId: 'user-1' });
      await repository.updateChild('child-1', { first_name: 'Edited' });

      expect(await repository.deleteIfNoHistory('child-1')).toBe(true);

      expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
      for (const table of ['children', 'child_ea_assignments', 'child_programme_enrollments', 'child_class_memberships']) {
        expect(await db.getAllAsync(`select * from ${table}`)).toEqual([]);
      }
    } finally {
      await db.closeAsync();
    }
  });

  test('an in-flight child insert is retained and followed by a remote hard_delete', async () => {
    const db = await createMigratedDatabase(runMigrations);
    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });
      await repository.save(makeChild(), { actorUserId: 'user-1' });
      await repository.updateChild('child-1', { first_name: 'Edited' });
      await db.runAsync("update sync_outbox set status = 'in_flight' where table_name = 'children' and operation = 'insert'");

      expect(await repository.deleteIfNoHistory('child-1')).toBe(true);

      expect(await repository.getChildren()).toEqual([]);
      expect(await db.getAllAsync('select table_name, operation, status from sync_outbox order by operation')).toEqual([
        { table_name: 'children', operation: 'hard_delete', status: 'pending' },
        { table_name: 'children', operation: 'insert', status: 'in_flight' },
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test.each([false, true])('child deletion and outbox replacement roll back together (remote=%s)', async (remote) => {
    const db = await createMigratedDatabase(runMigrations);
    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });
      await repository.save(makeChild(), { actorUserId: 'user-1' });
      if (remote) await db.runAsync('delete from sync_outbox');
      await repository.updateChild('child-1', { first_name: 'Edited' });
      const tables = ['children', 'child_ea_assignments', 'child_programme_enrollments', 'child_class_memberships', 'sync_outbox'];
      const before = await Promise.all(tables.map(table => db.getAllAsync(`select * from ${table} order by id`)));

      await expect(db.withExclusiveTransactionAsync(async (transaction) => {
        expect(await repository.deleteIfNoHistory('child-1', { transaction })).toBe(true);
        throw new Error('rollback deletion');
      })).rejects.toThrow('rollback deletion');

      expect(await Promise.all(tables.map(table => db.getAllAsync(`select * from ${table} order by id`)))).toEqual(before);
    } finally {
      await db.closeAsync();
    }
  });

  test('deleteIfNoHistory enqueues a hard delete for synced children', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });
      await repository.save(makeChild(), { actorUserId: 'user-1' });
      await db.runAsync("update children set sync_status = 'synced' where id = 'child-1'");
      await db.runAsync('delete from sync_outbox');

      expect(await repository.deleteIfNoHistory('child-1')).toBe(true);

      expect(await db.getFirstAsync('select count(*) as count from children')).toEqual({ count: 0 });
      expect(await db.getFirstAsync(`
        select table_name, record_id, operation, owner_user_id
        from sync_outbox
        where table_name = 'children'
          and record_id = 'child-1'
      `)).toEqual({
        table_name: 'children',
        record_id: 'child-1',
        operation: 'hard_delete',
        owner_user_id: 'user-1',
      });
    } finally {
      await db.closeAsync();
    }
  });

  test('saveChildRecord does not enqueue already-synced server rows', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });

      await repository.saveChildRecord(makeChild({ sync_status: 'synced', synced: true }));

      expect(await db.getFirstAsync('select sync_status from children where id = ?', 'child-1'))
        .toEqual({ sync_status: 'synced' });
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox'))
        .toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('saving a child requires an active programme assignment and academic year', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });

      await db.runAsync("update staff_programme_assignments set ended_at = '2026-05-21T00:00:00.000Z'");
      await expect(repository.save(makeChild(), { actorUserId: 'user-1' }))
        .rejects.toThrow(/No active programme assignment/i);

      await db.runAsync("update staff_programme_assignments set ended_at = null where id = 'spa-user-1'");
      await db.runAsync('update academic_years set is_active = 0');
      await expect(repository.save(makeChild(), { actorUserId: 'user-1' }))
        .rejects.toThrow(/active academic year/i);
    } finally {
      await db.closeAsync();
    }
  });

  test('deleteIfNoHistory deletes no-history children and refuses children with history', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createChildrenRepository({ database: db });
      await repository.save(makeChild(), { actorUserId: 'user-1' });

      expect(await repository.deleteIfNoHistory('child-1')).toBe(true);
      expect(await db.getFirstAsync('select count(*) as count from children')).toEqual({ count: 0 });

      await repository.save(makeChild(), { actorUserId: 'user-1' });
      await db.runAsync(`
        insert into assessments (
          id,
          user_id,
          child_id,
          programme_id,
          assessment_type,
          assessment_date
        )
        values (
          'assessment-1',
          'user-1',
          'child-1',
          'programme-a',
          'letter_egra',
          '2026-05-21'
        )
      `);

      expect(await repository.deleteIfNoHistory('child-1')).toBe(false);
      expect(await db.getFirstAsync('select count(*) as count from children')).toEqual({ count: 1 });
    } finally {
      await db.closeAsync();
    }
  });
});

test('a child with a skill tick is not deleted as history-free', async () => {
  const db = await createMigratedDatabase(runMigrations);
  try {
    await seedCoreData(db);
    const repository = createChildrenRepository({ database: db });
    await repository.saveChildRecord(makeChild({ synced: true }));
    await db.runAsync(`insert into skill_mastery
      (id, child_id, step_key, confirmed, changed_at, correction_id, changed_by)
      values ('tick-1', 'child-1', 'add.5', 1, '2026-10-20T08:00:00.000Z', 'correction-1', 'user-1')`);
    expect(await repository.deleteIfNoHistory('child-1')).toBe(false);
    expect(await db.getFirstAsync("select id from children where id = 'child-1'" )).toEqual({ id: 'child-1' });
    expect(await db.getAllAsync('select id from skill_mastery')).toEqual([{ id: 'tick-1' }]);
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
  } finally { await db.closeAsync(); }
});
