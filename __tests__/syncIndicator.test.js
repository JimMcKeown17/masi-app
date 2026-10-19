const mockIconCalls = [];
jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props) => { mockIconCalls.push(props); return null; },
}), { virtual: true });

import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import SyncIndicator from '../src/components/common/SyncIndicator';
import { MotionProvider } from '../src/context/MotionContext';
import { colors, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';

const mockUseOffline = jest.fn();
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockUseOffline() }));
const offline = (overrides = {}) => ({ isOnline: true, isSyncing: false, waitingCount: 0, needsAttentionCount: 0, ...overrides });
const style = (node) => StyleSheet.flatten(node.props.style);

beforeEach(() => { mockIconCalls.length = 0; });
afterEach(() => { jest.clearAllMocks(); jest.restoreAllMocks(); });

test.each([
  ['synced', {}, 'cloud-done-outline', colors.success, null, 'All saved and synced'],
  ['offline with a drained outbox', { isOnline: false }, 'cloud-done-outline', colors.success, null, 'All saved and synced'],
  ['waiting', { waitingCount: 3 }, 'cloud-upload-outline', colors.textSecondary, '3 waiting', 'Saved on your phone. 3 items waiting to sync'],
  ['offline', { isOnline: false, waitingCount: 1 }, 'cloud-offline-outline', colors.textSecondary, '1 waiting', 'Saved on your phone. 1 item will sync when you’re online'],
  ['terminal-only backlog', { needsAttentionCount: 2 }, 'warning-outline', colors.warning, '2', '2 items need attention'],
])('%s uses the canvas pill and keeps its spoken status', (_, state, icon, color, words, label) => {
  mockUseOffline.mockReturnValue(offline(state));
  const onPress = jest.fn();
  const screen = render(<SyncIndicator onPress={onPress} />);
  const button = screen.getByRole('button', { name: `Open sync status, ${label}` });
  fireEvent.press(button);
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(style(button)).toMatchObject({ minHeight: 44, minWidth: 44 });
  expect(style(button).height).toBeUndefined();
  expect(mockIconCalls).toContainEqual(expect.objectContaining({ name: icon, color, size: 18 }));
  const attention = state.needsAttentionCount > 0;
  expect(style(screen.getByTestId('sync-pill'))).toMatchObject({
    minHeight: 32, borderRadius: 16, borderWidth: 1, gap: 6,
    backgroundColor: attention ? colors.warningBg : colors.surface,
    borderColor: attention ? tints.warningEdge : tints.rule,
    ...(words ? { paddingLeft: 9, paddingRight: attention ? 6 : 12 } : { minWidth: 36, padding: 0 }),
  });
  if (words) {
    const text = screen.getByText(words);
    expect(style(text)).toMatchObject({ ...typeRoles.textPill, color: attention ? colors.warningText : colors.text });
    expect(text.props.maxFontSizeMultiplier).toBe(1.2);
  }
  if (attention) expect(mockIconCalls).toContainEqual(expect.objectContaining({ name: 'chevron-forward', color: colors.warningText, size: 14 }));
});

test('syncing shows the 18dp rotating arc and suppresses the count', () => {
  mockUseOffline.mockReturnValue(offline({ isSyncing: true, waitingCount: 5 }));
  const screen = render(<SyncIndicator />);
  expect(screen.getByLabelText('Open sync status, Syncing')).toBeTruthy();
  expect(mockIconCalls).toHaveLength(0);
  expect(screen.queryByText(/5/)).toBeNull();
  expect(style(screen.getByTestId('sync-spinner'))).toMatchObject({
    width: 18, height: 18, borderRadius: 9, borderWidth: 2,
    borderColor: tints.spinnerTrack, borderTopColor: colors.textSecondary,
  });
  expect(style(screen.getByTestId('sync-spinner')).transform).toBeDefined();
});

test.each([
  { tier: 'static', reduceMotion: true, motionLevel: 'still' },
  { tier: 'static', reduceMotion: false, motionLevel: 'still' },
])('syncing under motion %o has no rotation transform', (motion) => {
  mockUseOffline.mockReturnValue(offline({ isSyncing: true }));
  const screen = render(<MotionProvider value={motion}><SyncIndicator /></MotionProvider>);
  expect(style(screen.getByTestId('sync-spinner')).transform).toBeUndefined();
});

test('120 waiting shows 99+ while the accessible count stays exact', () => {
  mockUseOffline.mockReturnValue(offline({ waitingCount: 120 }));
  const screen = render(<SyncIndicator />);
  expect(screen.getByText('99+ waiting')).toBeTruthy();
  expect(screen.getByLabelText('Open sync status, Saved on your phone. 120 items waiting to sync')).toBeTruthy();
});

test('the spinner loop uses the native driver and stops when syncing ends', () => {
  const loop = { start: jest.fn(), stop: jest.fn() };
  jest.spyOn(Animated, 'loop').mockReturnValue(loop);
  const timing = jest.spyOn(Animated, 'timing');
  mockUseOffline.mockReturnValue(offline({ isSyncing: true }));
  const screen = render(<SyncIndicator />);
  expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1, duration: 1000, useNativeDriver: true }));
  expect(loop.start).toHaveBeenCalledTimes(1);
  mockUseOffline.mockReturnValue(offline());
  screen.rerender(<SyncIndicator />);
  expect(loop.stop).toHaveBeenCalledTimes(1);
});
