jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import { runMigrations } from '../src/db/migrations';
import {
  runSessionHistoryPull,
  resetSessionHistoryForActorChange,
  sessionHistoryScope,
} from '../src/services/sessionHistoryPull';
import { createSupabaseRequestQueue } from '../src/services/supabaseRequestQueue';
import { syncStateRepository } from '../src/db/repositories/syncStateRepository';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const DAY = 24 * 60 * 60 * 1000;
const iso = (n) => `2026-09-01T08:00:00.${String(n).padStart(6, '0')}+00:00`; // microsecond strings
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const parent = (n, extra = {}) => ({
  id: uuid(n), user_id: 'user-1', programme_id: 'programme-a', class_id: null,
  session_date: '2026-09-01', activities: {}, notes: null, created_at: iso(n), updated_at: iso(n), ...extra,
});

// Scripted server. `parents()` is read on every call so a test can change the visible set
// between runs. Rows are sorted by (updated_at, id), as the real RPC returns them.
const fakeServer = ({ parents, attendeesBySession = {}, failParentAt = null, hangParentAt = null, onParentCall = () => {} }) => {
  const calls = [];
  let parentCalls = 0;
  const client = {
    rpc: (name, args) => ({
      abortSignal: (signal) => {
        calls.push({ name, args });
        if (name === 'get_delivery_history_page') {
          parentCalls += 1;
          onParentCall(parentCalls);
          if (failParentAt === parentCalls) return Promise.resolve({ data: null, error: { message: 'boom', code: 'XX000' } });
          if (hangParentAt === parentCalls) {
            return new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))));
          }
          const list = typeof parents === 'function' ? parents() : parents;
          const seconds = (value) => Date.parse(`${value.slice(0, 19)}Z`) / 1000; // test fixtures are UTC
          const rows = list
            .filter((p) => {
              if (!args.p_after_updated_at) return true;
              if (args.p_overlap_seconds > 0) {
                return seconds(p.updated_at) > seconds(args.p_after_updated_at) - args.p_overlap_seconds;
              }
              return p.updated_at > args.p_after_updated_at
                || (p.updated_at === args.p_after_updated_at && p.id > args.p_after_id);
            })
            .slice(0, args.p_page_size);
          return Promise.resolve({ data: rows, error: null });
        }
        const rows = args.p_session_ids.flatMap((id) => attendeesBySession[id] || []).slice(0, args.p_page_size);
        return Promise.resolve({ data: rows, error: null });
      },
    }),
  };
  return { client, calls, parentCalls: () => calls.filter((c) => c.name === 'get_delivery_history_page') };
};

