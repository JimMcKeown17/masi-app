jest.mock('../src/context/ChildrenContext', () => ({ useChildren: jest.fn() }));
import { useChildren } from '../src/context/ChildrenContext';
beforeEach(() => useChildren.mockReturnValue({ children: [{ id: 'child-1' }] }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders as render } from '../test-support/renderWithProviders';
import LetterTrackerScreen from '../src/screens/assessments/LetterTrackerScreen';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { masteryRepository } from '../src/db/repositories/masteryRepository';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';

jest.mock('@react-navigation/native', () => ({
  NavigationContext: require('react').createContext(undefined),
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
  ...jest.requireActual('../src/db/repositories/assessmentsRepository'),
  assessmentsRepository: {
    latestLetterResult: jest.fn(),
  },
}));

jest.mock('../src/db/repositories/masteryRepository', () => ({
  ...jest.requireActual('../src/db/repositories/masteryRepository'),
  masteryRepository: {
    getLetterMastery: jest.fn(),
    setLetterMastery: jest.fn(),
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
    assessmentsRepository.latestLetterResult.mockResolvedValue(null);
    let storedRecords = [];
    masteryRepository.getLetterMastery.mockImplementation(async () => storedRecords);
    masteryRepository.setLetterMastery.mockImplementation(async ({ childId, letter, language, confirmed }) => {
      const record = { child_id: childId, letter, language, confirmed };
      storedRecords = [record];
      return record;
    });
    refreshSyncStatus.mockResolvedValue({ unsyncedCount: 1 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('failed taught-letter save keeps the cell unsaved and shows a retryable error', async () => {
    masteryRepository.setLetterMastery.mockRejectedValueOnce(new Error('SQLite write failed'));

    const { getByLabelText, queryByText } = render(<LetterTrackerScreen route={route} />);

    await waitFor(() => expect(getByLabelText('a, not mastered')).toBeTruthy());

    fireEvent.press(getByLabelText('a, not mastered'));

    await waitFor(() => expect(queryByText(/Letter update was not saved/i)).toBeTruthy());
    expect(queryByText('1 / 26 letters mastered')).toBeNull();
    expect(refreshSyncStatus).not.toHaveBeenCalled();
    expect(triggerBackgroundSync).not.toHaveBeenCalled();

    fireEvent.press(getByLabelText('a, not mastered'));

    await waitFor(() => expect(queryByText('1 / 26 letters mastered')).toBeTruthy());
    expect(queryByText(/Letter update was not saved/i)).toBeNull();
  });
});

test('a class-only route uses membership language and shows no confirmation controls', async () => {
  useChildren.mockReturnValue({ children: [] });
  useAuth.mockReturnValue({ user: { id: 'user-1' } });
  useOffline.mockReturnValue({ refreshSyncStatus: jest.fn() });
  assessmentsRepository.latestLetterResult.mockResolvedValue(null);
  masteryRepository.getLetterMastery.mockResolvedValue([]);
  const child = { id: 'control', first_name: 'Control', last_name: 'Child',
    class_id: 'membership-class', grade: '2', home_language: 'Afrikaans', is_delivery: true };
  const screen = render(<LetterTrackerScreen route={{ params: {
    child, classItem: { id: 'stale-class', home_language: 'English' },
  } }} />);
  expect(await screen.findByText('0 / 26 letters mastered')).toBeTruthy();
  expect(assessmentsRepository.latestLetterResult).toHaveBeenLastCalledWith({ userId: 'user-1', childId: 'control', language: 'af' });
  expect(screen.queryAllByRole('button')).toHaveLength(0);
});
