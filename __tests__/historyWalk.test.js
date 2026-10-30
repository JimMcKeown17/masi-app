jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {},
}));

import { runMigrations } from '../src/db/migrations';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { createSyncStateRepository } from '../src/db/repositories/syncStateRepository';
import { runRepositoryTransaction } from '../src/db/repositories/repositoryRuntime';
import { runHistoryWalk, createHistoryWalkState } from '../src/services/historyWalk';
import { runSessionHistoryPull, sessionHistoryScope } from '../src/services/sessionHistoryPull';

const SCOPE = 'probe:user-1';
const DAY = 86_400_000;
const rowsOf = (count) => Array.from({ length: count }, (_, i) => ({
  id: 'private-row-' + String(i + 1).padStart(4, '0'),
  updated_at: '2026-09-01T08:00:00.' + String(i + 1).padStart(6, '0') + '+00:00',
}));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

describe('shared history walker', () => {
  let db;
  let wall;
  let clock;
  let log;
  let warn;
  const cursor = async (scope = SCOPE) => JSON.parse((await db.getFirstAsync(
    'select cursor from sync_state where scope = ?', scope
  )).cursor);
  const probe = (options = {}) => {
    let coverage = { childIds: ['child-a', 'child-b'], classIds: ['class-1'] };
    const requests = [];
    const rows = rowsOf(options.count ?? 1);
    const stateRepo = createSyncStateRepository({ database: db });
    const deps = {
      database: db, state: createHistoryWalkState(), enqueueRequest: (task) => task(),
      now: () => clock, wallNow: () => wall, random: () => 0.5, requestTimeoutMs: 1000,
      client: { rpc: (_name, args) => ({ abortSignal: async () => {
        if (options.respond) return options.respond(args, requests.length);
        return { data: rows.filter((row) => !args.position
          || row.updated_at > args.position.updatedAt
          || (row.updated_at === args.position.updatedAt && row.id > args.position.id)
        ).slice(0, args.pageSize) };
      } }) },
      ...options.deps,
    };
    const walk = {
      tag: 'Probe', coverageKeys: ['childIds', 'classIds'], pageSize: 50,
      resolveScope: async () => ({ scope: SCOPE, windowStart: '2026-01-15', context: {} }),
      readCoverage: async () => coverage,
      fetchPage: async ({ request, position, overlapSeconds, pageSize }) => {
        const args = { position, overlapSeconds, pageSize };
        requests.push(args);
        return { rows: await request('probe_page', args) };
      },
      savePage: jest.fn(async ({ data, scope, pullState, admit }) => runRepositoryTransaction(db, async (txn) => {
        for (const row of data) await txn.runAsync('insert or ignore into probe_rows (id) values (?)', row.id);
        const resolved = typeof pullState === 'function'
          ? await require('../src/db/repositories/historyCoverage').resolveHistoryPullState(txn, pullState)
          : pullState;
        await stateRepo.setPullState(scope, resolved, { transaction: txn });
        if (!admit()) throw Object.assign(new Error('cancelled'), { kind: 'cancelled' });
      })),
      ...options.walk,
    };
    return { walk, deps, requests, setCoverage: (next) => { coverage = next; },
      run: (force = false) => runHistoryWalk({ userId: 'user-1', force, deps, walk }) };
  };
  const grantCoverage = async ({ db: reader }) => ({
    childIds: (await reader.getAllAsync('select child_id from probe_grants order by child_id')).map((row) => row.child_id),
  });
  const sessionRun = (state, force = false) => runSessionHistoryPull({ userId: 'user-1', force, deps: {
    database: db, state, enqueueRequest: (task) => task(), wallNow: () => wall, random: () => 0.5,
    client: { rpc: jest.fn((name, args) => ({ abortSignal: async () => ({
      data: name === 'get_delivery_history_page' && !args.p_after_id ? [{
        id: 'session-1', user_id: 'user-1', programme_id: 'programme-a', class_id: null,
        session_date: '2026-09-01', activities: {}, created_at: rowsOf(1)[0].updated_at,
        updated_at: rowsOf(1)[0].updated_at,
      }] : [],
    }) })) },
  } });

  beforeEach(async () => {
    wall = Date.parse('2026-09-26T08:00:00Z');
    clock = 0;
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    db = await createMigratedDatabase(runMigrations);
    await seedCoreData(db);
    await db.execAsync('create table probe_rows (id text primary key); create table probe_grants (child_id text primary key);');
    await db.runAsync("insert into probe_grants values ('child-a'), ('child-b')");
  });
  afterEach(async () => {
    await db.closeAsync();
    log.mockRestore();
    warn.mockRestore();
  });

  test('a class gained between runs re-walks from the start', async () => {
    const p = probe();
    await p.run();
    expect((await cursor()).rescanClassIds).toEqual(['class-1']);
    p.setCoverage({ childIds: ['child-a', 'child-b'], classIds: ['class-1', 'class-2'] });
    p.requests.length = 0;
    expect(await p.run()).toEqual({ status: 'complete', pages: 2 });
    expect(p.requests).toContainEqual({ position: null, overlapSeconds: 0, pageSize: 50 });
    expect((await cursor()).rescanClassIds).toEqual(['class-1', 'class-2']);
  });

  test('a class lost does not re-walk', async () => {
    const p = probe();
    await p.run();
    p.setCoverage({ childIds: ['child-a', 'child-b'], classIds: [] });
    expect(await p.run()).toEqual({ status: 'fresh', pages: 0 });
  });

  test('the first page uses firstPageSize', async () => {
    const p = probe({ count: 75, walk: { firstPageSize: 10 } });
    expect(await p.run()).toEqual({ status: 'complete', pages: 3 });
    expect(p.requests.map((r) => r.pageSize)).toEqual([10, 50, 50]);
    expect((await db.getFirstAsync('select count(*) as n from probe_rows')).n).toBe(75);
    // Each resumed run starts small, even though its cursor is already populated.
    const resumed = probe({ count: 75, walk: { firstPageSize: 10 }, deps: {
      onPageSaved: () => { clock += 60_000; },
    } });
    await db.runAsync('delete from sync_state where scope = ?', SCOPE);
    expect(await resumed.run()).toEqual({ status: 'partial', pages: 1 });
    expect(await resumed.run()).toEqual({ status: 'partial', pages: 1 });
    expect(resumed.requests.map((r) => r.pageSize)).toEqual([10, 10]);
  });

  test('MR001 stops as disabled and keeps the position', async () => {
    let disabled = true;
    const p = probe({ count: 75, respond: (args, call) => disabled && call === 2
      ? { error: { code: 'MR001', message: 'rollout_disabled' } }
      : { data: rowsOf(75).filter((r) => !args.position || r.id > args.position.id).slice(0, args.pageSize) },
    });
    expect(await p.run()).toEqual({ status: 'disabled', pages: 1 });
    const saved = await cursor();
    expect(saved).toMatchObject({ id: rowsOf(50)[49].id, updatedAt: rowsOf(50)[49].updated_at });
    expect(saved.lastFailureAt).toBeTruthy();
    expect(warn).not.toHaveBeenCalled();
    disabled = false;
    await p.run();
    expect(p.requests[2]).toMatchObject({ position: { id: saved.id, updatedAt: saved.updatedAt }, overlapSeconds: 0 });
  });

  test('a null windowStart never resets', async () => {
    const p = probe();
    await p.run();
    const saved = await cursor();
    saved.windowStart = 'old-window';
    await createSyncStateRepository({ database: db }).setPullState(SCOPE, { cursor: JSON.stringify(saved) });
    p.walk.resolveScope = async () => ({ scope: SCOPE, windowStart: null, context: {} });
    p.requests.length = 0;
    await p.run(true);
    expect(p.requests[0].position).toEqual({ id: saved.id, updatedAt: saved.updatedAt });
    expect((await cursor()).windowStart).toBe('old-window');
    await createSyncStateRepository({ database: db }).setPullState(SCOPE, {
      cursor: JSON.stringify({ ...saved, windowStart: null }),
    });
    p.requests.length = 0;
    await p.run(true);
    expect(p.requests[0].position).toEqual({ id: saved.id, updatedAt: saved.updatedAt });
    expect((await cursor()).windowStart).toBeNull();
  });

  test('timing is logged without ids', async () => {
    const p = probe({ walk: { logTiming: true }, deps: { now: () => clock++ } });
    await p.run();
    expect(log.mock.calls.at(-1)[0]).toMatch(/^\[Probe\] end status=complete pages=1 durationMs=\d+ complete=true rpcMs=\d+ saveMs=\d+ firstCommitMs=\d+$/);
    const lines = log.mock.calls.flat().join('\n');
    expect(lines).not.toContain('private-row-0001');
    expect(lines).not.toContain('user-1');
  });

  test('a session cursor has no class fields', async () => {
    await sessionRun(createHistoryWalkState());
    expect(Object.keys(await cursor(sessionHistoryScope('user-1', 'programme-a'))).filter((key) => /ClassIds$/.test(key))).toEqual([]);
  });

  test('a lost child leaves coverage, and its return re-walks', async () => {
    const p = probe({ walk: { coverageKeys: ['childIds'], dropLostCoverage: true } });
    await p.run();
    expect((await cursor()).rescanChildIds).toEqual(['child-a', 'child-b']);
    p.setCoverage({ childIds: ['child-b'] });
    wall += 16 * 60_000;
    expect(await p.run()).toEqual({ status: 'complete', pages: 1 });
    expect((await cursor()).rescanChildIds).toEqual(['child-b']);
    p.setCoverage({ childIds: ['child-a', 'child-b'] });
    p.requests.length = 0;
    await p.run();
    expect(p.requests.some((r) => r.position === null && r.overlapSeconds === 0)).toBe(true);
    expect((await cursor()).rescanChildIds).toEqual(['child-a', 'child-b']);
  });

  test('a lost class leaves coverage, and its return re-walks', async () => {
    const p = probe({ walk: { dropLostCoverage: true } });
    await p.run();
    p.setCoverage({ childIds: ['child-a', 'child-b'], classIds: [] });
    wall += 16 * 60_000;
    await p.run();
    expect((await cursor()).rescanClassIds).toEqual([]);
    p.setCoverage({ childIds: ['child-a', 'child-b'], classIds: ['class-1'] });
    p.requests.length = 0;
    await p.run();
    expect(p.requests.some((r) => r.position === null && r.overlapSeconds === 0)).toBe(true);
    expect((await cursor()).rescanClassIds).toEqual(['class-1']);
  });

  test('a loss during a paused re-walk leaves its snapshot', async () => {
    let pageCalls = 0;
    const p = probe({ walk: { coverageKeys: ['childIds'], dropLostCoverage: true }, respond: (args) => {
      pageCalls += 1;
      return { data: pageCalls === 3 ? rowsOf(args.pageSize) : [] };
    } });
    await p.run();
    wall += 8 * DAY;
    p.deps.onPageSaved = () => { if (pageCalls === 3) clock = 60_000; };
    expect(await p.run()).toEqual({ status: 'partial', pages: 2 });
    expect((await cursor()).rewalkChildIds).toEqual(['child-a', 'child-b']);
    p.setCoverage({ childIds: ['child-b'] });
    expect(await p.run()).toEqual({ status: 'complete', pages: 2 });
    expect((await cursor()).rescanChildIds).toEqual(['child-b']);
    expect((await cursor()).rewalkChildIds).toBeNull();
  });

  test('a run that makes no request writes nothing', async () => {
    const p = probe({ walk: { dropLostCoverage: true } });
    await p.run();
    const before = await db.getFirstAsync('select * from sync_state where scope = ?', SCOPE);
    p.setCoverage({ childIds: [], classIds: [] });
    p.requests.length = 0;
    expect(await p.run()).toEqual({ status: 'fresh', pages: 0 });
    expect(p.requests).toEqual([]);
    expect(await db.getFirstAsync('select * from sync_state where scope = ?', SCOPE)).toEqual(before);
  });

  test.each([
    ['a child lost while a page is in flight is not re-added', false],
    ['the failure marker is bounded too', true],
  ])('%s', async (_name, fail) => {
    const p = probe({ walk: { coverageKeys: ['childIds'], dropLostCoverage: true, readCoverage: grantCoverage } });
    await p.run();
    wall += 16 * 60_000;
    const entered = deferred();
    const page = deferred();
    p.deps.client = { rpc: () => ({ abortSignal: () => { entered.resolve(); return page.promise; } }) };
    const pending = p.run();
    await entered.promise;
    await db.runAsync("delete from probe_grants where child_id = 'child-a'");
    page.resolve(fail ? { error: { message: 'Network request failed' } } : { data: [] });
    expect(await pending).toEqual({ status: fail ? 'transport' : 'complete', pages: fail ? 0 : 1 });
    expect((await cursor()).rescanChildIds).toEqual(['child-b']);
    if (fail) expect((await cursor()).lastFailureAt).toBeTruthy();
    await db.runAsync("insert into probe_grants values ('child-a')");
    p.deps.client = { rpc: () => ({ abortSignal: async () => ({ data: [] }) }) };
    p.requests.length = 0;
    await p.run();
    expect(p.requests.some((r) => r.position === null && r.overlapSeconds === 0)).toBe(true);
  });

  test('removeFromHistoryCoverage drops only the given ids', async () => {
    const saved = { windowStart: null, updatedAt: rowsOf(1)[0].updated_at, id: 'kept-position',
      rescanChildIds: ['a', 'b'], rewalkChildIds: ['a', 'b'], firstWalkChildIds: null,
      rescanClassIds: ['class-1'], lastFailureAt: 'kept-failure', complete: false };
    await createSyncStateRepository({ database: db }).setPullState(SCOPE, { lastPulledAt: 'L', cursor: JSON.stringify(saved) });
    const { removeFromHistoryCoverage } = require('../src/db/repositories/historyCoverage');
    expect(await runRepositoryTransaction(db, (txn) => removeFromHistoryCoverage(txn, {
      scope: SCOPE, coverageKey: 'childIds', ids: ['a'],
    }))).toBe(true);
    expect(await cursor()).toEqual({ ...saved, rescanChildIds: ['b'], rewalkChildIds: ['b'] });
    expect((await db.getFirstAsync('select last_pulled_at from sync_state where scope = ?', SCOPE)).last_pulled_at).toBe('L');
    const before = await db.getFirstAsync('select * from sync_state where scope = ?', SCOPE);
    expect(await runRepositoryTransaction(db, (txn) => removeFromHistoryCoverage(txn, {
      scope: SCOPE, coverageKey: 'childIds', ids: ['missing'],
    }))).toBe(false);
    expect(await db.getFirstAsync('select * from sync_state where scope = ?', SCOPE)).toEqual(before);
    expect(await runRepositoryTransaction(db, (txn) => removeFromHistoryCoverage(txn, {
      scope: 'absent', coverageKey: 'childIds', ids: ['a'],
    }))).toBe(false);
    expect((await db.getFirstAsync('select count(*) as n from sync_state')).n).toBe(1);
  });

  test('the session walk keeps a lost child covered', async () => {
    for (const id of ['child-a', 'child-b']) {
      await db.runAsync("insert into children (id, first_name, last_name) values (?, 'Test', 'Child')", id);
      await db.runAsync("insert into child_ea_assignments (id, user_id, child_id, assigned_at) values (?, 'user-1', ?, '2026-01-15')", 'cea-' + id, id);
    }
    const state = createHistoryWalkState();
    await sessionRun(state);
    await db.runAsync("update child_ea_assignments set unassigned_at = '2026-09-26' where child_id = 'child-a'");
    await sessionRun(state, true);
    expect((await cursor(sessionHistoryScope('user-1', 'programme-a'))).rescanChildIds).toEqual(['child-a', 'child-b']);
    await db.runAsync("update child_ea_assignments set unassigned_at = null where child_id = 'child-a'");
    const rpc = jest.fn(() => ({ abortSignal: async () => ({ data: [] }) }));
    await runSessionHistoryPull({ userId: 'user-1', force: true, deps: {
      database: db, state, client: { rpc }, enqueueRequest: (task) => task(), wallNow: () => wall,
    } });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls.every(([, args]) => args.p_after_id === 'session-1')).toBe(true);
  });

  test('failures retain the first failure until a successful page clears it, then start a new streak', async () => {
    let failing = true;
    const p = probe({ respond: () => failing
      ? { error: { message: 'Network request failed' } } : { data: [] } });
    const firstFailure = new Date(wall).toISOString();
    expect(await p.run()).toEqual({ status: 'transport', pages: 0 });
    expect((await cursor()).lastFailureAt).toBe(firstFailure);

    wall += 60_000;
    // Recreate the walk to prove the first failure survives a restart in SQLite.
    const resumed = probe({ respond: () => failing
      ? { error: { message: 'Network request failed' } } : { data: [] } });
    expect(await resumed.run()).toEqual({ status: 'transport', pages: 0 });
    expect((await cursor()).lastFailureAt).toBe(firstFailure);

    failing = false;
    expect(await resumed.run()).toEqual({ status: 'complete', pages: 1 });
    expect((await cursor()).lastFailureAt).toBeNull();

    wall += 60_000;
    failing = true;
    expect(await resumed.run(true)).toEqual({ status: 'transport', pages: 0 });
    expect((await cursor()).lastFailureAt).toBe(new Date(wall).toISOString());
  });

  test('MR002 stops as year_mismatch', async () => {
    const p = probe({ respond: () => ({ error: { code: 'MR002', message: 'academic_year_mismatch' } }) });
    // An already complete cursor must become incomplete while retaining its durable tuple.
    const position = { updatedAt: rowsOf(1)[0].updated_at, id: rowsOf(1)[0].id };
    await createSyncStateRepository({ database: db }).setPullState(SCOPE, {
      lastPulledAt: new Date(wall).toISOString(), cursor: JSON.stringify({
        ...position, windowStart: '2026-01-15', complete: true, deltaComplete: true,
        firstWalk: false, nextRewalkAt: new Date(wall + 7 * DAY).toISOString(),
        rescanChildIds: ['child-a', 'child-b'], rescanClassIds: ['class-1'],
      }),
    });
    expect(await p.run(true)).toEqual({ status: 'year_mismatch', pages: 0 });
    expect(await cursor()).toMatchObject({ ...position, complete: false, lastFailureAt: new Date(wall).toISOString() });
    expect(p.walk.savePage).not.toHaveBeenCalled();
    expect(warn.mock.calls.at(-1)[0]).toContain('failureKind=year_mismatch');
  });
});

