global.__MASI_NO_DEFAULT_HANDLE__ = true;
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ ...require('../test-support/supabaseTestConfig'), supabase: {} }));
import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { useAssessmentHistoryStatus } from '../src/services/assessmentHistoryStatus';
import { getActiveAcademicYear } from '../src/db/repositories/domainRepositoryUtils';
import { createHistoryStoreFixture } from '../test-support/assessmentHistoryStoreFixture';
import { deferred } from '../test-support/assessmentHistoryServer';
import { PROGRAMME, serverFamily, uuid } from '../test-support/assessmentHistoryFixtures';
import { createLocalStateRepository } from '../src/db/repositories/localStateRepository';
import { describeCombinedHistoryState } from '../src/utils/syncStatusPresenter';
import { isMasteryInputsComplete } from '../src/services/pullCoverage';
import { StaleActorError } from '../src/session/staleActor';
import { createAssessmentHistoryStates } from '../src/services/assessmentHistoryPull';
import { resetHistoryWalkState } from '../src/services/historyWalk';

const B = 'get_battery_run_history_page', A = 'get_assessment_history_page', M = 'get_letter_mastery_page';
describe('assessment history store', () => {
  let f, store;
  beforeEach(async () => { f = await createHistoryStoreFixture(); store = f.makeStore(); });
  afterEach(async () => { await f.db.closeAsync(); jest.restoreAllMocks(); });
  const start = (force = false) => store.start({ userId: 'user-1', force });

  test('one pass calls the run, assessment and mastery RPCs in that order', async () => {
    const references = deferred();
    f.referenceDataReady.mockReturnValueOnce(references.promise);
    const pending = start();
    await Promise.resolve();
    expect(f.server.calls).toEqual([]);
    references.resolve();
    await pending;
    expect(f.server.calls.map(call => call.name)).toEqual([B, A, M]);
    expect(store.getSnapshot()).toEqual({ running: false, pageVersion: 3, runVersion: 1,
      lastResults: { batteryRuns: { status: 'complete', pages: 1 }, assessments: { status: 'complete', pages: 1 }, mastery: { status: 'complete', pages: 1 } } });
  });

  test.each(['fresh', 'previously completed'])('%s reference cache hydrates a non-null assessment tool before the history family and cursor commit', async cache => {
    const localState = createLocalStateRepository({ database: f.db });
    if (cache === 'previously completed') {
      await f.refreshReferenceData();
      expect(await localState.get('reference_data_complete_at')).toEqual(expect.any(String));
    }
    const toolId = uuid(880);
    f.referenceRows.assessment_tools = [{ id: toolId, programme_id: PROGRAMME,
      code: 'history-letter-tool', name: 'Letter tool', is_active: true, config: { version: 1 } }];
    const family = { ...serverFamily(1), assessment_tool_id: toolId };
    f.server.lists[A] = () => [family];
    store = f.makeStore({ referenceDataReady: f.refreshReferenceData });
    expect((await start()).assessments.status).toBe('complete');
    expect(await f.db.getFirstAsync('select assessment_tool_id from assessments where id = ?', family.id))
      .toEqual({ assessment_tool_id: toolId });
    expect(await f.db.getFirstAsync('select id, config from assessment_tools where id = ?', toolId))
      .toEqual({ id: toolId, config: JSON.stringify({ version: 1 }) });
    expect(JSON.parse((await store.getPullStates('user-1')).assessments.cursor).complete).toBe(true);
    expect(f.server.client.from).toHaveBeenCalledWith('assessment_tools');
  });

  test.each([2, 3])('%i start calls during one pass give exactly one trailing pass', async count => {
    const entered = deferred(), release = deferred();
    f.server.onRequest = async () => { if (f.server.calls.length === 1) { entered.resolve(); await release.promise; } };
    const first = start();
    await entered.promise;
    const waiting = Array.from({ length: count - 1 }, (_, i) => start(i === count - 2));
    if (count === 3) expect(waiting[0]).toBe(waiting[1]);
    expect(f.server.calls).toHaveLength(1);
    release.resolve();
    await Promise.all([first, ...waiting]);
    expect(f.referenceDataReady).toHaveBeenCalledTimes(2);
    expect(f.server.calls.map(call => call.name)).toEqual([B, A, M, B, A, M]);
    expect(store.getSnapshot()).toMatchObject({ running: false, runVersion: 2, pageVersion: 6 });
  });

  test('a class persisted mid-pass is re-walked by the trailing pass', async () => {
    const entered = deferred(), release = deferred();
    f.server.onRequest = async name => { if (name === M && f.server.calls.length === 3) { entered.resolve(); await release.promise; } };
    const first = start();
    await entered.promise; // Both programme walks have already snapshotted empty coverage.
    await f.db.runAsync("insert into class_ea_assignments (id, class_id, ea_user_id, programme_id, sync_status) values ('ca-new', 'class-1', 'user-1', ?, 'synced')", PROGRAMME);
    const older = { ...serverFamily(1), assessment_date: '2026-03-01', updated_at: '2026-03-01T08:00:00.000001+00:00' };
    f.server.lists[A] = () => [older];
    const trailing = start();
    release.resolve();
    await Promise.all([first, trailing]);
    expect((await f.db.getFirstAsync('select count(*) n from assessments')).n).toBe(1);
    expect((await store.getPullStates('user-1')).assessments.cursor).toContain('"rescanClassIds":["class-1"]');
    expect(f.server.calls.filter(call => call.name === A)).toHaveLength(3); // first pass; trailing delta + re-walk
  });

  test("a previous actor's pass cannot publish into the next actor's snapshot", async () => {
    await f.db.runAsync("insert into staff_programme_assignments (id, user_id, programme_id) values ('spa-b', 'user-2', ?)", PROGRAMME);
    const aEntered = deferred(), aRelease = deferred(), bEntered = deferred(), bRelease = deferred();
    f.server.onRequest = async () => {
      if (f.server.calls.length === 1) { aEntered.resolve(); await aRelease.promise; }
      else if (f.server.calls.length === 2) { bEntered.resolve(); await bRelease.promise; }
    };
    const wrapper = ({ children }) => <SignedInEAContext.Provider value={{ services: { assessmentHistory: { store } } }}>{children}</SignedInEAContext.Provider>;
    const { result } = renderHook(useAssessmentHistoryStatus, { wrapper });
    let old, next;
    act(() => { old = start(); });
    await aEntered.promise;
    act(() => store.reset());
    act(() => { next = store.start({ userId: 'user-2' }); });
    await act(async () => { await bEntered.promise; });
    const before = result.current;
    await act(async () => { aRelease.resolve(); await old; });
    expect(result.current).toBe(before);
    await act(async () => { bRelease.resolve(); await next; });
    expect(result.current).toMatchObject({ running: false, pageVersion: 3, lastResults: {
      batteryRuns: { status: 'complete' }, assessments: { status: 'complete' }, mastery: { status: 'complete' },
    } });
    expect((await store.getPullStates('user-1')).batteryRuns).toBeNull();
  });

  test('getPullStates is scoped to the user and active programme', async () => {
    await start();
    expect(await store.getPullStates('user-1')).toMatchObject({
      batteryRuns: { scope: 'battery_run_history_pull:user-1:' + PROGRAMME },
      assessments: { scope: 'assessment_history_pull:user-1:' + PROGRAMME },
      mastery: { scope: 'letter_mastery_pull:user-1' },
    });
    expect(await store.getPullStates('user-2')).toEqual({ batteryRuns: null, assessments: null, mastery: null });
    await f.db.runAsync("update staff_programme_assignments set programme_id = 'programme-b' where user_id = 'user-1'");
    expect(await store.getPullStates('user-1')).toMatchObject({ batteryRuns: null, assessments: null,
      mastery: { scope: 'letter_mastery_pull:user-1' } });
    await f.db.runAsync("update staff_programme_assignments set ended_at = '2099-01-01'");
    expect(await store.getPullStates('user-1')).toMatchObject({ batteryRuns: null, assessments: null,
      mastery: { scope: 'letter_mastery_pull:user-1' } });
    expect(await store.getPullStates(null)).toEqual({ batteryRuns: null, assessments: null, mastery: null });
  });

  const changeServerYear = newFirst => {
    f.server.year = 'year-2027';
    const old = { ...f.referenceRows.academic_years[0], is_active: 0 };
    const next = { id: 'year-2027', label: '2027', starts_on: '2027-01-15', ends_on: '2027-12-15', is_active: 1 };
    f.referenceRows.academic_years = newFirst ? [next, old] : [old, next];
  };

  test('a year change between the run and assessment walks restarts both year-scoped walks', async () => {
    let changed = false, observedRecovery = false;
    f.server.onRequest = async (name, args) => {
      if (name === A && !changed) { changed = true; changeServerYear(true); }
      if (name === B && args.p_academic_year_id === 'year-2027') {
        observedRecovery = true;
        // The new run has not committed yet. Its old completed cursor cannot look current.
        const states = await store.getPullStates('user-1');
        expect(describeCombinedHistoryState({ pullStates: Object.values(states) }).label).not.toBe('Up to date');
      }
    };
    await start();
    expect(observedRecovery).toBe(true);
    expect(f.refreshReferenceData).toHaveBeenCalledTimes(1);
    expect(f.server.calls.map(call => call.name)).toEqual([B, A, B, A, M]);
    const states = await store.getPullStates('user-1');
    for (const state of [states.batteryRuns, states.assessments]) {
      expect(JSON.parse(state.cursor)).toMatchObject({ complete: true, windowStart: '2027-01-15' });
    }
    expect(describeCombinedHistoryState({ pullStates: Object.values(states) }).label).toBe('Up to date');
    expect(await isMasteryInputsComplete({ database: f.db, userId: 'user-1' })).toBe(true);
  });

  test('a reference year switch immediately makes old completed programme cursors incomplete for readers', async () => {
    await start();
    changeServerYear(true);
    await f.refreshReferenceData();
    const before = await f.db.getAllAsync('select * from sync_state order by scope');
    const states = await store.getPullStates('user-1');
    expect(describeCombinedHistoryState({ pullStates: Object.values(states) }).label).not.toBe('Up to date');
    expect(await isMasteryInputsComplete({ database: f.db, userId: 'user-1' })).toBe(false);
    expect(await f.db.getAllAsync('select * from sync_state order by scope')).toEqual(before);
  });

  test.each([true, false])('a year mismatch refreshes reference data once and restarts that walk (new year first: %s)', async newFirst => {
    changeServerYear(newFirst);
    await start();
    expect(f.refreshReferenceData).toHaveBeenCalledTimes(1);
    expect(f.server.calls.map(call => call.name)).toEqual([B, B, A, M]);
    expect(f.server.calls[0].args.p_academic_year_id).toBe('year-2026');
    expect(f.server.calls[1].args).toMatchObject({ p_academic_year_id: 'year-2027', p_after_id: null });
    expect(f.server.calls[2].args.p_academic_year_id).toBe('year-2027');
    expect((await getActiveAcademicYear(f.db)).id).toBe('year-2027');
    for (const result of Object.values(store.getSnapshot().lastResults)) expect(result.status).toBe('complete');
  });

  test('a failed refresh restarts nothing', async () => {
    changeServerYear(true);
    f.referenceErrors.academic_years = { message: 'Network request failed' };
    const log = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await start();
    expect(f.refreshReferenceData).toHaveBeenCalledTimes(1);
    expect(f.server.calls.map(call => call.name)).toEqual([B, A, M]);
    expect(store.getSnapshot().lastResults).toMatchObject({ batteryRuns: { status: 'year_mismatch' },
      assessments: { status: 'year_mismatch' }, mastery: { status: 'complete' } });
    expect((await getActiveAcademicYear(f.db)).id).toBe('year-2026');
    expect(log).toHaveBeenCalledWith('[AssessmentHistory] reference refresh failed', 'Network request failed');
  });

  test('a repeated year mismatch never loops within a pass', async () => {
    changeServerYear(true);
    f.refreshReferenceData.mockResolvedValue(undefined);
    await start();
    expect(f.refreshReferenceData).toHaveBeenCalledTimes(1);
    expect(f.server.calls.map(call => call.name)).toEqual([B, B, A, M]);
    expect(store.getSnapshot().lastResults.batteryRuns.status).toBe('year_mismatch');
  });

  test('a disabled walk permits the other walks to run', async () => {
    f.server.disabled.add(B);
    await start();
    expect(f.server.calls.map(call => call.name)).toEqual([B, A, M]);
    expect(store.getSnapshot().lastResults).toMatchObject({ batteryRuns: { status: 'disabled' }, mastery: { status: 'complete' } });
  });

  test('a stale reference refresh rethrows and ends the pass', async () => {
    changeServerYear(true);
    f.refreshReferenceData.mockRejectedValueOnce(new StaleActorError());
    await expect(start()).rejects.toMatchObject({ name: 'StaleActorError' });
    expect(f.server.calls.map(call => call.name)).toEqual([B]);
    expect(store.getSnapshot().running).toBe(false);
  });

  test('cancelled ends the pass before assessments and mastery', async () => {
    const states = createAssessmentHistoryStates();
    store = f.makeStore({ states });
    f.server.onRequest = () => resetHistoryWalkState(states.batteryRuns);
    await start();
    expect(f.server.calls.map(call => call.name)).toEqual([B]);
    expect(store.getSnapshot().lastResults).toEqual({ batteryRuns: { status: 'cancelled', pages: 0 }, assessments: null, mastery: null });
    expect(await f.db.getAllAsync('select * from sync_state')).toEqual([]);
  });

  test('reset discards a waiting trailing pass without publishing the old actor', async () => {
    const entered = deferred(), release = deferred();
    f.server.onRequest = async () => { entered.resolve(); await release.promise; };
    const first = start();
    await entered.promise;
    const trailing = start(true);
    store.reset();
    const before = store.getSnapshot();
    expect(await trailing).toBeNull();
    release.resolve();
    await first;
    expect(store.getSnapshot()).toBe(before);
    expect(f.server.calls).toHaveLength(1);
  });

  test('a failed prerequisite makes no requests, writes or completed-run publication', async () => {
    const before = store.getSnapshot();
    f.referenceDataReady.mockRejectedValueOnce(new Error('References unavailable'));
    await expect(start()).rejects.toMatchObject({ message: 'References unavailable' });
    expect(store.getSnapshot()).toBe(before);
    expect(f.server.calls).toEqual([]);
    expect(await f.db.getAllAsync('select * from sync_state')).toEqual([]);
    expect(await store.start({})).toBeNull();
  });
});
