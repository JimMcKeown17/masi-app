import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import LetterMasteryPanel from '../src/components/assessment/LetterMasteryPanel';
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
jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: jest.fn() }));
jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  assessmentsRepository: { getAssessments: jest.fn() },
}));
jest.mock('../src/db/repositories/masteryRepository', () => ({
  masteryRepository: {
    getLetterMastery: jest.fn(),
    saveLetterMasteryRecord: jest.fn(),
    updateLetterMasteryRecord: jest.fn(),
  },
}));

describe('LetterMasteryPanel', () => {
  const refreshSyncStatus = jest.fn();
  const triggerBackgroundSync = jest.fn();
  const child = { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' };
  const classItem = { id: 'class-1', home_language: 'English' };

  beforeEach(() => {
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({ refreshSyncStatus, triggerBackgroundSync });
    assessmentsRepository.getAssessments.mockResolvedValue([]);
    masteryRepository.getLetterMastery.mockResolvedValue([]);
    masteryRepository.saveLetterMasteryRecord.mockResolvedValue('saved-id-1');
    masteryRepository.updateLetterMasteryRecord.mockResolvedValue(true);
    refreshSyncStatus.mockResolvedValue({ unsyncedCount: 1 });
  });

  afterEach(() => jest.clearAllMocks());

  test('reactivates a soft-deleted record on toggle-on instead of creating a duplicate', async () => {
    masteryRepository.getLetterMastery.mockResolvedValue([
      { id: 'rec-a', child_id: 'child-1', letter: 'a', language: 'English', _deleted: true },
    ]);
    const { getByLabelText, getByText } = render(
      <LetterMasteryPanel child={child} classItem={classItem} />,
    );
    // the soft-deleted row is filtered out of the initial taught set
    await waitFor(() => expect(getByLabelText('a, not mastered')).toBeTruthy());

    fireEvent.press(getByLabelText('a, not mastered'));

    await waitFor(() => {
      expect(masteryRepository.updateLetterMasteryRecord).toHaveBeenCalledWith(
        'rec-a',
        expect.objectContaining({ _deleted: false, deleted_at: null }),
      );
    });
    expect(masteryRepository.saveLetterMasteryRecord).not.toHaveBeenCalled();
    expect(getByText('1 / 26 letters mastered')).toBeTruthy();
  });

  test('toggling a letter on then off uses the saved id and updates the mastered count', async () => {
    const { getByLabelText, getByText, queryByText } = render(
      <LetterMasteryPanel child={child} classItem={classItem} />,
    );
    await waitFor(() => expect(getByLabelText('a, not mastered')).toBeTruthy());

    fireEvent.press(getByLabelText('a, not mastered'));
    await waitFor(() => expect(getByText('1 / 26 letters mastered')).toBeTruthy());
    expect(masteryRepository.saveLetterMasteryRecord).toHaveBeenCalledTimes(1);

    // toggle off: the panel re-fetches the active record by logical key
    masteryRepository.getLetterMastery.mockResolvedValueOnce([
      { id: 'saved-id-1', child_id: 'child-1', letter: 'a', language: 'English', _deleted: false },
    ]);
    fireEvent.press(getByLabelText('a, taught by coach'));
    await waitFor(() =>
      expect(masteryRepository.updateLetterMasteryRecord).toHaveBeenCalledWith(
        'saved-id-1',
        expect.objectContaining({ _deleted: true }),
      ),
    );
    await waitFor(() => expect(queryByText('1 / 26 letters mastered')).toBeNull());
  });

  test('failed taught-letter save keeps the cell unsaved and shows a retryable error', async () => {
    masteryRepository.saveLetterMasteryRecord.mockRejectedValueOnce(new Error('SQLite write failed'));
    const { getByLabelText, queryByText } = render(
      <LetterMasteryPanel child={child} classItem={classItem} />,
    );
    await waitFor(() => expect(getByLabelText('a, not mastered')).toBeTruthy());

    fireEvent.press(getByLabelText('a, not mastered'));

    await waitFor(() => expect(queryByText(/Letter update was not saved/i)).toBeTruthy());
    expect(queryByText('1 / 26 letters mastered')).toBeNull();
    expect(refreshSyncStatus).not.toHaveBeenCalled();
    expect(triggerBackgroundSync).not.toHaveBeenCalled();
  });

  test('a sync-status refresh failure after a successful write does not show the save error', async () => {
    refreshSyncStatus.mockRejectedValueOnce(new Error('sync status read failed'));
    const { getByLabelText, getByText, queryByText } = render(
      <LetterMasteryPanel child={child} classItem={classItem} />,
    );
    await waitFor(() => expect(getByLabelText('a, not mastered')).toBeTruthy());

    fireEvent.press(getByLabelText('a, not mastered'));

    await waitFor(() => expect(getByText('1 / 26 letters mastered')).toBeTruthy());
    expect(queryByText(/Letter update was not saved/i)).toBeNull();
  });
});
