// __tests__/SyncIndicator.hero.test.js
const mockUseOffline = jest.fn();
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockUseOffline() }));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }) => require('react').createElement(require('react-native').Text, null, 'icon:' + name),
}), { virtual: true });

import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { MotionProvider } from '../src/context/MotionContext';
import SyncIndicator from '../src/components/common/SyncIndicator';

const offline = (overrides) => ({ isOnline: true, isSyncing: false, waitingCount: 0, needsAttentionCount: 0, ...overrides });

describe('SyncIndicator hero variant', () => {
  test.each([
    { tier: 'static', reduceMotion: true, motionLevel: 'still' },
    { tier: 'static', reduceMotion: false, motionLevel: 'still' },
  ])('syncing under MotionProvider value %o does not rotate', (motion) => {
    mockUseOffline.mockReturnValue(offline({ isSyncing: true }));
    const screen = render(
      <MotionProvider value={motion}><SyncIndicator variant="hero" /></MotionProvider>,
    );
    expect(StyleSheet.flatten(screen.UNSAFE_getByType(Animated.View).props.style)?.transform).toBeUndefined();
  });
  test.each([
    [offline({}), 'All saved and synced. Sync status', 'icon:cloud-done-outline', null],
    [offline({ waitingCount: 3 }), 'Saved on your phone. 3 items waiting to sync. Sync status', 'icon:cloud-upload-outline', '3'],
    [offline({ isOnline: false, waitingCount: 2 }), "Saved on your phone. 2 items will sync when you’re online. Sync status", 'icon:cloud-offline-outline', '2'],
    [offline({ needsAttentionCount: 2 }), '2 items need attention. Sync status', 'icon:cloud-outline', '2'],
    [offline({ waitingCount: 140 }), 'Saved on your phone. 140 items waiting to sync. Sync status', 'icon:cloud-upload-outline', '99+'],
  ])('state %#', (state, label, icon, badge) => {
    mockUseOffline.mockReturnValue(state);
    const onPress = jest.fn();
    const screen = render(<SyncIndicator variant="hero" onPress={onPress} />);
    fireEvent.press(screen.getByLabelText(label));
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByText(icon)).toBeTruthy();
    if (badge) expect(screen.getByText(badge)).toBeTruthy();
  });

  test('syncing shows the rotating sync glyph and no badge', () => {
    mockUseOffline.mockReturnValue(offline({ isSyncing: true, waitingCount: 4 }));
    const screen = render(<SyncIndicator variant="hero" onPress={jest.fn()} />);
    expect(screen.getByLabelText('Syncing. Sync status')).toBeTruthy();
    expect(screen.getByText('icon:sync-outline')).toBeTruthy();
    expect(StyleSheet.flatten(screen.UNSAFE_getByType(Animated.View).props.style).transform).toBeDefined();
    expect(screen.queryByText('4')).toBeNull();
  });
});
