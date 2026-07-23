const mockIconCalls = [];
jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props) => {
    mockIconCalls.push(props);
    return null;
  },
}), { virtual: true });

import { render } from '@testing-library/react-native';
import SyncIndicator from '../src/components/common/SyncIndicator';
import { colors } from '../src/constants/colors';

const mockUseOffline = jest.fn();
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockUseOffline() }));

const offline = (overrides = {}) => ({
  isOnline: true,
  isSyncing: false,
  waitingCount: 0,
  needsAttentionCount: 0,
  ...overrides,
});

beforeEach(() => { mockIconCalls.length = 0; });
afterEach(() => jest.clearAllMocks());

test('terminal-only backlog shows the amber alert with the actionable count (regression: was a green check)', () => {
  mockUseOffline.mockReturnValue(offline({ needsAttentionCount: 2 }));
  const { getByLabelText, getByText } = render(<SyncIndicator onPress={() => {}} />);
  expect(getByLabelText('Open sync status, 2 items need attention')).toBeTruthy();
  expect(getByText('2')).toBeTruthy();
  expect(mockIconCalls[mockIconCalls.length - 1]).toEqual(expect.objectContaining({
    name: 'alert-circle-outline',
    color: colors.warning,
  }));
});

test('waiting items render the calm cloud with the waiting count', () => {
  mockUseOffline.mockReturnValue(offline({ waitingCount: 3 }));
  const { getByLabelText, getByText } = render(<SyncIndicator onPress={() => {}} />);
  expect(getByLabelText('Open sync status, Saved on your phone. 3 items waiting to sync')).toBeTruthy();
  expect(getByText('3')).toBeTruthy();
  expect(mockIconCalls[mockIconCalls.length - 1]).toEqual(expect.objectContaining({
    name: 'cloud-upload-outline',
    color: colors.info,
  }));
});

test('offline with waiting items reads reassuring, not alarming', () => {
  mockUseOffline.mockReturnValue(offline({ isOnline: false, waitingCount: 1 }));
  const { getByLabelText } = render(<SyncIndicator onPress={() => {}} />);
  expect(getByLabelText("Open sync status, Saved on your phone. 1 item will sync when you're online")).toBeTruthy();
  expect(mockIconCalls[mockIconCalls.length - 1]).toEqual(expect.objectContaining({
    name: 'cloud-offline-outline',
    color: colors.info,
  }));
});

test('offline with a drained outbox still shows the green check', () => {
  mockUseOffline.mockReturnValue(offline({ isOnline: false }));
  const { getByLabelText } = render(<SyncIndicator onPress={() => {}} />);
  expect(getByLabelText('Open sync status, All saved and synced')).toBeTruthy();
  expect(mockIconCalls[mockIconCalls.length - 1]).toEqual(expect.objectContaining({
    name: 'checkmark-circle-outline',
    color: colors.success,
  }));
});

test('syncing shows the spinner and suppresses the badge', () => {
  mockUseOffline.mockReturnValue(offline({ isSyncing: true, waitingCount: 5 }));
  const { getByLabelText, queryByText } = render(<SyncIndicator onPress={() => {}} />);
  expect(getByLabelText('Open sync status, Syncing')).toBeTruthy();
  expect(mockIconCalls).toHaveLength(0);
  expect(queryByText('5')).toBeNull();
});

test('Home treatment can show the full sync message instead of an icon-only badge', () => {
  mockUseOffline.mockReturnValue(offline({ waitingCount: 2 }));
  const { getByText, queryByText } = render(
    <SyncIndicator onPress={() => {}} showLabel dark />
  );

  expect(getByText('Saved on your phone · 2 waiting to sync')).toBeTruthy();
  expect(queryByText('2')).toBeNull();
});
