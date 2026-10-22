jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runMigrations } from '../src/db/migrations';
import { createBatteryRunsRepository } from '../src/db/repositories/batteryRunsRepository';
import { createMigratedDatabase } from '../test-support/sqliteRepositoryTestUtils';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { serverRun, seedHistoryData, USER, CHILD, UNKNOWN_CHILD, stamp, uuid } from '../test-support/assessmentHistoryFixtures';

const options = { scope: 'battery_run_history_pull:test', pullState: { cursor: 'saved' }, admit: () => true };
describe('battery run history merge', () => {
  let db;
  let repository;
  const stored = () => db.getFirstAsync('select * from battery_runs where id = ?', serverRun().id);
  const completed = () => serverRun(1, { status: 'completed', completed_at: stamp(50), updated_at: stamp(60) });
  beforeEach(async () => {
    db = await createMigratedDatabase(runMigrations);
    await seedHistoryData(db);
    repository = createBatteryRunsRepository({ database: db });
  });
  afterEach(async () => { await db.closeAsync(); });

  test('in_progress then completed converges', async () => {
    expect(await repository.saveHistoryPage([serverRun()], options)).toEqual({ inserted: 1, advanced: 0 });
    expect(await repository.saveHistoryPage([{ ...completed(), notes: 'Incoming change', language: 'xh' }], options)).toEqual({ inserted: 0, advanced: 1 });
    expect(await stored()).toMatchObject({ status: 'completed', completed_at: stamp(50), updated_at: stamp(60), server_updated_at: stamp(60), started_here: 0 });
    expect(await db.getFirstAsync('select count(*) as n from battery_runs')).toEqual({ n: 1 });
    expect(await db.getFirstAsync('select count(*) as n from sync_outbox')).toEqual({ n: 0 });
    expect(await stored()).toMatchObject({ notes: null, language: 'en', created_at: stamp() });
  });
  test('a stale in_progress never reopens a completed run', async () => {
    await repository.saveHistoryPage([completed()], options);
    const before = await stored();
    await repository.saveHistoryPage([serverRun()], options);
    expect(await stored()).toEqual(before);
  });
  test('a different terminal status never replaces a terminal one', async () => {
    await repository.saveHistoryPage([completed()], options);
    const before = await stored();
    await repository.saveHistoryPage([serverRun(1, { status: 'abandoned', updated_at: stamp(70) })], options);
    expect(await stored()).toEqual(before);
  });
  test('a run started here is never changed by a pull', async () => {
    await repository.startRun({ id: serverRun().id, userId: USER, childId: CHILD, batteryCode: 'wela_plus', batteryVersion: '2026.1', language: 'en' });
    const before = await stored();
    const outbox = await db.getAllAsync('select * from sync_outbox');
    expect(before).toMatchObject({ started_here: 1, sync_status: 'pending' });
    await repository.saveHistoryPage([completed()], options);
    expect(await stored()).toEqual(before);
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual(outbox);
  });
  test('a hydrated run keeps started_here = 0', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-run-history-'));
    let file;
    try {
      file = createBetterSqliteTestDatabase(path.join(dir, 'history.db'));
      await runMigrations(file);
      await seedHistoryData(file);
      await createBatteryRunsRepository({ database: file }).saveHistoryPage([serverRun()], options);
      await file.closeAsync();
      file = createBetterSqliteTestDatabase(path.join(dir, 'history.db'));
      await runMigrations(file);
      expect(await createBatteryRunsRepository({ database: file }).saveHistoryPage([completed()], options)).toEqual({ inserted: 0, advanced: 1 });
      expect(await file.getFirstAsync('select started_here, status from battery_runs')).toEqual({ started_here: 0, status: 'completed' });
    } finally {
      if (file?.isOpen) await file.closeAsync();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  test('an owned run whose class is not on the phone keeps its exact class_id', async () => {
    const classId = uuid(999);
    await repository.saveHistoryPage([serverRun(1, { class_id: classId })], options);
    expect((await stored()).class_id).toBe(classId);
    expect(await db.getFirstAsync('select id from classes where id = ?', classId)).toBeNull();
  });

  test.each([
    { id: 'bad-id' }, { user_id: 'bad-user' }, { child_id: 'bad-child' }, { programme_id: 'bad-programme' },
    { status: 'unknown' }, { status: 'completed', completed_at: null },
    { completed_at: stamp() }, { status: 'abandoned', completed_at: stamp() },
    { started_at: 'not a timestamp' }, { started_at: '2026-02-30T08:00:00Z' }, { language: 'EN' },
  ])('invalid run headers reject the whole page: %j', async (patch) => {
    await expect(repository.saveHistoryPage([serverRun(), serverRun(2, patch)], options))
      .rejects.toMatchObject({ name: 'TypeError', kind: 'query' });
    expect(await db.getAllAsync('select * from battery_runs')).toEqual([]);
    expect(await db.getAllAsync('select * from sync_state')).toEqual([]);
  });

  test('a run page rolls back its references and cursor on cancellation or a failed pull-state resolver', async () => {
    for (const failure of ['cancelled', 'resolver']) {
      let admissions = 0;
      await expect(repository.saveHistoryPage([serverRun(1, { child_id: UNKNOWN_CHILD })], {
        ...options, admit: () => failure !== 'cancelled' || ++admissions === 1,
        pullState: async (txn) => {
          expect(await txn.getFirstAsync('select count(*) as n from battery_runs')).toEqual({ n: 1 });
          if (failure === 'resolver') throw new Error('bound failed');
          return options.pullState;
        },
      })).rejects.toMatchObject(failure === 'cancelled' ? { kind: 'cancelled' } : { message: 'bound failed' });
      expect(await db.getAllAsync('select * from battery_runs')).toEqual([]);
      expect(await db.getAllAsync('select * from sync_state')).toEqual([]);
      expect(await db.getFirstAsync('select id from children where id = ?', UNKNOWN_CHILD)).toBeNull();
    }
  });
});
