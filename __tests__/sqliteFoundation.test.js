jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

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
    // runInTransaction uses manual BEGIN/COMMIT on the supplied db connection —
    // withExclusiveTransactionAsync is no longer used for migrations.
    // The db itself is passed as txn, so runAsync must exist on the mock.
    const db = {
      execAsync: jest.fn(async (sql) => {
        if (/BEGIN IMMEDIATE/i.test(sql)) {
          events.push('enter-migration-transaction');
        } else if (/^COMMIT$/i.test(sql)) {
          events.push('exit-migration-transaction');
        } else if (/^ROLLBACK$/i.test(sql)) {
          events.push('rollback-migration-transaction');
        } else if (/PRAGMA user_version\s*=/i.test(sql)) {
          events.push('txn:set-user-version');
        } else if (/PRAGMA foreign_keys/i.test(sql)) {
          events.push(`exec:${sql}`);
        } else {
          // Large migration SQL blocks.
          events.push('txn:exec-migration-sql');
        }
      }),
      getFirstAsync: jest.fn(async (sql) => {
        events.push(`get:${sql}`);
        return { user_version: 0 };
      }),
      runAsync: jest.fn(async () => {
        events.push('txn:record-migration');
      }),
    };

    await runMigrations(db);

    expect(events).toEqual([
      // user_version is read FIRST to detect pending migrations before any FK toggle.
      // configureDatabaseConnection (WAL, busy_timeout) is no longer called here —
      // it runs once in client.js initializeDatabase when the connection is opened.
      'get:PRAGMA user_version',
      // FK enforcement is turned OFF only when there are pending migrations.
      'exec:PRAGMA foreign_keys = OFF',
      // Per pending migration: BEGIN IMMEDIATE, exec SQL, record it, bump user_version, COMMIT.
      // The db connection itself is passed as txn, so txn.execAsync === db.execAsync.
      'enter-migration-transaction',
      'txn:exec-migration-sql',
      'txn:record-migration',
      'txn:set-user-version',
      'exit-migration-transaction',
      'enter-migration-transaction',
      'txn:exec-migration-sql',
      'txn:record-migration',
      'txn:set-user-version',
      'exit-migration-transaction',
      'enter-migration-transaction',
      'txn:exec-migration-sql',
      'txn:record-migration',
      'txn:set-user-version',
      'exit-migration-transaction',
      // FK enforcement restored in finally.
      'exec:PRAGMA foreign_keys = ON',
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
      expect(migrations).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }]);
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
    let beginCount = 0;
    // runInTransaction uses manual BEGIN IMMEDIATE/COMMIT — no withExclusiveTransactionAsync.
    const db = {
      execAsync: jest.fn(async (sql) => {
        if (/BEGIN IMMEDIATE/i.test(sql)) {
          beginCount += 1;
          const txnNumber = beginCount;
          events.push(`enter-${txnNumber}`);
          if (txnNumber === 1) {
            firstMigrationEntered.resolve();
          }
          if (txnNumber === 1) {
            await releaseFirstMigration.promise;
          }
        } else if (/^COMMIT$/i.test(sql)) {
          events.push(`exit-${beginCount}`);
        } else {
          const match = /PRAGMA user_version = (\d+)/i.exec(sql);
          if (match) {
            userVersion = Number(match[1]);
            events.push(`set-user-version-${match[1]}`);
          }
          // Other pragmas and migration SQL are silently accepted.
        }
      }),
      getFirstAsync: jest.fn(async () => ({ user_version: userVersion })),
      runAsync: jest.fn(async () => undefined),
    };

    const first = runMigrations(db);
    const second = runMigrations(db);

    await firstMigrationEntered.promise;
    // While the first run holds its migration transaction, the second concurrent
    // run is queued behind it on the app-level migration queue: no other
    // transaction has been entered. (Asserting on beginCount rather than the
    // event order keeps this robust now that user_version is bumped mid-transaction.)
    expect(beginCount).toBe(1);

    releaseFirstMigration.resolve();
    await Promise.all([first, second]);

    // The first run applies all pending migrations (three transactions); the second
    // run is serialized behind it, sees user_version already current, and does nothing.
    expect(beginCount).toBe(3);
    expect(userVersion).toBe(3);
  });

  test('a ROLLBACK failure does not mask the original migration error', async () => {
    const db = {
      execAsync: jest.fn(async (sql) => {
        if (/BEGIN IMMEDIATE/i.test(sql)) return;
        if (/^ROLLBACK$/i.test(sql)) throw new Error('rollback boom');
        if (/PRAGMA/i.test(sql)) return; // FK off/on, user_version bump
        throw new Error('migration boom'); // first migration SQL statement fails
      }),
      getFirstAsync: jest.fn(async () => ({ user_version: 0 })),
      runAsync: jest.fn(async () => undefined),
    };
    let caught;
    try {
      await runMigrations(db);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeDefined();
    expect(caught.message).toMatch(/migration boom/);   // the ORIGINAL error
    expect(caught.message).not.toMatch(/rollback boom/); // not masked by rollback failure
    // FK restored in finally even on failure:
    expect(db.execAsync).toHaveBeenCalledWith('PRAGMA foreign_keys = ON');
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
        migrations: [
          { version: 1, name: 'initial_sqlite_foundation' },
          { version: 2, name: 'programmes_daily_session_target' },
          { version: 3, name: 'sessions_forward_prep_columns' },
        ],
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