// New diagnostics coverage uses the signed-in default handle and its real SQLite writer.
describe('durable history failure diagnostics', () => {
  const { getDefaultTestHandle, TEST_ACTOR_ID } = require('../test-support/defaultTestHandle');
  let handle;
  let wall;
  let clock;
  let response;
  let deps;
  let walk;
  const saved = async () => JSON.parse((await (await handle.getReader()).getFirstAsync(
    "select cursor from sync_state where scope = 'diagnostics-probe'"
  )).cursor);
  const run = () => runHistoryWalk({ userId: TEST_ACTOR_ID, force: true, deps, walk });
  beforeEach(() => {
    handle = getDefaultTestHandle();
    wall = Date.parse('2026-10-01T08:00:00Z');
    clock = 0;
    response = { error: { message: 'Network request failed: raw device detail' } };
    deps = { database: handle, state: createHistoryWalkState(), enqueueRequest: handle.enqueueRequest,
      now: () => clock, wallNow: () => wall, random: () => 0.5,
      client: { rpc: () => ({ abortSignal: async () => response }) } };
    walk = { tag: 'DiagnosticsProbe', coverageKeys: ['childIds'], pageSize: 1,
      resolveScope: async () => ({ scope: 'diagnostics-probe', windowStart: '2026-01-15', context: {} }),
      readCoverage: async () => ({ childIds: [] }),
      fetchPage: async ({ request }) => ({ rows: await request('probe', {}) }),
      savePage: ({ scope, pullState }) => handle.withTransaction(txn => handle.services.repositories.syncState.setPullState(scope, pullState, { transaction: txn })),
    };
  });

  test('failure kind/message commit with the first failure time and a successful page clears the triad', async () => {
    const firstFailure = new Date(wall).toISOString();
    expect(await run()).toEqual({ status: 'transport', pages: 0 });
    expect(await saved()).toMatchObject({ lastFailureAt: firstFailure, lastFailureKind: 'transport', lastFailureMessage: response.error.message });
    wall += 2 * DAY;
    deps.state = createHistoryWalkState();
    response = { error: { code: '42703', message: 'raw query: missing column' } };
    expect(await run()).toEqual({ status: 'query', pages: 0 });
    expect(await saved()).toMatchObject({ lastFailureAt: firstFailure, lastFailureKind: 'query', lastFailureMessage: response.error.message });
    response = { data: rowsOf(1) };
    deps.onPageSaved = () => { clock = 60_000; };
    expect(await run()).toEqual({ status: 'partial', pages: 1 });
    expect(await saved()).toMatchObject({ lastFailureAt: null, lastFailureKind: null, lastFailureMessage: null, id: rowsOf(1)[0].id });
  });

  test.each([['MR001', 'disabled'], ['MR002', 'year_mismatch'], ['42703', 'query']])(
    '%s persists its raw failure kind/message', async (code, kind) => {
      response = { error: { code, message: 'raw failure ' + code } };
      expect(await run()).toEqual({ status: kind, pages: 0 });
      expect(await saved()).toMatchObject({ lastFailureKind: kind, lastFailureMessage: response.error.message });
    });

  test('old cursors without diagnostic fields remain readable and success clears the full marker', async () => {
    await handle.services.repositories.syncState.setPullState('diagnostics-probe', { cursor: JSON.stringify({
      windowStart: '2026-01-15', lastFailureAt: '2026-09-01T00:00:00Z', complete: false,
    }) });
    response = { data: [] };
    expect(await run()).toEqual({ status: 'complete', pages: 1 });
    expect(await saved()).toMatchObject({ lastFailureAt: null, lastFailureKind: null, lastFailureMessage: null });
  });

  test.each(['budget', 'dependency', 'cancelled'])('%s stops do not write failure metadata', async kind => {
    if (kind === 'budget') deps.runBudgetMs = 0;
    if (kind === 'dependency') walk.resolveScope = async () => null;
    if (kind === 'cancelled') deps.client = { rpc: () => ({ abortSignal: async () => {
      deps.state.actorGeneration += 1;
      return { error: { message: 'late network error' } };
    } }) };
    expect((await run()).status).toBe(kind === 'budget' ? 'partial' : kind);
    expect(await (await handle.getReader()).getFirstAsync("select * from sync_state where scope = 'diagnostics-probe'")).toBeNull();
  });

  test('a failed metadata write preserves the already committed successful page', async () => {
    const writer = await require('../test-support/testDatabase').getTestWriter();
    await writer.execAsync(`create trigger reject_failure_metadata before update on sync_state
      when json_extract(new.cursor, '$.lastFailureKind') is not null
      begin select raise(abort, 'failure metadata disk error'); end;`);
    let calls = 0;
    deps.client = { rpc: () => ({ abortSignal: async () => ++calls === 1
      ? { data: rowsOf(1) } : { error: { message: 'Network request failed' } } }) };
    expect(await run()).toEqual({ status: 'transport', pages: 1 });
    expect(await saved()).toMatchObject({ id: rowsOf(1)[0].id, lastFailureAt: null, lastFailureKind: null, lastFailureMessage: null });
  });

});
