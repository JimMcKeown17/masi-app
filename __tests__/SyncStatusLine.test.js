const mockOffline = jest.fn();
const mockHandle = { isCurrent: jest.fn(() => true) };
const mockIcon = jest.fn();
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockOffline() }));
jest.mock('../src/context/SignedInEAContext', () => ({ useSignedInEA: () => ({ handle: mockHandle }) }));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: props => { mockIcon(props); return null; },
}), { virtual: true });

import React from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import NativeAnimatedHelper from 'react-native/src/private/animated/NativeAnimatedHelper';
import Svg, { Circle, Path } from 'react-native-svg';
import { act, cleanup, render } from '@testing-library/react-native';
import SyncStatusLine, { describeSyncLine } from '../src/components/sessions/SyncStatusLine';
import { MotionProvider } from '../src/context/MotionContext';
import { colors, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';
import { describeSyncState } from '../src/utils/syncStatusPresenter';

const motion = { motionLevel: 'full', reduceMotion: false, tier: 'high' };
const lineTree = (override = {}) => <MotionProvider value={{ ...motion, ...override }}><SyncStatusLine /></MotionProvider>;
const renderLine = (override) => render(lineTree(override));
const style = node => StyleSheet.flatten(node.props.style);
const settleRefresh = () => act(async () => {});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
function setOffline(overrides) {
  mockOffline.mockReturnValue({ ...mockOffline(), ...overrides });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockHandle.isCurrent.mockReturnValue(true);
  mockOffline.mockReturnValue({
    isOnline: true, isSyncing: false, waitingCount: 0, needsAttentionCount: 0,
    refreshSyncStatus: jest.fn().mockResolvedValue({ waitingCount: 0 }),
  });
});
afterEach(() => { cleanup(); jest.restoreAllMocks(); jest.useRealTimers(); });

test('blank until its own refresh resolves, then the presenter line', async () => {
  const read = deferred();
  const refresh = jest.fn(() => read.promise);
  setOffline({ waitingCount: 3, refreshSyncStatus: refresh });
  const screen = renderLine();
  expect(screen.queryByText(/saved|synced|sync/i)).toBeNull();
  expect(style(screen.toJSON()).minHeight).toBe(18);
  expect(mockIcon).not.toHaveBeenCalled();
  await act(async () => read.resolve({ waitingCount: 3 }));
  expect(screen.getByText('Saved on your phone · 3 waiting to sync')).toBeTruthy();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(refresh).toHaveBeenCalledWith({ autoTrigger: false });
  expect(mockIcon).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'cloud-upload-outline', color: colors.textSecondary, size: 18 }));
});

test('a null snapshot with stale zero counters never says synced (R1)', async () => {
  setOffline({ refreshSyncStatus: jest.fn().mockResolvedValue(null) });
  const screen = renderLine();
  await settleRefresh();
  expect(screen.getByText('Saved on this phone')).toBeTruthy();
  expect(screen.queryByText('All saved and synced')).toBeNull();
});

test.each([
  ['undefined (context default)', () => Promise.resolve(undefined)],
  ['a rejection', () => Promise.reject(new Error('read failed'))],
  ['a synchronous throw', () => { throw new Error('read failed'); }],
  ['a boolean', () => Promise.resolve(true)],
  ['a number', () => Promise.resolve(0)],
  ['a string', () => Promise.resolve('fresh')],
])('%s falls back without claiming freshness', async (_name, refresh) => {
  setOffline({ refreshSyncStatus: jest.fn(refresh) });
  const screen = renderLine();
  await settleRefresh();
  expect(screen.getByText('Saved on this phone')).toBeTruthy();
  expect(screen.queryByText('All saved and synced')).toBeNull();
});

test('a handle that went stale during the read falls back', async () => {
  const read = deferred();
  setOffline({ refreshSyncStatus: jest.fn(() => read.promise) });
  const screen = renderLine();
  mockHandle.isCurrent.mockReturnValue(false);
  await act(async () => read.resolve({ waitingCount: 0 }));
  expect(screen.getByText('Saved on this phone')).toBeTruthy();
  expect(screen.queryByText('All saved and synced')).toBeNull();
});

