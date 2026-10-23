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
  const resultFor = (code = 'a') => ({
    question_code: code, question_version: '1.0', item_set_id: `${code}@1.0.en`,
    language: 'en', stopped_reason: 'completed', duration_ms: 1,
    derived: { total_correct: 1, total_attempted: 1, percent: 100, last_attempted_position: 0 },
    items: [{ position: 0, item_key: 'one', prompt: 'one', is_correct: true }],
  });
  const decide = async (runId, codes) => {
    const run = await db.getFirstAsync('select * from battery_runs where id = ?', runId);
    const assessments = createAssessmentsRepository({ database: db });
    for (const code of codes) {
      await assessments.saveQuestionResult({ assessmentId: uuid(), userId: run.user_id,
        childId: run.child_id, batteryRunId: runId, result: {
          ...resultFor(code), stopped_reason: 'skipped_tired', duration_ms: 0, items: [],
          derived: { total_correct: 0, total_attempted: 0, percent: 0, last_attempted_position: null },
        } });
    }
  };
  const failure = async task => {
    try { await task(); } catch (error) { return error; }
    throw new Error('Expected repository call to refuse');
  };
  const snapshot = () => Promise.all(['battery_runs', 'assessments', 'assessment_items', 'sync_outbox']
    .map(table => db.getAllAsync(`select * from ${table} order by id`)));
  const addChild = async () => {
    const id = uuid();
    await db.runAsync('insert into children (id, first_name, last_name) values (?, ?, ?)', id, 'Other', 'Child');
    return id;
  };
  const finish = (method, id) => repository[method](id, { questionCodes: ['a'] });
  const save = args => createAssessmentsRepository({ database: db }).saveQuestionResult({
    assessmentId: uuid(), userId, childId, result: resultFor(), ...args,
  });
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
    await decide(id, ['a']);
    const initial = (await outbox())[0];
    await db.runAsync("update sync_outbox set status = ?, retry_count = 3, last_error = 'retry'", status);
    await repository.finalizeRun(id, { questionCodes: ['a'] });
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
    if (method === 'finalizeRun') await decide(id, ['a']);
    const startedAt = (await outbox())[0].payload.started_at;
    await db.runAsync('delete from sync_outbox where id = ?', `battery_runs:${id}:insert`);
    await db.runAsync("update battery_runs set sync_status = 'synced' where id = ?", id);
    await finish(method, id);
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
    expect((await failure(() => finish(method, id))).message).toMatch(/started|installation|device/i);
    expect(await outbox()).toEqual(before);
    expect((await repository.getRunWithResults(id)).status).toBe('in_progress');
  });

  test.each(['finalizeRun', 'abandonRun'])('%s refuses completed, abandoned and missing runs', async method => {
    for (const first of ['finalizeRun', 'abandonRun']) {
      const id = uuid(); await start({ id });
      if (first === 'finalizeRun') await decide(id, ['a']);
      await finish(first, id);
      const before = await outbox();
      expect((await failure(() => finish(method, id))).message).toMatch(/in_progress|terminal|finished/i);
      expect(await outbox()).toEqual(before);
    }
    expect((await failure(() => finish(method, uuid()))).message).toMatch(/not found/i);
  });

  test('start refuses a duplicate id rather than overwriting immutable run identity', async () => {
    const id = uuid(); await start({ id });
    const before = await outbox();
    expect(await failure(() => start({ id, language: 'xh' }))).toBeInstanceOf(Error);
    expect(await outbox()).toEqual(before);
    expect((await repository.getRunWithResults(id)).language).toBe('en');
  });

  test('start requires an active programme and fails atomically when outbox insertion fails', async () => {
    await db.runAsync("update staff_programme_assignments set ended_at = '2026-10-20'");
    expect((await failure(() => start())).message).toMatch(/No active programme assignment/);
    expect(await db.getAllAsync('select * from battery_runs')).toEqual([]);
    await db.runAsync('update staff_programme_assignments set ended_at = null');
    await db.execAsync("create trigger fail_run before insert on sync_outbox begin select raise(abort, 'outbox unavailable'); end");
    expect(await failure(() => start())).toMatchObject({
      code: 'SQLITE_CONSTRAINT_TRIGGER', message: 'outbox unavailable',
    });
    expect(await db.getAllAsync('select * from battery_runs')).toEqual([]);
    expect(await outbox()).toEqual([]);
  });

  test('finalization rolls back if refreshing the outbox fails', async () => {
    const id = uuid(); await start({ id });
    await decide(id, ['a']);
    const before = await outbox();
    await db.execAsync("create trigger fail_run before insert on sync_outbox begin select raise(abort, 'outbox unavailable'); end");
    expect(await failure(() => repository.finalizeRun(id, { questionCodes: ['a'] }))).toMatchObject({
      code: 'SQLITE_CONSTRAINT_TRIGGER', message: 'outbox unavailable',
    });
    expect(await repository.getRunWithResults(id)).toMatchObject({ status: 'in_progress', completed_at: null });
    expect(await outbox()).toEqual(before);
  });

  test('unfinished queries are user and active-programme scoped and exclude terminal or other-installation runs', async () => {
    const mine = uuid(), otherInstall = uuid(), terminal = uuid(), otherProgramme = uuid(), otherUser = uuid();
    for (const id of [mine, otherInstall, terminal, otherProgramme, otherUser]) {
      await start({ id, childId: id === mine ? childId : await addChild() });
    }
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

  test('history lists all own active-programme runs, including remote and empty runs, and counts stored Questions including skips', async () => {
    const completed = uuid(), remote = uuid(), empty = uuid(), otherProgrammeRun = uuid(), otherUserRun = uuid();
    for (const id of [completed, remote, empty, otherProgrammeRun, otherUserRun]) {
      await start({ id, childId: id === completed ? childId : await addChild() });
    }
    await repository.abandonRun(empty);
    await db.runAsync('update battery_runs set started_here = 0 where id = ?', remote);
    const assessments = createAssessmentsRepository({ database: db });
    await assessments.saveQuestionResult({ assessmentId: uuid(), userId, childId, batteryRunId: completed, result: {
      question_code: 'letter_sounds', question_version: '2026.1', item_set_id: 'letter_sounds@2026.1.en',
      language: 'en', stopped_reason: 'skipped_tired', duration_ms: 0,
      derived: { total_correct: 0, total_attempted: 0, percent: 0, last_attempted_position: null }, items: [],
    } });
    await repository.finalizeRun(completed, { questionCodes: ['letter_sounds'] });
    const otherProgrammeId = uuid();
    await db.runAsync('insert into programmes (id, code, name) values (?, ?, ?)', otherProgrammeId, 'other', 'Other');
    await db.runAsync('update battery_runs set programme_id = ? where id = ?', otherProgrammeId, otherProgrammeRun);
    await db.runAsync('update battery_runs set user_id = ? where id = ?', uuid(), otherUserRun);
    const runs = await repository.getRunsForUser(userId);
    expect(runs.map(run => run.id).sort()).toEqual([completed, remote, empty].sort());
    expect(runs.find(run => run.id === completed)).toMatchObject({ status: 'completed', question_count: 1 });
    expect(runs.find(run => run.id === remote)).toMatchObject({ status: 'in_progress', question_count: 0, started_here: 0 });
    expect(runs.find(run => run.id === empty)).toMatchObject({ status: 'abandoned', question_count: 0 });
    await db.runAsync("update staff_programme_assignments set ended_at = '2026-10-20'");
    expect(await repository.getRunsForUser(userId)).toEqual([]);
  });

  test('handle services expose a battery repository bound to the same database', async () => {
    const handle = { userId, getReader: async () => db, withTransaction: task => db.withExclusiveTransactionAsync(task),
      isOpen: () => true, isCurrent: () => true, onClose: () => {}, dataClient: {}, enqueueRequest: task => task() };
    const { repositories } = createHandleServices(handle);
    const id = uuid();
    await repositories.batteryRuns.startRun({ id, userId, childId, batteryCode: 'wela_plus', batteryVersion: '2026.1', language: 'en' });
    expect((await repository.getRunWithResults(id)).id).toBe(id);
  });

  test('a second unfinished run for the same child is refused with the existing run id', async () => {
    const first = await start();
    const before = await snapshot();
    const error = await failure(() => start());
    expect(error.code).toBe('UNFINISHED_RUN_EXISTS');
    expect(error.runId).toBe(first.id);
    expect(await snapshot()).toEqual(before);
    expect(await outbox()).toHaveLength(1);
    await start({ childId: await addChild() });
    await repository.abandonRun(first.id);
    const replacement = await start();
    expect((await repository.getRunWithResults(replacement.id)).status).toBe('in_progress');
  });

  test.each(['user', 'programme', 'installation'])('unfinished-run check excludes a different %s', async scope => {
    const first = await start();
    if (scope === 'user') await db.runAsync('update battery_runs set user_id = ? where id = ?', uuid(), first.id);
    if (scope === 'programme') {
      const other = uuid();
      await db.runAsync('insert into programmes (id, code, name) values (?, ?, ?)', other, 'other', 'Other');
      await db.runAsync('update battery_runs set programme_id = ? where id = ?', other, first.id);
    }
    if (scope === 'installation') await db.runAsync('update battery_runs set started_here = 0 where id = ?', first.id);
    const second = await start();
    expect(second.id).not.toBe(first.id);
    expect(await outbox()).toHaveLength(2);
  });

  test('two concurrent starts produce only one unfinished run and one outbox header', async () => {
    const results = await Promise.allSettled([start(), start()]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const refused = results.find(result => result.status === 'rejected').reason;
    expect(refused.code).toBe('UNFINISHED_RUN_EXISTS');
    expect(refused.runId).toBe(results.find(result => result.status === 'fulfilled').value.id);
    expect(await db.getAllAsync('select * from battery_runs')).toHaveLength(1);
    expect(await outbox()).toHaveLength(1);
  });

  test('startRun with abandonRunId abandons and starts atomically', async () => {
    const old = await start();
    const next = await start({ abandonRunId: old.id });
    expect(await repository.getRunWithResults(old.id)).toMatchObject({ status: 'abandoned', completed_at: null });
    expect(await repository.getRunWithResults(next.id)).toMatchObject({ status: 'in_progress', started_here: 1 });
    const rows = await outbox();
    expect(rows).toHaveLength(2);
    expectHeader(rows.find(row => row.record_id === old.id).payload, old.id, 'abandoned');
    expectHeader(rows.find(row => row.record_id === next.id).payload, next.id, 'in_progress');
  });

  test('startRun with abandonRunId rolls both back when the new run\'s outbox insert fails', async () => {
    const old = await start();
    const id = uuid();
    const before = await snapshot();
    await db.execAsync(`create trigger fail_new_run before insert on sync_outbox
      when NEW.id = 'battery_runs:${id}:insert'
      begin
        select case when (select status from battery_runs where id = '${old.id}') <> 'abandoned'
          then raise(abort, 'old run was not abandoned first') end;
        select raise(abort, 'new run outbox unavailable');
      end`);
    const error = await failure(() => start({ id, abandonRunId: old.id }));
    expect(error.code).toBe('SQLITE_CONSTRAINT_TRIGGER');
    expect(error.message).toBe('new run outbox unavailable');
    expect(await snapshot()).toEqual(before);
    expect(await repository.getRunWithResults(old.id)).toMatchObject({ status: 'in_progress' });
    expect(await repository.getRunWithResults(id)).toBeNull();
  });

  test('abandonRunId for another child is refused and nothing changes', async () => {
    const old = await start({ childId: await addChild() });
    const before = await snapshot();
    expect(await failure(() => start({ abandonRunId: old.id }))).toBeInstanceOf(Error);
    expect(await snapshot()).toEqual(before);
  });

  test.each(['missing', 'pulled', 'terminal'])('replacement refuses a %s abandonRunId without writes', async kind => {
    const old = await start();
    if (kind === 'pulled') await db.runAsync('update battery_runs set started_here = 0 where id = ?', old.id);
    if (kind === 'terminal') await repository.abandonRun(old.id);
    const before = await snapshot();
    expect(await failure(() => start({ abandonRunId: kind === 'missing' ? uuid() : old.id }))).toBeInstanceOf(Error);
    expect(await snapshot()).toEqual(before);
  });

  test('replacement rollback also restores the old run when another unfinished run still blocks', async () => {
    const old = await start();
    const blocker = uuid();
    await db.runAsync(`insert into battery_runs
      (id, user_id, child_id, programme_id, battery_code, battery_version, language, started_at, started_here)
      values (?, ?, ?, ?, 'test', '1', 'en', '2026-10-20T00:00:00.000Z', 1)`, blocker, userId, childId, programmeId);
    const before = await snapshot();
    const error = await failure(() => start({ abandonRunId: old.id }));
    expect(error.code).toBe('UNFINISHED_RUN_EXISTS');
    expect(error.runId).toBe(blocker);
    expect(await snapshot()).toEqual(before);
  });

  test('finalizeRun refuses an incomplete run and finalizes a complete one', async () => {
    const { id } = await start();
    await decide(id, ['a', 'b']);
    const other = await start({ childId: await addChild() });
    await decide(other.id, ['c']);
    const before = await snapshot();
    const error = await failure(() => repository.finalizeRun(id, { questionCodes: ['a', 'b', 'c'] }));
    expect(error.code).toBe('RUN_INCOMPLETE');
    expect(await snapshot()).toEqual(before);
    await repository.finalizeRun(id, { questionCodes: ['a', 'b'] });
    expect(await repository.getRunWithResults(id)).toMatchObject({ status: 'completed', results: expect.any(Array) });
    expectHeader((await outbox()).find(row => row.record_id === id).payload, id, 'completed');
  });

  test.each([undefined, null, {}, { questionCodes: [] }, { questionCodes: 'a' }])(
    'finalizeRun requires a non-empty questionCodes array (%p)', async options => {
      const { id } = await start();
      const before = await snapshot();
      expect(await failure(() => repository.finalizeRun(id, options))).toBeInstanceOf(TypeError);
      expect(await snapshot()).toEqual(before);
    },
  );

  test('getUnfinishedRunsForUser counts decided Questions', async () => {
    const first = await start();
    await decide(first.id, ['a', 'b']);
    const second = await start({ childId: await addChild() });
    const rows = await repository.getUnfinishedRunsForUser(userId);
    expect(rows.find(row => row.id === first.id).question_count).toBe(2);
    expect(rows.find(row => row.id === second.id).question_count).toBe(0);
  });

  test.each([
    ['abandoned run', 'abandoned'], ['completed run', 'completed'], ['pulled run', 'started_here'],
    ['another child', 'child'], ['missing run', 'missing'], ['another user', 'user'],
  ])('saveQuestionResult refuses a %s with RUN_NOT_WRITABLE and writes nothing', async (_label, kind) => {
    const { id } = await start();
    if (kind === 'abandoned' || kind === 'completed') await db.runAsync(
      'update battery_runs set status = ?, completed_at = ? where id = ?',
      kind, kind === 'completed' ? '2026-10-23T00:00:00.000Z' : null, id,
    );
    if (kind === 'started_here') await db.runAsync('update battery_runs set started_here = 0 where id = ?', id);
    if (kind === 'user') await db.runAsync('update battery_runs set user_id = ? where id = ?', uuid(), id);
    const otherChild = kind === 'child' ? await addChild() : childId;
    const before = await snapshot();
    const error = await failure(() => save({ batteryRunId: kind === 'missing' ? uuid() : id, childId: otherChild }));
    expect(error.code).toBe('RUN_NOT_WRITABLE');
    expect(await snapshot()).toEqual(before);
    expect(await db.getAllAsync('select * from assessments')).toEqual([]);
    expect(await db.getAllAsync('select * from assessment_items')).toEqual([]);
    expect(await db.getAllAsync("select * from sync_outbox where table_name = 'assessments'")).toEqual([]);
  });

  test.each(['ended', 'changed'])('saveQuestionResult refuses with RUN_NOT_WRITABLE when the programme assignment %s after start', async kind => {
    const { id } = await start();
    await db.runAsync("update staff_programme_assignments set ended_at = '2026-10-23'");
    if (kind === 'changed') {
      const other = uuid();
      await db.runAsync('insert into programmes (id, code, name) values (?, ?, ?)', other, 'other', 'Other');
      await db.runAsync(`insert into staff_programme_assignments (id, user_id, programme_id, assigned_at)
        values (?, ?, ?, '2026-10-23')`, uuid(), userId, other);
    }
    const before = await snapshot();
    const error = await failure(() => save({ batteryRunId: id }));
    expect(error.code).toBe('RUN_NOT_WRITABLE');
    expect(await snapshot()).toEqual(before);
    expect(await db.getAllAsync('select * from assessments')).toEqual([]);
    expect(await db.getAllAsync('select * from assessment_items')).toEqual([]);
    expect(await db.getAllAsync("select * from sync_outbox where table_name = 'assessments'")).toEqual([]);
  });

  test('the run guard precedes both duplicate checks and leaves standalone programme refusal unchanged', async () => {
    const { id } = await start();
    const assessmentId = uuid();
    await save({ assessmentId, batteryRunId: id });
    const original = await db.getFirstAsync('select * from assessments where id = ?', assessmentId);
    expect(original.programme_id).toBe(programmeId);
    expect((await failure(() => save({ assessmentId, batteryRunId: id }))).code).toBe('ASSESSMENT_ALREADY_SAVED');
    expect((await failure(() => save({ batteryRunId: id }))).code).toBe('QUESTION_ALREADY_DECIDED');
    await db.runAsync("update staff_programme_assignments set ended_at = '2026-10-23'");
    const before = await snapshot();
    for (const args of [{ assessmentId, batteryRunId: id }, { batteryRunId: id }]) {
      expect((await failure(() => save(args))).code).toBe('RUN_NOT_WRITABLE');
    }
    const standalone = await failure(() => save({}));
    expect(standalone.code).toBeUndefined();
    expect(standalone.message).toMatch(/No active programme assignment/);
    expect(await snapshot()).toEqual(before);
  });
});
