jest.mock('../src/hooks/useAssessableChildren', () => ({ useAssessableChildren: jest.fn() }));
import { useAssessableChildren } from '../src/hooks/useAssessableChildren';
beforeEach(() => useAssessableChildren.mockImplementation(() => {
  const state = require('../src/context/ChildrenContext').useChildren();
  const all = state.children ?? state.allChildren ?? [];
  return { all, yourChildren: all, restOfClass: [], loading: false };
}));
import { useAssessmentHistoryStatus } from '../src/services/assessmentHistoryStatus';
jest.mock('../src/services/assessmentHistoryStatus', () => ({
  ...jest.requireActual('../src/services/assessmentHistoryStatus'), useAssessmentHistoryStatus: jest.fn(),
}));
beforeEach(() => useAssessmentHistoryStatus.mockReturnValue({ running: false, pageVersion: 0, runVersion: 0 }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
import { renderWithProviders } from '../test-support/renderWithProviders';
import { WELA_PLUS_FULL_2024_1 as BATTERY } from '../src/assessment-questions';
import StatusBadge from '../src/components/common/StatusBadge';
import ListGroup from '../src/components/common/ListGroup';
import React from 'react';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { FlatList, RefreshControl, StyleSheet } from 'react-native';
import { act, fireEvent, waitFor, within } from '@testing-library/react-native';
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

const mockGetChildNamesByIds = jest.fn(async () => ({}));
const mockGetAssessmentHistoryPullStates = jest.fn(async () => ({ batteryRuns: null, assessments: null, mastery: null }));
const mockStartAssessmentHistoryPull = jest.fn(async () => null);
const mockHandle = { repositories: { assessments: assessmentsRepository, batteryRuns: batteryRunsRepository, children: { getChildNamesByIds: mockGetChildNamesByIds } }, services: { assessmentHistory: { start: mockStartAssessmentHistoryPull, store: { getPullStates: mockGetAssessmentHistoryPullStates } } } };
const withEA = ui => <SignedInEAContext.Provider value={mockHandle}>{ui}</SignedInEAContext.Provider>;
const render = ui => {
  const screen = renderWithProviders(withEA(ui));
  return { ...screen, rerender: next => screen.rerender(withEA(next)) };
};

const ZERO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
let mockInsets = ZERO_INSETS;
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  SafeAreaProvider: ({ children }) => children,
  useSafeAreaInsets: () => mockInsets,
}));

