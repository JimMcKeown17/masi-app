import { useAssessmentHistoryStatus } from '../src/services/assessmentHistoryStatus';
jest.mock('../src/services/assessmentHistoryStatus', () => ({
  ...jest.requireActual('../src/services/assessmentHistoryStatus'), useAssessmentHistoryStatus: jest.fn(),
}));
beforeEach(() => useAssessmentHistoryStatus.mockReturnValue({ running: false, pageVersion: 0, runVersion: 0 }));
jest.mock('../test-support/handleServiceMocks', () => ({
getSessionHistoryPullState: jest.fn(),
getAssessmentHistoryPullStates: jest.fn(),
retryFailedItem: jest.fn(),
removeDeliveredItem: jest.fn(),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

import { render, fireEvent, waitFor, within } from '@testing-library/react-native';
import { AllProviders } from '../test-support/renderWithProviders';
import { StyleSheet } from 'react-native';
import { colors, tints } from '../src/constants/colors';
import SyncStatusScreen from '../src/screens/main/SyncStatusScreen';
import { removeDeliveredItem, retryFailedItem } from '../test-support/handleServiceMocks';
import { useSessionHistoryStatus } from '../src/services/sessionHistoryStatus';
import { getSessionHistoryPullState, getAssessmentHistoryPullStates } from '../test-support/handleServiceMocks';

jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('@react-navigation/native', () => ({
  NavigationContext: require('react').createContext(null),
  useFocusEffect: (callback) => require('react').useEffect(callback, [callback]),
}));
jest.mock('../src/services/sessionHistoryStatus', () => ({ ...jest.requireActual('../src/services/sessionHistoryStatus'),
useSessionHistoryStatus: jest.fn() }));
beforeEach(() => {
  useSessionHistoryStatus.mockReturnValue({ running: false, pageVersion: 0, runVersion: 0 });
  getSessionHistoryPullState.mockResolvedValue(null);
  const complete = { lastPulledAt: '2026-10-21T10:00:00Z', cursor: '{"complete":true}' };
  getAssessmentHistoryPullStates.mockResolvedValue({ batteryRuns: complete, assessments: complete, mastery: complete, skillMastery: complete });
});



const mockUseOffline = jest.fn();
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockUseOffline() }));

const offline = ({ syncStatus = {}, ...overrides } = {}) => ({
  isOnline: true,
  isSyncing: false,
  waitingCount: 0,
  needsAttentionCount: 0,
  syncNow: jest.fn(),
  refreshSyncStatus: jest.fn(),
  syncStatus,
  ...overrides,
});

const terminalItem = (overrides = {}) => ({
  outboxId: 'session_attendees:abc12345ff:insert',
  table: 'session_attendees',
  id: 'abc12345ff',
  operation: 'insert',
  reason: '42501-authenticated: new row violates row-level security policy',
  failedAt: null,
  terminal: true,
  nextRetryAt: null,
  retryCount: 3,
  delivery: 'waiting',
  clearsItself: false,
  canRemove: false,
  canRetry: true,
  ...overrides,
});

const renderScreen = () => render(
  <AllProviders><SyncStatusScreen /></AllProviders>
);

afterEach(() => jest.clearAllMocks());

test.each([
  ['not downloaded', false, null, 'Not downloaded yet', null],
  ['downloading', true, null, 'Downloading', 'Downloading history from Head Office…'],
  ['up to date', false, { lastPulledAt: '2026-09-25T10:00:00Z', cursor: '{"complete":true}' }, 'Up to date', null],
  ['incomplete', false, { lastPulledAt: null, cursor: '{"complete":false}' }, /^Incomplete since /, 'History not fully downloaded yet'],
  ['failed after success', false, { lastPulledAt: '2026-09-25T10:00:00Z', cursor: '{"complete":true,"lastFailureAt":"2026-09-25T10:00:00Z"}' }, /^Incomplete since /, 'History not fully downloaded yet'],
])('History shows %s independently of the upload summary', async (_state, running, pullState, label, detail) => {
  mockUseOffline.mockReturnValue(offline());
  useSessionHistoryStatus.mockReturnValue({ running, pageVersion: 0, runVersion: 0 });
  getSessionHistoryPullState.mockResolvedValue(pullState);
  const screen = renderScreen();
  await waitFor(() => expect(screen.getByText('History')).toBeTruthy());
  await waitFor(() => expect(screen.getByText(label)).toBeTruthy());
  if (detail) expect(screen.getByText(detail)).toBeTruthy();
  expect(screen.getByText('All saved and synced')).toBeTruthy();
  expect(getSessionHistoryPullState).toHaveBeenCalledWith('user-1');
});

