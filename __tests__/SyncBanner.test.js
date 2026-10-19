import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import SyncBanner from '../src/components/common/SyncBanner';
import BrandButton from '../src/components/common/BrandButton';
import { colors, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
const mockUseOffline = jest.fn();
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockUseOffline() }));
const base = { isOnline: true, isSyncing: false, waitingCount: 3, needsAttentionCount: 0 };
beforeEach(() => { jest.clearAllMocks(); mockUseOffline.mockReturnValue(base); });

test('waiting has the exact copy and a small tertiary Sync now action, without live announcements', () => {
  const onSyncNow = jest.fn();
  const ui = render(<SyncBanner onSyncNow={onSyncNow} />);
  expect(StyleSheet.flatten(ui.getByText('3 items waiting to sync').props.style)).toMatchObject({ ...typeRoles.textBodyStrong, color: colors.text });
  const container = ui.getByTestId('sync-banner');
  expect(StyleSheet.flatten(container.props.style)).toMatchObject({ minHeight: 56, borderRadius: 18, borderColor: tints.rule });
  expect(container.props.accessibilityRole).toBeUndefined();
  expect(container.props.accessibilityLiveRegion).toBeUndefined();
  expect(ui.UNSAFE_getByType(BrandButton).props).toMatchObject({ variant: 'tertiary', size: 'sm' });
  fireEvent.press(ui.getByRole('button', { name: 'Sync now' }));
  expect(onSyncNow).toHaveBeenCalledTimes(1);
});
test.each([
  [{ isOnline: false }, '3 items will sync when you’re online'],
  [{ isSyncing: true }, 'Syncing 3 items…'],
  [{ waitingCount: 1, isOnline: false }, '1 item will sync when you’re online'],
  [{ waitingCount: 1, isSyncing: true }, 'Syncing 1 item…'],
])('transport state %p has copy without the sync action', (overrides, message) => {
  mockUseOffline.mockReturnValue({ ...base, ...overrides });
  const ui = render(<SyncBanner onSyncNow={jest.fn()} />);
  expect(ui.getByText(message)).toBeTruthy();
  expect(ui.queryByRole('button', { name: 'Sync now' })).toBeNull();
});
test.each([
  { waitingCount: 1 }, { waitingCount: 10000 },
])('waiting count %p is exact, with no display cap', ({ waitingCount }) => {
  mockUseOffline.mockReturnValue({ ...base, waitingCount });
  const ui = render(<SyncBanner onSyncNow={jest.fn()} />);
  expect(ui.getByText(`${waitingCount} ${waitingCount === 1 ? 'item' : 'items'} waiting to sync`)).toBeTruthy();
});
test.each([
  { waitingCount: 0 }, { waitingCount: 0, isSyncing: true },
  { needsAttentionCount: 2 }, { needsAttentionCount: 2, isSyncing: true },
])('no banner for %p', (overrides) => {
  mockUseOffline.mockReturnValue({ ...base, ...overrides });
  expect(render(<SyncBanner />).toJSON()).toBeNull();
});
