jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
import { renderWithProviders } from '../test-support/renderWithProviders';
import ListGroup from '../src/components/common/ListGroup';
import React from 'react';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { FlatList, StyleSheet } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import AssessmentHistoryScreen from '../src/screens/assessments/AssessmentHistoryScreen';
import { useAuth } from '../src/context/AuthContext';
import { useChildren } from '../src/context/ChildrenContext';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { batteryRunsRepository } from '../src/db/repositories/batteryRunsRepository';
import { supabase } from '../src/services/supabaseClient';

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

jest.mock('../src/context/ChildrenContext', () => ({
  useChildren: jest.fn(),
}));

jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  ...jest.requireActual('../src/db/repositories/assessmentsRepository'),
  assessmentsRepository: {
    getQuestionResults: jest.fn(),
  },
}));

jest.mock('../src/db/repositories/batteryRunsRepository', () => ({
  ...jest.requireActual('../src/db/repositories/batteryRunsRepository'),
  batteryRunsRepository: { getRunsForUser: jest.fn() },
}));

jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'),
  supabase: {
    from: jest.fn(),
  },
}));

const render = ui => renderWithProviders(<SignedInEAContext.Provider value={{ repositories: { assessments: assessmentsRepository, batteryRuns: batteryRunsRepository } }}>{ui}</SignedInEAContext.Provider>);

const ZERO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
let mockInsets = ZERO_INSETS;
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  SafeAreaProvider: ({ children }) => children,
  useSafeAreaInsets: () => mockInsets,
}));

describe('AssessmentHistoryScreen Plan 5 behavior', () => {
  test('battery Questions are hidden behind one read-only run row, with human-readable status and stored Question count', async () => {
    assessmentsRepository.getQuestionResults.mockResolvedValue([
      { id: 'q1', child_id: 'child-1', battery_run_id: 'run-1', question_code: 'letter_sounds', assessment_date: '2026-05-20' },
      { id: 'q6', child_id: 'child-1', battery_run_id: 'run-1', question_code: 'wela_plus_read_words', assessment_date: '2026-05-20' },
    ]);
    batteryRunsRepository.getRunsForUser.mockResolvedValue([
      { id: 'run-1', child_id: 'child-1', status: 'in_progress', question_count: 2, language: 'xh', started_at: '2026-05-20T10:00:00Z', sync_status: 'synced' },
    ]);
    const navigation = { navigate: jest.fn() };
    const screen = render(<AssessmentHistoryScreen navigation={navigation} />);
    await screen.findByText('WelaPLUS · In progress · 2 Questions');
    expect(screen.getAllByTestId('assessment-history-row')).toHaveLength(1);
    expect(screen.getByText('isiXhosa')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /WelaPLUS/ })).toBeNull();
    fireEvent.press(screen.getByText('WelaPLUS · In progress · 2 Questions'));
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-21T12:00:00.000Z'));

    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useChildren.mockReturnValue({
      allChildren: [
        { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' },
      ],
    });
    batteryRunsRepository.getRunsForUser.mockResolvedValue([]);
    assessmentsRepository.getQuestionResults.mockResolvedValue([
      {
        id: 'assessment-1',
        user_id: 'user-1',
        child_id: 'child-1',
        question_code: 'letter_sounds',
        assessment_date: '2026-05-20',
        language: 'en', score: 8, total_items: 60, sync_status: 'pending',
        battery_run_id: null, stopped_reason: 'completed', items: [], derived: {},
        created_at: '2026-05-20T10:00:00.000Z',
      },
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('load errors appear as root toasts', async () => {
    assessmentsRepository.getQuestionResults.mockRejectedValueOnce(new Error('read failed'));
    const screen = render(<AssessmentHistoryScreen navigation={{ navigate: jest.fn() }} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Failed to load assessments'));
    expect(screen.getByRole('button', { name: 'Dismiss message' })).toBeTruthy();
  });

  test('the history card ends 16dp above the 48dp bottom safe area', async () => {
    mockInsets = { top: 24, right: 0, bottom: 48, left: 0 };
    try {
      const screen = render(<AssessmentHistoryScreen navigation={{ navigate: jest.fn() }} />);
      await screen.findByText('Pending sync');
      expect(StyleSheet.flatten(screen.UNSAFE_getByType(ListGroup).props.style)).toMatchObject({ marginBottom: 64 });
      expect(StyleSheet.flatten(screen.UNSAFE_getByType(FlatList).props.contentContainerStyle)?.paddingBottom).toBeUndefined();
    } finally {
      mockInsets = ZERO_INSETS;
    }
  });

  test('history rows are contained in the shared ListGroup', async () => {
    const screen = render(<AssessmentHistoryScreen navigation={{ navigate: jest.fn() }} />);
    await screen.findByText('Pending sync');
    const group = screen.UNSAFE_getByType(ListGroup);
    expect(group.findAllByType('Text').some(node => node.props.children === 'Pending sync')).toBe(true);
    expect(screen.queryByTestId('history-row-divider')).toBeNull();
  });

  test('loads complete assessment history from SQLite without a hidden date cutoff', async () => {
    const navigation = { navigate: jest.fn() };
    const { getByText, queryByText } = render(<AssessmentHistoryScreen navigation={navigation} />);

    await waitFor(() => expect(getByText('Amahle Dlamini')).toBeTruthy());

    expect(getByText('Pending sync')).toBeTruthy();
    expect(getByText('English')).toBeTruthy();
    expect(queryByText('No assessments yet. Run your first assessment!')).toBeNull();
    expect(assessmentsRepository.getQuestionResults).toHaveBeenCalledTimes(1);
    expect(assessmentsRepository.getQuestionResults).toHaveBeenCalledWith({
      userId: 'user-1',
      recordedByUserId: 'user-1',
      includeSkipped: true,
      order: 'desc',
    });
    expect(batteryRunsRepository.getRunsForUser).toHaveBeenCalledWith('user-1');
    fireEvent.press(getByText('Letter Sounds'));
    expect(navigation.navigate).toHaveBeenCalledWith('AssessmentDetail', { assessmentId: 'assessment-1', childName: 'Amahle Dlamini' });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
