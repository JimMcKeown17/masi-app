jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createClassesRepository } from '../src/db/repositories/classesRepository';
import { createClassEaAssignmentsRepository } from '../src/db/repositories/classEaAssignmentsRepository';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { classEaAssignmentDomainId } from '../src/db/repositories/domainRepositoryUtils';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';

const FIXED_NOW = new Date('2026-05-21T08:00:00.000Z');

describe('class letter order editions', () => {
  let db;
  let repository;
  beforeEach(async () => {
    db = await createMigratedDatabase(runMigrations);
    await seedCoreData(db);
    repository = createClassesRepository({ database: db });
  });
  afterEach(async () => { jest.restoreAllMocks(); await db.closeAsync(); });

  const serverClass = (overrides = {}) => ({
    id: 'class-1', school_id: 'school-1', name: 'Server class', grade: '1',
    academic_year_id: 'year-2026', created_by: 'user-1', sync_status: 'synced',
    letter_order_edition: '2099-01-01', ...overrides,
  });

  test.each(['synced', 'terminal'])('a %s server row stores its edition', async sync_status => {
    await repository.saveClass(serverClass({ sync_status }));
    expect(await repository.getClassById('class-1')).toMatchObject({ letter_order_edition: '2099-01-01' });
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
  });

  test('a server edition changes only the edition while a local rename is pending', async () => {
    await repository.updateClass('class-1', { name: 'Local rename' });
    const before = await repository.getClassById('class-1');
    const outbox = await db.getAllAsync('select * from sync_outbox');

    expect(await repository.saveClass(serverClass())).toBe(false);

    expect(await repository.getClassById('class-1')).toEqual({
      ...before, letter_order_edition: '2099-01-01',
    });
    expect(await repository.getClassById('class-1')).toMatchObject({ name: 'Local rename', sync_status: 'pending' });
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual(outbox);
  });

  test.each([null, undefined])('a server edition of %p preserves the stored edition', async edition => {
    await repository.saveClass(serverClass());
    const incoming = serverClass({ name: 'Pulled name' });
    if (edition === undefined) delete incoming.letter_order_edition;
    else incoming.letter_order_edition = edition;
    await repository.saveClass(incoming);
    expect(await repository.getClassById('class-1')).toMatchObject({
      name: 'Pulled name', letter_order_edition: '2099-01-01',
    });
  });

  test('a new local class ignores a supplied edition and takes the default', async () => {
    await repository.saveClass(serverClass({ id: 'local-class', sync_status: 'pending', letter_order_edition: 'bogus' }));
    expect(await repository.getClassById('local-class')).toMatchObject({ letter_order_edition: '2026-10-23' });
  });

  test('a local re-save keeps the stored server edition', async () => {
    await repository.saveClass(serverClass());
    await repository.saveClass(serverClass({ sync_status: 'pending', letter_order_edition: 'bogus' }));
    expect(await repository.getClassById('class-1')).toMatchObject({ letter_order_edition: '2099-01-01' });
  });

  test('a local update ignores a supplied edition while applying the name', async () => {
    await repository.updateClass('class-1', { name: 'X', letter_order_edition: 'bogus' });
    expect(await repository.getClassById('class-1')).toMatchObject({ name: 'X', letter_order_edition: '2026-10-23' });
  });

  test('a language edit keeps the edition', async () => {
    await repository.updateClass('class-1', { home_language: 'English' });
    expect(await repository.getClassById('class-1')).toMatchObject({ home_language: 'English', letter_order_edition: '2026-10-23' });
  });

  test('reads several children in one statement and omits children without an active membership', async () => {
    for (const id of ['child-1', 'child-2', 'child-none']) {
      await db.runAsync("insert into children (id, first_name, last_name, class_id) values (?, 'Test', 'Child', 'class-1')", id);
    }
    await repository.saveClass(serverClass({ id: 'class-2', home_language: 'isiXhosa' }));
    for (const id of ['child-1', 'child-2']) {
      await db.runAsync(`insert into child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at)
        values (?, ?, 'class-2', 'year-2026', '2026-01-15')`, id, id);
    }
    const query = jest.spyOn(db, 'getAllAsync');
    const singleQuery = jest.spyOn(db, 'getFirstAsync');
    const result = await repository.getActiveClassesForChildren(['child-1', 'child-2', 'child-none', 'missing']);
    expect(query).toHaveBeenCalledTimes(1);
    // Injected databases also check PRAGMA user_version in resolveDatabase.
    expect(singleQuery.mock.calls.filter(([sql]) => !/pragma/i.test(sql))).toEqual([]);
    expect([...result.keys()]).toEqual(['child-1', 'child-2']);
    expect(result.get('child-1')).toMatchObject({ id: 'class-2', home_language: 'isiXhosa', synced: true });
    for (const id of ['child-1', 'child-2']) {
      expect(result.get(id)).toEqual(await repository.getActiveClassForChild(id));
      expect(result.get(id)).not.toHaveProperty('child_id');
    }
  });

  test('an empty batch returns an empty Map without a query', async () => {
    const query = jest.spyOn(db, 'getAllAsync');
    const singleQuery = jest.spyOn(db, 'getFirstAsync');
    expect(await repository.getActiveClassesForChildren([])).toEqual(new Map());
    expect(query).not.toHaveBeenCalled();
    expect(singleQuery).not.toHaveBeenCalled();
  });

  describe.each(['single', 'batch'])('the active class for a child (%s)', readMode => {
    const readClass = async childId => readMode === 'single'
      ? repository.getActiveClassForChild(childId)
      : (await repository.getActiveClassesForChildren([childId])).get(childId) ?? null;
    beforeEach(async () => {
      await db.runAsync("insert into children (id, first_name, last_name, class_id) values ('child-1', 'Test', 'Child', 'class-1')");
      for (const year of [2023, 2024, 2025]) {
        await db.runAsync(`insert into academic_years (id, label, starts_on, ends_on, is_active)
          values (?, ?, ?, ?, 0)`, `year-${year}`, String(year), `${year}-01-01`, `${year}-12-31`);
      }
      for (const id of ['class-2', 'class-3', 'class-4']) {
        await repository.saveClass(serverClass({ id, home_language: 'English' }));
      }
    });

    const membership = async (id, classId, year, enrolledAt, exitedAt = null) => db.runAsync(`
      insert into child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at, exited_at)
      values (?, 'child-1', ?, ?, ?, ?)
    `, id, classId, year, enrolledAt, exitedAt);

    test('follows the active membership instead of children.class_id and ignores exited memberships', async () => {
      await membership('active', 'class-2', 'year-2026', '2026-02-01');
      await membership('exited', 'class-3', 'year-2026', '2026-03-01', '2026-04-01');
      expect(await readClass('child-1')).toMatchObject({
        id: 'class-2', home_language: 'English', letter_order_edition: '2099-01-01',
      });
    });

    test('prefers the active academic year over a newer enrollment in another year', async () => {
      await membership('active-year', 'class-2', 'year-2026', '2026-01-01');
      await membership('other-year', 'class-3', 'year-2025', '2026-05-01');
      expect(await readClass('child-1')).toMatchObject({ id: 'class-2' });
    });

    test('ranks other years by newest enrollment then ascending membership id', async () => {
      await membership('old', 'class-4', 'year-2023', '2025-01-01');
      await membership('b', 'class-3', 'year-2024', '2025-05-01');
      await membership('a', 'class-2', 'year-2025', '2025-05-01');
      expect(await readClass('child-1')).toMatchObject({ id: 'class-2' });
    });

    test('an archived membership class is ignored', async () => {
      await membership('archived', 'class-2', 'year-2026', '2026-01-01');
      await membership('available', 'class-3', 'year-2025', '2025-01-01');
      await db.runAsync("update classes set archived_at = '2026-10-26' where id = 'class-2'");
      expect(await readClass('child-1')).toMatchObject({ id: 'class-3' });
    });

    test('returns null without an active membership even when children.class_id is set', async () => {
      expect(await readClass('child-1')).toBeNull();
      await membership('exited', 'class-2', 'year-2026', '2026-01-01', '2026-02-01');
      expect(await readClass('child-1')).toBeNull();
      expect(await readClass('missing-child')).toBeNull();
    });
  });
});