test('fallback stays for the mount lifetime through context and refresh callback changes', async () => {
  const refresh = jest.fn().mockResolvedValue(null);
  setOffline({ refreshSyncStatus: refresh });
  const screen = renderLine();
  await settleRefresh();
  const laterRefresh = jest.fn().mockResolvedValue({ waitingCount: 0 });
  setOffline({ waitingCount: 4, isSyncing: true, refreshSyncStatus: laterRefresh });
  screen.rerender(lineTree());
  await settleRefresh();
  expect(screen.getByText('Saved on this phone')).toBeTruthy();
  setOffline({ waitingCount: 0, isSyncing: false });
  screen.rerender(lineTree());
  expect(screen.getByText('Saved on this phone')).toBeTruthy();
  expect(screen.queryByText('All saved and synced')).toBeNull();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(laterRefresh).not.toHaveBeenCalled();
});

test('live line follows context changes after a fresh snapshot without refreshing again', async () => {
  const refresh = jest.fn().mockResolvedValue({ waitingCount: 1 });
  setOffline({ waitingCount: 1, refreshSyncStatus: refresh });
  const screen = renderLine();
  await settleRefresh();
  expect(screen.getByText('Saved on your phone · 1 waiting to sync')).toBeTruthy();
  setOffline({ isSyncing: true });
  screen.rerender(lineTree());
  expect(screen.getByText('Syncing…')).toBeTruthy();
  act(() => jest.advanceTimersByTime(200));
  setOffline({ isSyncing: false, waitingCount: 0 });
  screen.rerender(lineTree());
  act(() => jest.advanceTimersByTime(200));
  expect(screen.getByText('All saved and synced')).toBeTruthy();
  expect(mockIcon).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'cloud-done-outline', color: colors.successText }));
  expect(refresh).toHaveBeenCalledTimes(1);
});

test('offline copy is the presenter message verbatim', async () => {
  setOffline({ isOnline: false, waitingCount: 5 });
  const screen = renderLine();
  await settleRefresh();
  expect(screen.getByText(describeSyncState('offline', { waitingCount: 5 }).message)).toBeTruthy();
  expect(mockIcon).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'cloud-offline-outline', color: colors.textSecondary }));
});

test('needs attention uses the warning text colour', async () => {
  expect(describeSyncLine({ phase: 'live', state: 'needs_attention', message: '1 item needs attention' }))
    .toEqual({ glyph: 'alert-circle-outline', glyphColor: colors.warningText, textColor: colors.warningText, message: '1 item needs attention' });
  setOffline({ needsAttentionCount: 1 });
  const screen = renderLine();
  await settleRefresh();
  expect(style(screen.getByText('1 item needs attention')).color).toBe(colors.warningText);
});

test('pending is empty and fallback has neutral copy and colours', () => {
  expect(describeSyncLine({ phase: 'pending' })).toBeNull();
  expect(describeSyncLine({ phase: 'fallback' })).toEqual({
    glyph: 'cloud-outline', glyphColor: colors.textSecondary, textColor: colors.textSecondary, message: 'Saved on this phone',
  });
});

test('is not a live region and not pressable, with a wrapping inline glyph slot', async () => {
  const screen = renderLine();
  await settleRefresh();
  const text = screen.getByText('All saved and synced');
  expect(style(text)).toMatchObject({ ...typeRoles.textNote, color: colors.textSecondary, textAlign: 'center' });
  expect(text.props.numberOfLines).toBeUndefined();
  expect(style(text.findByType(View))).toMatchObject({ width: 26, height: 18 });
  expect(text.props.children[0].type).toBe(View);
  expect(text.props.children[1]).toBe('All saved and synced');
  const inspect = node => {
    if (!node || typeof node !== 'object') return;
    expect(node.props?.accessibilityLiveRegion).toBeUndefined();
    expect(node.props?.accessibilityRole).not.toBe('button');
    expect(node.props?.onPress).toBeUndefined();
    node.children?.forEach(inspect);
  };
  inspect(screen.toJSON());
});

