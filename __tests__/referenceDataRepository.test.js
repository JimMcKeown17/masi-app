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
          getAllAsync: jest.fn(async () => []),
          getFirstAsync: jest.fn(async () => null),
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

  test('school refresh adopts server ids when a stale local row has the same name', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      const schoolsRepository = createSchoolsRepository({ database: db });

      await schoolsRepository.replaceFromServer([
        {
          id: 'stale-school-id',
          school_uid: 'stale-school-uid',
          name: 'Aaron Gqadu',
        },
      ]);
      await db.runAsync("insert into programmes (id, code, name) values ('programme-a', 'lit', 'Literacy')");
      await db.runAsync(`
        insert into staff_programme_assignments (
          id,
          user_id,
          programme_id,
          school_id,
          assigned_at
        )
        values (
          'assignment-1',
          'user-1',
          'programme-a',
          'stale-school-id',
          '2026-05-21T08:00:00.000Z'
        )
      `);
      await db.runAsync(`
        insert into classes (
          id,
          school_id,
          name,
          grade
        )
        values (
          'class-1',
          'stale-school-id',
          'Grade 1A',
          '1'
        )
      `);
      await db.runAsync(
        `
        insert into sync_outbox (
          id,
          table_name,
          record_id,
          operation,
          payload,
          status,
          retry_count,
          last_error,
          next_retry_at,
          created_at,
          updated_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        'classes:class-1:update',
        'classes',
        'class-1',
        'update',
        JSON.stringify({
          id: 'class-1',
          school_id: 'stale-school-id',
          name: 'Grade 1A',
          sync_status: 'pending',
        }),
        'failed',
        1,
        'insert or update on table "classes" violates foreign key constraint "classes_school_id_fkey"',
        '2099-01-01T00:00:00.000Z',
        '2026-05-21T08:00:00.000Z',
        '2026-05-21T08:00:00.000Z'
      );

      await expect(schoolsRepository.replaceFromServer([
        {
          id: 'server-school-id',
          school_uid: 'server-school-uid',
          name: 'Aaron Gqadu',
        },
      ])).resolves.toBe(true);

      expect(await db.getAllAsync('select id, school_uid, name from schools')).toEqual([
        {
          id: 'server-school-id',
          school_uid: 'server-school-uid',
          name: 'Aaron Gqadu',
        },
      ]);
      expect(await db.getFirstAsync("select school_id from staff_programme_assignments where id = 'assignment-1'"))
        .toEqual({ school_id: 'server-school-id' });
      expect(await db.getFirstAsync("select school_id from classes where id = 'class-1'"))
        .toEqual({ school_id: 'server-school-id' });
      const outboxRow = await db.getFirstAsync(`
        select status, retry_count, last_error, next_retry_at, payload
        from sync_outbox
        where id = 'classes:class-1:update'
      `);
      expect({
        ...outboxRow,
        payload: JSON.parse(outboxRow.payload),
      }).toEqual({
        status: 'pending',
        retry_count: 0,
        last_error: null,
        next_retry_at: null,
        payload: expect.objectContaining({
          id: 'class-1',
          school_id: 'server-school-id',
        }),
      });
    } finally {
      await db.closeAsync();
    }
  });

  test('reference refresh adopts server ids for lookup rows with unique business keys', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      const jobTitlesRepository = createReferenceDataRepository({ database: db, tableName: 'job_titles' });
      const programmesRepository = createReferenceDataRepository({ database: db, tableName: 'programmes' });
      const academicYearsRepository = createReferenceDataRepository({ database: db, tableName: 'academic_years' });
      const assessmentToolsRepository = createReferenceDataRepository({ database: db, tableName: 'assessment_tools' });

      await jobTitlesRepository.replaceFromServer([
        {
          id: 'stale-job-title',
          code: 'ea',
          name: 'Education Assistant',
        },
      ]);
      await programmesRepository.replaceFromServer([
        {
          id: 'stale-programme',
          code: 'literacy',
          name: 'Literacy',
        },
      ]);
      await academicYearsRepository.replaceFromServer([
        {
          id: 'stale-year',
          label: '2026',
          starts_on: '2026-01-15',
          ends_on: '2026-12-15',
          is_active: true,
        },
      ]);
      await assessmentToolsRepository.replaceFromServer([
        {
          id: 'stale-tool',
          programme_id: 'stale-programme',
          code: 'letter_egra',
          name: 'Letter EGRA',
        },
      ]);

      await db.runAsync("insert into schools (id, name) values ('local-school', 'Local School')");
      await db.runAsync(`
        insert into staff_programme_assignments (
          id,
          user_id,
          programme_id,
          assigned_at
        )
        values (
          'assignment-1',
          'user-1',
          'stale-programme',
          '2026-05-21T08:00:00.000Z'
        )
      `);
      await db.runAsync(`
        insert into classes (
          id,
          school_id,
          name,
          grade,
          academic_year_id
        )
        values (
          'class-1',
          'local-school',
          'Grade 1A',
          '1',
          'stale-year'
        )
      `);
      await db.runAsync(`
        insert into children (
          id,
          first_name,
          last_name,
          class_id
        )
        values (
          'child-1',
          'Test',
          'Child',
          'class-1'
        )
      `);
      await db.runAsync(`
        insert into assessments (
          id,
          user_id,
          child_id,
          programme_id,
          assessment_tool_id,
          assessment_type,
          assessment_date
        )
        values (
          'assessment-1',
          'user-1',
          'child-1',
          'stale-programme',
          'stale-tool',
          'letter_egra',
          '2026-05-21'
        )
      `);

      await expect(jobTitlesRepository.replaceFromServer([
        {
          id: 'server-job-title',
          code: 'ea',
          name: 'Education Assistant',
        },
      ])).resolves.toBe(true);
      await expect(programmesRepository.replaceFromServer([
        {
          id: 'server-programme',
          code: 'literacy',
          name: 'Literacy',
        },
      ])).resolves.toBe(true);
      await expect(academicYearsRepository.replaceFromServer([
        {
          id: 'server-year',
          label: '2026',
          starts_on: '2026-01-15',
          ends_on: '2026-12-15',
          is_active: true,
        },
      ])).resolves.toBe(true);
      await expect(assessmentToolsRepository.replaceFromServer([
        {
          id: 'server-tool',
          programme_id: 'server-programme',
          code: 'letter_egra',
          name: 'Letter EGRA',
        },
      ])).resolves.toBe(true);

      expect(await db.getAllAsync('select id, code, name from job_titles')).toEqual([
        { id: 'server-job-title', code: 'ea', name: 'Education Assistant' },
      ]);
      expect(await db.getAllAsync('select id, code, name from programmes')).toEqual([
        { id: 'server-programme', code: 'literacy', name: 'Literacy' },
      ]);
      expect(await db.getFirstAsync("select programme_id from staff_programme_assignments where id = 'assignment-1'"))
        .toEqual({ programme_id: 'server-programme' });
      expect(await db.getFirstAsync("select academic_year_id from classes where id = 'class-1'"))
        .toEqual({ academic_year_id: 'server-year' });
      expect(await db.getFirstAsync("select programme_id, assessment_tool_id from assessments where id = 'assessment-1'"))
        .toEqual({
          programme_id: 'server-programme',
          assessment_tool_id: 'server-tool',
        });
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
