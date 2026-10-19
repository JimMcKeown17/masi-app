import React from 'react';
const ReactNative = require('react-native');
import { AccessibilityInfo, BackHandler, Platform, View } from 'react-native';
import { act, cleanup, fireEvent, within } from '@testing-library/react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import { colors } from '../src/constants/colors';
import { toLocalDateString } from '../src/utils/localDate';
import FocusAwareStatusBar from '../src/components/common/FocusAwareStatusBar';
import SessionCompleteScreen from '../src/screens/sessions/SessionCompleteScreen';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'ea-1' } }) }));
const mockHandle = { isCurrent: jest.fn() };
jest.mock('../src/context/SignedInEAContext', () => ({ useSignedInEA: () => ({ handle: mockHandle }) }));
const mockGetSessionsTodayGoal = jest.fn();
jest.mock('../src/services/sessionsTodayGoal', () => ({
  getSessionsTodayGoal: (...args) => mockGetSessionsTodayGoal(...args),
}));
let mockOffline;
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockOffline }));
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useFocusEffect: (callback) => require('react').useEffect(callback, [callback]),
}));

const navigation = { popTo: jest.fn() };
const MET = { target: 3, ceiling: 5, count: 3, state: 'met' };
const BELOW = { target: 3, ceiling: 5, count: 2, state: 'below' };
const hidden = { includeHiddenElements: true };
const advance = (ms) => act(() => { jest.advanceTimersByTime(ms); });
const flush = () => act(async () => {});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const defaultParams = () => ({
  childCount: 2, childNames: ['Anelisa', 'Athenkosi'], letters: ['s', 'm', 'n', 'l'],
  readingLevel: '3 Letter Blends', sessionDate: toLocalDateString(new Date()),
});
function renderScreen({ params = defaultParams(), motionLevel = 'still' } = {}) {
  return renderWithProviders(<SessionCompleteScreen navigation={navigation} route={{ params }} />, {
    insets: { top: 47, bottom: 34, left: 0, right: 0 },
    motion: { motionLevel, reduceMotion: motionLevel === 'still', tier: motionLevel === 'still' ? 'static' : 'high' },
  });
}
function backHandler() {
  return BackHandler.addEventListener.mock.calls.find(([event]) => event === 'hardwareBackPress')?.[1];
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-19T10:00:00+02:00'));
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'ios');
  mockHandle.isCurrent.mockReturnValue(true);
  mockGetSessionsTodayGoal.mockResolvedValue(BELOW);
  mockOffline = {
    isOnline: true, isSyncing: false, waitingCount: 3, needsAttentionCount: 0,
    refreshSyncStatus: jest.fn().mockResolvedValue({ waitingCount: 3 }),
  };
  jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove: jest.fn() });
  jest.spyOn(ReactNative, 'findNodeHandle').mockImplementation(ref => ref ? 101 : null);
  jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});
afterEach(() => { cleanup(); jest.restoreAllMocks(); jest.useRealTimers(); });

test('pill and receipt', async () => {
  const screen = renderScreen();
  expect(screen.getByText('Saved for 2 children')).toBeTruthy();
  expect(screen.getByLabelText('Children: Anelisa and Athenkosi')).toBeTruthy();
  expect(screen.getByLabelText('Letters: M, L, N, S')).toBeTruthy();
  expect(screen.getByLabelText('Reading level: 3 Letter Blends')).toBeTruthy();
  await flush();
  expect(mockGetSessionsTodayGoal).toHaveBeenCalledWith({ handle: mockHandle, userId: 'ea-1' });
  expect(mockOffline.refreshSyncStatus).toHaveBeenCalledWith({ autoTrigger: false });
  expect(screen.getByText('Saved on your phone · 3 waiting to sync')).toBeTruthy();
});

test('3/3 today reads "Daily target reached." once, as the headline', async () => {
  mockGetSessionsTodayGoal.mockResolvedValue(MET);
  const screen = renderScreen();
  const headline = await screen.findByRole('header', { name: 'Daily target reached.' });
  expect(headline).toBeTruthy();
  expect(screen.getAllByText('Daily target\nreached.', { normalizer: text => text })).toHaveLength(1);
  const card = within(screen.getByTestId('session-complete-card'));
  expect(card.queryByText('Daily target reached.')).toBeNull();
  expect(screen.getAllByText('Daily target reached.')).toHaveLength(1);
  expect(card.getByText('3 of 3 sessions today')).toBeTruthy();
});

test('2/3 shows "Session captured." and the sub-line', async () => {
  const screen = renderScreen();
  expect(await screen.findByText('Session\ncaptured.')).toBeTruthy();
  expect(screen.getByText('One more pair reaches your target.')).toBeTruthy();
});

