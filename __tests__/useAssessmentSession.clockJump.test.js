import { renderHook, act } from '@testing-library/react-native';
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
  attemptNumber: 1, assessmentType: 'letter_egra', captureMode: 'grid', isWordAssessment: false,
});

describe('useAssessmentSession clock jump-immunity (R7)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-09T08:00:00.000Z'));
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({ triggerBackgroundSync: jest.fn(), refreshSyncStatus: jest.fn() });
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); jest.clearAllMocks(); });

  test('a wall-clock jump does not change elapsed or expiry', () => {
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { result.current.startActive(); });
    act(() => { jest.advanceTimersByTime(10000); }); // advances performance.now by 10s
    const before = result.current.getElapsedMs();
    expect(before).toBe(10000);
    act(() => { jest.setSystemTime(new Date('2026-07-09T07:00:00.000Z')); }); // wall clock -1h
    expect(result.current.getElapsedMs()).toBe(before);
    act(() => { jest.setSystemTime(new Date('2026-07-09T09:00:00.000Z')); }); // wall clock +1h
    expect(result.current.getElapsedMs()).toBe(before);
    expect(result.current.isExpired()).toBe(false);
  });
});