test.each(['pageVersion', 'runVersion'])('History reloads on %s', async (version) => {
  mockUseOffline.mockReturnValue(offline());
  const screen = renderScreen();
  await waitFor(() => expect(getSessionHistoryPullState).toHaveBeenCalledTimes(1));
  useSessionHistoryStatus.mockReturnValue({ running: false, pageVersion: 0, runVersion: 0, [version]: 1 });
  getSessionHistoryPullState.mockResolvedValue({ lastPulledAt: null, cursor: '{"complete":false}' });
  screen.rerender(<AllProviders><SyncStatusScreen /></AllProviders>);
  await waitFor(() => expect(screen.getByText('History not fully downloaded yet')).toBeTruthy());
  expect(getSessionHistoryPullState).toHaveBeenCalledTimes(2);
});

test('terminal-only backlog reads needs-attention and itemizes with Retry (regression: never claims all synced)', () => {
  mockUseOffline.mockReturnValue(offline({
    needsAttentionCount: 1,
    syncStatus: { needsAttentionItems: [terminalItem()] },
  }));
  const { queryByText, getByText } = renderScreen();
  expect(queryByText('All saved and synced')).toBeNull();
  expect(getByText('1 item needs attention')).toBeTruthy();
  expect(getByText('Attendance')).toBeTruthy();
  expect(getByText('The office could not accept this.')).toBeTruthy();
  expect(getByText('Waiting for the office to get a copy.')).toBeTruthy();
  expect(getByText('Retry')).toBeTruthy();
});

// MA-BUG-20261104-019: no table names, ids or server errors on screen.
test('needs-attention items show plain words, never a table name, id or server error', () => {
  mockUseOffline.mockReturnValue(offline({
    needsAttentionCount: 2,
    syncStatus: { needsAttentionItems: [
      terminalItem(),
      terminalItem({ outboxId: 'classes:class-1:archive', table: 'classes', id: 'class-1', operation: 'archive',
        reason: 'classes archive did not acknowledge exactly one updated row', clearsItself: true, canRetry: false }),
    ] },
  }));
  const screen = renderScreen();
  expect(screen.getByText('Attendance')).toBeTruthy();
  expect(screen.getByText('Classes')).toBeTruthy();
  expect(screen.queryByText(/session_attendees|classes archive|row-level|abc12345|ID:/)).toBeNull();
  // A refused change never offers Retry: it clears by itself once the office has a copy.
  expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1);
});

test.each([
  ['offline', false, 'waiting', 'Connect to the internet so the office gets a copy.'],
  ['oversized', true, 'support', 'Send diagnostics, then contact support.'],
])('a %s item says what to do', (_name, isOnline, delivery, hint) => {
  mockUseOffline.mockReturnValue(offline({
    isOnline, needsAttentionCount: 1, syncStatus: { needsAttentionItems: [terminalItem({ delivery })] },
  }));
  const screen = renderScreen();
  expect(screen.getByText(hint)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'The office has a copy — remove from this phone' })).toBeNull();
});

