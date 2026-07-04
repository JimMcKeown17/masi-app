import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import SequentialAssessmentScreen from '../src/screens/assessments/SequentialAssessmentScreen';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';

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

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'assessment-1'),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const child = { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' };
const letterSet = {
  id: 'english-test',
  language: 'English',
  letters: ['a', 'b', 'c'],
  lettersPerPage: 3,
  columns: 3,
};

const makeNavigation = () => ({
  addListener: jest.fn(() => jest.fn()),
  navigate: jest.fn(),
  replace: jest.fn(),
  goBack: jest.fn(),
  dispatch: jest.fn(),
});

const makeRoute = () => ({
  params: {
    child,
    letterSet,
    attemptNumber: 2,
    assessmentType: 'letter_egra',
    captureMode: 'sequential',
  },
});

const renderScreen = () => {
  const navigation = makeNavigation();
  const screen = render(<SequentialAssessmentScreen navigation={navigation} route={makeRoute()} />);
  return { ...screen, navigation };
};

const originalWarn = console.warn;

describe('SequentialAssessmentScreen', () => {
  const refreshSyncStatus = jest.fn();
  const triggerBackgroundSync = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-21T08:00:00.000Z'));
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({
      refreshSyncStatus,
      triggerBackgroundSync,
    });
    refreshSyncStatus.mockResolvedValue({ unsyncedCount: 1 });
    assessmentsRepository.saveAssessment.mockResolvedValue(true);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation((message, ...args) => {
      if (String(message).includes("Tried to use the icon")) return;
      originalWarn(message, ...args);
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('completing all items saves a sequential record', async () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Start Assessment'));
    fireEvent.press(getByText('Correct'));
    fireEvent.press(getByText('Incorrect'));
    await act(async () => {
      fireEvent.press(getByText('Correct'));
    });

    await waitFor(() => expect(assessmentsRepository.saveAssessment).toHaveBeenCalledTimes(1));
    const saved = assessmentsRepository.saveAssessment.mock.calls[0][0];
    expect(saved.capture_mode).toBe('sequential');
    expect(saved.letters_attempted).toBe(3);
    expect(saved.last_letter_attempted).toEqual({ index: 2, letter: 'c' });
  });

  test('R2 race does not overshoot when the final item is pressed twice in one act', async () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Start Assessment'));
    fireEvent.press(getByText('Correct'));
    fireEvent.press(getByText('Incorrect'));
    await act(async () => {
      fireEvent.press(getByText('Correct'));
      fireEvent.press(getByText('Correct'));
    });

    await waitFor(() => expect(assessmentsRepository.saveAssessment).toHaveBeenCalledTimes(1));
    const saved = assessmentsRepository.saveAssessment.mock.calls[0][0];
    expect(saved.letters_attempted).toBe(3);
    expect(saved.last_letter_attempted.index).toBe(2);
  });

  test('Back is disabled at cursor 0 and decrements otherwise', async () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Start Assessment'));
    fireEvent.press(getByText('Back'));
    fireEvent.press(getByText('Correct'));
    fireEvent.press(getByText('Back'));
    fireEvent.press(getByText('Incorrect'));
    fireEvent.press(getByText('Correct'));
    await act(async () => {
      fireEvent.press(getByText('Correct'));
    });

    await waitFor(() => expect(assessmentsRepository.saveAssessment).toHaveBeenCalledTimes(1));
    const saved = assessmentsRepository.saveAssessment.mock.calls[0][0];
    expect(saved.correction_count).toBe(1);
    expect(saved.letters_attempted).toBe(3);
    expect(saved.correct_letters).toEqual([
      { index: 1, letter: 'b' },
      { index: 2, letter: 'c' },
    ]);
  });
});