describe('classesRepository', () => {
  test('getClassById returns an archived class that getClasses leaves out', async () => {
    const db = await createMigratedDatabase(runMigrations);
    try {
      await seedCoreData(db);
      const repository = createClassesRepository({ database: db });
      const [seeded] = await repository.getClasses();
      await db.runAsync("update classes set archived_at = '2026-10-21T08:00:00Z' where id = ?", seeded.id);
      expect(await repository.getClasses()).toEqual([]);
      expect(await repository.getClassById(seeded.id)).toEqual(expect.objectContaining({
        id: seeded.id, grade: seeded.grade, archived_at: '2026-10-21T08:00:00Z',
      }));
      expect(await repository.getClassById('no-such-class')).toBeNull();
      expect(await repository.getClassById(null)).toBeNull();
    } finally {
      await db.closeAsync();
    }
  });

  test('editing a full mapped synced class ignores caller sync bookkeeping and queues one update', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createClassesRepository({ database: db });
      const [seeded] = await repository.getClasses();
      await repository.saveClass({ ...seeded, synced: true });
      const [current] = await repository.getClasses();
      expect(current).toEqual(expect.objectContaining({ sync_status: 'synced', synced: true }));
      expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);

      await repository.updateClass(current.id, {
        ...current,
        name: 'Updated class',
        last_sync_error: 'stale caller error',
      });

      const [updated] = await repository.getClasses();
      expect(updated).toEqual(expect.objectContaining({
        name: 'Updated class', sync_status: 'pending', synced: false, last_sync_error: null,
      }));
      const outbox = await db.getAllAsync('select table_name, record_id, operation, payload from sync_outbox');
      expect(outbox).toHaveLength(1);
      expect(outbox[0]).toEqual(expect.objectContaining({
        table_name: 'classes', record_id: current.id, operation: 'update',
      }));
      expect(JSON.parse(outbox[0].payload)).toEqual(expect.objectContaining({
        name: 'Updated class', sync_status: 'pending', synced: false, last_sync_error: null,
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

  test('saves and updates classes with sync metadata', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createClassesRepository({ database: db });

      await repository.saveClass({
        id: 'class-2',
        school_id: 'school-1',
        name: 'Grade 2B',
        grade: '2',
        teacher: 'Ms Zulu',
        academic_year_id: 'year-2026',
        created_by: 'user-1',
        synced: false,
      });
      await repository.updateClass('class-2', { teacher: 'Mr Mokoena' });

      expect(await repository.getClasses()).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'class-2',
          teacher: 'Mr Mokoena',
          synced: false,
        }),
      ]));
    } finally {
      await db.closeAsync();
    }
  });

  test('mobile-created classes create an active EA assignment in the same transaction', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createClassesRepository({ database: db });

      await repository.saveClass({
        id: 'class-created-on-device',
        school_id: 'school-1',
        name: 'Plan5A',
        grade: 'Grade 1',
        teacher: 'Teacher Plan5',
        academic_year_id: 'year-2026',
        created_by: 'user-1',
        synced: false,
      });

      expect(await repository.getClasses({ userId: 'user-1' })).toEqual([
        expect.objectContaining({
          id: 'class-created-on-device',
        }),
      ]);
      expect(await db.getFirstAsync(`
        select id, class_id, ea_user_id, programme_id, unassigned_at
        from class_ea_assignments
        where class_id = ?
      `, 'class-created-on-device')).toEqual({
        id: classEaAssignmentDomainId({
          classId: 'class-created-on-device',
          eaUserId: 'user-1',
          programmeId: 'programme-a',
        }),
        class_id: 'class-created-on-device',
        ea_user_id: 'user-1',
        programme_id: 'programme-a',
        unassigned_at: null,
      });
      expect(await db.getFirstAsync(`
        select count(*) as count
        from sync_outbox
        where table_name in ('classes', 'class_ea_assignments')
          and record_id in (
            'class-created-on-device',
            (select id from class_ea_assignments where class_id = 'class-created-on-device')
          )
      `)).toEqual({ count: 2 });
    } finally {
      await db.closeAsync();
    }
  });

  test('synced server-pulled class assignments make admin classes visible offline without outbox rows', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const classesRepository = createClassesRepository({ database: db });
      const assignmentsRepository = createClassEaAssignmentsRepository({ database: db });

      await classesRepository.saveClass({
        id: 'admin-class',
        school_id: 'school-1',
        name: 'Admin Assigned',
        grade: '1',
        academic_year_id: 'year-2026',
        created_by: 'admin-user',
        sync_status: 'synced',
      });
      await assignmentsRepository.save({
        id: 'server-class-assignment',
        class_id: 'admin-class',
        ea_user_id: 'user-1',
        programme_id: 'programme-a',
        assigned_at: '2026-05-22T08:00:00.000Z',
        created_by: 'admin-user',
        sync_status: 'synced',
      });

      expect(await classesRepository.getClasses({ userId: 'user-1' })).toEqual([
        expect.objectContaining({ id: 'admin-class' }),
      ]);
      expect(await db.getFirstAsync(`
        select count(*) as count
        from sync_outbox
        where record_id in ('admin-class', 'server-class-assignment')
      `)).toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  // Delete class (plan O2 item 3; ADR-0014 D4; MA-BUG-20261104-013). An EA closes a class for
  // everyone only when they created it and nobody else holds it; otherwise Delete class means leave.
  // Either way the class's children keep their class: no membership exit, no class_id change.
  describe('Delete class', () => {
    const ARCHIVED_AT = '2026-05-24T00:00:00.000Z';
    const seedClassWithDeliveryChild = async (db) => {
      await db.runAsync(`insert into class_ea_assignments (id, class_id, ea_user_id, programme_id, assigned_at, created_by, sync_status)
        values ('own-class-grant', 'class-1', 'user-1', 'programme-a', '2026-01-15T00:00:00.000Z', 'office', 'synced')`);
      await db.runAsync(`insert into children (id, first_name, last_name, class_id, created_by, sync_status)
        values ('child-1', 'Amahle', 'Dlamini', 'class-1', 'office', 'synced')`);
      await db.runAsync(`insert into child_ea_assignments (id, user_id, child_id, assigned_at, created_by, sync_status)
        values ('child-grant', 'user-1', 'child-1', '2026-01-15T00:00:00.000Z', 'office', 'synced')`);
      await db.runAsync(`insert into child_programme_enrollments (id, child_id, programme_id, enrolled_at, created_by, sync_status)
        values ('enrollment-1', 'child-1', 'programme-a', '2026-01-15T00:00:00.000Z', 'office', 'synced')`);
      await db.runAsync(`insert into child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at, created_by, sync_status)
        values ('membership-1', 'child-1', 'class-1', 'year-2026', '2026-01-15T00:00:00.000Z', 'office', 'synced')`);
    };
    const childState = db => db.getAllAsync(`
      select c.class_id, m.exited_at, c.sync_status as child_sync, m.sync_status as membership_sync
      from children c join child_class_memberships m on m.child_id = c.id where c.id = 'child-1'
    `);
    const queued = db => db.getAllAsync('select table_name, record_id, operation from sync_outbox order by table_name, record_id');

    test.each([
      ['another EA created it', async (db) => { await db.runAsync("update classes set created_by = 'office' where id = 'class-1'"); }],
      ['another EA also holds it on this phone', async (db) => {
        await db.runAsync(`insert into class_ea_assignments (id, class_id, ea_user_id, programme_id, assigned_at, created_by, sync_status)
          values ('other-class-grant', 'class-1', 'other-ea', 'programme-a', '2026-01-15T00:00:00.000Z', 'office', 'synced')`);
      }],
    ])('when %s, Delete class leaves: only this EA\'s class assignment ends', async (_label, share) => {
      const db = await createMigratedDatabase(runMigrations);
      try {
        await seedCoreData(db);
        await seedClassWithDeliveryChild(db);
        await share(db);
        const repository = createClassesRepository({ database: db });
        expect(await repository.isLeaveOnly('class-1', { userId: 'user-1' })).toBe(true);

        await repository.archiveClass('class-1', { actorUserId: 'user-1', archivedAt: ARCHIVED_AT });

        expect(await db.getFirstAsync("select archived_at from classes where id = 'class-1'")).toEqual({ archived_at: null });
        expect(await db.getAllAsync('select id, unassigned_at from class_ea_assignments order by id')).toEqual([
          ...(await db.getFirstAsync("select 1 as present from class_ea_assignments where id = 'other-class-grant'")
            ? [{ id: 'other-class-grant', unassigned_at: null }] : []),
          { id: 'own-class-grant', unassigned_at: ARCHIVED_AT },
        ]);
        expect(await childState(db)).toEqual([{ class_id: 'class-1', exited_at: null, child_sync: 'synced', membership_sync: 'synced' }]);
        expect(await queued(db)).toEqual([{ table_name: 'class_ea_assignments', record_id: 'own-class-grant', operation: 'archive' }]);
        // The EA keeps teaching their own children, who stay in their class.
        expect((await createChildrenRepository({ database: db }).getMyChildren('user-1')).map(child => child.id)).toEqual(['child-1']);
      } finally {
        await db.closeAsync();
      }
    });

    test('the creator and only holder asks the server to close the class, and its children keep their class', async () => {
      const db = await createMigratedDatabase(runMigrations);
      try {
        await seedCoreData(db);
        await seedClassWithDeliveryChild(db);
        const repository = createClassesRepository({ database: db });
        expect(await repository.isLeaveOnly('class-1', { userId: 'user-1' })).toBe(false);

        await repository.archiveClass('class-1', { actorUserId: 'user-1', archivedAt: ARCHIVED_AT });

        expect(await db.getFirstAsync("select archived_at from classes where id = 'class-1'")).toEqual({ archived_at: ARCHIVED_AT });
        expect(await db.getFirstAsync("select unassigned_at from class_ea_assignments where id = 'own-class-grant'"))
          .toEqual({ unassigned_at: ARCHIVED_AT });
        expect(await childState(db)).toEqual([{ class_id: 'class-1', exited_at: null, child_sync: 'synced', membership_sync: 'synced' }]);
        expect(await queued(db)).toEqual([
          { table_name: 'class_ea_assignments', record_id: 'own-class-grant', operation: 'archive' },
          { table_name: 'classes', record_id: 'class-1', operation: 'archive' },
        ]);
      } finally {
        await db.closeAsync();
      }
    });
  });

  test('deleteClass archives synced classes with dependents instead of creating a sync orphan', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const classesRepository = createClassesRepository({ database: db });
      const assignmentsRepository = createClassEaAssignmentsRepository({ database: db });

      await assignmentsRepository.save({
        id: 'class-assignment-1',
        class_id: 'class-1',
        ea_user_id: 'user-1',
        programme_id: 'programme-a',
        assigned_at: '2026-05-21T08:00:00.000Z',
        created_by: 'user-1',
        synced: false,
      });
      await db.runAsync("update classes set sync_status = 'synced' where id = 'class-1'");
      await db.runAsync('delete from sync_outbox');

      await classesRepository.deleteClass('class-1', {
        actorUserId: 'user-1',
        archivedAt: '2026-05-26T00:00:00.000Z',
      });

      expect(await db.getFirstAsync('select id, archived_at from classes where id = ?', 'class-1'))
        .toEqual({ id: 'class-1', archived_at: '2026-05-26T00:00:00.000Z' });
      expect(await db.getFirstAsync('select unassigned_at from class_ea_assignments where id = ?', 'class-assignment-1'))
        .toEqual({ unassigned_at: '2026-05-26T00:00:00.000Z' });
      expect(await db.getFirstAsync(`
        select table_name, record_id, operation
        from sync_outbox
        where table_name = 'classes'
          and record_id = 'class-1'
      `)).toEqual({
        table_name: 'classes',
        record_id: 'class-1',
        operation: 'archive',
      });
    } finally {
      await db.closeAsync();
    }
  });

  test('saveClass on a local write throws when no owner field is set (RLS contract guard)', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createClassesRepository({ database: db });

      await expect(repository.saveClass({
        id: 'class-no-owner',
        school_id: 'school-1',
        name: 'Orphan',
        grade: '1',
        academic_year_id: 'year-2026',
        synced: false,
      })).rejects.toThrow(/classes\.created_by is required/i);

      expect(await db.getFirstAsync('select count(*) as count from classes where id = ?', 'class-no-owner'))
        .toEqual({ count: 0 });
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('saveClass defaults created_by from staff_id when only staff_id is provided', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const repository = createClassesRepository({ database: db });

      await repository.saveClass({
        id: 'class-via-staff-id',
        school_id: 'school-1',
        name: 'StaffIdOnly',
        grade: '1',
        academic_year_id: 'year-2026',
        staff_id: 'user-1',
        programme_id: 'programme-a',
        synced: false,
      });

      expect(await db.getFirstAsync('select id, created_by from classes where id = ?', 'class-via-staff-id'))
        .toEqual({ id: 'class-via-staff-id', created_by: 'user-1' });
      expect(await db.getFirstAsync(`
        select count(*) as count
        from class_ea_assignments
        where class_id = ?
          and ea_user_id = ?
          and unassigned_at is null
      `, 'class-via-staff-id', 'user-1')).toEqual({ count: 1 });
    } finally {
      await db.closeAsync();
    }
  });

  test('saveClass on a local write throws when no programme can be resolved (RLS contract guard)', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db, { includeStaffProgrammeAssignment: false });
      const repository = createClassesRepository({ database: db });

      await expect(repository.saveClass({
        id: 'class-no-programme',
        school_id: 'school-1',
        name: 'NoProgramme',
        grade: '1',
        academic_year_id: 'year-2026',
        created_by: 'user-1',
        synced: false,
      })).rejects.toThrow(/classes.*programme.*required|active programme assignment/i);

      expect(await db.getFirstAsync('select count(*) as count from classes where id = ?', 'class-no-programme'))
        .toEqual({ count: 0 });
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
    } finally {
      await db.closeAsync();
    }
  });

  test('user-scoped class reads return active assignments in the active programme', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db);
      const classesRepository = createClassesRepository({ database: db });
      const assignmentsRepository = createClassEaAssignmentsRepository({ database: db });

      await classesRepository.saveClass({
        id: 'class-2',
        school_id: 'school-1',
        name: 'Grade 2B',
        grade: '2',
        academic_year_id: 'year-2026',
        created_by: 'admin-user',
        synced: true,
      });
      await assignmentsRepository.save({
        id: 'assignment-literacy',
        class_id: 'class-1',
        ea_user_id: 'user-1',
        programme_id: 'programme-a',
        assigned_at: '2026-05-21T08:00:00.000Z',
        created_by: 'admin-user',
        synced: false,
      });
      await assignmentsRepository.save({
        id: 'assignment-numeracy',
        class_id: 'class-2',
        ea_user_id: 'user-1',
        programme_id: 'programme-b',
        assigned_at: '2026-05-21T08:00:00.000Z',
        created_by: 'admin-user',
        synced: false,
      });

      expect((await classesRepository.getClasses()).map(classItem => classItem.id))
        .toEqual(['class-1', 'class-2']);
      expect(await classesRepository.getClasses({ userId: 'user-1' })).toEqual([
        expect.objectContaining({ id: 'class-1' }),
      ]);
    } finally {
      await db.closeAsync();
    }
  });
});
