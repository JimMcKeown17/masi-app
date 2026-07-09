import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor, act } from '@testing-library/react-native';

// R13: elapsed is driven by the monotonic clock, not Date. Mock it.
let mockNow = 0;
jest.mock('../src/utils/monotonicClock', () => ({ now: () => mockNow }));

import SequentialAssessmentScreen from '../src/screens/assessments/SequentialAssessmentScreen';
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

describe('SequentialAssessmentScreen expiry', () => {
  const navigation = { addListener: jest.fn(() => jest.fn()), navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), dispatch: jest.fn() };
  const route = { params: {
    child: { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' },
    letterSet: { id: 'english-test', language: 'English', letters: ['a', 'b'], lettersPerPage: 20, columns: 5 },
    attemptNumber: 1, assessmentType: 'letter_egra', captureMode: 'sequential',
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

  test('a decision after expiry finalizes without recording it', async () => {
    const { getByText } = render(<SequentialAssessmentScreen navigation={navigation} route={route} />);
    fireEvent.press(getByText('Start Assessment'));       // startedAt = mockNow = 0
    act(() => { mockNow = 65000; });                      // past the deadline
    fireEvent.press(getByText('Correct'));
    await waitFor(() => expect(assessmentsRepository.saveAssessment).toHaveBeenCalled());
    expect(assessmentsRepository.saveAssessment.mock.calls[0][0].correct_responses).toBe(0);
  });
});