test('back-dated: date on the pill, static gauge', async () => {
  jest.setSystemTime(new Date('2026-10-15T10:00:00+02:00'));
  mockGetSessionsTodayGoal.mockResolvedValue(MET);
  const screen = renderScreen({ params: { ...defaultParams(), sessionDate: '2026-10-13' }, motionLevel: 'full' });
  await flush();
  expect(screen.getByText('Saved for 2 children · Tue 13 Oct')).toBeTruthy();
  expect(screen.queryByTestId('gauge-earned', hidden)).toBeNull();
  expect(screen.getByRole('header')).toHaveTextContent('Session captured.');
});

test('goal null and goal rejected both drop the card and the halo', async () => {
  const error = new Error('read failed');
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  for (const fail of [false, true]) {
    if (fail) mockGetSessionsTodayGoal.mockRejectedValue(error);
    else mockGetSessionsTodayGoal.mockResolvedValue(null);
    const screen = renderScreen();
    await flush();
    expect(screen.queryByTestId('session-complete-card')).toBeNull();
    expect(screen.queryByTestId('session-complete-halo', hidden)).toBeNull();
    expect(screen.getByRole('header')).toHaveTextContent('Session captured.');
    screen.unmount();
  }
  expect(log).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledWith('Error loading today’s sessions on Session complete:', error);
});

test('Done before the goal resolves pops to the Home tab exactly once on a double tap', () => {
  mockGetSessionsTodayGoal.mockReturnValue(new Promise(() => {}));
  mockOffline.refreshSyncStatus.mockReturnValue(new Promise(() => {}));
  const screen = renderScreen();
  fireEvent.press(screen.getByText('Done'));
  fireEvent.press(screen.getByText('Done'));
  expect(navigation.popTo).toHaveBeenCalledTimes(1);
  expect(navigation.popTo).toHaveBeenCalledWith('MainTabs', { screen: 'Home' });
});

test('Android back calls the same exit and is consumed', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const screen = renderScreen();
  await flush();
  expect(backHandler()).toEqual(expect.any(Function));
  act(() => { expect(backHandler()()).toBe(true); });
  expect(navigation.popTo).toHaveBeenCalledTimes(1);
  expect(navigation.popTo).toHaveBeenCalledWith('MainTabs', { screen: 'Home' });
  const subscription = BackHandler.addEventListener.mock.results[0].value;
  screen.unmount();
  expect(subscription.remove).toHaveBeenCalledTimes(1);
});

test('Done then back still exits once', async () => {
  mockGetSessionsTodayGoal.mockResolvedValue(MET);
  const screen = renderScreen({ motionLevel: 'full' });
  await flush();
  advance(400);
  fireEvent.press(screen.getByText('Done'));
  expect(backHandler()).toEqual(expect.any(Function));
  act(() => { expect(backHandler()()).toBe(true); });
  expect(navigation.popTo).toHaveBeenCalledTimes(1);
  expect(navigation.popTo).toHaveBeenCalledWith('MainTabs', { screen: 'Home' });
});

test.each(['ios', 'android'])('announces the summary once and focuses Done (%s)', async os => {
  jest.replaceProperty(Platform, 'OS', os);
  mockGetSessionsTodayGoal.mockResolvedValue(MET);
  const params = defaultParams();
  const screen = renderScreen({ params });
  await flush();
  const announce = os === 'ios' ? AccessibilityInfo.announceForAccessibilityWithOptions : AccessibilityInfo.announceForAccessibility;
  const summary = 'Session captured. Saved for 2 children. 3 of 3 sessions today. Daily target reached.';
  if (os === 'ios') expect(announce).toHaveBeenCalledWith(summary, { queue: true });
  else expect(announce).toHaveBeenCalledWith(summary);
  expect(announce).toHaveBeenCalledTimes(1);
  expect(AccessibilityInfo.setAccessibilityFocus).toHaveBeenCalledTimes(1);
  expect(AccessibilityInfo.setAccessibilityFocus).toHaveBeenCalledWith(101);
  const focusOrder = AccessibilityInfo.setAccessibilityFocus.mock.invocationCallOrder[0];
  const announceOrder = announce.mock.invocationCallOrder[0];
  if (os === 'ios') expect(focusOrder).toBeLessThan(announceOrder);
  else expect(announceOrder).toBeLessThan(focusOrder);
  screen.rerender(<SessionCompleteScreen navigation={navigation} route={{ params }} />);
  await flush();
  expect(announce).toHaveBeenCalledTimes(1);
  expect(AccessibilityInfo.setAccessibilityFocus).toHaveBeenCalledTimes(1);
});

