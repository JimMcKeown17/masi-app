jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {},
}));

import { PostgrestClient } from '@supabase/postgrest-js';
import { v4 as uuid } from 'uuid';
import { createFamilySyncFixture } from '../test-support/assessmentFamilySyncTestUtils';
import { createClassEaAssignmentsRepository } from '../src/db/repositories/classEaAssignmentsRepository';
import { AUTHENTICATED_DENIAL_MARKER } from '../src/services/offlineSync';

global.__MASI_NO_DEFAULT_HANDLE__ = true;

const CAPTURE_TIME = '2026-10-23T10:00:00.000Z';
const GRANTED_AT = '2026-01-15T00:00:00.000Z';
const OUTSIDE_WINDOW_ERROR = 'result is outside every grant window';

// Real postgrest-js parses these replies; no request leaves this fake transport.
const reply = (data, status = 200) => ({
  ok: status >= 200 && status < 300, status,
  statusText: status === 200 ? 'OK' : 'Refused',
  headers: { get: () => null },
  text: async () => JSON.stringify(data),
});

describe('control-child uploads through the real SQLite outbox and error classifier', () => {
  let f, classId, grantId, grants;

  beforeEach(async () => {
    jest.useFakeTimers({ now: new Date(CAPTURE_TIME), doNotFake: ['nextTick', 'setImmediate'] });
    f = await createFamilySyncFixture();
    classId = uuid();
    grantId = uuid();
    const schoolId = uuid(), yearId = uuid(), headOfficeId = uuid();
    await f.db.runAsync('insert into schools (id, name) values (?, ?)', schoolId, 'Control child school');
    await f.db.runAsync(`insert into academic_years (id, label, starts_on, ends_on, is_active)
      values (?, '2026', '2026-01-01', '2026-12-31', 1)`, yearId);
    await f.db.runAsync(`insert into classes (id, school_id, academic_year_id, name, grade, home_language, created_by, sync_status)
      values (?, ?, ?, 'Class A', '1', 'English', ?, 'synced')`, classId, schoolId, yearId, headOfficeId);
    await f.db.runAsync("update children set class_id = ?, created_by = ?, sync_status = 'synced' where id = ?",
      classId, headOfficeId, f.childId);
    await f.db.runAsync(`insert into child_class_memberships
      (id, child_id, class_id, academic_year_id, enrolled_at, created_by, sync_status)
      values (?, ?, ?, ?, ?, ?, 'synced')`, uuid(), f.childId, classId, yearId, GRANTED_AT, headOfficeId);
    grants = createClassEaAssignmentsRepository({ database: f.db });
  });

  afterEach(async () => {
    await f?.db.closeAsync();
    jest.useRealTimers();
  });

  const saveGrant = (overrides = {}) => grants.save({
    id: grantId, class_id: classId, ea_user_id: f.userId, programme_id: f.programmeId,
    assigned_at: GRANTED_AT, unassigned_at: null, created_by: f.userId,
    ...overrides,
  });
  const queued = (table, id) => f.outbox.getById(`${table}:${id}:insert`);
  const expectControlOnly = async () => {
    expect(await f.db.getAllAsync('select * from child_ea_assignments where child_id = ?', f.childId)).toEqual([]);
    expect(await f.db.getAllAsync('select * from child_programme_enrollments where child_id = ?', f.childId)).toEqual([]);
    expect(await f.db.getAllAsync('select * from child_group_memberships where child_id = ?', f.childId)).toEqual([]);
    expect((await f.db.getFirstAsync('select created_by from children where id = ?', f.childId)).created_by).not.toBe(f.userId);
  };
  const expectFamilySynced = async id => {
    expect(await f.read(id)).toMatchObject({ sync_status: 'synced', last_sync_error: null });
    const items = await f.items(id);
    expect(items).toHaveLength(3);
    expect(items.every(item => item.sync_status === 'synced' && item.last_sync_error === null)).toBe(true);
    expect(await queued('assessments', id)).toBeNull();
  };

  const fakeServer = ({ assignmentOnServer = false, outsideWindows = false } = {}) => {
    const state = { allowGrantUpload: false, assignmentOnServer, outsideWindows };
    const transport = jest.fn(async (url, init) => {
      const path = new URL(url).pathname;
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body);
      if (path === '/rest/v1/class_ea_assignments') {
        const assignments = Array.isArray(body) ? body : [body];
        expect(assignments).toHaveLength(1);
        expect(assignments[0]).toMatchObject({
          class_id: classId, ea_user_id: f.userId, programme_id: f.programmeId, unassigned_at: null,
        });
        if (!state.allowGrantUpload) return reply({ code: 'NETWORK', message: 'assignment upload offline' }, 503);
        state.assignmentOnServer = true;
        return reply([]);
      }
      expect(['/rest/v1/rpc/submit_assessment', '/rest/v1/rpc/save_battery_run']).toContain(path);
      const record = body.p_assessment || body.p_run;
      expect(record).toMatchObject({ child_id: f.childId, user_id: f.userId, programme_id: f.programmeId });
      if (state.outsideWindows || !state.assignmentOnServer) return reply({
        code: '42501', message: state.outsideWindows ? OUTSIDE_WINDOW_ERROR : 'class assignment not on server',
        details: null, hint: null,
      }, 403);
      return reply('inserted');
    });
    return {
      state, transport,
      client: new PostgrestClient('http://127.0.0.1:55432/rest/v1', { fetch: transport }),
      rpcCalls: () => transport.mock.calls.filter(([url]) => new URL(url).pathname.includes('/rpc/')),
    };
  };

  test('a pending class grant keeps a 42501 assessment retriable, then its acknowledgement releases the family', async () => {
    await saveGrant();
    const { id } = await f.save();
    await expectControlOnly();
    expect((await f.db.getAllAsync('select table_name from sync_outbox')).map(row => row.table_name).sort())
      .toEqual(['assessments', 'class_ea_assignments']);
    const server = fakeServer();
    const engine = f.engine(server.client);

    expect(await engine.syncAll()).toMatchObject({ totalSynced: 0, totalTerminal: 0, totalRetriable: 2 });
    expect(server.rpcCalls()).toHaveLength(1);
    expect(await queued('class_ea_assignments', grantId)).toMatchObject({ status: 'failed', retry_count: 1 });
    expect(await queued('assessments', id)).toMatchObject({
      status: 'failed', retry_count: 1, last_error: 'class assignment not on server',
      next_retry_at: expect.any(String),
    });
    expect((await queued('assessments', id)).last_error).not.toContain(AUTHENTICATED_DENIAL_MARKER);
    expect(Date.parse((await queued('assessments', id)).next_retry_at)).toBeGreaterThan(Date.now());
    expect(await f.read(id)).toMatchObject({ sync_status: 'failed' });
    expect((await f.items(id)).every(item => item.sync_status !== 'synced')).toBe(true);
    expect(await f.db.getAllAsync("select id from sync_outbox where status = 'terminal'")).toEqual([]);

    server.state.allowGrantUpload = true;
    // Ordinary passes respect backoff; manual Sync Now explicitly bypasses it.
    expect(await engine.syncAll()).toMatchObject({ totalSynced: 0, totalFailed: 0 });
    expect(server.rpcCalls()).toHaveLength(1);
    const recovered = await engine.syncAll({ force: true });
    expect(recovered.failedRecords).toEqual([]);
    expect(recovered).toMatchObject({ totalSynced: 2, totalFailed: 0 });
    expect((await grants.getAll())[0]).toMatchObject({ id: grantId, sync_status: 'synced' });
    expect(server.rpcCalls()).toHaveLength(2);
    await expectFamilySynced(id);
    expect(await f.db.getAllAsync('select * from sync_outbox')).toEqual([]);
    await expectControlOnly();
  });

  test('a pending class grant keeps a 42501 run retriable and recovery uploads the run before its Question', async () => {
    await saveGrant();
    const { id: runId } = await f.start({ classId });
    const { id: resultId } = await f.save(3, { batteryRunId: runId });
    await expectControlOnly();
    const server = fakeServer();
    const engine = f.engine(server.client);

    const denied = await engine.syncAll();
    expect(denied).toMatchObject({ totalSynced: 0, totalTerminal: 0, totalRetriable: 2 });
    expect(denied.tableResults.assessments).toMatchObject({ skipped: true, skippedDependency: 'battery_runs' });
    expect(server.rpcCalls()).toHaveLength(1);
    expect(await queued('battery_runs', runId)).toMatchObject({
      status: 'failed', retry_count: 1, last_error: 'class assignment not on server', next_retry_at: expect.any(String),
    });
    expect(await f.runs.getRunWithResults(runId)).toMatchObject({ sync_status: 'failed' });
    expect(await queued('assessments', resultId)).toMatchObject({ status: 'pending', retry_count: 0 });
    expect((await f.items(resultId)).every(item => item.sync_status !== 'synced')).toBe(true);
    expect(await f.db.getAllAsync("select id from sync_outbox where status = 'terminal'")).toEqual([]);

    server.state.allowGrantUpload = true;
    expect(await engine.syncAll({ force: true })).toMatchObject({ totalSynced: 3, totalFailed: 0 });
    expect((await grants.getAll())[0]).toMatchObject({ id: grantId, sync_status: 'synced' });
    expect(server.rpcCalls().map(([url]) => new URL(url).pathname.split('/').pop()))
      .toEqual(['save_battery_run', 'save_battery_run', 'submit_assessment']);
    expect(await f.runs.getRunWithResults(runId)).toMatchObject({ sync_status: 'synced', last_sync_error: null });
    await expectFamilySynced(resultId);
    expect(await f.db.getAllAsync('select * from sync_outbox')).toEqual([]);
    await expectControlOnly();
  });

  test.each(['assessments', 'battery_runs'])('a 42501 for %s outside every held grant window is terminal with the authenticated marker', async table => {
    const endedAt = '2026-09-30T12:00:00.000Z';
    await saveGrant({ unassigned_at: endedAt, synced: true });
    await f.db.runAsync('update child_class_memberships set exited_at = ? where child_id = ?', endedAt, f.childId);
    const { id } = table === 'assessments' ? await f.save() : await f.start({ classId });
    const read = () => table === 'assessments' ? f.read(id) : f.runs.getRunWithResults(id);
    const captured = await read();
    expect(table === 'assessments' ? captured.assessment_date : captured.started_at.slice(0, 10)).toBe('2026-10-23');
    await expectControlOnly();
    const server = fakeServer({ outsideWindows: true });
    const engine = f.engine(server.client);

    expect(await engine.syncAll()).toMatchObject({ totalSynced: 0, totalTerminal: 1, totalRetriable: 0 });
    expect(server.rpcCalls()).toHaveLength(1);
    const body = JSON.parse(server.rpcCalls()[0][1].body);
    expect(table === 'assessments' ? body.p_assessment.assessment_date : body.p_run.started_at.slice(0, 10)).toBe('2026-10-23');
    const reason = '42501-authenticated: result is outside every grant window';
    expect(await queued(table, id)).toMatchObject({ status: 'terminal', last_error: reason, next_retry_at: null });
    expect(await read()).toMatchObject({ sync_status: 'terminal', last_sync_error: reason });
    if (table === 'assessments') expect((await f.items(id)).every(item => item.sync_status !== 'synced')).toBe(true);
    expect(await engine.requeueTerminalRlsFailures(f.userId)).toBe(0);
    expect(await engine.syncAll()).toMatchObject({ totalSynced: 0, totalTerminal: 0, totalRetriable: 0 });
    expect(server.rpcCalls()).toHaveLength(1);
    expect(await queued(table, id)).toMatchObject({ status: 'terminal', last_error: reason });
  });

  test.each(['assessments', 'battery_runs'])('%s uploads with a synced class grant and no local delivery row', async table => {
    await saveGrant({ synced: true });
    const { id } = table === 'assessments' ? await f.save() : await f.start({ classId });
    await expectControlOnly();
    expect(await f.db.getAllAsync('select table_name from sync_outbox')).toEqual([{ table_name: table }]);
    const server = fakeServer({ assignmentOnServer: true });

    expect(await f.engine(server.client).syncAll()).toMatchObject({ totalSynced: 1, totalFailed: 0, totalTerminal: 0 });
    expect(server.transport).toHaveBeenCalledTimes(1);
    expect(new URL(server.transport.mock.calls[0][0]).pathname).toBe(table === 'assessments'
      ? '/rest/v1/rpc/submit_assessment' : '/rest/v1/rpc/save_battery_run');
    if (table === 'assessments') await expectFamilySynced(id);
    else expect(await f.runs.getRunWithResults(id)).toMatchObject({ sync_status: 'synced', last_sync_error: null });
    expect(await f.db.getAllAsync('select * from sync_outbox')).toEqual([]);
    await expectControlOnly();
  });
});
