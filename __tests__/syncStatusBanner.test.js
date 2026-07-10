jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

import { render, fireEvent } from '@testing-library/react-native';
import SyncStatusBanner from '../src/components/common/SyncStatusBanner';

const mockUseOffline = jest.fn();
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockUseOffline() }));

const offline = (overrides = {}) => ({
  isOnline: true,
  waitingCount: 0,
  needsAttentionCount: 0,
  ...overrides,
});

afterEach(() => jest.clearAllMocks());

test('renders nothing when everything is synced', () => {
  mockUseOffline.mockReturnValue(offline());
  expect(render(<SyncStatusBanner onPress={() => {}} />).toJSON()).toBeNull();
});

test('renders nothing when offline with a drained outbox (Network card still says Offline)', () => {
  mockUseOffline.mockReturnValue(offline({ isOnline: false }));
  expect(render(<SyncStatusBanner onPress={() => {}} />).toJSON()).toBeNull();
});

test('waiting backlog reads reassuring, not failed (regression: was amber "waiting" / red "failed")', () => {
  mockUseOffline.mockReturnValue(offline({ waitingCount: 3 }));
  const { getByText, queryByText } = render(<SyncStatusBanner onPress={() => {}} />);
  expect(getByText('Saved on your phone · 3 waiting to sync')).toBeTruthy();
  expect(queryByText(/failed to sync/i)).toBeNull();
});

test('terminal backlog reads needs-attention, and wins over waiting', () => {
  mockUseOffline.mockReturnValue(offline({ waitingCount: 3, needsAttentionCount: 2 }));
  const { getByText } = render(<SyncStatusBanner onPress={() => {}} />);
  expect(getByText('2 items need attention')).toBeTruthy();
});

test('offline with waiting work keeps the reassurance copy', () => {
  mockUseOffline.mockReturnValue(offline({ isOnline: false, waitingCount: 2 }));
  const { getByText } = render(<SyncStatusBanner onPress={() => {}} />);
  expect(getByText("Saved on your phone · 2 will sync when you're online")).toBeTruthy();
});

test('press opens sync status', () => {
  const onPress = jest.fn();
  mockUseOffline.mockReturnValue(offline({ waitingCount: 1 }));
  const { getByLabelText } = render(<SyncStatusBanner onPress={onPress} />);
  fireEvent.press(getByLabelText('Open sync status, Saved on your phone. 1 item waiting to sync'));
  expect(onPress).toHaveBeenCalledTimes(1);
});