test.each(['resolve', 'reject'])('unmount before the goal %ss: no update, no announcement', async outcome => {
  const goal = deferred();
  mockGetSessionsTodayGoal.mockReturnValue(goal.promise);
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  const screen = renderScreen();
  fireEvent.press(screen.getByText('Done'));
  screen.unmount();
  await act(async () => { goal[outcome](outcome === 'resolve' ? MET : new Error('late read failed')); });
  advance(2000);
  expect(navigation.popTo).toHaveBeenCalledTimes(1);
  expect(AccessibilityInfo.announceForAccessibilityWithOptions).not.toHaveBeenCalled();
  expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
  expect(AccessibilityInfo.setAccessibilityFocus).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});

test.each(['resolve', 'reject'])('drops a goal that %ss after the handle goes stale', async outcome => {
  const goal = deferred();
  mockGetSessionsTodayGoal.mockReturnValue(goal.promise);
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  const screen = renderScreen();
  mockHandle.isCurrent.mockReturnValue(false);
  await act(async () => { goal[outcome](outcome === 'resolve' ? MET : new Error('stale read failed')); });
  expect(screen.getByTestId('gauge-skeleton', hidden)).toBeTruthy();
  expect(AccessibilityInfo.announceForAccessibilityWithOptions).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});

test('never says synced from stale counters while its refresh is pending', async () => {
  mockOffline.waitingCount = 0;
  mockOffline.refreshSyncStatus.mockReturnValue(new Promise(() => {}));
  const screen = renderScreen();
  await flush();
  expect(screen.queryByText('All saved and synced')).toBeNull();
  advance(1400);
  expect(screen.queryByText('All saved and synced')).toBeNull();
});

test('the gauge carries the final label from the first frame (full motion)', async () => {
  const goal = deferred();
  mockGetSessionsTodayGoal.mockReturnValue(goal.promise);
  const screen = renderScreen({ motionLevel: 'full' });
  await act(async () => { goal.resolve(MET); });
  expect(screen.getByLabelText('3 of 3 sessions today. Goal met.')).toBeTruthy();
});

test('full motion: numeral 2 before 650ms, 3 after 800ms; confetti only for the exact target', async () => {
  mockGetSessionsTodayGoal.mockResolvedValue(MET);
  const screen = renderScreen({ motionLevel: 'full' });
  await flush();
  advance(600);
  // Opacity belongs to the numeral's Animated.View, not the Text testID.
  let numeralRow = screen.getByTestId('gauge-numeral-to').parent;
  while (numeralRow.type !== 'View') numeralRow = numeralRow.parent;
  expect(numeralRow).toHaveStyle({ opacity: 0 });
  expect(screen.getByTestId('gauge-numeral-from', hidden)).toHaveTextContent('2');
  advance(150);
  expect(screen.getByTestId('confetti-layer', hidden)).toBeTruthy();
  advance(650);
  expect(screen.queryByTestId('gauge-numeral-from', hidden)).toBeNull();
  expect(screen.getByText('3')).toBeTruthy();
  screen.unmount();
  mockGetSessionsTodayGoal.mockResolvedValue(BELOW);
  const below = renderScreen({ motionLevel: 'full' });
  await flush();
  expect(below.queryByTestId('confetti-layer', hidden)).toBeNull();
  advance(750);
  expect(below.queryByTestId('confetti-layer', hidden)).toBeNull();
  advance(650);
  expect(below.queryByTestId('confetti-layer', hidden)).toBeNull();
});

test('footer turns sticky only when the content overflows', async () => {
  const screen = renderScreen();
  await flush();
  const scroll = screen.getByTestId('session-complete-scroll');
  fireEvent(scroll, 'layout', { nativeEvent: { layout: { height: 500 } } });
  fireEvent(scroll, 'contentSizeChange', 390, 400);
  expect(screen.getByTestId('sticky-action-footer')).toHaveStyle({ backgroundColor: 'transparent', borderTopWidth: 0 });
  fireEvent(scroll, 'contentSizeChange', 390, 900);
  expect(screen.getByTestId('sticky-action-footer')).toHaveStyle({ backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1 });
});

test('light status bar and a red strip behind the inset', async () => {
  const screen = renderScreen();
  await flush();
  expect(screen.UNSAFE_getByType(FocusAwareStatusBar).props.style).toBe('light');
  const strip = screen.UNSAFE_getAllByType(View).find(node => {
    const style = ReactNative.StyleSheet.flatten(node.props.style);
    return style?.height === 47 && style.backgroundColor === colors.red600;
  });
  expect(strip).toBeTruthy();
  expect(strip.props.pointerEvents).toBe('none');
});
