jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import {
  DATABASE_NAME,
  getDatabase,
  resetDatabaseConnectionForTests,
  withTransaction,
} from '../src/db/client';
import {
  __reset as resetExpoSQLiteMock,
  __setDatabaseFactory,
  openDatabaseAsync,
} from 'expo-sqlite';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import {
  CURRENT_SCHEMA_VERSION,
  runMigrations,
} from '../src/db/migrations';
import { debugDump } from '../src/db/debugDump';

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
};

describe('SQLite foundation client', () => {
  beforeEach(() => {
    resetExpoSQLiteMock();
    resetDatabaseConnectionForTests();
  });

  test('queues overlapping write transactions until the active transaction finishes', async () => {
    const firstTransactionEntered = createDeferred();
    const releaseFirstTransaction = createDeferred();
    const events = [];
    const db = {
      execAsync: jest.fn(async () => {}),
      withExclusiveTransactionAsync: jest.fn(async (task) => {
        const transactionNumber = db.withExclusiveTransactionAsync.mock.calls.length;
        const txn = { id: `txn-${transactionNumber}` };

        events.push(`enter-${txn.id}`);
        if (transactionNumber === 1) {
          firstTransactionEntered.resolve();
        }
        await task(txn);
        events.push(`exit-${txn.id}`);
      }),
    };

    __setDatabaseFactory(async () => db);

    const first = withTransaction(async (txn) => {
      events.push(`task-a-${txn.id}`);
      await releaseFirstTransaction.promise;
    });

    const second = withTransaction(async (txn) => {
      events.push(`task-b-${txn.id}`);
    });

    await firstTransactionEntered.promise;

    expect(openDatabaseAsync).toHaveBeenCalledWith(DATABASE_NAME);
    expect(events).toEqual(['enter-txn-1', 'task-a-txn-1']);

    releaseFirstTransaction.resolve();
    await Promise.all([first, second]);

    expect(events).toEqual([
      'enter-txn-1',
      'task-a-txn-1',
      'exit-txn-1',
      'enter-txn-2',
      'task-b-txn-2',
      'exit-txn-2',
    ]);
  });

  test('configures lock-related pragmas whenever a new database handle is opened', async () => {
    const firstDb = {
      execAsync: jest.fn(async () => {}),
    };
    const secondDb = {
      execAsync: jest.fn(async () => {}),
    };
    __setDatabaseFactory(jest.fn()
      .mockResolvedValueOnce(firstDb)
      .mockResolvedValueOnce(secondDb));

    await expect(getDatabase()).resolves.toBe(firstDb);
    resetDatabaseConnectionForTests();
    await expect(getDatabase()).resolves.toBe(secondDb);

    for (const db of [firstDb, secondDb]) {
      expect(db.execAsync).toHaveBeenCalledWith('PRAGMA foreign_keys = ON');
      expect(db.execAsync).toHaveBeenCalledWith('PRAGMA journal_mode = WAL');
      expect(db.execAsync).toHaveBeenCalledWith('PRAGMA busy_timeout = 5000');
    }
  });

  test('app-level migrations wait behind an active queued write transaction', async () => {
    const firstTransactionEntered = createDeferred();
    const releaseFirstTransaction = createDeferred();
    const events = [];
    const db = {
      execAsync: jest.fn(async (sql) => {
        events.push(`exec:${sql}`);
      }),
      getFirstAsync: jest.fn(async () => ({ user_version: CURRENT_SCHEMA_VERSION })),
      withExclusiveTransactionAsync: jest.fn(async (task) => {
        events.push('enter-write');
        firstTransactionEntered.resolve();
        await task(db);
        await releaseFirstTransaction.promise;
        events.push('exit-write');
      }),
    };

    __setDatabaseFactory(async () => db);

    const write = withTransaction(async () => {
      events.push('inside-write');
    });
    await firstTransactionEntered.promise;

    const migrations = runMigrations();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(events).toEqual([
      'exec:PRAGMA foreign_keys = ON',
      'exec:PRAGMA journal_mode = WAL',
      'exec:PRAGMA busy_timeout = 5000',
      'enter-write',
      'inside-write',
    ]);

    releaseFirstTransaction.resolve();
    await Promise.all([write, migrations]);

    expect(events).toEqual([
      'exec:PRAGMA foreign_keys = ON',
      'exec:PRAGMA journal_mode = WAL',
      'exec:PRAGMA busy_timeout = 5000',
      'enter-write',
      'inside-write',
      'exit-write',
      'exec:PRAGMA foreign_keys = ON',
      'exec:PRAGMA journal_mode = WAL',
      'exec:PRAGMA busy_timeout = 5000',
    ]);
  });
});

