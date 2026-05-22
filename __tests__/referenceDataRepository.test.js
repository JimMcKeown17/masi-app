jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import {
  __reset as resetExpoSQLiteMock,
  __setDatabaseFactory,
} from 'expo-sqlite';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { resetDatabaseConnectionForTests, withTransaction } from '../src/db/client';
import { CURRENT_SCHEMA_VERSION, runMigrations } from '../src/db/migrations';
import {
  createReferenceDataRepository,
  createSchoolsRepository,
} from '../src/db/repositories/referenceDataRepository';

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
};

describe('reference data repositories', () => {
  beforeEach(() => {
    resetExpoSQLiteMock();
    resetDatabaseConnectionForTests();
  });

  test('default reference replacements share the global SQLite write queue', async () => {
    const firstTransactionEntered = createDeferred();
    const releaseFirstTransaction = createDeferred();
    const events = [];
    const db = {
      execAsync: jest.fn(),
      getFirstAsync: jest.fn(async (sql) => (
        sql === 'PRAGMA user_version' ? { user_version: CURRENT_SCHEMA_VERSION } : null
      )),
      withExclusiveTransactionAsync: jest.fn(async (task) => {
        const transactionNumber = db.withExclusiveTransactionAsync.mock.calls.length;
        const txn = {
          id: `txn-${transactionNumber}`,
          runAsync: jest.fn(async () => {}),
        };

        events.push(`enter-${txn.id}`);
        if (transactionNumber === 1) {
          firstTransactionEntered.resolve();
          await releaseFirstTransaction.promise;
        }
        await task(txn);
        events.push(`exit-${txn.id}`);
      }),
    };

    __setDatabaseFactory(async () => db);
    const schoolsRepository = createSchoolsRepository();

    const first = schoolsRepository.replaceFromServer([{ id: 'school-1', name: 'Cached School' }]);
    await firstTransactionEntered.promise;
    const second = withTransaction(async (txn) => {
      events.push(`task-b-${txn.id}`);
    });

    await Promise.resolve();

    expect(events).toEqual(['enter-txn-1']);

    releaseFirstTransaction.resolve();
    await Promise.all([first, second]);

    expect(events).toEqual([
      'enter-txn-1',
      'exit-txn-1',
      'enter-txn-2',
      'task-b-txn-2',
      'exit-txn-2',
    ]);
  });

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

  test('staff programme assignment replacement removes server-missing rows within the user scope', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      await db.runAsync("insert into programmes (id, code, name) values ('programme-a', 'lit', 'Literacy')");
      await db.runAsync("insert into programmes (id, code, name) values ('programme-b', 'num', 'Numeracy')");
      const repository = createReferenceDataRepository({
        database: db,
        tableName: 'staff_programme_assignments',
      });

      await repository.replaceFromServer([
        { id: 'old-assignment', user_id: 'user-1', programme_id: 'programme-a', assigned_at: '2026-01-01T00:00:00.000Z' },
        { id: 'other-user-assignment', user_id: 'user-2', programme_id: 'programme-b', assigned_at: '2026-01-01T00:00:00.000Z' },
      ]);

      await repository.replaceFromServer([
        { id: 'new-assignment', user_id: 'user-1', programme_id: 'programme-b', assigned_at: '2026-05-22T00:00:00.000Z' },
      ], { scope: { user_id: 'user-1' } });

      expect(await db.getAllAsync(`
        select id, user_id, programme_id
        from staff_programme_assignments
        order by user_id, id
      `)).toEqual([
        { id: 'new-assignment', user_id: 'user-1', programme_id: 'programme-b' },
        { id: 'other-user-assignment', user_id: 'user-2', programme_id: 'programme-b' },
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('staff programme assignment replacement avoids stale active-unique collisions', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      await db.runAsync("insert into programmes (id, code, name) values ('programme-a', 'lit', 'Literacy')");
      await db.runAsync("insert into programmes (id, code, name) values ('programme-b', 'num', 'Numeracy')");
      const repository = createReferenceDataRepository({
        database: db,
        tableName: 'staff_programme_assignments',
      });

      await repository.replaceFromServer([
        { id: 'stale-active', user_id: 'user-1', programme_id: 'programme-a', assigned_at: '2026-01-01T00:00:00.000Z' },
      ]);

      await expect(repository.replaceFromServer([
        { id: 'replacement-active', user_id: 'user-1', programme_id: 'programme-b', assigned_at: '2026-05-22T00:00:00.000Z' },
      ], { scope: { user_id: 'user-1' } })).resolves.toBe(true);

      expect(await db.getAllAsync(`
        select id, programme_id
        from staff_programme_assignments
        where user_id = 'user-1'
      `)).toEqual([
        { id: 'replacement-active', programme_id: 'programme-b' },
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  test('FK-referenced reference tables upsert server rows without deleting local referenced rows', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      await db.runAsync("insert into schools (id, name) values ('school-1', 'Masi Primary')");
      const academicYearsRepository = createReferenceDataRepository({
        database: db,
        tableName: 'academic_years',
      });

      await academicYearsRepository.replaceFromServer([
        { id: 'year-2026', label: '2026', starts_on: '2026-01-15', ends_on: '2026-12-15', is_active: true },
      ]);
      await db.runAsync(`
        insert into classes (id, school_id, name, grade, academic_year_id)
        values ('class-1', 'school-1', 'Grade 1A', '1', 'year-2026')
      `);

      await academicYearsRepository.replaceFromServer([
        { id: 'year-2027', label: '2027', starts_on: '2027-01-15', ends_on: '2027-12-15', is_active: false },
      ]);

      expect(await db.getFirstAsync("select academic_year_id from classes where id = 'class-1'"))
        .toEqual({ academic_year_id: 'year-2026' });
      expect(await db.getAllAsync('select id from academic_years order by id')).toEqual([
        { id: 'year-2026' },
        { id: 'year-2027' },
      ]);
    } finally {
      await db.closeAsync();
    }
  });
});
