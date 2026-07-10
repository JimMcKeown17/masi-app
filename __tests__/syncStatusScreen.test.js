jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SyncStatusScreen from '../src/screens/main/SyncStatusScreen';
import { retryFailedItem } from '../src/services/offlineSync';

jest.mock('../src/services/offlineSync', () => ({ retryFailedItem: jest.fn() }));

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
  table: 'assessment_items',
  id: 'abc12345ff',
  operation: 'insert',
  reason: 'RLS policy',
  failedAt: null,
  terminal: true,
  nextRetryAt: null,
  retryCount: 3,
  ...overrides,
});

const metrics = { frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderScreen = () => render(
  <SafeAreaProvider initialMetrics={metrics}><SyncStatusScreen /></SafeAreaProvider>
);

afterEach(() => jest.clearAllMocks());

test('terminal-only backlog reads needs-attention and itemizes with Retry (regression: never claims all synced)', () => {
  mockUseOffline.mockReturnValue(offline({
    needsAttentionCount: 1,
    syncStatus: { needsAttentionItems: [terminalItem()] },
  }));
  const { queryByText, getByText } = renderScreen();
  expect(queryByText('All saved and synced')).toBeNull();
  expect(getByText('1 item needs attention')).toBeTruthy();
  expect(getByText('RLS policy')).toBeTruthy();
  expect(getByText('Retry')).toBeTruthy();
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

test('clean state claims all saved and synced', () => {
  mockUseOffline.mockReturnValue(offline());
  expect(renderScreen().getByText('All saved and synced')).toBeTruthy();
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