test.each(['resolve', 'reject'])('unmount before refresh %s stops every continuation', async outcome => {
  const read = deferred();
  const error = jest.spyOn(console, 'error');
  const timing = jest.spyOn(Animated, 'timing');
  setOffline({ refreshSyncStatus: jest.fn(() => read.promise) });
  const screen = renderLine();
  screen.unmount();
  await act(async () => {
    if (outcome === 'resolve') read.resolve({ waitingCount: 0 });
    else read.reject(new Error('late failure'));
  });
  expect(mockHandle.isCurrent).not.toHaveBeenCalled();
  expect(mockIcon).not.toHaveBeenCalled();
  expect(timing).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
});

test('a message change cross-fades for 150ms, hides the old phrase from accessibility and removes it', async () => {
  // RN's native Jest mock completes at 16ms without advancing values. Use its real JS clock here.
  jest.spyOn(NativeAnimatedHelper, 'shouldUseNativeDriver').mockReturnValue(false);
  const timing = jest.spyOn(Animated, 'timing');
  setOffline({ waitingCount: 1 });
  const screen = renderLine();
  await settleRefresh();
  setOffline({ waitingCount: 0 });
  screen.rerender(lineTree());
  const previous = () => screen.queryByTestId('sync-line-previous', { includeHiddenElements: true });
  expect(style(previous())).toMatchObject({ position: 'absolute', top: 0, left: 0, right: 0 });
  expect(previous().props.accessibilityElementsHidden).toBe(true);
  expect(previous().props.importantForAccessibility).toBe('no-hide-descendants');
  expect(screen.queryByText('Saved on your phone · 1 waiting to sync')).toBeNull();
  expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ duration: 150, easing: Easing.linear, useNativeDriver: true }));
  expect(style(screen.getByTestId('sync-line-current')).opacity).toBe(0);
  expect(style(previous()).opacity).toBe(1);
  act(() => jest.advanceTimersByTime(80));
  expect(style(screen.getByTestId('sync-line-current')).opacity).toBeGreaterThan(0);
  expect(style(screen.getByTestId('sync-line-current')).opacity).toBeLessThan(1);
  act(() => jest.advanceTimersByTime(60));
  expect(previous()).toBeTruthy();
  act(() => jest.advanceTimersByTime(30));
  expect(previous()).toBeNull();
  expect(style(screen.getByTestId('sync-line-current')).opacity).toBe(1);
});

test('rapid message changes replace the outgoing layer and stop the superseded fade', async () => {
  jest.spyOn(NativeAnimatedHelper, 'shouldUseNativeDriver').mockReturnValue(false);
  const screen = renderLine();
  await settleRefresh();
  setOffline({ waitingCount: 1 });
  screen.rerender(lineTree());
  act(() => jest.advanceTimersByTime(50));
  setOffline({ waitingCount: 2 });
  screen.rerender(lineTree());
  act(() => jest.advanceTimersByTime(120));
  expect(screen.getByText('Saved on your phone · 2 waiting to sync')).toBeTruthy();
  expect(screen.queryByTestId('sync-line-previous', { includeHiddenElements: true })).toBeTruthy();
  act(() => jest.advanceTimersByTime(50));
  expect(screen.queryByTestId('sync-line-previous', { includeHiddenElements: true })).toBeNull();
});