describe('AssessmentHistoryScreen Plan 5 behavior', () => {
  test('empty history invites the EA to assess a child', async () => {
    assessmentsRepository.getQuestionResults.mockResolvedValue([]);
    batteryRunsRepository.getRunsForUser.mockResolvedValue([]);
    const screen = render(<AssessmentHistoryScreen navigation={{ navigate: jest.fn() }} />);
    expect(await screen.findByText('No assessments yet. Assess your first child!')).toBeTruthy();
  });

  test.each([
    [BATTERY.battery_code, BATTERY.battery_version, 'WelaPLUS', 11, '11 of 11 decided'],
    ['egra', 'dbe-egra-en-fal-2-v1', 'English FAL EGRA 2', 4, '4 of 4 decided'],
    ['future_battery', '99', 'future_battery', 3, '3 decided'],
  ])('same-child %s runs on different dates have distinct spoken dates and displayed decided counts', async (code, version, title, count, decided) => {
    assessmentsRepository.getQuestionResults.mockResolvedValue([]);
    batteryRunsRepository.getRunsForUser.mockResolvedValue([21, 22].map(day => ({
      id: `run-${day}`, child_id: 'child-1', status: 'completed', question_count: count, language: 'xh',
      battery_code: code, battery_version: version, started_at: `2026-10-${day}T10:00:00Z`,
    })));
    const screen = render(<AssessmentHistoryScreen navigation={{ navigate: jest.fn() }} />);
    const rows = await screen.findAllByRole('button', { name: new RegExp(title) });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(row => row.props.accessibilityLabel)).size).toBe(2);
    for (const date of ['Wed, Oct 21, 2026', 'Thu, Oct 22, 2026']) {
      const row = screen.getByRole('button', {
        name: `${date}, ${title}, Amahle Dlamini, Finalized, isiXhosa, ${decided}`,
      });
      expect(within(row).getByText(date)).toBeTruthy();
      expect(within(row).getByText(decided)).toBeTruthy();
    }
  });

  test.each([
    ['completed', 'Finalized', 'success'],
    ['in_progress', 'Open', 'warning'],
    ['abandoned', 'Abandoned', 'neutral'],
  ])('history: %s run shows date, child, battery and decided count with %s badge and opens BatteryRunSummary', async (status, label, tone) => {
    assessmentsRepository.getQuestionResults.mockResolvedValue([
      { id: 'q1', child_id: 'child-1', battery_run_id: 'run-1', question_code: 'letter_sounds', assessment_date: '2026-10-22' },
      { id: 'q6', child_id: 'child-1', battery_run_id: 'run-1', question_code: 'wela_plus_read_words', assessment_date: '2026-10-22' },
    ]);
    batteryRunsRepository.getRunsForUser.mockResolvedValue([
      { id: 'run-1', child_id: 'child-1', status, question_count: 11, language: 'xh',
        battery_code: BATTERY.battery_code, battery_version: BATTERY.battery_version, started_here: 1,
        started_at: '2026-10-22T10:00:00Z', sync_status: 'synced' },
    ]);
    const navigation = { navigate: jest.fn() };
    const screen = render(<AssessmentHistoryScreen navigation={navigation} />);
    const row = await screen.findByRole('button', { name: `Thu, Oct 22, 2026, WelaPLUS, Amahle Dlamini, ${label}, isiXhosa, 11 of 11 decided` });
    expect(within(row).getByText('Thu, Oct 22, 2026')).toBeTruthy();
    expect(within(row).getByText('WelaPLUS')).toBeTruthy();
    expect(within(row).getByText('11 of 11 decided')).toBeTruthy();
    expect(within(row).getByText('›')).toBeTruthy();
    const texts = within(row).getAllByText(/Thu, Oct|Amahle Dlamini|^WelaPLUS$|^isiXhosa$|decided/);
    expect(texts.map(text => text.props.children)).toEqual([
      'Thu, Oct 22, 2026', expect.anything(), 'WelaPLUS', 'isiXhosa', '11 of 11 decided',
    ]);
    expect(within(row).UNSAFE_getByType(StatusBadge).props).toMatchObject({ label, tone });
    expect(screen.getAllByTestId('assessment-history-row')).toHaveLength(1);
    expect(within(row).getByText('Amahle Dlamini')).toBeTruthy();
    expect(within(row).getByText('isiXhosa')).toBeTruthy();
    expect(screen.queryByText('Letter Sounds')).toBeNull();
    fireEvent.press(row);
    expect(navigation.navigate).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).toHaveBeenCalledWith('BatteryRunSummary', { runId: 'run-1' });
  });

  test('unknown battery run keeps its code, chevron and decided count without inventing a total', async () => {
    assessmentsRepository.getQuestionResults.mockResolvedValue([]);
    batteryRunsRepository.getRunsForUser.mockResolvedValue([
      { id: 'future-run', child_id: 'child-1', status: 'completed', question_count: 3, language: 'en',
        battery_code: 'future_battery', battery_version: '99', started_at: '2026-10-22T10:00:00Z' },
    ]);
    const screen = render(<AssessmentHistoryScreen navigation={{ navigate: jest.fn() }} />);
    const row = await screen.findByRole('button', { name: 'Thu, Oct 22, 2026, future_battery, Amahle Dlamini, Finalized, English, 3 decided' });
    expect(within(row).getByText('3 decided')).toBeTruthy();
    expect(within(row).getByText('future_battery')).toBeTruthy();
    expect(within(row).getByText('›')).toBeTruthy();
  });

  test('a run row is dated by the South African day it started, not the UTC day', async () => {
    assessmentsRepository.getQuestionResults.mockResolvedValue([]);
    batteryRunsRepository.getRunsForUser.mockResolvedValue([
      { id: 'run-2', child_id: 'child-1', status: 'completed', question_count: 11, language: 'xh',
        battery_code: BATTERY.battery_code, battery_version: BATTERY.battery_version, started_at: '2026-10-19T22:30:00Z', sync_status: 'synced' },
    ]);
    const screen = render(<AssessmentHistoryScreen navigation={{ navigate: jest.fn() }} />);
    await screen.findByText('Tue, Oct 20, 2026');
    expect(screen.queryByText(/Oct 19/)).toBeNull();
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

  test.each(['pageVersion', 'runVersion'])('%s reload keeps rows mounted until the replacement arrives', async version => {
    const navigation = { navigate: jest.fn() };
    const screen = render(<AssessmentHistoryScreen navigation={navigation} />);
    expect(screen.getByText('Loading...')).toBeTruthy();
    await screen.findByText('Amahle Dlamini');
    const row = screen.getByTestId('assessment-history-row');
    const initial = assessmentsRepository.getQuestionResults.mock.results[0];
    const rows = await initial.value;
    let resolve;
    assessmentsRepository.getQuestionResults.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    useAssessmentHistoryStatus.mockReturnValue({ running: false, pageVersion: 0, runVersion: 0, [version]: 1 });
    screen.rerender(<AssessmentHistoryScreen navigation={navigation} />);
    expect(screen.queryByText('Loading...')).toBeNull();
    expect(screen.getByTestId('assessment-history-row')).toBe(row);
    fireEvent.press(screen.getByText('Letter Sounds'));
    expect(navigation.navigate).toHaveBeenCalledWith('AssessmentDetail', { assessmentId: 'assessment-1', childName: 'Amahle Dlamini' });
    await act(async () => resolve([...rows, { ...rows[0], id: 'assessment-2', score: 9 }]));
    expect(await screen.findByText('9 / 60')).toBeTruthy();
    expect(screen.getAllByTestId('assessment-history-row')).toHaveLength(2);
  });

  test('switching user hides the previous rows until the new first load settles, even on error', async () => {
    const navigation = { navigate: jest.fn() };
    const screen = render(<AssessmentHistoryScreen navigation={navigation} />);
    await screen.findByText('Amahle Dlamini');
    let reject;
    assessmentsRepository.getQuestionResults.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    useAuth.mockReturnValue({ user: { id: 'user-2' } });
    screen.rerender(<AssessmentHistoryScreen navigation={navigation} />);
    expect(screen.queryByText('Amahle Dlamini')).toBeNull();
    expect(screen.getByText('Loading...')).toBeTruthy();
    await act(async () => reject(new Error('read failed')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load assessments');
    expect(screen.queryByText('Loading...')).toBeNull();
    expect(screen.queryByText('Amahle Dlamini')).toBeNull();
    expect(screen.getByText('No assessments yet. Assess your first child!')).toBeTruthy();
  });

  test('a rejected reload keeps the previous rows and shows the existing error toast', async () => {
    const navigation = { navigate: jest.fn() };
    const screen = render(<AssessmentHistoryScreen navigation={navigation} />);
    await screen.findByText('Amahle Dlamini');
    const row = screen.getByTestId('assessment-history-row');
    let reject;
    assessmentsRepository.getQuestionResults.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    useAssessmentHistoryStatus.mockReturnValue({ pageVersion: 1, runVersion: 0 });
    screen.rerender(<AssessmentHistoryScreen navigation={navigation} />);
    expect(screen.queryByText('Loading...')).toBeNull();
    expect(screen.getByTestId('assessment-history-row')).toBe(row);
    await act(async () => reject(new Error('read failed')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load assessments');
    expect(screen.getByTestId('assessment-history-row')).toBe(row);
    expect(screen.getByText('Amahle Dlamini')).toBeTruthy();
  });

  test('an older reload cannot overwrite a newer result', async () => {
    const navigation = { navigate: jest.fn() };
    const screen = render(<AssessmentHistoryScreen navigation={navigation} />);
    await screen.findByText('Amahle Dlamini');
    const rows = await assessmentsRepository.getQuestionResults.mock.results[0].value;
    let resolveOld, resolveNew;
    assessmentsRepository.getQuestionResults
      .mockReturnValueOnce(new Promise(done => { resolveOld = done; }))
      .mockReturnValueOnce(new Promise(done => { resolveNew = done; }));
    useAssessmentHistoryStatus.mockReturnValue({ pageVersion: 1, runVersion: 0 });
    screen.rerender(<AssessmentHistoryScreen navigation={navigation} />);
    useAssessmentHistoryStatus.mockReturnValue({ pageVersion: 2, runVersion: 0 });
    screen.rerender(<AssessmentHistoryScreen navigation={navigation} />);
    await act(async () => resolveNew([{ ...rows[0], score: 10 }]));
    expect(await screen.findByText('10 / 60')).toBeTruthy();
    await act(async () => resolveOld([{ ...rows[0], score: 9 }]));
    expect(screen.getByText('10 / 60')).toBeTruthy();
    expect(screen.queryByText('9 / 60')).toBeNull();
  });

  test('pull-to-refresh calls services.assessmentHistory.start({ force: true })', async () => {
    const screen = render(<AssessmentHistoryScreen navigation={{ navigate: jest.fn() }} />);
    await screen.findByText('Pending sync');
    expect(mockStartAssessmentHistoryPull).not.toHaveBeenCalled(); // focus only reloads SQLite
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    await waitFor(() => expect(mockStartAssessmentHistoryPull).toHaveBeenCalledWith({ force: true }));
    expect(mockStartAssessmentHistoryPull).toHaveBeenCalledTimes(1);
  });

  test('while running, Downloading history from Head Office… is shown', async () => {
    useAssessmentHistoryStatus.mockReturnValue({ running: true, pageVersion: 0, runVersion: 0 });
    const screen = render(<AssessmentHistoryScreen navigation={{ navigate: jest.fn() }} />);
    expect(screen.getByText('Downloading history from Head Office…')).toBeTruthy();
    await screen.findByText('Pending sync');
    expect(screen.getByText('Downloading history from Head Office…')).toBeTruthy();
  });

  test('an own result for a history reference child shows the stored name, not Unknown child', async () => {
    useChildren.mockReturnValue({ allChildren: [] });
    mockGetChildNamesByIds.mockResolvedValueOnce({ 'child-1': { name: 'Lindiwe Mbeki', hidden: false } });
    const screen = render(<AssessmentHistoryScreen navigation={{ navigate: jest.fn() }} />);
    await screen.findByText('Lindiwe Mbeki');
    expect(screen.queryByText('Unknown child')).toBeNull();
    expect(mockGetChildNamesByIds).toHaveBeenCalledWith(['child-1']);
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
    expect(queryByText('No assessments yet. Assess your first child!')).toBeNull();
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
  test('uses assessable names directly and retains the SQLite fallback for history-only children', async () => {
    const control = { id: 'control', first_name: 'Cora', last_name: 'Control' };
    useChildren.mockReturnValue({ allChildren: [] });
    useAssessableChildren.mockReturnValue({ all: [control], yourChildren: [], restOfClass: [control], loading: false });
    assessmentsRepository.getQuestionResults.mockResolvedValue(['control', 'history-only'].map((child_id, index) => ({
      id: `result-${index}`, child_id, question_code: 'letter_sounds', assessment_date: '2026-05-20',
      score: 1, total_items: 1, language: 'en', sync_status: 'synced',
    })));
    mockGetChildNamesByIds.mockResolvedValue({ 'history-only': { name: 'Historic Child', hidden: false } });
    const screen = render(<AssessmentHistoryScreen navigation={{ navigate: jest.fn() }} />);
    expect(await screen.findByText('Historic Child')).toBeTruthy();
    expect(screen.getByText('Cora Control')).toBeTruthy();
    expect(mockGetChildNamesByIds).toHaveBeenCalledWith(['history-only']);
  });

  test('history: a pulled run (started_here 0) opens BatteryRunSummary', async () => {
    assessmentsRepository.getQuestionResults.mockResolvedValue([]);
    batteryRunsRepository.getRunsForUser.mockResolvedValue([{
      id: 'pulled-run', child_id: 'child-1', status: 'in_progress', started_here: 0,
      battery_code: BATTERY.battery_code, battery_version: BATTERY.battery_version,
      question_count: 4, language: 'xh', started_at: '2026-10-22T10:00:00Z', sync_status: 'synced',
    }]);
    const navigation = { navigate: jest.fn() };
    const screen = render(<AssessmentHistoryScreen navigation={navigation} />);
    const row = await screen.findByRole('button', { name: 'Thu, Oct 22, 2026, WelaPLUS, Amahle Dlamini, Open, isiXhosa, 4 of 11 decided' });
    expect(within(row).UNSAFE_getByType(StatusBadge).props).toMatchObject({ label: 'Open', tone: 'warning' });
    fireEvent.press(row);
    expect(navigation.navigate).toHaveBeenCalledWith('BatteryRunSummary', { runId: 'pulled-run' });
  });

  test.each([
    ['unknown_battery', BATTERY.battery_version],
    [BATTERY.battery_code, 'unknown_version'],
  ])('history: unknown battery %s@%s falls back to its code and count without a denominator', async (code, version) => {
    assessmentsRepository.getQuestionResults.mockResolvedValue([]);
    batteryRunsRepository.getRunsForUser.mockResolvedValue([{
      id: 'unknown-run', child_id: 'child-1', status: 'abandoned', question_count: 3, language: 'en',
      battery_code: code, battery_version: version, started_at: '2026-10-22T10:00:00Z', sync_status: 'pending',
    }]);
    const navigation = { navigate: jest.fn() };
    const screen = render(<AssessmentHistoryScreen navigation={navigation} />);
    const title = code;
    await screen.findByText(title);
    const row = screen.getByRole('button', { name: new RegExp(code) });
    expect(within(row).UNSAFE_getByType(StatusBadge).props).toMatchObject({ label: 'Abandoned', tone: 'neutral' });
    expect(within(row).getByText('3 decided')).toBeTruthy();
    expect(screen.queryByText('3 of 11 decided')).toBeNull();
    fireEvent.press(row);
    expect(navigation.navigate).toHaveBeenCalledWith('BatteryRunSummary', { runId: 'unknown-run' });
  });

  test.each([
    ['letter_sounds', 'Letter Sounds', 60], ['word_reading', 'Word Reading', 50],
  ])('history: standalone %s rows unchanged', async (code, title, total) => {
    assessmentsRepository.getQuestionResults.mockResolvedValue([{
      id: 'standalone', child_id: 'child-1', question_code: code, assessment_date: '2026-05-20',
      language: 'en', score: 8, total_items: total, sync_status: 'pending', battery_run_id: null,
    }]);
    const navigation = { navigate: jest.fn() };
    const screen = render(<AssessmentHistoryScreen navigation={navigation} />);
    const row = await screen.findByRole('button', { name: new RegExp(title) });
    expect(within(row).getByText('Wed, May 20, 2026')).toBeTruthy();
    expect(within(row).getByText('Amahle Dlamini')).toBeTruthy();
    expect(within(row).getByText('Pending sync')).toBeTruthy();
    expect(within(row).getByText('English')).toBeTruthy();
    expect(within(row).getByText(`8 / ${total}`)).toBeTruthy();
    expect(within(row).UNSAFE_queryAllByType(StatusBadge)).toHaveLength(0);
    fireEvent.press(row);
    expect(navigation.navigate).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).toHaveBeenCalledWith('AssessmentDetail', { assessmentId: 'standalone', childName: 'Amahle Dlamini' });
  });

});