const getUserVersion = async (db) => {
  const row = await db.getFirstAsync('PRAGMA user_version');
  return row.user_version;
};

const getTableNames = async (db) => {
  const rows = await db.getAllAsync(
    "select name from sqlite_master where type = 'table' order by name"
  );

  return rows.map((row) => row.name);
};

const getColumnNames = async (db, tableName) => {
  const rows = await db.getAllAsync(`PRAGMA table_info(${tableName})`);
  return rows.map((row) => row.name);
};

const SERVER_BACKED_TABLES = [
  'schools',
  'job_titles',
  'programmes',
  'staff_programme_assignments',
  'assessment_tools',
  'academic_years',
  'assessment_windows',
  'teachers',
  'classes',
  'children',
  'child_ea_assignments',
  'child_programme_enrollments',
  'class_ea_assignments',
  'group_ea_assignments',
  'grouping_versions',
  'class_grouping_state',
  'child_class_memberships',
  'groups',
  'child_group_memberships',
  'time_entries',
  'sessions',
  'session_attendees',
  'assessments',
  'assessment_items',
  'letter_mastery',
];

const expectSqliteConstraintFailure = async (operation) => {
  let thrownError = null;

  try {
    await (typeof operation === 'function' ? operation() : operation);
  } catch (error) {
    thrownError = error;
  }

  expect(thrownError?.message || '').toMatch(/constraint|unique/i);
};

