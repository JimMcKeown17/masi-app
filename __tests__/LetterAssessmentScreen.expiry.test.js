import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor, act } from '@testing-library/react-native';

// R13: elapsed is driven by the monotonic clock, not Date. Mock it (setSystemTime no longer
// advances assessment time).
let mockNow = 0;
jest.mock('../src/utils/monotonicClock', () => ({ now: () => mockNow }));

import LetterAssessmentScreen from '../src/screens/assessments/LetterAssessmentScreen';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';

jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: jest.fn() }));
jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  assessmentsRepository: { saveAssessment: jest.fn() },
}));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'assessment-1') }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

describe('LetterAssessmentScreen expiry + timing', () => {
  const navigation = { addListener: jest.fn(() => jest.fn()), navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), dispatch: jest.fn() };
  const route = { params: {
    child: { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' },
    letterSet: { id: 'english-test', language: 'English', letters: ['a'], lettersPerPage: 1, columns: 1 },
    attemptNumber: 2, assessmentType: 'letter_egra',
  } };

  beforeEach(() => {
    jest.useFakeTimers();
    mockNow = 0;
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({ refreshSyncStatus: jest.fn().mockResolvedValue({}), triggerBackgroundSync: jest.fn() });
    assessmentsRepository.saveAssessment.mockResolvedValue(true);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); jest.clearAllMocks(); });

  test('a tap after expiry records nothing AND triggers finish', async () => {
    const { getByText, getByLabelText } = render(
      <LetterAssessmentScreen navigation={navigation} route={route} />
    );
    fireEvent.press(getByText('Start Assessment'));       // startedAt = mockNow = 0
    fireEvent.press(getByLabelText('a, not marked'));    // record the only letter correct (pre-expiry)
    act(() => { mockNow = 65000; });                      // past the 60s deadline, no watchdog tick fired
    fireEvent.press(getByLabelText('a, correct'));        // an expired tap would normally untoggle (a correction)
    // "triggers finish": the guard routes to handleFinish, which saves directly (last index is correct).
    await waitFor(() => expect(assessmentsRepository.saveAssessment).toHaveBeenCalled());
    const saved = assessmentsRepository.saveAssessment.mock.calls[0][0];
    expect(saved.correct_responses).toBe(1);             // "records nothing": the expired tap did NOT untoggle
    expect(saved.correction_count).toBe(0);              // and logged no correction
  });

  test('completion_time reflects real elapsed seconds', async () => {
    const { getByText, getByLabelText } = render(
      <LetterAssessmentScreen navigation={navigation} route={route} />
    );
    fireEvent.press(getByText('Start Assessment'));
    fireEvent.press(getByLabelText('a, not marked'));    // record a correct so Finish saves directly
    act(() => { mockNow = 7000; });
    fireEvent.press(getByText('Finish'));
    await waitFor(() => expect(assessmentsRepository.saveAssessment).toHaveBeenCalled());
    expect(assessmentsRepository.saveAssessment.mock.calls[0][0].completion_time).toBe(7);
  });
});
