import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('../src/components/assessment/LetterTile', () => {
  const ReactLib = require('react');
  const { Pressable } = require('react-native');
  const renderSpy = jest.fn();
  const Tile = ReactLib.memo(function MockTile({ index, letter, state, isCurrent, onPress }) {
    renderSpy(index);
    const label = `${letter}, ${state === true ? 'correct' : state === false ? 'incorrect' : 'not marked'}${isCurrent ? ', current' : ''}`;
    return ReactLib.createElement(Pressable, { accessibilityLabel: label, onPress: () => { if (onPress) onPress(index); } });
  });
  return { __esModule: true, default: Tile, renderSpy };
});

import SequentialAssessmentScreen from '../src/screens/assessments/SequentialAssessmentScreen';
import { renderSpy } from '../src/components/assessment/LetterTile';
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

describe('SequentialAssessmentScreen render isolation', () => {
  const navigation = { addListener: jest.fn(() => jest.fn()), navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), dispatch: jest.fn() };
  const route = { params: {
    child: { id: 'child-1', first_name: 'A', last_name: 'B' },
    letterSet: { id: 'english-test', language: 'English', letters: ['a', 'b', 'c'], lettersPerPage: 20, columns: 5 },
    attemptNumber: 1, assessmentType: 'letter_egra', captureMode: 'sequential',
  } };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-09T08:00:00.000Z'));
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({ refreshSyncStatus: jest.fn().mockResolvedValue({}), triggerBackgroundSync: jest.fn() });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderSpy.mockClear();
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); jest.clearAllMocks(); });

  test('a decision re-renders exactly two tiles (decided + next current)', () => {
    const { getByText } = render(<SequentialAssessmentScreen navigation={navigation} route={route} />);
    fireEvent.press(getByText('Start Assessment'));
    renderSpy.mockClear();
    fireEvent.press(getByText('Correct'));
    expect(renderSpy).toHaveBeenCalledTimes(2);
    expect(renderSpy.mock.calls.map((c) => c[0]).sort()).toEqual([0, 1]);
  });
});