describe('SQLite migration runner', () => {
  test('configures connection pragmas before migration execution and outside the transaction', async () => {
    const events = [];
    const db = {
      execAsync: jest.fn(async (sql) => {
        events.push(`exec:${sql}`);
      }),
      getFirstAsync: jest.fn(async (sql) => {
        events.push(`get:${sql}`);
        return { user_version: 0 };
      }),
      withExclusiveTransactionAsync: jest.fn(async (task) => {
        events.push('enter-migration-transaction');
        await task({
          execAsync: jest.fn(async () => {
            events.push('txn:exec-migration-sql');
          }),
          runAsync: jest.fn(async () => {
            events.push('txn:record-migration');
          }),
        });
        events.push('exit-migration-transaction');
      }),
    };

    await runMigrations(db);

    expect(events).toEqual([
      'exec:PRAGMA foreign_keys = ON',
      'exec:PRAGMA journal_mode = WAL',
      'exec:PRAGMA busy_timeout = 5000',
      'get:PRAGMA user_version',
      'enter-migration-transaction',
      'txn:exec-migration-sql',
      'txn:record-migration',
      'exit-migration-transaction',
      `exec:PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`,
    ]);
  });

  test('runs migrations idempotently and sets user_version in real SQLite', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      await runMigrations(db);

      expect(await getUserVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
      expect(await getTableNames(db)).toEqual(expect.arrayContaining([
        'schema_migrations',
        'local_state',
        'sync_state',
        'sync_outbox',
      ]));

      const migrations = await db.getAllAsync('select version from schema_migrations');
      expect(migrations).toEqual([{ version: 1 }]);
    } finally {
      await db.closeAsync();
    }
  });

  test('creates the full clean-slate local mirror with 25 server-backed tables', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);

      const tableNames = await getTableNames(db);
      expect(tableNames).toEqual(expect.arrayContaining(SERVER_BACKED_TABLES));
      expect(tableNames.filter((name) => SERVER_BACKED_TABLES.includes(name))).toHaveLength(25);
    } finally {
      await db.closeAsync();
    }
  });

  test('enables foreign keys and adds local sync metadata to every server-backed table', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await db.execAsync('PRAGMA foreign_keys = OFF');
      await runMigrations(db);

      expect(await db.getFirstAsync('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });

      for (const tableName of SERVER_BACKED_TABLES) {
        await expect(getColumnNames(db, tableName)).resolves.toEqual(expect.arrayContaining([
          'sync_status',
          'last_sync_error',
          'server_updated_at',
        ]));
      }
    } finally {
      await db.closeAsync();
    }
  });

  test('mirrors the Plan 1 Zazi-alignment column additions locally', async () => {
    const db = createBetterSqliteTestDatabase();
    const expectedColumnsByTable = {
      classes: ['academic_year_id', 'teacher_id', 'archived_at', 'archived_by_user_id', 'archive_reason'],
      children: ['archived_at', 'archived_by_user_id', 'archive_reason', 'hidden_at'],
      groups: ['grouping_version_id', 'display_number', 'archived_at', 'archived_by_user_id', 'archive_reason'],
      child_group_memberships: ['grouping_version_id'],
      assessments: ['assessment_window_id', 'assessment_purpose', 'grade_snapshot', 'teacher_name_snapshot'],
      session_attendees: ['grade_snapshot'],
      letter_mastery: ['deleted_at'],
    };

    try {
      await runMigrations(db);

      for (const [tableName, expectedColumns] of Object.entries(expectedColumnsByTable)) {
        await expect(getColumnNames(db, tableName)).resolves.toEqual(
          expect.arrayContaining(expectedColumns)
        );
      }
    } finally {
      await db.closeAsync();
    }
  });

  test('enforces Zazi-alignment schema invariants in real SQLite', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);

      await db.runAsync(
        "insert into academic_years (id, label, starts_on, ends_on, is_active) values ('year-2026', '2026', '2026-01-15', '2026-12-15', 1)"
      );
      expect(await db.getFirstAsync(
        "select label, window_type from assessment_windows where academic_year_id = 'year-2026'"
      )).toEqual({
        label: '2026 Baseline',
        window_type: 'baseline',
      });

      await expectSqliteConstraintFailure(db.runAsync(
        "insert into academic_years (id, label, starts_on, ends_on, is_active) values ('year-2027', '2027', '2027-01-15', '2027-12-15', 1)"
      ));

      await db.runAsync("insert into schools (id, name) values ('school-1', 'Masi Primary')");
      await db.runAsync("insert into programmes (id, code, name) values ('programme-1', 'literacy', 'Literacy')");
      await db.runAsync(
        "insert into classes (id, school_id, name, grade, academic_year_id) values ('class-1', 'school-1', 'Grade 1A', '1', 'year-2026')"
      );
      await db.runAsync(
        "insert into children (id, first_name, last_name, class_id) values ('child-1', 'Amahle', 'Dlamini', 'class-1')"
      );

      await expectSqliteConstraintFailure(db.runAsync(`
        insert into assessments (
          id,
          user_id,
          child_id,
          programme_id,
          assessment_purpose,
          assessment_type,
          assessment_date
        )
        values (
          'assessment-1',
          'user-1',
          'child-1',
          'programme-1',
          'official_window',
          'egra_letter_sounds',
          '2026-02-01'
        )
      `));

      await db.runAsync(
        "insert into grouping_versions (id, class_id, academic_year_id, version_number, status) values ('grouping-1', 'class-1', 'year-2026', 1, 'active')"
      );
      await expectSqliteConstraintFailure(db.runAsync(
        "insert into grouping_versions (id, class_id, academic_year_id, version_number, status) values ('grouping-2', 'class-1', 'year-2026', 2, 'active')"
      ));

      await db.runAsync(`
        insert into letter_mastery (
          id,
          user_id,
          child_id,
          programme_id,
          letter,
          language,
          source
        )
        values (
          'mastery-1',
          'user-1',
          'child-1',
          'programme-1',
          'a',
          'isiXhosa',
          'taught'
        )
      `);
      await expectSqliteConstraintFailure(db.runAsync(`
        insert into letter_mastery (
          id,
          user_id,
          child_id,
          programme_id,
          letter,
          language,
          source
        )
        values (
          'mastery-duplicate',
          'user-1',
          'child-1',
          'programme-1',
          'a',
          'isiXhosa',
          'taught'
        )
      `));

      await db.runAsync(
        "update letter_mastery set deleted_at = '2026-05-21T00:00:00.000Z' where id = 'mastery-1'"
      );
      await expect(db.runAsync(`
        insert into letter_mastery (
          id,
          user_id,
          child_id,
          programme_id,
          letter,
          language,
          source
        )
        values (
          'mastery-2',
          'user-1',
          'child-1',
          'programme-1',
          'a',
          'isiXhosa',
          'taught'
        )
      `)).resolves.toBeDefined();
    } finally {
      await db.closeAsync();
    }
  });

  test('mirrors backend active uniqueness for child assignments and programme enrollments', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);

      await db.runAsync("insert into schools (id, name) values ('school-1', 'Masi Primary')");
      await db.runAsync("insert into programmes (id, code, name) values ('programme-1', 'literacy', 'Literacy')");
      await db.runAsync(
        "insert into classes (id, school_id, name, grade) values ('class-1', 'school-1', 'Grade 1A', '1')"
      );
      await db.runAsync(
        "insert into children (id, first_name, last_name, class_id) values ('child-1', 'Amahle', 'Dlamini', 'class-1')"
      );

      await db.runAsync(`
        insert into child_ea_assignments (id, user_id, child_id)
        values ('assignment-1', 'user-1', 'child-1')
      `);
      await expectSqliteConstraintFailure(db.runAsync(`
        insert into child_ea_assignments (id, user_id, child_id)
        values ('assignment-duplicate', 'user-1', 'child-1')
      `));
      await db.runAsync(
        "update child_ea_assignments set unassigned_at = '2099-05-21T00:00:00.000Z' where id = 'assignment-1'"
      );
      await expect(db.runAsync(`
        insert into child_ea_assignments (id, user_id, child_id)
        values ('assignment-2', 'user-1', 'child-1')
      `)).resolves.toBeDefined();

      await db.runAsync(`
        insert into child_programme_enrollments (id, child_id, programme_id)
        values ('enrollment-1', 'child-1', 'programme-1')
      `);
      await expectSqliteConstraintFailure(db.runAsync(`
        insert into child_programme_enrollments (id, child_id, programme_id)
        values ('enrollment-duplicate', 'child-1', 'programme-1')
      `));
      await db.runAsync(
        "update child_programme_enrollments set ended_at = '2099-05-21T00:00:00.000Z' where id = 'enrollment-1'"
      );
      await expect(db.runAsync(`
        insert into child_programme_enrollments (id, child_id, programme_id)
        values ('enrollment-2', 'child-1', 'programme-1')
      `)).resolves.toBeDefined();
    } finally {
      await db.closeAsync();
    }
  });

  test('uses sync status and outbox enums from the clean-slate sync contract', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      await db.runAsync("insert into schools (id, name) values ('school-1', 'Masi Primary')");

      for (const status of ['pending', 'synced', 'failed', 'terminal']) {
        await db.runAsync(
          'update schools set sync_status = ? where id = ?',
          status,
          'school-1'
        );
      }
      await expectSqliteConstraintFailure(db.runAsync(
        'update schools set sync_status = ? where id = ?',
        'deleted',
        'school-1'
      ));

      for (const operation of ['insert', 'update', 'archive', 'hard_delete', 'restore']) {
        await db.runAsync(
          'insert into sync_outbox (id, table_name, record_id, operation, status) values (?, ?, ?, ?, ?)',
          `outbox-${operation}`,
          'children',
          `record-${operation}`,
          operation,
          'terminal'
        );
      }
      await expectSqliteConstraintFailure(db.runAsync(
        'insert into sync_outbox (id, table_name, record_id, operation) values (?, ?, ?, ?)',
        'outbox-delete',
        'children',
        'record-delete',
        'delete'
      ));
    } finally {
      await db.closeAsync();
    }
  });

  test('serializes concurrent migration runs on the app-level migration queue', async () => {
    const firstMigrationEntered = createDeferred();
    const releaseFirstMigration = createDeferred();
    const events = [];
    let userVersion = 0;
    let transactionCount = 0;
    const db = {
      execAsync: jest.fn(async (sql) => {
        if (/PRAGMA user_version = 1/i.test(sql)) {
          userVersion = 1;
          events.push('set-user-version-1');
        }
      }),
      getFirstAsync: jest.fn(async () => ({ user_version: userVersion })),
      runAsync: jest.fn(async () => undefined),
      withExclusiveTransactionAsync: jest.fn(async (task) => {
        transactionCount += 1;
        const transactionNumber = transactionCount;
        events.push(`enter-${transactionNumber}`);
        if (transactionNumber === 1) {
          firstMigrationEntered.resolve();
        }
        await task(db);
        if (transactionNumber === 1) {
          await releaseFirstMigration.promise;
        }
        events.push(`exit-${transactionNumber}`);
      }),
    };

    const first = runMigrations(db);
    const second = runMigrations(db);

    await firstMigrationEntered.promise;
    expect(events).toEqual(['enter-1']);

    releaseFirstMigration.resolve();
    await Promise.all([first, second]);

    expect(events).toEqual([
      'enter-1',
      'exit-1',
      'set-user-version-1',
    ]);
    expect(db.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
  });

  test('rolls back schema changes and leaves user_version untouched when migration history insert fails', async () => {
    const db = createBetterSqliteTestDatabase();
    const originalRunAsync = db.runAsync.bind(db);

    db.runAsync = async (sql, ...params) => {
      if (/insert or ignore into schema_migrations/i.test(sql)) {
        throw new Error('forced migration history failure');
      }

      return originalRunAsync(sql, ...params);
    };

    try {
      await expect(runMigrations(db)).rejects.toThrow('forced migration history failure');

      expect(await getUserVersion(db)).toBe(0);
      expect(await getTableNames(db)).not.toEqual(expect.arrayContaining([
        'schema_migrations',
        'sync_outbox',
        'children',
      ]));
    } finally {
      await db.closeAsync();
    }
  });
});

