jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { v4 as uuid } from 'uuid';
import { runMigrations } from '../src/db/migrations';
import { createMigratedDatabase } from '../test-support/sqliteRepositoryTestUtils';
import { bindTestActor } from '../test-support/actorTestUtils';
import { createAssessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { createHandleServices } from '../src/session/handleServices';

describe('battery runs through real SQLite', () => {
  let db, repository, userId, childId, programmeId, classId;
  beforeEach(async () => {
    db = await createMigratedDatabase(runMigrations);
    userId = uuid(); childId = uuid(); programmeId = uuid(); classId = uuid();
    bindTestActor(db, userId);
    await db.runAsync('insert into programmes (id, code, name) values (?, ?, ?)', programmeId, 'literacy', 'Literacy');
    await db.runAsync(`insert into staff_programme_assignments (id, user_id, programme_id, assigned_at)
      values (?, ?, ?, '2026-01-15T00:00:00.000Z')`, uuid(), userId, programmeId);
    await db.runAsync('insert into children (id, first_name, last_name) values (?, ?, ?)', childId, 'Test', 'Child');
    repository = require('../src/db/repositories/batteryRunsRepository').createBatteryRunsRepository({ database: db });
  });
  afterEach(async () => { await db?.closeAsync(); jest.useRealTimers(); });
  const start = (args = {}) => repository.startRun({
    id: uuid(), userId, childId, classId, batteryCode: 'wela_plus', batteryVersion: '2026.1', language: 'en', ...args,
  });
  const outbox = async () => (await db.getAllAsync("select * from sync_outbox where table_name = 'battery_runs'"))
    .map(row => ({ ...row, payload: JSON.parse(row.payload) }));
  const expectHeader = (payload, id, status) => {
    expect(payload).toMatchObject({
      id, user_id: userId, child_id: childId, programme_id: programmeId, class_id: classId,
      battery_code: 'wela_plus', battery_version: '2026.1', language: 'en',
      assessment_purpose: 'progress_check', assessment_window_id: null, status,
      started_at: expect.any(String), created_at: expect.any(String), notes: null,
      completed_at: status === 'completed' ? expect.any(String) : null,
    });
    expect(payload).not.toHaveProperty('started_here');
    expect(payload).not.toHaveProperty('row_version');
  };

  test('startRun saves the full pending header with started_here and exact ISO start time', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-20T23:58:59.123Z'));
    const id = uuid();
    await start({ id });
    const run = await repository.getRunWithResults(id);
    expect(run).toMatchObject({ id, status: 'in_progress', started_here: 1, sync_status: 'pending', results: [] });
    const [row] = await outbox();
    expect(row).toMatchObject({ id: `battery_runs:${id}:insert`, operation: 'insert', owner_user_id: userId });
    expectHeader(row.payload, id, 'in_progress');
    expect(row.payload.started_at).toBe('2026-10-20T23:58:59.123Z');
    expect(await repository.getRunWithResults(uuid())).toBeNull();
  });

  test.each(['pending', 'failed', 'in_flight', 'terminal'])('finalize coalesces the existing %s insert into one completed payload', async status => {
    const id = uuid(); await start({ id });
    const initial = (await outbox())[0];
    await db.runAsync("update sync_outbox set status = ?, retry_count = 3, last_error = 'retry'", status);
    await repository.finalizeRun(id);
    const rows = await outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: `battery_runs:${id}:insert`, operation: 'insert', status: 'pending' });
    expectHeader(rows[0].payload, id, 'completed');
    expect(rows[0].payload.started_at).toBe(initial.payload.started_at);
    expect((await repository.getRunWithResults(id)).completed_at).toBe(rows[0].payload.completed_at);
  });

  test('abandon coalesces before upload and leaves completed_at null', async () => {
    const id = uuid(); await start({ id });
    await repository.abandonRun(id);
    const [row] = await outbox();
    expectHeader(row.payload, id, 'abandoned');
    expect(row.id).toBe(`battery_runs:${id}:insert`);
    expect(await repository.getRunWithResults(id)).toMatchObject({ status: 'abandoned', completed_at: null });
  });

  test.each(['finalizeRun', 'abandonRun'])('%s uses :update after the insert was acknowledged', async method => {
    const id = uuid(); await start({ id });
    const startedAt = (await outbox())[0].payload.started_at;
    await db.runAsync('delete from sync_outbox where id = ?', `battery_runs:${id}:insert`);
    await db.runAsync("update battery_runs set sync_status = 'synced' where id = ?", id);
    await repository[method](id);
    const rows = await outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: `battery_runs:${id}:update`, operation: 'update' });
    expectHeader(rows[0].payload, id, method === 'finalizeRun' ? 'completed' : 'abandoned');
    expect(rows[0].payload.started_at).toBe(startedAt);
    expect((await repository.getRunWithResults(id)).sync_status).toBe('pending');
  });

  test.each(['finalizeRun', 'abandonRun'])('%s refuses a run started elsewhere without changing it', async method => {
    const id = uuid(); await start({ id });
    await db.runAsync('update battery_runs set started_here = 0 where id = ?', id);
    const before = await outbox();
    await expect(repository[method](id)).rejects.toThrow(/started|installation|device/i);
    expect(await outbox()).toEqual(before);
    expect((await repository.getRunWithResults(id)).status).toBe('in_progress');
  });

  test.each(['finalizeRun', 'abandonRun'])('%s refuses completed, abandoned and missing runs', async method => {
    for (const first of ['finalizeRun', 'abandonRun']) {
      const id = uuid(); await start({ id }); await repository[first](id);
      const before = await outbox();
      await expect(repository[method](id)).rejects.toThrow(/in_progress|terminal|finished/i);
      expect(await outbox()).toEqual(before);
    }
    await expect(repository[method](uuid())).rejects.toThrow(/not found/i);
  });

  test('start refuses a duplicate id rather than overwriting immutable run identity', async () => {
    const id = uuid(); await start({ id });
    const before = await outbox();
    await expect(start({ id, language: 'xh' })).rejects.toThrow();
    expect(await outbox()).toEqual(before);
    expect((await repository.getRunWithResults(id)).language).toBe('en');
  });

  test('start requires an active programme and fails atomically when outbox insertion fails', async () => {
    await db.runAsync("update staff_programme_assignments set ended_at = '2026-10-20'");
    await expect(start()).rejects.toThrow(/No active programme assignment/);
    expect(await db.getAllAsync('select * from battery_runs')).toEqual([]);
    await db.runAsync('update staff_programme_assignments set ended_at = null');
    await db.execAsync("create trigger fail_run before insert on sync_outbox begin select raise(abort, 'outbox unavailable'); end");
    await expect(start()).rejects.toMatchObject({
      code: 'SQLITE_CONSTRAINT_TRIGGER', message: 'outbox unavailable',
    });
    expect(await db.getAllAsync('select * from battery_runs')).toEqual([]);
    expect(await outbox()).toEqual([]);
  });

  test('finalization rolls back if refreshing the outbox fails', async () => {
    const id = uuid(); await start({ id });
    const before = await outbox();
    await db.execAsync("create trigger fail_run before insert on sync_outbox begin select raise(abort, 'outbox unavailable'); end");
    await expect(repository.finalizeRun(id)).rejects.toMatchObject({
      code: 'SQLITE_CONSTRAINT_TRIGGER', message: 'outbox unavailable',
    });
    expect(await repository.getRunWithResults(id)).toMatchObject({ status: 'in_progress', completed_at: null });
    expect(await outbox()).toEqual(before);
  });

  test('unfinished queries are user and active-programme scoped and exclude terminal or other-installation runs', async () => {
    const mine = uuid(), otherInstall = uuid(), terminal = uuid(), otherProgramme = uuid(), otherUser = uuid();
    for (const id of [mine, otherInstall, terminal, otherProgramme, otherUser]) await start({ id });
    await db.runAsync('update battery_runs set started_here = 0 where id = ?', otherInstall);
    await repository.abandonRun(terminal);
    const programmeB = uuid();
    await db.runAsync('insert into programmes (id, code, name) values (?, ?, ?)', programmeB, 'other', 'Other');
    await db.runAsync('update battery_runs set programme_id = ? where id = ?', programmeB, otherProgramme);
    await db.runAsync('update battery_runs set user_id = ? where id = ?', uuid(), otherUser);
    expect((await repository.getUnfinishedRunsForUser(userId)).map(r => r.id)).toEqual([mine]);
    expect((await repository.getUnfinishedRunForChild({ userId, childId })).id).toBe(mine);
    expect(await repository.getUnfinishedRunForChild({ userId, childId: uuid() })).toBeNull();
    await db.runAsync("update staff_programme_assignments set ended_at = '2026-10-20'");
    expect(await repository.getUnfinishedRunsForUser(userId)).toEqual([]);
  });

  test('getRunWithResults returns only this run, including skipped decisions and ordered hydrated items', async () => {
    const id = uuid(); await start({ id });
    const assessments = createAssessmentsRepository({ database: db });
    const result = {
      question_code: 'letter_sounds', question_version: '2026.1', item_set_id: 'letter_sounds@2026.1.en',
      language: 'en', stopped_reason: 'completed', duration_ms: 2000,
      derived: { total_correct: 1, total_attempted: 2, percent: 50, last_attempted_position: 2 },
      items: [
        { position: 2, item_key: 'b', prompt: 'b', is_correct: false, metadata: { reached: false } },
        { position: 0, item_key: 'a', prompt: 'a', is_correct: true },
      ],
    };
    const first = uuid(), skipped = uuid();
    await assessments.saveQuestionResult({ assessmentId: first, userId, childId, batteryRunId: id, result });
    await assessments.saveQuestionResult({ assessmentId: skipped, userId, childId, batteryRunId: id,
      result: { ...result, question_code: 'word_reading', stopped_reason: 'skipped_tired', items: [] } });
    await assessments.saveQuestionResult({ assessmentId: uuid(), userId, childId, result });
    const run = await repository.getRunWithResults(id);
    expect(run.results).toHaveLength(2);
    const read = run.results.find(r => r.id === first);
    expect(read.derived).toEqual(result.derived);
    expect(read.items.map(i => [i.position, i.is_correct, i.metadata])).toEqual([[0, true, {}], [2, false, { reached: false }]]);
    expect(run.results.find(r => r.id === skipped).items).toEqual([]);
    // Historical run reads retain the run's programme after the EA changes programme.
    await db.runAsync("update staff_programme_assignments set ended_at = '2026-10-20'");
    expect((await repository.getRunWithResults(id)).results).toEqual(run.results);
  });

  test('handle services expose a battery repository bound to the same database', async () => {
    const handle = { userId, getReader: async () => db, withTransaction: task => db.withExclusiveTransactionAsync(task),
      isOpen: () => true, isCurrent: () => true, onClose: () => {}, dataClient: {}, enqueueRequest: task => task() };
    const { repositories } = createHandleServices(handle);
    const id = uuid();
    await repositories.batteryRuns.startRun({ id, userId, childId, batteryCode: 'wela_plus', batteryVersion: '2026.1', language: 'en' });
    expect((await repository.getRunWithResults(id)).id).toBe(id);
  });
});
