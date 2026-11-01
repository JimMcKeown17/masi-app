jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ ...require('../test-support/supabaseTestConfig'), supabase: {} }));
import { runMigrations } from '../src/db/migrations';
import { createMigratedDatabase } from '../test-support/sqliteRepositoryTestUtils';
import { seedHistoryData, serverFamily, serverRun, USER, OTHER_USER, CHILD, UNKNOWN_CHILD, PROGRAMME, uuid, stamp } from '../test-support/assessmentHistoryFixtures';
import { createHistoryServer, masteryRow } from '../test-support/assessmentHistoryServer';
import { createAssessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { createMasteryRepository } from '../src/db/repositories/masteryRepository';
import { loadMasteryState, countMastered } from '../src/utils/masteryState';
import {
  createAssessmentHistoryStates, runAssessmentHistoryPull, runBatteryRunHistoryPull,
  runLetterMasteryHistoryPull, assessmentHistoryScope, batteryRunHistoryScope,
  letterMasteryHistoryScope, readAssessmentScope, readMasteryScope,
  ASSESSMENT_HISTORY_PAGE_SIZE, ASSESSMENT_HISTORY_FIRST_PAGE_SIZE,
  BATTERY_RUN_HISTORY_PAGE_SIZE, LETTER_MASTERY_PAGE_SIZE,
} from '../src/services/assessmentHistoryPull';

const A = 'get_assessment_history_page', B = 'get_battery_run_history_page', M = 'get_letter_mastery_page';
const T1 = '2026-09-01T08:00:00.000001+00:00';
const T2 = '2026-09-01T08:20:00.000001+00:00';
const T3 = '2026-09-01T08:40:00.000001+00:00';
const programmeWalks = [
  [runAssessmentHistoryPull, 'assessments', A, assessmentHistoryScope, 'assessments'],
  [runBatteryRunHistoryPull, 'batteryRuns', B, batteryRunHistoryScope, 'battery_runs'],
];

describe('assessment, run and mastery history walks', () => {
  let db, states, wall, server;
  const deps = (key, extra = {}) => ({
    database: db, state: states[key], client: server.client, enqueueRequest: task => task(),
    wallNow: () => wall, now: () => 0, random: () => 0, ...extra,
  });
  const run = (walk, key, extra = {}) => walk({ userId: USER, deps: deps(key), ...extra });
  const cursor = async scope => JSON.parse((await db.getFirstAsync('select cursor from sync_state where scope = ?', scope)).cursor);
  const ac = () => cursor(assessmentHistoryScope(USER, PROGRAMME));
  const mc = () => cursor(letterMasteryHistoryScope(USER));
  const delivery = async (id = CHILD, status = 'synced') => {
    await db.runAsync("insert or ignore into children (id, first_name, last_name) values (?, 'Local', 'Child')", id);
    await db.runAsync("insert into child_ea_assignments (id, user_id, child_id, sync_status, assigned_at) values (?, ?, ?, ?, '2026-01-15')", 'cea-' + id, USER, id, status);
  };
  const heldClass = async (id = 'class-1', status = 'synced') => {
    await db.runAsync("insert or ignore into classes (id, school_id, name, grade, academic_year_id) values (?, 'school-1', ?, '1', 'year-2026')", id, id);
    // Any programme grants assessment scope, not just the active programme.
    await db.runAsync("insert into class_ea_assignments (id, class_id, ea_user_id, programme_id, sync_status, assigned_at) values (?, ?, ?, 'programme-b', ?, '2026-01-15')", 'ca-' + id, id, USER, status);
  };
  const member = (childId = CHILD, classId = 'class-1', status = 'synced', year = 'year-2026', exited = null) =>
    db.runAsync("insert into child_class_memberships (id, child_id, class_id, academic_year_id, sync_status, exited_at, enrolled_at) values (?, ?, ?, ?, ?, ?, '2026-01-15')",
      'cm-' + childId + classId + year, childId, classId, year, status, exited);
  const year2027 = async () => {
    await db.runAsync('update academic_years set is_active = 0');
    await db.runAsync("insert into academic_years (id, label, starts_on, ends_on, is_active) values ('year-2027', '2027', '2027-01-15', '2027-12-15', 1)");
    server.year = 'year-2027';
  };
  beforeEach(async () => {
    db = await createMigratedDatabase(runMigrations);
    await seedHistoryData(db);
    await db.runAsync("update staff_programme_assignments set assigned_at = '2026-01-15'");
    states = createAssessmentHistoryStates();
    wall = Date.parse('2026-09-01T09:00:00Z');
    server = createHistoryServer();
  });
  afterEach(async () => { await db.closeAsync(); });

  test('a fresh phone shows another EA\'s letter result and confirmation', async () => {
    await delivery(); await heldClass(); await member();
    const header = serverRun(1, { user_id: OTHER_USER });
    const family = { ...serverFamily(1, { run: header }), user_id: OTHER_USER };
    // 61 stored items, including repeated prompts; evidence comes from their prompts.
    family.items.forEach((item, i) => { item.prompt = i % 2 ? 'a' : 'm'; });
    server.lists = { [B]: () => [header], [A]: () => [family], [M]: () => [masteryRow(CHILD, 'k', T1)] };
    for (const [walk, key] of [[runBatteryRunHistoryPull, 'batteryRuns'], [runAssessmentHistoryPull, 'assessments'], [runLetterMasteryHistoryPull, 'mastery']]) {
      expect(await run(walk, key)).toEqual({ status: 'complete', pages: 1 });
    }
    expect(server.calls.map(c => c.name)).toEqual([B, A, M]);
    expect((await db.getFirstAsync('select count(*) n from assessment_items')).n).toBe(61);
    const state = await loadMasteryState({ repositories: {
      assessments: createAssessmentsRepository({ database: db }), mastery: createMasteryRepository({ database: db }),
    }, userId: USER, childId: CHILD, languageCode: 'en' });
    expect(state.assessmentMastered).toEqual(new Set(['a', 'm']));
    expect(state.taughtRecords.map(row => row.letter)).toEqual(['k']);
    expect(countMastered({ ...state, taughtLetters: new Set(['k']) })).toBe(3);
    expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
  });

  test('a run with no Questions arrives through the run walk, and its completion through a delta', async () => {
    let row = serverRun();
    server.lists[B] = () => [row];
    expect((await run(runBatteryRunHistoryPull, 'batteryRuns')).status).toBe('complete');
    expect(await db.getFirstAsync('select status, started_here from battery_runs')).toEqual({ status: 'in_progress', started_here: 0 });
    expect(await db.getAllAsync('select * from assessments')).toEqual([]);
    row = { ...row, status: 'completed', completed_at: T2, updated_at: T2 };
    wall += 16 * 60_000; server.calls.length = 0;
    await run(runBatteryRunHistoryPull, 'batteryRuns');
    expect(server.calls[0].args).toMatchObject({ p_after_id: row.id, p_after_updated_at: stamp(), p_overlap_seconds: 120 });
    expect(await db.getFirstAsync('select status, completed_at from battery_runs')).toEqual({ status: 'completed', completed_at: T2 });
  });

  test('a class gained re-walks the assessment and run walks', async () => {
    await heldClass();
    const recentFamily = serverFamily(2), recentRun = serverRun(2);
    server.lists = { [A]: () => [recentFamily], [B]: () => [recentRun] };
    for (const [walk, key] of programmeWalks) await run(walk, key);
    await heldClass('class-2');
    const older = '2026-03-01T08:00:00.000001+00:00';
    server.lists = { [A]: () => [{ ...serverFamily(1), updated_at: older, assessment_date: '2026-03-01' }, recentFamily],
      [B]: () => [serverRun(1, { updated_at: older, started_at: older }), recentRun] };
    for (const [walk, key, rpc, scope] of programmeWalks) {
      server.calls.length = 0;
      expect((await run(walk, key)).status).toBe('complete');
      expect(server.calls.filter(c => c.name === rpc).some(c => c.args.p_after_id === null)).toBe(true);
      expect((await cursor(scope(USER, PROGRAMME))).rescanClassIds).toEqual(['class-1', 'class-2']);
    }
    expect((await db.getFirstAsync('select count(*) n from assessments')).n).toBe(2);
    expect((await db.getFirstAsync('select count(*) n from battery_runs')).n).toBe(2);
  });

  test('a delivery child moving into a held class re-walks', async () => {
    await delivery(); await heldClass();
    for (const [walk, key] of programmeWalks) await run(walk, key);
    await member();
    for (const [walk, key, rpc] of programmeWalks) {
      server.calls.length = 0;
      await run(walk, key);
      expect(server.calls.filter(c => c.name === rpc)).toHaveLength(2);
      expect(server.calls[1].args.p_after_id).toBeNull();
    }
    expect((await ac()).rescanChildIds).toEqual([CHILD]);
  });

  test('a pending membership or class assignment is not coverage', async () => {
    await delivery(); await heldClass();
    for (const [walk, key] of programmeWalks) await run(walk, key);
    await member(CHILD, 'class-1', 'pending'); await heldClass('class-2', 'pending');
    expect(await readAssessmentScope(db, { userId: USER, academicYearId: 'year-2026' }))
      .toEqual({ classIds: ['class-1'], childIds: [] });
    for (const [walk, key] of programmeWalks) expect(await run(walk, key)).toEqual({ status: 'fresh', pages: 0 });
    await delivery(UNKNOWN_CHILD, 'pending');
    expect(await readMasteryScope(db, { userId: USER })).toEqual({ childIds: [CHILD] });
  });

  test('assessment scope is sorted, distinct, actor and year bound, and includes exited memberships', async () => {
    await delivery(); await heldClass('class-2'); await heldClass();
    await member(CHILD, 'class-2'); await member(CHILD, 'class-1', 'synced', 'year-2026', T1);
    await db.runAsync("insert into academic_years (id, label, starts_on, ends_on) values ('year-old', 'old', '2025-01-01', '2025-12-31')");
    await delivery(UNKNOWN_CHILD); await member(UNKNOWN_CHILD, 'class-1', 'synced', 'year-old');
    await heldClass('class-other');
    await db.runAsync("update class_ea_assignments set ea_user_id = ? where class_id = 'class-other'", OTHER_USER);
    expect(await readAssessmentScope(db, { userId: USER, academicYearId: 'year-2026' }))
      .toEqual({ classIds: ['class-1', 'class-2'], childIds: [CHILD] });
  });

  test('a delivery child gained re-walks the mastery walk', async () => {
    await run(runLetterMasteryHistoryPull, 'mastery');
    await delivery();
    server.lists[M] = () => [masteryRow(CHILD, 'k', T1)];
    server.calls.length = 0;
    expect((await run(runLetterMasteryHistoryPull, 'mastery')).status).toBe('complete');
    expect(server.calls).toHaveLength(2);
    expect(server.calls[1].args.p_after_id).toBeNull();
    expect((await mc()).rescanChildIds).toEqual([CHILD]);
  });

  test('a delivery child lost, corrected while hidden, then regained converges', async () => {
    await delivery(); await delivery(UNKNOWN_CHILD);
    let hidden = false, a = masteryRow(CHILD, 'k', T1), b = masteryRow(UNKNOWN_CHILD, 'a', T1);
    server.lists[M] = () => hidden ? [b] : [a, b];
    await run(runLetterMasteryHistoryPull, 'mastery');
    await db.runAsync('update child_ea_assignments set unassigned_at = ? where child_id = ?', T2, CHILD);
    hidden = true; a = { ...a, confirmed: false, changed_at: T2, updated_at: T2 };
    b = { ...b, changed_at: T3, updated_at: T3 };
    wall += 16 * 60_000;
    await run(runLetterMasteryHistoryPull, 'mastery');
    expect(await mc()).toMatchObject({ updatedAt: T3, rescanChildIds: [UNKNOWN_CHILD] });
    expect((await db.getFirstAsync('select confirmed from letter_mastery where id = ?', a.id)).confirmed).toBe(1);
    await db.runAsync('update child_ea_assignments set unassigned_at = null where child_id = ?', CHILD);
    hidden = false; server.calls.length = 0;
    await run(runLetterMasteryHistoryPull, 'mastery');
    expect(server.calls.some(c => c.args.p_after_id === null)).toBe(true);
    expect(await db.getFirstAsync('select confirmed, server_changed_at from letter_mastery where id = ?', a.id))
      .toEqual({ confirmed: 0, server_changed_at: T2 });
    expect((await mc()).rescanChildIds).toEqual([CHILD, UNKNOWN_CHILD]);
  });

  test('a class lost, a co-EA\'s result added while hidden, then the class regained re-walks', async () => {
    await heldClass(); await delivery(UNKNOWN_CHILD); await member(UNKNOWN_CHILD);
    let hidden = false, families = [], headers = [];
    server.lists = { [A]: () => hidden ? families.filter(r => r.user_id === USER) : families,
      [B]: () => hidden ? headers.filter(r => r.user_id === USER) : headers };
    for (const [walk, key] of programmeWalks) await run(walk, key);
    await db.runAsync("update class_ea_assignments set unassigned_at = ? where class_id = 'class-1'", T2);
    hidden = true;
    families = [{ ...serverFamily(1, { childId: UNKNOWN_CHILD }), user_id: OTHER_USER, updated_at: T2 }, { ...serverFamily(2), updated_at: T3 }];
    headers = [serverRun(1, { child_id: UNKNOWN_CHILD, user_id: OTHER_USER, updated_at: T2 }), serverRun(2, { updated_at: T3 })];
    wall += 16 * 60_000;
    for (const [walk, key, , scope] of programmeWalks) {
      await run(walk, key);
      expect(await cursor(scope(USER, PROGRAMME))).toMatchObject({ updatedAt: T3, rescanClassIds: [] });
    }
    await db.runAsync("update class_ea_assignments set unassigned_at = null where class_id = 'class-1'");
    hidden = false;
    for (const [walk, key, , , table] of programmeWalks) {
      server.calls.length = 0;
      await run(walk, key);
      expect(server.calls.some(c => c.args.p_after_id === null)).toBe(true);
      expect((await db.getFirstAsync('select count(*) n from ' + table)).n).toBe(2);
    }
  });

  test('a stale local year never completes', async () => {
    server.year = 'year-2027'; server.lists[A] = () => [serverFamily(1)];
    expect(await run(runAssessmentHistoryPull, 'assessments')).toEqual({ status: 'year_mismatch', pages: 0 });
    expect(server.calls[0].args.p_academic_year_id).toBe('year-2026');
    expect(await ac()).toMatchObject({ lastFailureAt: new Date(wall).toISOString(), complete: false });
    expect(await db.getAllAsync('select * from assessments')).toEqual([]);
  });

  test('a server year change between pages stops at the saved page', async () => {
    const families = Array.from({ length: 15 }, (_, i) => serverFamily(i + 1, { items: 1 }));
    server.lists[A] = () => families;
    server.onRequest = () => { if (server.calls.length === 2) server.year = 'year-2027'; };
    expect(await run(runAssessmentHistoryPull, 'assessments')).toEqual({ status: 'year_mismatch', pages: 1 });
    expect(await ac()).toMatchObject({ updatedAt: families[9].updated_at, id: families[9].id, complete: false });
    expect((await db.getFirstAsync('select count(*) n from assessments')).n).toBe(10);
    server.onRequest = null; server.calls.length = 0; server.lists[A] = () => [];
    await year2027();
    await run(runAssessmentHistoryPull, 'assessments');
    expect(server.calls[0].args).toMatchObject({ p_after_id: null, p_academic_year_id: 'year-2027', p_overlap_seconds: 0 });
  });

  test('absence never deletes', async () => {
    server.lists = { [A]: () => [serverFamily(1)], [M]: () => [masteryRow(CHILD, 'k', T1)] };
    await run(runAssessmentHistoryPull, 'assessments'); await run(runLetterMasteryHistoryPull, 'mastery');
    server.lists = {}; wall += 9 * 24 * 60 * 60_000;
    await run(runAssessmentHistoryPull, 'assessments'); await run(runLetterMasteryHistoryPull, 'mastery');
    expect((await db.getFirstAsync('select count(*) n from assessments')).n).toBe(1);
    expect((await db.getFirstAsync('select count(*) n from assessment_items')).n).toBe(61);
    expect((await db.getFirstAsync('select count(*) n from letter_mastery')).n).toBe(1);
  });

  test('a disabled walk keeps its data and cursor and resumes when re-enabled', async () => {
    const family = serverFamily(1); server.lists[A] = () => [family];
    await run(runAssessmentHistoryPull, 'assessments');
    const before = await ac();
    server.disabled.add(A); server.calls.length = 0;
    expect(await run(runAssessmentHistoryPull, 'assessments', { force: true })).toEqual({ status: 'disabled', pages: 0 });
    expect(await ac()).toMatchObject({ updatedAt: before.updatedAt, id: before.id, complete: false, lastFailureAt: expect.any(String) });
    expect((await db.getFirstAsync('select count(*) n from assessments')).n).toBe(1);
    server.disabled.delete(A); server.calls.length = 0;
    expect((await run(runAssessmentHistoryPull, 'assessments', { force: true })).status).toBe('complete');
    expect(server.calls[0].args).toMatchObject({ p_after_id: family.id, p_overlap_seconds: 120 });
  });

  test('a new academic year resets the assessment and run cursors, not the mastery cursor', async () => {
    server.lists = { [A]: () => [serverFamily(1)], [B]: () => [serverRun()], [M]: () => [masteryRow(CHILD, 'k', T1)] };
    for (const [walk, key] of [...programmeWalks, [runLetterMasteryHistoryPull, 'mastery']]) await run(walk, key);
    const masteryBefore = await mc();
    await year2027(); server.calls.length = 0; server.lists = {};
    for (const [walk, key] of [...programmeWalks, [runLetterMasteryHistoryPull, 'mastery']]) await run(walk, key, { force: true });
    expect(server.calls.filter(c => c.name !== M).every(c => c.args.p_after_id === null && c.args.p_academic_year_id === 'year-2027')).toBe(true);
    expect(server.calls.find(c => c.name === M).args).toMatchObject({ p_after_id: masteryBefore.id, p_after_updated_at: T1, p_overlap_seconds: 120 });
    expect((await mc()).windowStart).toBeNull();
  });

  test('a restart resumes from the saved cursor', async () => {
    const families = Array.from({ length: 65 }, (_, i) => serverFamily(i + 1, { items: 1 }));
    server.lists[A] = () => families;
    let saved = 0;
    expect(await runAssessmentHistoryPull({ userId: USER, deps: deps('assessments', {
      onPageSaved: () => { saved++; }, now: () => saved ? 60_001 : 0,
    }) })).toEqual({ status: 'partial', pages: 1 });
    expect(await ac()).toMatchObject({ id: families[9].id, updatedAt: families[9].updated_at, complete: false });
    states = createAssessmentHistoryStates(); server.calls.length = 0;
    expect((await run(runAssessmentHistoryPull, 'assessments')).status).toBe('complete');
    expect(server.calls[0].args).toMatchObject({ p_after_id: families[9].id, p_after_updated_at: families[9].updated_at, p_overlap_seconds: 0, p_page_size: 10 });
    expect(server.calls.map(c => c.args.p_page_size)).toEqual([10, 50]);
    expect((await db.getFirstAsync('select count(*) n from assessments')).n).toBe(65);
  });

  test('requests carry the active programme; with none, both programme walks report dependency without a request', async () => {
    for (const [walk, key] of programmeWalks) await run(walk, key);
    expect(server.calls.every(c => c.args.p_programme_id === PROGRAMME && c.args.p_academic_year_id === 'year-2026')).toBe(true);
    await db.runAsync('update staff_programme_assignments set ended_at = ?', T1);
    server.calls.length = 0;
    for (const [walk, key] of programmeWalks) expect(await run(walk, key)).toEqual({ status: 'dependency', pages: 0 });
    expect(server.calls).toEqual([]);
    expect((await run(runLetterMasteryHistoryPull, 'mastery')).status).toBe('complete');
  });

  test.each(['assessments', 'batteryRuns', 'mastery'])('a %s page saver validation failure remains query and records failure without advancing', async key => {
    const row = key === 'assessments' ? { ...serverFamily(1), total_items: 62 }
      : key === 'batteryRuns' ? serverRun(1, { status: 'bad-status' })
        : masteryRow(CHILD, 'k', T1, { changed_at: 'invalid' });
    const [walk, rpc, scope] = key === 'assessments' ? [runAssessmentHistoryPull, A, assessmentHistoryScope(USER, PROGRAMME)]
      : key === 'batteryRuns' ? [runBatteryRunHistoryPull, B, batteryRunHistoryScope(USER, PROGRAMME)]
        : [runLetterMasteryHistoryPull, M, letterMasteryHistoryScope(USER)];
    server.lists[rpc] = () => [row];
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await run(walk, key)).toEqual({ status: 'query', pages: 0 });
      expect(await cursor(scope)).toMatchObject({ id: null, updatedAt: null, complete: false, lastFailureAt: new Date(wall).toISOString() });
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('failureKind=query'));
      for (const table of ['assessments', 'battery_runs', 'letter_mastery']) expect(await db.getAllAsync('select * from ' + table)).toEqual([]);
    } finally { warning.mockRestore(); }
  });

  test('a saver query failure on a later page retains the committed family cursor', async () => {
    const rows = Array.from({ length: 15 }, (_, i) => serverFamily(i + 1, { items: 1 }));
    rows[10] = { ...rows[10], total_items: 2 };
    server.lists[A] = () => rows;
    expect(await run(runAssessmentHistoryPull, 'assessments')).toEqual({ status: 'query', pages: 1 });
    expect(await ac()).toMatchObject({ id: rows[9].id, updatedAt: rows[9].updated_at,
      complete: false, lastFailureAt: new Date(wall).toISOString() });
    expect((await db.getFirstAsync('select count(*) n from assessments')).n).toBe(10);
    expect((await db.getFirstAsync('select count(*) n from assessment_items')).n).toBe(10);
  });

  test('without an active year the programme walks depend on reference data but mastery can run', async () => {
    await db.runAsync('update academic_years set is_active = 0');
    for (const [walk, key] of programmeWalks) expect(await run(walk, key)).toEqual({ status: 'dependency', pages: 0 });
    expect(server.calls).toEqual([]);
    expect(await db.getAllAsync('select * from sync_state')).toEqual([]);
    expect(await run(runLetterMasteryHistoryPull, 'mastery')).toEqual({ status: 'complete', pages: 1 });
    expect(server.calls[0].args).toEqual({ p_after_updated_at: null, p_after_id: null,
      p_page_size: 200, p_overlap_seconds: 0 });
  });

  test('page sizes and scope keys are the public contract', () => {
    expect([ASSESSMENT_HISTORY_FIRST_PAGE_SIZE, ASSESSMENT_HISTORY_PAGE_SIZE, BATTERY_RUN_HISTORY_PAGE_SIZE, LETTER_MASTERY_PAGE_SIZE]).toEqual([10, 50, 200, 200]);
    expect(assessmentHistoryScope(USER, PROGRAMME)).toBe('assessment_history_pull:' + USER + ':' + PROGRAMME);
    expect(batteryRunHistoryScope(USER, PROGRAMME)).toBe('battery_run_history_pull:' + USER + ':' + PROGRAMME);
    expect(letterMasteryHistoryScope(USER)).toBe('letter_mastery_pull:' + USER);
    expect(new Set(Object.values(states)).size).toBe(4);
  });
});
