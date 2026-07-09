import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';

// Mockable monotonic clock (R7/R10): control elapsed independently of jest fake timers.
let mockNow = 0;
jest.mock('../src/utils/monotonicClock', () => ({ now: () => mockNow }));

import { useAssessmentSession } from '../src/hooks/useAssessmentSession';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';

jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const makeArgs = () => ({
  navigation: { addListener: jest.fn(() => jest.fn()), replace: jest.fn(), goBack: jest.fn(), dispatch: jest.fn() },
  child: { id: 'child-1' },
  letterSet: { letters: ['a', 'b'], lettersPerPage: 20, columns: 5, language: 'English' },
  attemptNumber: 1,
  assessmentType: 'letter_egra',
  captureMode: 'grid',
  isWordAssessment: false,
});

describe('useAssessmentSession monotonic timekeeping', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockNow = 0;
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({ triggerBackgroundSync: jest.fn(), refreshSyncStatus: jest.fn() });
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); jest.clearAllMocks(); });

  const spyAppState = () => {
    let handler;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
      handler = fn;
      return { remove: jest.fn() };
    });
    return () => handler;
  };

  test('elapsed reads the monotonic clock (immune to throttled ticks)', () => {
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { result.current.startActive(); });
    // Clock advances 5s with NO watchdog ticks fired (simulates Android throttling).
    mockNow = 5000;
    expect(result.current.getElapsedMs()).toBe(5000);
    expect(result.current.isExpired()).toBe(false);
  });

  test('watchdog finalizes from the clock, not a tick count (R10)', () => {
    const onExpire = jest.fn();
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { result.current.setOnTimerExpire(onExpire); result.current.startActive(); });
    // Elapsed jumps past the deadline; fire EXACTLY ONE watchdog tick. A tick-count
    // regression would need 60 ticks and would NOT expire here.
    mockNow = 60001;
    act(() => { jest.advanceTimersByTime(1000); });
    expect(result.current.isExpired()).toBe(true);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  test('elapsed is clamped to the duration ceiling', () => {
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { result.current.startActive(); });
    mockNow = 120000;
    expect(result.current.getElapsedMs()).toBe(60000);
  });

  test('stopTimer freezes elapsed at the banked value', () => {
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { result.current.startActive(); });
    mockNow = 8000;
    act(() => { result.current.stopTimer(); });
    mockNow = 30000;
    expect(result.current.getElapsedMs()).toBe(8000);
  });

  test('backgrounding pauses the clock and foregrounding resumes it', () => {
    const getHandler = spyAppState();
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { result.current.startActive(); });   // startedAt = 0
    mockNow = 10000;
    act(() => { getHandler()('background'); });       // bank 10000, pause
    mockNow = 40000;                                  // 30s "in background" must not count
    expect(result.current.getElapsedMs()).toBe(10000);
    act(() => { getHandler()('active'); });           // resume: startedAt = 40000
    mockNow = 42000;
    expect(result.current.getElapsedMs()).toBe(12000);
  });

  test('after stopTimer, a background/foreground cycle does not resume the clock', () => {
    const getHandler = spyAppState();
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { result.current.startActive(); });
    mockNow = 5000;
    act(() => { result.current.stopTimer(); });
    act(() => { const h = getHandler(); h('background'); h('active'); });
    mockNow = 25000;
    expect(result.current.getElapsedMs()).toBe(5000);
  });

  test('watchdog does not finalize while backgrounded, then finalizes on foreground (R8)', () => {
    const onExpire = jest.fn();
    const getHandler = spyAppState();
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { result.current.setOnTimerExpire(onExpire); result.current.startActive(); });
    mockNow = 60001;                                  // deadline reached
    act(() => { getHandler()('background'); });        // pause + isForeground false
    act(() => { jest.advanceTimersByTime(1000); });    // a tick fires but foreground is false
    expect(onExpire).not.toHaveBeenCalled();
    act(() => { getHandler()('active'); });            // isForeground true again
    act(() => { jest.advanceTimersByTime(1000); });    // now the watchdog finalizes
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  test('an AppState change before startActive is a no-op', () => {
    const getHandler = spyAppState();
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { const h = getHandler(); h('background'); h('active'); }); // runningRef false: no throw, no accrual
    act(() => { result.current.startActive(); });
    mockNow = 3000;
    expect(result.current.getElapsedMs()).toBe(3000);
  });
});
