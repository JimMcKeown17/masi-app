// __tests__/sessionHistoryStatus.test.js
import { describeHistoryState } from '../src/utils/syncStatusPresenter';
import { act, renderHook } from '@testing-library/react-native';
import { startSessionHistoryPull, resetSessionHistoryStatusForActorChange, useSessionHistoryStatus, getSessionHistoryPullState } from '../src/services/sessionHistoryStatus';
import { runSessionHistoryPull, resetSessionHistoryForActorChange } from '../src/services/sessionHistoryPull';

jest.mock('../src/services/sessionHistoryPull', () => ({
  runSessionHistoryPull: jest.fn(),
  resetSessionHistoryForActorChange: jest.fn(),
  sessionHistoryScope: (userId, programmeId) => `session_history_pull:${userId}:${programmeId}`,
}));
const mockGetFirst = jest.fn();
jest.mock('../src/db/repositories/repositoryRuntime', () => ({
  resolveDatabase: async () => ({ getFirstAsync: (...args) => mockGetFirst(...args) }),
}));

describe('session history status store', () => {
  beforeEach(() => {
    resetSessionHistoryStatusForActorChange();
    jest.clearAllMocks();
  });

  test('a previous actor cannot publish pages or completion into the next actor snapshot', async () => {
    let resolveA; let resolveB;
    runSessionHistoryPull.mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveB = resolve; }));
    const { result } = renderHook(useSessionHistoryStatus);
    let a; let b;
    act(() => { a = startSessionHistoryPull({ userId: 'A' }); });
    const pageA = runSessionHistoryPull.mock.calls[0][0].deps.onPageSaved;
    act(() => { pageA(); });
    act(() => { resetSessionHistoryStatusForActorChange(); });
    expect(resetSessionHistoryForActorChange).toHaveBeenCalledTimes(1);
    act(() => { b = startSessionHistoryPull({ userId: 'B', force: true }); });
    const beforeOldCompletion = result.current;
    await act(async () => { pageA(); resolveA({ status: 'cancelled', pages: 0 }); await a; });
    expect(result.current).toEqual(beforeOldCompletion);
    expect(result.current).toMatchObject({ running: true, lastResult: null });
    const pageB = runSessionHistoryPull.mock.calls[1][0].deps.onPageSaved;
    act(() => { pageB(); });
    expect(result.current.pageVersion).toBe(beforeOldCompletion.pageVersion + 1);
    const completed = { status: 'complete', pages: 1 };
    await act(async () => { resolveB(completed); await b; });
    expect(result.current).toMatchObject({ running: false, lastResult: completed, runVersion: beforeOldCompletion.runVersion + 1 });
  });

  test('a run saving no pages still publishes completion and anonymous starts do nothing', async () => {
    const { result } = renderHook(useSessionHistoryStatus);
    const before = result.current;
    await act(async () => { expect(await startSessionHistoryPull({})).toBeNull(); });
    expect(runSessionHistoryPull).not.toHaveBeenCalled();
    runSessionHistoryPull.mockResolvedValueOnce({ status: 'query', pages: 0 });
    await act(async () => { await startSessionHistoryPull({ userId: 'A' }); });
    expect(result.current).toEqual({ running: false, pageVersion: before.pageVersion, runVersion: before.runVersion + 1, lastResult: { status: 'query', pages: 0 } });
  });

  test('persisted state is scoped to the user and active Programme and includes updatedAt', async () => {
    mockGetFirst.mockResolvedValueOnce({ programme_id: 'programme-a' }).mockResolvedValueOnce({
      scope: 'session_history_pull:A:programme-a', last_pulled_at: null, cursor: '{"complete":false}', updated_at: '2026-09-25T10:00:00.000Z',
    });
    expect(await getSessionHistoryPullState('A')).toEqual({
      scope: 'session_history_pull:A:programme-a', lastPulledAt: null, cursor: '{"complete":false}', updatedAt: '2026-09-25T10:00:00.000Z',
    });
    expect(mockGetFirst.mock.calls[1][1]).toBe('session_history_pull:A:programme-a');
    mockGetFirst.mockResolvedValueOnce(null);
    expect(await getSessionHistoryPullState('B')).toBeNull();
    expect(await getSessionHistoryPullState(null)).toBeNull();
  });
});

describe('describeHistoryState', () => {
  test('running wins', () => {
    expect(describeHistoryState({ running: true, pullState: null }).label).toBe('Downloading');
  });
  test('never pulled', () => {
    expect(describeHistoryState({ running: false, pullState: null }).label).toBe('Not downloaded yet');
  });
  test('complete and stamped', () => {
    expect(describeHistoryState({ running: false, pullState: { lastPulledAt: '2026-09-25T10:00:00.000Z', cursor: JSON.stringify({ complete: true }) } }).label)
      .toBe('Up to date');
  });
  test('incomplete names the time it became incomplete', () => {
    const { label } = describeHistoryState({ running: false, pullState: { lastPulledAt: null, cursor: JSON.stringify({ complete: false }), updatedAt: '2026-09-25T10:00:00.000Z' } });
    expect(label).toMatch(/^Incomplete since /);
  });
  test('a failure after an earlier success is not reported as up to date', () => {
    const { label, detail } = describeHistoryState({ running: false, pullState: {
      lastPulledAt: '2026-09-25T10:00:00.000Z',
      cursor: JSON.stringify({ complete: true, lastFailureAt: '2026-09-26T08:00:00.000Z' }),
    } });
    expect(label).toMatch(/^Incomplete since /);
    expect(detail).toBe('History not fully downloaded yet');
  });
});

 test.each(['2026-09-25T10:00:00.000Z', '2026-09-24T10:00:00.000Z'])(
  'any retained failure prevents up-to-date status, including equal or older timestamp %s', (lastFailureAt) => {
    expect(describeHistoryState({ running: false, pullState: {
      lastPulledAt: '2026-09-25T10:00:00.000Z',
      cursor: JSON.stringify({ complete: true, lastFailureAt }),
    } })).toEqual({ label: expect.stringMatching(/^Incomplete since /), detail: 'History not fully downloaded yet' });
  }
);
