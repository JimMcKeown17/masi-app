jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {},
}));

import { CURRENT_SCHEMA_VERSION, MIGRATIONS, runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createReferenceDataRepository } from '../src/db/repositories/referenceDataRepository';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const migrateToV14 = async (db) => {
  await db.execAsync('PRAGMA foreign_keys = OFF');
  for (const migration of MIGRATIONS.filter(({ version }) => version <= 14)) {
    await db.execAsync(migration.sql);
    await db.runAsync(
      'insert into schema_migrations (version, name) values (?, ?)',
      migration.version, migration.name
    );
  }
  await db.execAsync('PRAGMA user_version = 14; PRAGMA foreign_keys = ON');
};

describe('assessment results schema v15', () => {
  let db;
  beforeEach(async () => {
    db = await createMigratedDatabase(migrateToV14);
    await seedCoreData(db);
    await db.runAsync(`
      insert into children (id, first_name, last_name, created_by)
      values ('child-1', 'Test', 'Child', 'user-1')
    `);
  });
  afterEach(async () => db.closeAsync());

  const insertRun = (overrides = {}) => {
    const row = {
      id: 'run-1',
      battery_code: 'wela_plus_full',
      battery_version: '2024.1',
      child_id: 'child-1',
      user_id: 'user-1',
      programme_id: 'programme-a',
      class_id: 'class-1',
      assessment_purpose: 'progress_check',
      assessment_window_id: null,
      language: 'xh',
      started_at: '2026-10-20T08:00:00.000Z',
      completed_at: null,
      status: 'in_progress',
      notes: null,
      sync_status: 'pending',
      ...overrides,
    };
    return db.runAsync(
      `insert into battery_runs (${Object.keys(row).join(', ')})
       values (${Object.keys(row).map(() => '?').join(', ')})`,
      ...Object.values(row)
    );
  };

  const insertAssessment = (id, runId, questionCode = 'letter_sounds') => db.runAsync(`
    insert into assessments (
      id, user_id, child_id, programme_id, assessment_type, assessment_date,
      battery_run_id, question_code, question_version, item_set_id, language,
      stopped_reason, duration_ms
    ) values (?, 'user-1', 'child-1', 'programme-a', ?, '2026-10-20',
      ?, ?, '2026.1', 'letter_sounds@2026.1.xh', 'xh', 'stop_rule', 15000)
  `, id, questionCode, runId, questionCode);

  test('v14 upgrade clears old assessments, items and their three queued writes, keeping other work', async () => {
    await db.execAsync(`
      insert into assessments (
        id, user_id, child_id, programme_id, assessment_type, assessment_date, sync_status
      ) values ('old-assessment', 'user-1', 'child-1', 'programme-a', 'letter_egra', '2026-10-19', 'pending');
      insert into assessment_items (id, assessment_id, item_key, position, sync_status)
      values ('old-item-1', 'old-assessment', 'a', 0, 'pending'),
        ('old-item-2', 'old-assessment', 'b', 1, 'failed');
      insert into time_entries (id, user_id, sign_in_time, sync_status)
      values ('time-1', 'user-1', '2026-10-20T08:00:00.000Z', 'pending');
      insert into sync_outbox (id, table_name, record_id, operation, owner_user_id, status, payload)
      values
        ('assessment-outbox', 'assessments', 'old-assessment', 'insert', 'user-1', 'pending', null),
        ('item-outbox-1', 'assessment_items', 'old-item-1', 'insert', 'user-1', 'failed', '{}'),
        ('item-outbox-2', 'assessment_items', 'old-item-2', 'insert', 'user-1', 'terminal', '{}'),
        ('child-outbox', 'children', 'child-1', 'insert', 'user-1', 'pending', '{"id":"child-1"}'),
        ('time-outbox', 'time_entries', 'time-1', 'insert', 'user-1', 'failed', '{"id":"time-1"}');
    `);
    const otherOutbox = await db.getAllAsync(`
      select * from sync_outbox
      where table_name not in ('assessments', 'assessment_items') order by id
    `);
    const children = await db.getAllAsync('select * from children');
    const timeEntries = await db.getAllAsync('select * from time_entries');
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 14 });
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 5 });

    await runMigrations(db);

    expect(await db.getAllAsync('select * from assessments')).toEqual([]);
    expect(await db.getAllAsync('select * from assessment_items')).toEqual([]);
    expect(await db.getAllAsync('select * from sync_outbox order by id')).toEqual(otherOutbox);
    expect(await db.getAllAsync('select * from children')).toEqual(children);
    expect(await db.getAllAsync('select * from time_entries')).toEqual(timeEntries);
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: CURRENT_SCHEMA_VERSION });
    expect(await db.getFirstAsync("select version, name from schema_migrations where name = 'assessment_results'"))
      .toEqual({ version: MIGRATIONS.find(({ name }) => name === 'assessment_results').version, name: 'assessment_results' });
    expect(await db.getFirstAsync('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    expect(await db.getAllAsync('PRAGMA foreign_key_check')).toEqual([]);
  });

  test('assessment_results precedes letter_mastery_current_state', () => {
    expect(MIGRATIONS.find(({ name }) => name === 'assessment_results').version)
      .toBeLessThan(MIGRATIONS.find(({ name }) => name === 'letter_mastery_current_state').version);
  });

  describe('after upgrading', () => {
    beforeEach(async () => runMigrations(db));

    test('stores result columns, defaults derived to an object, and preserves new results on reopening', async () => {
      await insertRun();
      await insertAssessment('result-1', 'run-1');
      expect(await db.getFirstAsync('select * from assessments')).toMatchObject({
        question_code: 'letter_sounds', question_version: '2026.1',
        item_set_id: 'letter_sounds@2026.1.xh', language: 'xh',
        stopped_reason: 'stop_rule', duration_ms: 15000, derived: '{}', battery_run_id: 'run-1',
      });
      await db.runAsync("update assessments set derived = ? where id = 'result-1'", '{"total_correct":3}');
      await expect(db.runAsync("update assessments set derived = null where id = 'result-1'"))
        .rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_NOTNULL' });
      await runMigrations(db);
      expect(await db.getFirstAsync('select id, derived from assessments'))
        .toEqual({ id: 'result-1', derived: '{"total_correct":3}' });
      expect(await db.getAllAsync('PRAGMA foreign_key_check')).toEqual([]);
    });

    test('rejects a duplicate run Question but allows different Questions and standalone results', async () => {
      await insertRun();
      await insertAssessment('result-1', 'run-1');
      await expect(insertAssessment('duplicate', 'run-1'))
        .rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_UNIQUE' });
      await insertAssessment('different-question', 'run-1', 'word_reading');
      await insertAssessment('standalone-1', null);
      await insertAssessment('standalone-2', null);
      expect(await db.getFirstAsync('select count(*) as count from assessments')).toEqual({ count: 4 });
      expect(await db.getAllAsync("PRAGMA index_list('assessments')"))
        .toEqual(expect.arrayContaining([
          expect.objectContaining({ name: 'idx_assessments_run_question', unique: 1, partial: 1 }),
        ]));
    });

    test('accepts a run whose class is absent locally with foreign keys on', async () => {
      expect(await db.getFirstAsync('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
      expect(await db.getFirstAsync("select id from classes where id = 'old-class'")).toBeNull();
      await insertRun({ class_id: 'old-class' });
      expect(await db.getFirstAsync('select class_id from battery_runs')).toEqual({ class_id: 'old-class' });
      expect(await db.getAllAsync('PRAGMA foreign_key_check')).toEqual([]);
    });

    test('restricts deleting the child of a run with foreign keys on', async () => {
      await insertRun();
      expect(await db.getFirstAsync('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
      await expect(db.runAsync("delete from children where id = 'child-1'"))
        .rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_TRIGGER', message: 'FOREIGN KEY constraint failed' });
      expect(await db.getAllAsync("PRAGMA foreign_key_list('battery_runs')"))
        .toEqual(expect.arrayContaining([
          expect.objectContaining({ from: 'child_id', table: 'children', on_delete: 'RESTRICT' }),
          expect.objectContaining({ from: 'programme_id', table: 'programmes' }),
        ]));
      expect(await db.getFirstAsync("select id from children where id = 'child-1'")).not.toBeNull();
    });

    test('restricts deleting a run with a result and rejects an unknown run or programme', async () => {
      await insertRun();
      await insertAssessment('result-1', 'run-1');
      await expect(db.runAsync("delete from battery_runs where id = 'run-1'"))
        .rejects.toMatchObject({ message: 'FOREIGN KEY constraint failed' });
      await expect(insertAssessment('missing-run-result', 'missing-run'))
        .rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
      await expect(insertRun({ id: 'missing-programme-run', programme_id: 'missing-programme' }))
        .rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
    });

    test('defaults started_here to 0, accepts 1, and rejects 2', async () => {
      await insertRun();
      expect(await db.getFirstAsync('select started_here from battery_runs')).toEqual({ started_here: 0 });
      await db.runAsync("update battery_runs set started_here = 1 where id = 'run-1'");
      await expect(db.runAsync("update battery_runs set started_here = 2 where id = 'run-1'"))
        .rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_CHECK' });
      expect(await db.getFirstAsync('select started_here from battery_runs')).toEqual({ started_here: 1 });
    });

    test('validates run status and requires completed_at exactly when completed', async () => {
      const completedAt = '2026-10-20T08:10:00.000Z';
      for (const [status, completed_at] of [
        ['unknown', null], ['completed', null],
        ['in_progress', completedAt], ['abandoned', completedAt],
      ]) {
        await expect(insertRun({ status, completed_at })).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_CHECK' });
      }
      await insertRun();
      await insertRun({ id: 'completed-run', status: 'completed', completed_at: completedAt });
      await insertRun({ id: 'abandoned-run', status: 'abandoned' });
      expect(await db.getFirstAsync('select count(*) as count from battery_runs')).toEqual({ count: 3 });
      expect(await db.getAllAsync("PRAGMA index_info('idx_battery_runs_user_status')"))
        .toEqual([expect.objectContaining({ name: 'user_id' }), expect.objectContaining({ name: 'status' })]);
    });

    test('mirrors the assessment purpose/window rule', async () => {
      const { id: windowId } = await db.getFirstAsync(
        "select id from assessment_windows where academic_year_id = 'year-2026' and window_type = 'baseline'"
      );
      for (const [assessment_purpose, assessment_window_id] of [
        ['official_window', null], ['progress_check', windowId],
        ['other', windowId], ['unknown', null],
      ]) {
        await expect(insertRun({ assessment_purpose, assessment_window_id }))
          .rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_CHECK' });
      }
      await insertRun({ assessment_purpose: 'official_window', assessment_window_id: windowId });
      await insertRun({ id: 'other-run', assessment_purpose: 'other' });
    });

    test('deleteIfNoHistory refuses an unsynced zero-Question run and preserves child, run and outbox', async () => {
      await db.runAsync(`insert into child_ea_assignments (id, child_id, user_id, sync_status)
        values ('delete-delivery', 'child-1', 'user-1', 'synced')`);
      await insertRun({ started_here: 1 });
      await db.runAsync(`
        insert into sync_outbox (id, table_name, record_id, operation, payload, owner_user_id)
        values ('run-outbox', 'battery_runs', 'run-1', 'insert', '{"id":"run-1"}', 'user-1')
      `);
      const child = await db.getFirstAsync("select * from children where id = 'child-1'");
      const run = await db.getFirstAsync("select * from battery_runs where id = 'run-1'");
      const outbox = await db.getAllAsync('select * from sync_outbox');
      expect(await db.getAllAsync('select * from assessments')).toEqual([]);
      expect(run).toMatchObject({ sync_status: 'pending', started_here: 1 });

      await expect(createChildrenRepository({ database: db }).deleteIfNoHistory('child-1')).resolves.toBe(false);

      expect(await db.getFirstAsync("select * from children where id = 'child-1'")).toEqual(child);
      expect(await db.getFirstAsync("select * from battery_runs where id = 'run-1'")).toEqual(run);
      expect(await db.getAllAsync('select * from sync_outbox')).toEqual(outbox);
    });

    test('programmes reference pulls round-trip the default battery code and version', async () => {
      const repository = createReferenceDataRepository({ database: db, tableName: 'programmes' });
      await repository.replaceFromServer([{
        id: 'programme-a', code: 'literacy', name: 'Literacy',
        default_battery_code: 'wela_plus_full', default_battery_version: '2024.1',
      }]);
      expect((await repository.getAll()).find(({ id }) => id === 'programme-a')).toMatchObject({
        default_battery_code: 'wela_plus_full', default_battery_version: '2024.1',
      });
    });
  });
});
