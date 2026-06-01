jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';

// #35 (write-path root-cause fix): a class change must keep children.class_id and
// the active child_class_memberships row in sync, so getChildrenInClass and the
// roster query (which joins memberships ON exited_at IS NULL) never disagree.

const FIXED_NOW = new Date('2026-05-21T08:00:00.000Z');

const seedTwoClasses = async (db) => {
  await seedCoreData(db); // school-1, programme-a, year-2026 (active), class-1
  await db.runAsync(`
    insert into classes (id, school_id, name, grade, academic_year_id, created_by)
    values ('class-2', 'school-1', 'Grade 1B', '1', 'year-2026', 'user-1')
  `);
};

const saveChildInClass1 = async (repo) => {
  await repo.save(
    { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini', class_id: 'class-1', created_by: 'user-1' },
    { actorUserId: 'user-1' }
  );
};

describe('updateChild — a class change keeps the active membership in sync (#35)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('changing class archives the old membership, inserts a new active one, and syncs class_id', async () => {
    const db = await createMigratedDatabase(runMigrations);
    await seedTwoClasses(db);
    const repo = createChildrenRepository({ database: db });
    await saveChildInClass1(repo);

    await repo.updateChild('child-1', { class_id: 'class-2' }, { actorUserId: 'user-1' });

    // Denormalized column updated.
    expect((await db.getFirstAsync('select class_id from children where id = ?', 'child-1')).class_id).toBe('class-2');

    // Old membership archived (exited_at set); a new active membership for class-2.
    const memberships = await db.getAllAsync(
      'select class_id, exited_at from child_class_memberships order by class_id'
    );
    expect(memberships).toEqual([
      { class_id: 'class-1', exited_at: expect.any(String) }, // archived
      { class_id: 'class-2', exited_at: null },               // new active
    ]);

    // Both membership writes are enqueued for sync (archive of old + insert of new).
    const ops = (await db.getAllAsync(
      "select operation from sync_outbox where table_name = 'child_class_memberships'"
    )).map((r) => r.operation);
    expect(ops).toContain('archive');
    expect(ops.filter((o) => o === 'insert').length).toBeGreaterThanOrEqual(2); // initial save + reassignment
  });

  test('does not churn memberships when the class is unchanged', async () => {
    const db = await createMigratedDatabase(runMigrations);
    await seedTwoClasses(db);
    const repo = createChildrenRepository({ database: db });
    await saveChildInClass1(repo);

    await repo.updateChild('child-1', { first_name: 'Renamed' }, { actorUserId: 'user-1' });

    const memberships = await db.getAllAsync('select class_id, exited_at from child_class_memberships');
    expect(memberships).toEqual([{ class_id: 'class-1', exited_at: null }]); // still the one active membership
  });
});
