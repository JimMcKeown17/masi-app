import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useAssessmentSession } from '../src/hooks/useAssessmentSession';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';

jest.mock('../src/db/repositories/assessmentsRepository', () => ({ assessmentsRepository: { saveAssessment: jest.fn() } }));
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => ({ triggerBackgroundSync: jest.fn(), refreshSyncStatus: jest.fn().mockResolvedValue() }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

const letterSet = { id: 'eng-1', language: 'english', letters: ['a','b','c'], columns: 5, lettersPerPage: 20 };
const makeNav = () => ({ addListener: jest.fn(() => jest.fn()), replace: jest.fn(), dispatch: jest.fn(), goBack: jest.fn() });

describe('useAssessmentSession', () => {
  const makeDeferred = () => {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };

  const makeNavigationWithHandlers = () => {
    const handlers = {};
    const navigation = {
      addListener: jest.fn((ev, h) => { handlers[ev] = h; return jest.fn(); }),
      replace: jest.fn(),
      dispatch: jest.fn(),
      goBack: jest.fn(),
    };
    return { handlers, navigation };
  };

  const clickAlertButton = (text) => {
    const calls = Alert.alert.mock.calls;
    const matchingCall = [...calls].reverse().find((call) => (call[2] || []).some((b) => b.text === text));
    const buttons = matchingCall?.[2];
    const btn = buttons.find((b) => b.text === text);
    if (!btn) throw new Error('Alert button not found: ' + text);
    btn.onPress();
  };

  beforeEach(() => {
    jest.useFakeTimers();
    assessmentsRepository.saveAssessment.mockResolvedValue(true);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('R7: finish via TIMER EXPIRY records completion_time === full duration (60, not 59)', async () => {
    const navigation = makeNav();
    const { result } = renderHook(() => useAssessmentSession({
      navigation, child: { id: 'c1' }, letterSet, attemptNumber: 1,
      assessmentType: 'letter_egra', captureMode: 'sequential', isWordAssessment: false,
    }));
    act(() => { result.current.setOnTimerExpire(() => result.current.finishAndSave({ letterStates: { 0: true }, finalLastIndex: 0, correctionCount: 2 })); });
    act(() => { result.current.startActive(); });
    await act(async () => { jest.advanceTimersByTime(60000); });
    expect(assessmentsRepository.saveAssessment).toHaveBeenCalledTimes(1);
    const saved = assessmentsRepository.saveAssessment.mock.calls[0][0];
    expect(saved.completion_time).toBe(60);
    expect(saved.capture_mode).toBe('sequential');
    expect(saved.correction_count).toBe(2);
    expect(navigation.replace).toHaveBeenCalledWith('AssessmentResults', expect.objectContaining({ assessment: saved }));
  });

  test('finishAndSave is idempotent (double finish saves once)', async () => {
    const navigation = makeNav();
    const { result } = renderHook(() => useAssessmentSession({ navigation, child: { id: 'c1' }, letterSet, attemptNumber: 1, assessmentType: 'letter_egra', captureMode: 'grid', isWordAssessment: false }));
    act(() => { result.current.startActive(); });
    await act(async () => { await result.current.finishAndSave({ letterStates: {}, finalLastIndex: -1, correctionCount: 0 }); });
    await act(async () => { await result.current.finishAndSave({ letterStates: {}, finalLastIndex: -1, correctionCount: 0 }); });
    expect(assessmentsRepository.saveAssessment).toHaveBeenCalledTimes(1);
  });

  test('failed save shows a Retry/Discard Alert and does NOT navigate', async () => {
    const navigation = makeNav();
    assessmentsRepository.saveAssessment.mockRejectedValueOnce(new Error('disk full'));
    const { result } = renderHook(() => useAssessmentSession({ navigation, child: { id: 'c1' }, letterSet, attemptNumber: 1, assessmentType: 'letter_egra', captureMode: 'grid', isWordAssessment: false }));
    act(() => { result.current.startActive(); });
    await act(async () => { await result.current.finishAndSave({ letterStates: { 0: true }, finalLastIndex: 0, correctionCount: 0 }); });
    expect(Alert.alert).toHaveBeenCalled();
    const lastCall = Alert.alert.mock.calls[Alert.alert.mock.calls.length - 1];
    expect(String(lastCall[0])).toMatch(/could not save/i);
    expect((lastCall[2] || []).map((b) => b.text)).toEqual(expect.arrayContaining(['Retry', 'Discard']));
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  test('failed-save leave guard stays active until Discard', async () => {
    const { handlers, navigation } = makeNavigationWithHandlers();
    assessmentsRepository.saveAssessment.mockRejectedValueOnce(new Error('disk full'));
    const { result } = renderHook(() => useAssessmentSession({ navigation, child: { id: 'c1' }, letterSet, attemptNumber: 1, assessmentType: 'letter_egra', captureMode: 'grid', isWordAssessment: false }));
    act(() => { result.current.startActive(); });
    await act(async () => { await result.current.finishAndSave({ letterStates: { 0: true }, finalLastIndex: 0, correctionCount: 0 }); });
    expect(Alert.alert).toHaveBeenCalled();

    const preventDefault = jest.fn();
    act(() => { handlers.beforeRemove({ preventDefault, data: { action: {} } }); });
    expect(preventDefault).toHaveBeenCalled();

    act(() => { clickAlertButton('Discard'); });
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  test('double finish before save resolves saves and navigates once', async () => {
    const d = makeDeferred();
    assessmentsRepository.saveAssessment.mockReturnValue(d.promise);
    const navigation = makeNav();
    const { result } = renderHook(() => useAssessmentSession({ navigation, child: { id: 'c1' }, letterSet, attemptNumber: 1, assessmentType: 'letter_egra', captureMode: 'grid', isWordAssessment: false }));
    act(() => { result.current.startActive(); });

    let firstFinish;
    act(() => {
      firstFinish = result.current.finishAndSave({ letterStates: {}, finalLastIndex: -1, correctionCount: 0 });
      result.current.finishAndSave({ letterStates: {}, finalLastIndex: -1, correctionCount: 0 });
    });
    d.resolve(true);
    await act(async () => { await firstFinish; });

    expect(assessmentsRepository.saveAssessment).toHaveBeenCalledTimes(1);
    expect(navigation.replace).toHaveBeenCalledTimes(1);
  });

  test('Retry re-invokes save and navigates after success', async () => {
    const navigation = makeNav();
    assessmentsRepository.saveAssessment.mockRejectedValueOnce(new Error('fail'));
    const { result } = renderHook(() => useAssessmentSession({ navigation, child: { id: 'c1' }, letterSet, attemptNumber: 1, assessmentType: 'letter_egra', captureMode: 'grid', isWordAssessment: false }));
    act(() => { result.current.startActive(); });
    await act(async () => { await result.current.finishAndSave({ letterStates: { 0: true }, finalLastIndex: 0, correctionCount: 0 }); });
    expect(Alert.alert).toHaveBeenCalled();

    assessmentsRepository.saveAssessment.mockResolvedValue(true);
    await act(async () => { clickAlertButton('Retry'); });

    expect(assessmentsRepository.saveAssessment).toHaveBeenCalledTimes(2);
    expect(navigation.replace).toHaveBeenCalledTimes(1);
  });

  test('abandoning during pending save does not navigate to results after save resolves', async () => {
    const d = makeDeferred();
    assessmentsRepository.saveAssessment.mockReturnValue(d.promise);
    const { handlers, navigation } = makeNavigationWithHandlers();
    const { result } = renderHook(() => useAssessmentSession({ navigation, child: { id: 'c1' }, letterSet, attemptNumber: 1, assessmentType: 'letter_egra', captureMode: 'grid', isWordAssessment: false }));
    act(() => { result.current.startActive(); });

    let finishPromise;
    act(() => {
      finishPromise = result.current.finishAndSave({ letterStates: { 0: true }, finalLastIndex: 0, correctionCount: 0 });
    });
    act(() => {
      handlers.beforeRemove({ preventDefault: jest.fn(), data: { action: { type: 'POP' } } });
    });
    act(() => { clickAlertButton('Leave'); });

    d.resolve(true);
    await act(async () => { await finishPromise; });

    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
