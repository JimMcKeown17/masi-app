import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import LetterAssessmentScreen from '../src/screens/assessments/LetterAssessmentScreen';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { storage } from '../src/utils/storage';

jest.mock('../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../src/context/OfflineContext', () => ({
  useOffline: jest.fn(),
}));

jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  assessmentsRepository: {
    saveAssessment: jest.fn(),
  },
}));

jest.mock('../src/utils/storage', () => ({
  storage: {
    saveAssessment: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'assessment-1'),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

describe('LetterAssessmentScreen Plan 5 behavior', () => {
  const refreshSyncStatus = jest.fn();
  const triggerBackgroundSync = jest.fn();
  const navigation = {
    addListener: jest.fn(() => jest.fn()),
    navigate: jest.fn(),
    replace: jest.fn(),
    goBack: jest.fn(),
    dispatch: jest.fn(),
  };
  const route = {
    params: {
      child: { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' },
      letterSet: {
        id: 'english-test',
        language: 'English',
        letters: ['a'],
        lettersPerPage: 1,
        columns: 1,
      },
      attemptNumber: 2,
      assessmentType: 'letter_egra',
    },
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-21T08:00:00.000Z'));
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({
      refreshSyncStatus,
      triggerBackgroundSync,
    });
    assessmentsRepository.saveAssessment.mockResolvedValue(true);
    refreshSyncStatus.mockResolvedValue({ unsyncedCount: 1 });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('finishing an assessment saves through the assessment repository and triggers background sync', async () => {
    const { getByText, getByLabelText } = render(
      <LetterAssessmentScreen navigation={navigation} route={route} />
    );

    fireEvent.press(getByText('Start Assessment'));
    fireEvent.press(getByLabelText('a, not marked'));
    fireEvent.press(getByLabelText('a, correct'));
    fireEvent.press(getByLabelText('a, not marked'));
    fireEvent.press(getByText('Finish'));

    await waitFor(() => expect(assessmentsRepository.saveAssessment).toHaveBeenCalledWith(expect.objectContaining({
      id: 'assessment-1',
      user_id: 'user-1',
      child_id: 'child-1',
      assessment_type: 'letter_egra',
      attempt_number: 2,
      letter_language: 'English',
      capture_mode: 'grid',
      correction_count: 1,
      correct_responses: 1,
      letters_attempted: 1,
      accuracy: 100,
      date_assessed: '2026-05-21',
      synced: false,
    })));
    expect(refreshSyncStatus).toHaveBeenCalled();
    expect(triggerBackgroundSync).toHaveBeenCalled();
    expect(storage.saveAssessment).not.toHaveBeenCalled();
    expect(navigation.replace).toHaveBeenCalledWith('AssessmentResults', expect.objectContaining({
      child: route.params.child,
      attemptNumber: 2,
      assessmentType: 'letter_egra',
    }));
  });

  test('failed assessment save shows Retry/Discard alert without navigating away', async () => {
    assessmentsRepository.saveAssessment.mockRejectedValueOnce(new Error('SQLite write failed'));
    const { getByText, getByLabelText } = render(
      <LetterAssessmentScreen navigation={navigation} route={route} />
    );

    fireEvent.press(getByText('Start Assessment'));
    fireEvent.press(getByLabelText('a, not marked'));
    fireEvent.press(getByText('Finish'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
      'Could not save',
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Retry' }),
        expect.objectContaining({ text: 'Discard' }),
      ])
    ));
    const buttons = Alert.alert.mock.calls[0][2];
    expect(buttons.map((button) => button.text)).toEqual(expect.arrayContaining(['Retry', 'Discard']));
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(refreshSyncStatus).not.toHaveBeenCalled();
    expect(triggerBackgroundSync).not.toHaveBeenCalled();
  });
});