describe('SQLite debug dump', () => {
  test('handles a fresh database before migrations have run', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      const dump = await debugDump(db);

      expect(dump).toEqual({
        database: 'sqlite',
        releaseMetadata: expect.objectContaining({
          supabaseTarget: 'sqlite-staging',
          supabaseProjectId: 'segygjzpujphwvrubusm',
        }),
        schemaVersion: 0,
        migrations: [],
        tableCounts: {},
        syncState: [],
        failedOutboxRows: [],
        generatedAt: expect.any(String),
      });
    } finally {
      await db.closeAsync();
    }
  });

  test('reports schema version, migrations, table counts, and generation time', async () => {
    const db = createBetterSqliteTestDatabase();

    try {
      await runMigrations(db);
      await db.runAsync("insert into schools (id, name) values ('school-1', 'Masi Primary')");

      const dump = await debugDump(db);

      expect(dump).toEqual({
        database: 'sqlite',
        releaseMetadata: expect.objectContaining({
          supabaseTarget: 'sqlite-staging',
          supabaseProjectId: 'segygjzpujphwvrubusm',
        }),
        schemaVersion: CURRENT_SCHEMA_VERSION,
        migrations: [{ version: 1, name: 'initial_sqlite_foundation' }],
        tableCounts: expect.objectContaining({
          schools: 1,
          sync_outbox: 0,
        }),
        syncState: [],
        failedOutboxRows: [],
        generatedAt: expect.any(String),
      });
      expect(new Date(dump.generatedAt).toString()).not.toBe('Invalid Date');
    } finally {
      await db.closeAsync();
    }
  });
});