test('syncing draws the 18dp ring, runs on the native driver and stops on unmount', async () => {
  const loop = jest.spyOn(Animated, 'loop');
  const timing = jest.spyOn(Animated, 'timing');
  setOffline({ isSyncing: true });
  const screen = renderLine();
  await settleRefresh();
  expect(screen.UNSAFE_getByType(Svg).props).toMatchObject({ width: 18, height: 18 });
  expect(screen.UNSAFE_getByType(Circle).props).toMatchObject({ r: 7.7, stroke: tints.spinnerTrack, strokeWidth: 2.6 });
  expect(screen.UNSAFE_getByType(Path).props).toMatchObject({ stroke: colors.textSecondary, strokeWidth: 2.6 });
  expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ duration: 1000, easing: Easing.linear, useNativeDriver: true }));
  expect(loop).toHaveBeenCalledTimes(1);
  const stop = jest.spyOn(loop.mock.results[0].value, 'stop');
  screen.unmount();
  expect(stop).toHaveBeenCalledTimes(1);
});

test('Reduce Motion stops rotation but keeps a still syncing ring', async () => {
  const loop = jest.spyOn(Animated, 'loop');
  setOffline({ isSyncing: true });
  const screen = renderLine({ reduceMotion: true, motionLevel: 'still' });
  await settleRefresh();
  expect(loop).not.toHaveBeenCalled();
  expect(screen.UNSAFE_getByType(Svg)).toBeTruthy();
  screen.rerender(lineTree());
  expect(loop).toHaveBeenCalledTimes(1);
  const stop = jest.spyOn(loop.mock.results[0].value, 'stop');
  screen.rerender(lineTree({ reduceMotion: true, motionLevel: 'still' }));
  expect(stop).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Syncing…')).toBeTruthy();
});

const spinnerStyle = screen => style(screen.UNSAFE_getAllByType(View)
  .find(node => style(node)?.width === 18 && style(node)?.height === 18));

test('hardware still mode keeps the syncing ring static without Reduce Motion', async () => {
  const loop = jest.spyOn(Animated, 'loop');
  setOffline({ isSyncing: true });
  const screen = renderLine({ tier: 'static', motionLevel: 'still', reduceMotion: false });
  await settleRefresh();
  expect(loop).not.toHaveBeenCalled();
  expect(spinnerStyle(screen).transform).toBeUndefined();
  expect(screen.getByText('Syncing…')).toBeTruthy();
});

test.each([
  { motionLevel: 'still', reduceMotion: false },
  { motionLevel: 'full', reduceMotion: true },
])('changing motion to %o stops and resets an active spinner', async override => {
  jest.spyOn(NativeAnimatedHelper, 'shouldUseNativeDriver').mockReturnValue(false);
  const loop = jest.spyOn(Animated, 'loop');
  const timing = jest.spyOn(Animated, 'timing');
  setOffline({ isSyncing: true });
  const screen = renderLine();
  await settleRefresh();
  expect(loop).toHaveBeenCalledTimes(1);
  const stop = jest.spyOn(loop.mock.results[0].value, 'stop');
  const spin = timing.mock.calls[0][0];
  act(() => jest.advanceTimersByTime(400));
  expect(spin.__getValue()).toBeGreaterThan(0);
  expect(spinnerStyle(screen).transform).toBeDefined();

  screen.rerender(lineTree(override));
  expect(stop).toHaveBeenCalledTimes(1);
  expect(spin.__getValue()).toBe(0);
  expect(spinnerStyle(screen).transform).toBeUndefined();
  act(() => jest.advanceTimersByTime(2000));
  expect(spin.__getValue()).toBe(0);
  expect(loop).toHaveBeenCalledTimes(1);
});

test('unmount during a fade stops it without a late update', async () => {
  jest.spyOn(NativeAnimatedHelper, 'shouldUseNativeDriver').mockReturnValue(false);
  const timing = jest.spyOn(Animated, 'timing');
  const error = jest.spyOn(console, 'error');
  const screen = renderLine();
  await settleRefresh();
  setOffline({ waitingCount: 1 });
  screen.rerender(lineTree());
  const stop = jest.spyOn(timing.mock.results[0].value, 'stop');
  act(() => jest.advanceTimersByTime(50));
  screen.unmount();
  expect(stop).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(500));
  expect(error).not.toHaveBeenCalled();
});
