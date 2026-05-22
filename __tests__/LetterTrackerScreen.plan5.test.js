import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import LetterTrackerScreen from '../src/screens/assessments/LetterTrackerScreen';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { masteryRepository } from '../src/db/repositories/masteryRepository';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback) => {
    const React = require('react');
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock('../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../src/context/OfflineContext', () => ({
  useOffline: jest.fn(),
}));

jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  assessmentsRepository: {
    getAssessments: jest.fn(),
  },
}));

jest.mock('../src/db/repositories/masteryRepository', () => ({
  masteryRepository: {
    getLetterMastery: jest.fn(),
    saveLetterMasteryRecord: jest.fn(),
    updateLetterMasteryRecord: jest.fn(),
  },
}));

describe('LetterTrackerScreen Plan 5 behavior', () => {
  const refreshSyncStatus = jest.fn();
  const triggerBackgroundSync = jest.fn();
  const route = {
    params: {
      child: { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' },
      classItem: { id: 'class-1', home_language: 'English' },
    },
  };

  beforeEach(() => {
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({
      refreshSyncStatus,
      triggerBackgroundSync,
    });
    assessmentsRepository.getAssessments.mockResolvedValue([]);
    masteryRepository.getLetterMastery.mockResolvedValue([]);
    masteryRepository.saveLetterMasteryRecord.mockResolvedValue(true);
    masteryRepository.updateLetterMasteryRecord.mockResolvedValue(true);
    refreshSyncStatus.mockResolvedValue({ unsyncedCount: 1 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('failed taught-letter save keeps the cell unsaved and shows a retryable error', async () => {
    masteryRepository.saveLetterMasteryRecord.mockRejectedValueOnce(new Error('SQLite write failed'));

    const { getByLabelText, queryByText } = render(<LetterTrackerScreen route={route} />);

    await waitFor(() => expect(getByLabelText('a, not mastered')).toBeTruthy());

    fireEvent.press(getByLabelText('a, not mastered'));

    await waitFor(() => expect(queryByText(/Letter update was not saved/i)).toBeTruthy());
    expect(queryByText('1 / 26 letters mastered')).toBeNull();
    expect(refreshSyncStatus).not.toHaveBeenCalled();
    expect(triggerBackgroundSync).not.toHaveBeenCalled();

    masteryRepository.saveLetterMasteryRecord.mockResolvedValueOnce(true);
    fireEvent.press(getByLabelText('a, not mastered'));

    await waitFor(() => expect(queryByText('1 / 26 letters mastered')).toBeTruthy());
    expect(queryByText(/Letter update was not saved/i)).toBeNull();
  });
});
