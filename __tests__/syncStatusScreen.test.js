jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SyncStatusScreen from '../src/screens/main/SyncStatusScreen';

jest.mock('../src/services/offlineSync', () => ({ retryFailedItem: jest.fn() }));

const mockUseOffline = jest.fn();
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockUseOffline() }));

const offline = (syncStatus) => ({
  isOnline: true,
  isSyncing: false,
  syncNow: jest.fn(),
  refreshSyncStatus: jest.fn(),
  syncStatus,
});

const metrics = { frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderScreen = () => render(
  <SafeAreaProvider initialMetrics={metrics}><SyncStatusScreen /></SafeAreaProvider>
);

afterEach(() => jest.clearAllMocks());

test('does NOT claim "up to date" when failed/terminal items exist but nothing is pending', () => {
  // All stuck items are terminal -> excluded from breakdown, but present in failedItems.
  mockUseOffline.mockReturnValue(offline({
    breakdown: {},
    failedItems: [{ table: 'assessment_items', id: 'abc12345ff', reason: 'RLS policy', failedAt: null }],
  }));
  const { queryByText, getByText } = renderScreen();
  expect(queryByText('Everything is up to date.')).toBeNull();
  expect(getByText(/failed to sync/i)).toBeTruthy();
});

test('claims "up to date" only when there is nothing pending AND nothing failed', () => {
  mockUseOffline.mockReturnValue(offline({ breakdown: {}, failedItems: [] }));
  const { getByText } = renderScreen();
  expect(getByText('Everything is up to date.')).toBeTruthy();
});