describe('runSessionHistoryPull', () => {
  let db;
  let wall;
  const deps = (extra) => ({
    database: db, enqueueRequest: (task) => task(), requestTimeoutMs: 50, runBudgetMs: 60_000,
    wallNow: () => wall, random: () => 0.5, ...extra, // 0.5 => exactly 7 days between re-walks
  });
  const cursorOf = async (userId = 'user-1', programmeId = 'programme-a') => {
    const row = await db.getFirstAsync('select cursor, last_pulled_at from sync_state where scope = ?', sessionHistoryScope(userId, programmeId));
    return row && { ...JSON.parse(row.cursor), lastPulledAt: row.last_pulled_at };
  };
  const addDeliveryChild = async (childId) => {
    await db.runAsync("insert into children (id, first_name, last_name, class_id, sync_status) values (?, 'New', 'Child', 'class-1', 'synced')", childId);
    await db.runAsync("insert into child_ea_assignments (id, user_id, child_id, sync_status) values (?, 'user-1', ?, 'synced')", `cea-${childId}`, childId);
  };

  beforeEach(async () => {
    wall = Date.parse('2026-09-26T08:00:00.000Z');
    resetSessionHistoryForActorChange();
    db = await createMigratedDatabase(runMigrations);
    await seedCoreData(db);
  });
  afterEach(async () => { await db.closeAsync(); });

  test('slow attendee pagination saves a durable page past the run budget and subsequent runs complete', async () => {
    const parents = Array.from({ length: 200 }, (_, i) => parent(i + 1));
    const attendees = parents.flatMap((session, i) => Array.from({ length: 4 }, (_, child) => ({
      id: uuid(1000 + i * 4 + child), session_id: session.id, child_id: `child-${child}`,
      group_id: null, attendance_status: 'present', grade_snapshot: null, notes: null,
      created_at: iso(1), updated_at: iso(1),
      child_first_name: 'Child', child_last_name: String(child), child_preferred_name: null,
    })));
    let clock = 0;
    const calls = [];
    const client = { rpc: (name, args) => ({ abortSignal: () => {
      calls.push({ name, args });
      clock += 12_000;
      const rows = name === 'get_delivery_history_page'
        ? parents.filter((row) => !args.p_after_updated_at || row.updated_at > args.p_after_updated_at
          || (row.updated_at === args.p_after_updated_at && row.id > args.p_after_id))
        : attendees.filter((row) => args.p_session_ids.includes(row.session_id)
          && (!args.p_after_session_id || row.session_id > args.p_after_session_id
            || (row.session_id === args.p_after_session_id && row.id > args.p_after_attendee_id)));
      return Promise.resolve({ data: rows.slice(0, args.p_page_size), error: null });
    } }) };

    const runs = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await runSessionHistoryPull({ userId: 'user-1', deps: deps({
        client, now: () => clock, runBudgetMs: 60_000, requestTimeoutMs: 15_000,
      }) });
      runs.push({ result, cursor: await cursorOf(),
        sessions: (await db.getFirstAsync('select count(*) as n from sessions')).n,
        attendees: (await db.getFirstAsync('select count(*) as n from session_attendees')).n,
      });
      if (result.status === 'complete') break;
    }

    let previousCursor = null;
    for (const run of runs) {
      expect(run.result.pages).toBeGreaterThanOrEqual(1);
      expect(run.cursor).not.toEqual(previousCursor);
      expect(run.cursor.updatedAt).toBe(iso(200));
      expect(run.sessions).toBe(200);
      expect(run.attendees).toBe(800);
      previousCursor = run.cursor;
    }
    expect(runs.map(({ result }) => result.status)).toEqual(['partial', 'complete']);
    expect(runs[0].cursor.deltaComplete).toBe(false);
    expect(runs[1].cursor.complete).toBe(true);
    expect(calls.filter(({ name }) => name === 'get_delivery_history_attendee_page')).toHaveLength(5);
    expect(clock).toBe(84_000); // parent + five attendee requests, then the next run's empty parent page
  });

  test('an actor change during the cursor write cancels the service and rolls back the whole page', async () => {
    const session = parent(1);
    const server = fakeServer({ parents: [session], attendeesBySession: { [session.id]: [{
      id: uuid(1001), session_id: session.id, child_id: 'reference-child', group_id: null,
      attendance_status: 'present', grade_snapshot: null, notes: null,
      created_at: iso(1), updated_at: iso(1),
      child_first_name: 'Reference', child_last_name: 'Child', child_preferred_name: null,
    }] } });
    const setPullState = syncStateRepository.setPullState;
    const cursorWrite = jest.spyOn(syncStateRepository, 'setPullState').mockImplementation(async (...args) => {
      resetSessionHistoryForActorChange();
      return setPullState(...args);
    });
    let result;
    try {
      result = await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: server.client }) });
      expect(cursorWrite).toHaveBeenCalledTimes(1);
    } finally {
      cursorWrite.mockRestore();
    }
    expect(result).toEqual({ status: 'cancelled', pages: 0 });
    for (const table of ['sessions', 'session_attendees', 'children', 'sync_state']) {
      expect((await db.getFirstAsync(`select count(*) as n from ${table}`)).n).toBe(0);
    }
  });

  test('a failed refresh in the same millisecond as success is retried', async () => {
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents: [parent(1)] }).client }) });
    const failed = fakeServer({ parents: [], failParentAt: 1 });
    expect((await runSessionHistoryPull({ userId: 'user-1', force: true, deps: deps({ client: failed.client }) })).status).toBe('query');
    expect((await cursorOf()).lastFailureAt).toBe(new Date(wall).toISOString());
    const retry = fakeServer({ parents: [parent(1)] });
    expect((await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: retry.client }) })).status).toBe('complete');
    expect(retry.parentCalls()).toHaveLength(1);
    expect((await cursorOf()).lastFailureAt).toBeNull();
  });

  test('an error response from a stale actor is cancelled without recording failure', async () => {
    const server = fakeServer({ parents: [], failParentAt: 1, onParentCall: resetSessionHistoryForActorChange });
    expect(await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: server.client }) })).toEqual({ status: 'cancelled', pages: 0 });
    expect(await cursorOf()).toBeNull();
  });

  test.each(['entry', 'after parent write'])('actor admission at transaction %s rolls back the page and cursor', async (stage) => {
    const transaction = db.withExclusiveTransactionAsync.bind(db);
    const write = db.runAsync.bind(db);
    let reached = false;
    if (stage === 'entry') {
      db.withExclusiveTransactionAsync = (task) => transaction(async (txn) => {
        reached = true;
        resetSessionHistoryForActorChange();
        return task(txn);
      });
    } else {
      db.runAsync = async (sql, ...args) => {
        const result = await write(sql, ...args);
        if (/insert into "sessions"/i.test(sql)) {
          reached = true;
          resetSessionHistoryForActorChange();
        }
        return result;
      };
    }
    const server = fakeServer({ parents: [parent(1)] });
    expect(await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: server.client }) })).toEqual({ status: 'cancelled', pages: 0 });
    expect(reached).toBe(true);
    expect((await db.getFirstAsync('select count(*) as n from sessions')).n).toBe(0);
    expect(await cursorOf()).toBeNull();
  });

  test('the deadline backstop settles even when a request ignores abort', async () => {
    let signal;
    const client = { rpc: () => ({ abortSignal: (value) => {
      signal = value;
      return new Promise(() => {});
    } }) };
    expect(await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client, requestTimeoutMs: 20 }) })).toEqual({ status: 'transport', pages: 0 });
    expect(signal.aborted).toBe(true);
    expect((await cursorOf()).lastFailureAt).toBe(new Date(wall).toISOString());
  });

  test('the installed PostgREST thenable builder works with an immediate injected queue', async () => {
    const { PostgrestClient } = require('@supabase/postgrest-js');
    const fetch = jest.fn(async (_url, options) => {
      expect(options.signal).toBeInstanceOf(AbortSignal);
      return { ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, text: async () => '[]' };
    });
    const client = new PostgrestClient('https://history-test.invalid', { fetch });
    expect(await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client }) })).toEqual({ status: 'complete', pages: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await cursorOf()).complete).toBe(true);
  });

  test('an attendee request failure abandons the whole parent page', async () => {
    const client = { rpc: (name) => ({ abortSignal: () => Promise.resolve(name === 'get_delivery_history_page'
      ? { data: [parent(1)], error: null }
      : { data: null, error: { code: 'XX000', message: 'attendee query failed' } }) }) };
    expect(await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client }) })).toEqual({ status: 'query', pages: 0 });
    expect((await db.getFirstAsync('select count(*) as n from sessions')).n).toBe(0);
    expect(await cursorOf()).toMatchObject({ updatedAt: null, complete: false, lastPulledAt: null, lastFailureAt: new Date(wall).toISOString() });
  });

  test('a delivery child added during a paused re-walk keeps overall completeness false until the next walk', async () => {
    const parents = Array.from({ length: 201 }, (_, i) => parent(i + 1));
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents }).client }) });
    const lastSuccess = (await cursorOf()).lastPulledAt;
    await addDeliveryChild('child-a');
    wall += 1000;
    let saved = 0;
    expect(await runSessionHistoryPull({ userId: 'user-1', deps: deps({
      client: fakeServer({ parents }).client,
      runBudgetMs: 1000,
      onPageSaved: () => { saved += 1; },
      now: () => (saved >= 3 ? 1e9 : 0), // two delta pages, then one re-walk page
    }) })).toEqual({ status: 'partial', pages: 3 });
    expect(await cursorOf()).toMatchObject({
      deltaComplete: true, complete: false,
      rescanAfter: { updatedAt: iso(200), id: uuid(200) },
      rewalkChildIds: ['child-a'], lastPulledAt: lastSuccess,
    });

    await addDeliveryChild('child-b');
    parents.unshift(parent(0, { updated_at: '2026-03-01T08:00:00.000001+00:00' }));
    const resumed = fakeServer({ parents });
    expect(await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: resumed.client }) })).toEqual({ status: 'partial', pages: 3 });
    expect(resumed.parentCalls()[2].args).toMatchObject({ p_after_updated_at: iso(200), p_overlap_seconds: 0 });
    expect(await cursorOf()).toMatchObject({ complete: false, rescanAfter: null, rescanChildIds: ['child-a'], lastPulledAt: lastSuccess });
    expect(await db.getFirstAsync('select id from sessions where id = ?', uuid(0))).toBeNull();

    expect((await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents }).client }) })).status).toBe('complete');
    expect(await cursorOf()).toMatchObject({ complete: true, rescanChildIds: ['child-a', 'child-b'], lastPulledAt: new Date(wall).toISOString() });
    expect(await db.getFirstAsync('select id from sessions where id = ?', uuid(0))).toEqual({ id: uuid(0) });
  });

  test('first hydration pages to exhaustion, replays raw cursor strings, and counts as a completed re-walk', async () => {
    const server = fakeServer({ parents: Array.from({ length: 450 }, (_, i) => parent(i + 1)) });
    expect(await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: server.client }) })).toEqual({ status: 'complete', pages: 3 });
    const calls = server.parentCalls();
    expect(calls).toHaveLength(3); // no second walk on a new phone
    expect(calls[1].args.p_after_updated_at).toBe(iso(200));
    expect(calls.every((c) => c.args.p_overlap_seconds === 0 && c.args.p_window_start === '2026-01-15')).toBe(true);
    expect(await cursorOf()).toMatchObject({
      updatedAt: iso(450), deltaComplete: true, complete: true, windowStart: '2026-01-15', rescanAfter: null, firstWalk: false,
      rescanCompletedAt: new Date(wall).toISOString(), rescanChildIds: [],
    });
    expect((await db.getFirstAsync('select count(*) as n from sessions')).n).toBe(450);
  });

  test('a later forced run uses the two-minute overlap on its first page only', async () => {
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents: [parent(1)] }).client }) });
    const second = fakeServer({ parents: Array.from({ length: 450 }, (_, i) => parent(i + 1)) });
    await runSessionHistoryPull({ userId: 'user-1', force: true, deps: deps({ client: second.client }) });
    const overlaps = second.parentCalls().map((c) => c.args.p_overlap_seconds);
    expect(overlaps).toEqual([120, 0, 0]);
  });

  test('a new delivery child triggers a re-walk that brings its older sessions down', async () => {
    const visible = [parent(5)];
    const server = fakeServer({ parents: () => visible });
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: server.client }) });
    // Handover: a child whose older session (updated long before the cursor) becomes authorized.
    await addDeliveryChild('child-new');
    visible.unshift(parent(1, { updated_at: '2026-03-01T08:00:00.000001+00:00' }));
    const after = fakeServer({ parents: () => visible });
    expect((await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: after.client }) })).status).toBe('complete');
    expect(after.parentCalls().some((c) => c.args.p_after_updated_at === null && c.args.p_overlap_seconds === 0)).toBe(true);
    expect(await db.getFirstAsync('select id from sessions where id = ?', uuid(1))).toEqual({ id: uuid(1) });
    expect((await cursorOf()).rescanChildIds).toEqual(['child-new']);
  });

  test('the backstop re-walk interval is jittered between 6 and 8 days per phone', async () => {
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents: [parent(1)] }).client, random: () => 0 }) });
    expect(Date.parse((await cursorOf()).nextRewalkAt) - wall).toBe(6 * DAY);
    wall += 5 * DAY + 23 * 60 * 60 * 1000;
    const early = fakeServer({ parents: [parent(1)] });
    await runSessionHistoryPull({ userId: 'user-1', force: true, deps: deps({ client: early.client }) });
    expect(early.parentCalls().some((c) => c.args.p_after_updated_at === null)).toBe(false);
    wall += 2 * 60 * 60 * 1000;
    const due = fakeServer({ parents: [parent(1)] });
    await runSessionHistoryPull({ userId: 'user-1', force: true, deps: deps({ client: due.client, random: () => 0.999999 }) });
    expect(due.parentCalls().some((c) => c.args.p_after_updated_at === null)).toBe(true);
    const next = Date.parse((await cursorOf()).nextRewalkAt) - wall;
    expect(next).toBeGreaterThan(7.99 * DAY);
    expect(next).toBeLessThanOrEqual(8 * DAY);
  });

  test('the backstop re-walk runs again after a week even with nothing new', async () => {
    const server = fakeServer({ parents: [parent(1)] });
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: server.client }) });
    wall += 7 * DAY + 1;
    const later = fakeServer({ parents: [parent(1)] });
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: later.client }) });
    expect(later.parentCalls().some((c) => c.args.p_after_updated_at === null)).toBe(true);
    expect((await cursorOf()).rescanCompletedAt).toBe(new Date(wall).toISOString());
  });

  test('a budget-cut run resumes from its saved position on the next run', async () => {
    const parents = Array.from({ length: 450 }, (_, i) => parent(i + 1));
    let saved = 0;
    const first = await runSessionHistoryPull({ userId: 'user-1', deps: deps({
      client: fakeServer({ parents }).client,
      runBudgetMs: 1000,
      onPageSaved: () => { saved += 1; },
      now: () => (saved >= 2 ? 1e9 : 0), // the budget is spent once two pages are saved
    }) });
    expect(first).toEqual({ status: 'partial', pages: 2 });
    expect(await cursorOf()).toMatchObject({ updatedAt: iso(400), deltaComplete: false, complete: false, lastPulledAt: null, firstWalk: true });
    const resumed = fakeServer({ parents });
    expect((await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: resumed.client }) })).status).toBe('complete');
    expect(resumed.parentCalls()).toHaveLength(1); // the resumed first walk still counts as a completed re-walk
    expect(resumed.parentCalls()[0].args).toMatchObject({ p_after_updated_at: iso(400), p_overlap_seconds: 0 });
    expect((await db.getFirstAsync('select count(*) as n from sessions')).n).toBe(450);
  });

  test('a request deadline ends the run as transport, keeps earlier pages, and records the failure', async () => {
    const server = fakeServer({ parents: Array.from({ length: 300 }, (_, i) => parent(i + 1)), hangParentAt: 2 });
    expect((await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: server.client }) })).status).toBe('transport');
    expect(await cursorOf()).toMatchObject({ updatedAt: iso(200), complete: false, lastPulledAt: null, lastFailureAt: new Date(wall).toISOString() });
  });

  test('a hung predecessor in the shared queue cannot hold the run past its deadline', async () => {
    const queue = createSupabaseRequestQueue();
    let releasePredecessor;
    const predecessorStarted = new Promise((started) => {
      queue.enqueue(() => new Promise((resolve) => { releasePredecessor = resolve; started(); }));
    });
    await predecessorStarted; // a roster request that is now blocking the queue
    const server = fakeServer({ parents: [parent(1)] });
    const result = await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: server.client, enqueueRequest: queue.enqueue, requestTimeoutMs: 20 }) });
    expect(result.status).toBe('transport');
    // Drain the queue: the expired history task must still never start.
    releasePredecessor();
    await queue.enqueue(() => null);
    expect(server.calls).toHaveLength(0);
    // Single flight was released: a new run starts rather than rejoining a stuck promise.
    const retry = fakeServer({ parents: [parent(1)] });
    await runSessionHistoryPull({ userId: 'user-1', force: true, deps: deps({ client: retry.client }) });
    expect(retry.calls.length).toBeGreaterThan(0);
  });

  test('a failed refresh after a successful run is not reported fresh and is retried', async () => {
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents: [parent(1)] }).client }) });
    wall += 1000;
    const failing = fakeServer({ parents: [parent(1)], failParentAt: 1 });
    expect((await runSessionHistoryPull({ userId: 'user-1', force: true, deps: deps({ client: failing.client }) })).status).toBe('query');
    expect((await cursorOf()).lastFailureAt).toBe(new Date(wall).toISOString());
    const retry = fakeServer({ parents: [parent(1)] });
    expect((await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: retry.client }) })).status).toBe('complete');
    expect((await cursorOf()).lastFailureAt).toBeNull();
  });

  test('an actor change while a request is queued cancels the run before it starts', async () => {
    const queue = createSupabaseRequestQueue();
    let releasePredecessor;
    const predecessorStarted = new Promise((started) => {
      queue.enqueue(() => new Promise((resolve) => { releasePredecessor = resolve; started(); }));
    });
    await predecessorStarted;
    let markEnqueued;
    const historyEnqueued = new Promise((resolve) => { markEnqueued = resolve; });
    const enqueueRequest = (task) => { const queued = queue.enqueue(task); markEnqueued(); return queued; };
    const server = fakeServer({ parents: [parent(1)] });
    const run = runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: server.client, enqueueRequest, requestTimeoutMs: 5000 }) });
    await historyEnqueued; // the history request is genuinely waiting in the queue
    resetSessionHistoryForActorChange();
    releasePredecessor();
    expect((await run).status).toBe('cancelled');
    await queue.enqueue(() => null);
    expect(server.calls).toHaveLength(0);
    expect(await cursorOf()).toBeNull();
  });

  // Task 6 supplies the presenter and un-skips these two UI completeness checks.
  test.skip('a budget stop during a due re-walk stays incomplete and resumes', async () => {
    const { describeHistoryState } = require('../src/utils/syncStatusPresenter');
    const parents = Array.from({ length: 450 }, (_, i) => parent(i + 1));
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents }).client }) });
    await addDeliveryChild('child-new');
    let saved = 0;
    const cut = await runSessionHistoryPull({ userId: 'user-1', deps: deps({
      client: fakeServer({ parents }).client,
      runBudgetMs: 1000,
      onPageSaved: () => { saved += 1; },
      now: () => (saved >= 4 ? 1e9 : 0), // three delta pages (overlap re-reads all), then one re-walk page
    }) });
    expect(cut.status).toBe('partial');
    const midway = await cursorOf();
    expect(midway).toMatchObject({ deltaComplete: true, complete: false, updatedAt: iso(450) });
    expect(midway.rescanAfter).toEqual({ updatedAt: iso(200), id: uuid(200) });
    expect(describeHistoryState({ running: false, pullState: { lastPulledAt: midway.lastPulledAt, cursor: JSON.stringify(midway) } }).label)
      .not.toBe('Up to date');
    expect((await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents }).client }) })).status).toBe('complete');
    expect(await cursorOf()).toMatchObject({ complete: true, rescanAfter: null, rescanChildIds: ['child-new'] });
  });

  test.skip('a budget stop before a due re-walk starts also stays incomplete', async () => {
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents: [parent(1)] }).client }) });
    await addDeliveryChild('child-new');
    let saved = 0;
    const cut = await runSessionHistoryPull({ userId: 'user-1', deps: deps({
      client: fakeServer({ parents: [parent(1)] }).client,
      runBudgetMs: 1000,
      onPageSaved: () => { saved += 1; },
      now: () => (saved >= 1 ? 1e9 : 0), // budget spent right after the delta page
    }) });
    expect(cut.status).toBe('partial');
    expect(await cursorOf()).toMatchObject({ deltaComplete: true, complete: false, rescanAfter: null });
  });

  test('an actor change after a response arrives commits nothing', async () => {
    const server = fakeServer({ parents: [parent(1)], onParentCall: () => resetSessionHistoryForActorChange() });
    expect((await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: server.client }) })).status).toBe('cancelled');
    expect((await db.getFirstAsync('select count(*) as n from sessions')).n).toBe(0);
    expect(await cursorOf()).toBeNull();
  });

  test('a parent with zero attendees does not stall the cursor', async () => {
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents: [parent(1), parent(2)] }).client }) });
    expect((await cursorOf()).updatedAt).toBe(iso(2));
  });

  test('a new academic year resets the window and the cursor', async () => {
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents: [parent(1)] }).client }) });
    await db.runAsync('update academic_years set is_active = 0');
    await db.runAsync("insert into academic_years (id, label, starts_on, ends_on, is_active) values ('year-2027', '2027', '2027-01-14', '2027-12-10', 1)");
    const next = fakeServer({ parents: [] });
    await runSessionHistoryPull({ userId: 'user-1', force: true, deps: deps({ client: next.client }) });
    expect(next.parentCalls()[0].args).toMatchObject({ p_window_start: '2027-01-14', p_after_updated_at: null, p_overlap_seconds: 0 });
  });

  test('a second user on the same device starts fresh', async () => {
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents: [parent(1)] }).client }) });
    await db.runAsync("insert into staff_programme_assignments (id, user_id, programme_id, school_id, assigned_at) values ('spa-user-2', 'user-2', 'programme-a', 'school-1', '2026-01-15T00:00:00.000Z')");
    const other = fakeServer({ parents: [] });
    await runSessionHistoryPull({ userId: 'user-2', deps: deps({ client: other.client }) });
    expect(other.parentCalls()[0].args.p_after_updated_at).toBeNull();
  });

  test('a Programme change is a new scope with a fresh first hydration', async () => {
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents: [parent(1)] }).client }) });
    await db.runAsync("update staff_programme_assignments set ended_at = '2026-09-02T00:00:00.000Z' where id = 'spa-user-1'");
    await db.runAsync("insert into staff_programme_assignments (id, user_id, programme_id, school_id, assigned_at) values ('spa-user-1b', 'user-1', 'programme-b', 'school-1', '2026-09-02T00:00:00.000Z')");
    const next = fakeServer({ parents: [] });
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: next.client }) });
    expect(next.parentCalls()[0].args).toMatchObject({ p_programme_id: 'programme-b', p_after_updated_at: null });
  });

  test.each(['Programme', 'academic year'])('missing %s reports dependency without a request or stamp', async (missing) => {
    await db.runAsync(missing === 'Programme'
      ? "update staff_programme_assignments set ended_at = '2026-09-26'"
      : 'update academic_years set is_active = 0');
    const server = fakeServer({ parents: [parent(1)] });
    expect((await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: server.client }) })).status).toBe('dependency');
    expect(server.calls).toHaveLength(0);
    expect((await db.getFirstAsync('select count(*) as n from sync_state')).n).toBe(0);
  });

  test('a routine up-to-date check refreshes last_pulled_at', async () => {
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents: [parent(1)] }).client }) });
    wall += 20 * 60 * 1000; // past the 15-minute staleness, inside the weekly re-walk interval
    expect((await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents: [parent(1)] }).client }) })).status).toBe('complete');
    expect((await cursorOf()).lastPulledAt).toBe(new Date(wall).toISOString());
  });

  test('a fresh completed scope is skipped unless forced', async () => {
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents: [parent(1)] }).client }) });
    const again = fakeServer({ parents: [parent(1)] });
    expect((await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: again.client }) })).status).toBe('fresh');
    expect(again.calls).toHaveLength(0);
  });

  test('a concurrent call joins the in-flight run instead of starting a second traversal', async () => {
    const server = fakeServer({ parents: [parent(1)] });
    const first = runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: server.client }) });
    const joined = runSessionHistoryPull({ userId: 'user-1', force: true, deps: deps({ client: server.client }) });
    expect(joined).toBe(first);
    const [a, b] = await Promise.all([first, joined]);
    expect(a).toBe(b);
    expect(server.parentCalls()).toHaveLength(1);
  });

  test('attendees beyond one attendee page are fetched with the attendee cursor', async () => {
    const p = parent(1);
    const many = Array.from({ length: 250 }, (_, i) => ({
      id: `a-${String(i).padStart(4, '0')}`, session_id: p.id, child_id: 'child-1', group_id: null,
      attendance_status: 'present', grade_snapshot: null, notes: null, created_at: iso(1), updated_at: iso(1),
      child_first_name: 'A', child_last_name: 'B', child_preferred_name: null,
    }));
    const calls = [];
    const client = { rpc: (name, args) => ({ abortSignal: () => {
      calls.push({ name, args });
      if (name === 'get_delivery_history_page') return Promise.resolve({ data: args.p_after_updated_at ? [] : [p], error: null });
      const start = args.p_after_attendee_id ? many.findIndex((a) => a.id === args.p_after_attendee_id) + 1 : 0;
      return Promise.resolve({ data: many.slice(start, start + args.p_page_size), error: null });
    } }) };
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client }) });
    const attendeeCalls = calls.filter((c) => c.name === 'get_delivery_history_attendee_page');
    expect(attendeeCalls).toHaveLength(2);
    expect(attendeeCalls[1].args).toMatchObject({ p_after_session_id: p.id, p_after_attendee_id: 'a-0199' });
    expect((await db.getFirstAsync('select count(*) as n from session_attendees')).n).toBe(250);
  });
});