// D8: the exit, only once the office has a copy, and only after the EA confirms.
test('a delivered item offers "The office has a copy — remove from this phone"', async () => {
  const state = offline({ needsAttentionCount: 1,
    syncStatus: { needsAttentionItems: [terminalItem({ delivery: 'delivered', canRemove: true })] } });
  mockUseOffline.mockReturnValue(state);
  removeDeliveredItem.mockResolvedValue({ removed: true });
  const screen = renderScreen();
  expect(screen.getByText('The office has a copy.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'The office has a copy — remove from this phone' }));
  expect(removeDeliveredItem).not.toHaveBeenCalled();
  expect(await screen.findByText('Remove from this phone?')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
  await waitFor(() => expect(removeDeliveredItem).toHaveBeenCalledWith('session_attendees:abc12345ff:insert'));
  await waitFor(() => expect(state.refreshSyncStatus).toHaveBeenCalledTimes(1));
  expect(within(screen.getByTestId('toast-host')).getByText('Removed from this phone')).toBeTruthy();
});

test('cancelling the exit removes nothing; a refused exit says so', async () => {
  const state = offline({ needsAttentionCount: 1,
    syncStatus: { needsAttentionItems: [terminalItem({ delivery: 'delivered', canRemove: true })] } });
  mockUseOffline.mockReturnValue(state);
  removeDeliveredItem.mockResolvedValue({ removed: false, delivery: 'waiting' });
  const screen = renderScreen();
  fireEvent.press(screen.getByRole('button', { name: 'The office has a copy — remove from this phone' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Cancel' }));
  expect(removeDeliveredItem).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'The office has a copy — remove from this phone' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Remove' }));
  await waitFor(() => expect(within(screen.getByTestId('toast-host'))
    .getByText('Not removed. The office does not have a copy yet.')).toBeTruthy());
});

test('waiting backlog reads calm and count-only: no itemized rows, no Retry', () => {
  mockUseOffline.mockReturnValue(offline({
    waitingCount: 3,
    syncStatus: { backedOffCount: 1, nextRetryAt: '2099-01-01T10:00:00.000Z' },
  }));
  const { getByText, queryByText } = renderScreen();
  expect(getByText('Saved on your phone · 3 waiting to sync')).toBeTruthy();
  expect(getByText('3 items saved on your phone, waiting to sync')).toBeTruthy();
  expect(getByText(/^Next attempt around /)).toBeTruthy();
  expect(queryByText('Retry')).toBeNull();
});

test('terminal plus waiting shows the needs-attention summary AND the waiting count', () => {
  mockUseOffline.mockReturnValue(offline({
    waitingCount: 2,
    needsAttentionCount: 1,
    syncStatus: { needsAttentionItems: [terminalItem({ table: 'sessions', id: 'deadbeef99' })] },
  }));
  const { getByText } = renderScreen();
  expect(getByText('1 item needs attention')).toBeTruthy();
  expect(getByText('2 items saved on your phone, waiting to sync')).toBeTruthy();
});

test('clean state claims all saved and synced and shows no breaker card', () => {
  mockUseOffline.mockReturnValue(offline());
  const { getByText, queryByText } = renderScreen();
  expect(getByText('All saved and synced')).toBeTruthy();
  expect(queryByText('Large roster change from Head Office is waiting')).toBeNull();
});

test('a persisted reconcile breaker note renders its card and Apply requests that scope', () => {
  const authorizeReconcileBreaker = jest.fn();
  mockUseOffline.mockReturnValue(offline({
    needsAttentionCount: 1,
    authorizeReconcileBreaker,
    syncStatus: {
      reconcileBreakerNotes: [{
        scope: 'childEaAssignments',
        candidateCount: 15,
        wouldEndCount: 12,
        triggeredAt: '2026-07-13T12:00:00.000Z',
      }],
    },
  }));

  const rendered = renderScreen();
  const { getByText, queryByText, rerender } = rendered;
  expect(getByText('Large roster change from Head Office is waiting')).toBeTruthy();

  fireEvent.press(getByText('Apply'));
  expect(authorizeReconcileBreaker).toHaveBeenCalledWith('childEaAssignments');

  mockUseOffline.mockReturnValue(offline());
  rerender(<AllProviders><SyncStatusScreen /></AllProviders>);
  expect(queryByText('Large roster change from Head Office is waiting')).toBeNull();
});

test('offline with terminal items shows reconnect framing and an inert Retry', () => {
  mockUseOffline.mockReturnValue(offline({
    isOnline: false,
    needsAttentionCount: 1,
    syncStatus: { needsAttentionItems: [terminalItem({ table: 'sessions', id: 'deadbeef99' })] },
  }));
  const { getByText } = renderScreen();
  expect(getByText('Reconnect to retry these items.')).toBeTruthy();
  fireEvent.press(getByText('Retry'));
  expect(retryFailedItem).not.toHaveBeenCalled();
});

test('offline with only self-clearing items does not promise a retry', () => {
  mockUseOffline.mockReturnValue(offline({
    isOnline: false, needsAttentionCount: 1,
    syncStatus: { needsAttentionItems: [terminalItem({ table: 'classes', operation: 'archive', clearsItself: true, canRetry: false })] },
  }));
  const screen = renderScreen();
  expect(screen.queryByText('Reconnect to retry these items.')).toBeNull();
  expect(screen.getByText('Connect to the internet so the office gets a copy.')).toBeTruthy();
});

test('Retry is secondary and publishes its neutral progress message through the root host', async () => {
  const state = offline({ needsAttentionCount: 1, syncStatus: { needsAttentionItems: [terminalItem({ table: 'sessions' })] } });
  mockUseOffline.mockReturnValue(state);
  const screen = renderScreen();
  const retry = screen.getByRole('button', { name: 'Retry' });
  expect(StyleSheet.flatten(retry.props.style)).toEqual(expect.objectContaining({
    backgroundColor: colors.surface, borderColor: tints.control, borderWidth: 1.5, minHeight: 44,
  }));
  fireEvent.press(retry);
  await waitFor(() => expect(state.syncNow).toHaveBeenCalledWith({ force: true }));
  expect(retryFailedItem).toHaveBeenCalledWith('sessions', 'abc12345ff');
  expect(state.refreshSyncStatus).toHaveBeenCalledTimes(1);
  expect(within(screen.getByTestId('toast-host')).getByText('Retrying Lessons...')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByTestId('toast-status', { includeHiddenElements: true })).toBeNull();
});

test('Sync now retains its forced sync handler', () => {
  const state = offline();
  mockUseOffline.mockReturnValue(state);
  const screen = renderScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Sync now' }));
  expect(state.syncNow).toHaveBeenCalledWith({ force: true });
});


test('complete sessions with an incomplete assessment walk do not show Up to date', async () => {
  mockUseOffline.mockReturnValue(offline());
  const complete = { lastPulledAt: '2026-10-21T10:00:00Z', cursor: '{"complete":true}' };
  getSessionHistoryPullState.mockResolvedValue(complete);
  getAssessmentHistoryPullStates.mockResolvedValue({ batteryRuns: complete,
    assessments: { updatedAt: '2026-10-21T08:00:00Z', cursor: '{"complete":false}' }, mastery: complete, skillMastery: complete });
  const screen = renderScreen();
  await screen.findByText('History not fully downloaded yet');
  expect(screen.queryByText('Up to date')).toBeNull();
  expect(screen.getAllByText('History')).toHaveLength(1);
  expect(getAssessmentHistoryPullStates).toHaveBeenCalledWith('user-1');
});

test.each(['pageVersion', 'runVersion'])('assessment %s reloads the five History states', async version => {
  mockUseOffline.mockReturnValue(offline());
  const screen = renderScreen();
  await waitFor(() => expect(getAssessmentHistoryPullStates).toHaveBeenCalledTimes(1));
  useAssessmentHistoryStatus.mockReturnValue({ running: false, pageVersion: 0, runVersion: 0, [version]: 1 });
  screen.rerender(<AllProviders><SyncStatusScreen /></AllProviders>);
  await waitFor(() => expect(getAssessmentHistoryPullStates).toHaveBeenCalledTimes(2));
});

test.each(['batteryRuns', 'assessments', 'mastery', 'skillMastery'])('History requires the %s state to be up to date', async key => {
  mockUseOffline.mockReturnValue(offline());
  const complete = { lastPulledAt: '2026-10-21T10:00:00Z', cursor: '{"complete":true}' };
  getSessionHistoryPullState.mockResolvedValue(complete);
  const states = { batteryRuns: complete, assessments: complete, mastery: complete, skillMastery: complete };
  getAssessmentHistoryPullStates.mockResolvedValue({ ...states, [key]: { ...complete, cursor: '{"complete":false}' } });
  const screen = renderScreen();
  await screen.findByText('History not fully downloaded yet');
  expect(screen.queryByText('Up to date')).toBeNull();
});
