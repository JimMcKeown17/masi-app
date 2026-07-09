import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, act } from '@testing-library/react-native';

jest.mock('../src/components/assessment/EgraLetterGrid', () => {
  const gridRenderSpy = jest.fn();
  const Grid = () => { gridRenderSpy(); return null; };
  return { __esModule: true, default: Grid, gridRenderSpy };
});

import LetterAssessmentScreen from '../src/screens/assessments/LetterAssessmentScreen';
import { gridRenderSpy } from '../src/components/assessment/EgraLetterGrid';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';

jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: jest.fn() }));
jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  assessmentsRepository: { saveAssessment: jest.fn() },
}));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'assessment-1') }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const T0 = new Date('2026-07-09T08:00:00.000Z');

describe('LetterAssessmentScreen render isolation', () => {
  const navigation = { addListener: jest.fn(() => jest.fn()), navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), dispatch: jest.fn() };
  const route = { params: {
    child: { id: 'child-1', first_name: 'A', last_name: 'B' },
    letterSet: { id: 'english-test', language: 'English', letters: ['a', 'b', 'c'], lettersPerPage: 20, columns: 5 },
    attemptNumber: 1, assessmentType: 'letter_egra',
  } };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(T0);
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({ refreshSyncStatus: jest.fn().mockResolvedValue({}), triggerBackgroundSync: jest.fn() });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); jest.clearAllMocks(); });

  test('advancing the countdown does not re-render the grid', () => {
    const { getByText } = render(<LetterAssessmentScreen navigation={navigation} route={route} />);
    fireEvent.press(getByText('Start Assessment'));
    gridRenderSpy.mockClear();
    act(() => { jest.advanceTimersByTime(3000); }); // three 1 Hz ticks
    expect(gridRenderSpy).not.toHaveBeenCalled();
  });
});
