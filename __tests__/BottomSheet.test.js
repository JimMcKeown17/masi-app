import React from 'react';
const ReactNative = require('react-native');
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { renderWithProviders } from '../test-support/renderWithProviders';
import { colors, spacing, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';
import { duration } from '../src/constants/motion';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
import BottomSheet from '../src/components/common/BottomSheet';

let mockKeyboardHeight = 0;
jest.mock('../src/hooks/useKeyboardHeight', () => ({ useKeyboardHeight: () => mockKeyboardHeight }));

jest.mock('react-native-safe-area-context', () => {
  const ReactForMock = require('react');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    useSafeAreaInsets: () => insets,
    SafeAreaInsetsContext: ReactForMock.createContext(insets),
    SafeAreaProvider: ({ children }) => <>{children}</>,
  };
});

// BottomSheet renders through Paper's Portal, which needs the PaperProvider's
// Portal.Host above it — same as the app root provides.
const renderSheet = (props = {}, options) => renderWithProviders(
    <BottomSheet
      visible
      onDismiss={jest.fn()}
      title="Choose a group"
      subtitle="Amahle Dlamini"
      dismissLabel="Dismiss test sheet"
      {...props}
    >
      <Text>Body content</Text>
    </BottomSheet>
  , options
);

describe('BottomSheet', () => {
  test('renders its title, subtitle, and body only when visible', () => {
    const visible = renderSheet();

    expect(visible.getByText('Choose a group')).toBeTruthy();
    expect(visible.getByText('Amahle Dlamini')).toBeTruthy();
    expect(visible.getByText('Body content')).toBeTruthy();

    const hidden = renderSheet({ visible: false });

    expect(hidden.queryByText('Choose a group')).toBeNull();
    expect(hidden.queryByText('Amahle Dlamini')).toBeNull();
    expect(hidden.queryByText('Body content')).toBeNull();
  });

  test('dismisses from both the labelled backdrop and hardware back', () => {
    const backSpy = jest.spyOn(BackHandler, 'addEventListener');
    const onDismiss = jest.fn();
    const sheet = renderSheet({ onDismiss });

    fireEvent.press(sheet.getByLabelText('Dismiss test sheet'));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    // Portal has no Modal onRequestClose; Android hardware back goes through
    // the BackHandler subscription instead.
    const backCall = backSpy.mock.calls.find(([event]) => event === 'hardwareBackPress');
    expect(backCall).toBeTruthy();
    act(() => {
      backCall[1]();
    });
    expect(onDismiss).toHaveBeenCalledTimes(2);
    backSpy.mockRestore();
  });

  test('renders header extras before the body and the footer after it', () => {
    const { toJSON } = renderSheet({
      headerExtras: <Text>Header extras</Text>,
      footer: <Text>Footer content</Text>,
    });
    const output = JSON.stringify(toJSON());

    expect(output.indexOf('Amahle Dlamini')).toBeLessThan(output.indexOf('Header extras'));
    expect(output.indexOf('Header extras')).toBeLessThan(output.indexOf('Body content'));
    expect(output.indexOf('Body content')).toBeLessThan(output.indexOf('Footer content'));
  });

  test('a title-only header keeps the same gap above the body as a subtitle gives', () => {
    const titleOnly = renderSheet({ subtitle: undefined });
    const withSubtitle = renderSheet();
    const titleGap = StyleSheet.flatten(titleOnly.getByText('Choose a group').props.style).marginBottom;
    const subtitleGap = StyleSheet.flatten(withSubtitle.getByText('Amahle Dlamini').props.style).marginBottom;
    expect(subtitleGap).toBeGreaterThan(0);
    expect(titleGap).toBe(subtitleGap);
    // With a subtitle, the title itself adds no gap: the subtitle owns it.
    expect(StyleSheet.flatten(withSubtitle.getByText('Choose a group').props.style).marginBottom ?? 0).toBe(0);
  });

  test('uses a plain body when scrolling is disabled', () => {
    const sheet = renderSheet({ scrollable: false });

    expect(sheet.UNSAFE_queryByType(ScrollView)).toBeNull();
    expect(sheet.getByText('Body content')).toBeTruthy();
  });

  test('omits keyboard avoidance when disabled', () => {
    const sheet = renderSheet({ keyboardAvoiding: false });

    expect(sheet.UNSAFE_queryByType(KeyboardAvoidingView)).toBeNull();
    expect(sheet.getByText('Body content')).toBeTruthy();
  });

  test.each(['android', 'ios'])('avoids the keyboard with padding on %s', platform => {
    jest.replaceProperty(Platform, 'OS', platform);
    const sheet = renderSheet();
    expect(sheet.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('padding');
  });

  // A percentage maxHeight needs a parent with a definite height. Under a
  // content-sized wrapper Yoga grows the wrapper to panel / 0.8 and pins the
  // panel to its top, so the sheet floats 25% of its height above the screen
  // bottom (seen on the A03s). Both wrappers must fill the overlay.
  test.each([true, false])('the sheet wrapper fills the overlay below the top inset (keyboardAvoiding %s)', keyboardAvoiding => {
    const sheet = renderSheet({ keyboardAvoiding });
    let wrapper = sheet.getByTestId('bottom-sheet-panel').parent;
    while (typeof wrapper.type !== 'string' && wrapper.type !== KeyboardAvoidingView) wrapper = wrapper.parent;
    expect(StyleSheet.flatten(wrapper.props.style)).toMatchObject({
      flex: 1, justifyContent: 'flex-end', paddingTop: spacing.sm,
    });
  });

  test('drops the bottom inset padding while the keyboard is up and restores it when hidden', () => {
    mockKeyboardHeight = 300;
    const sheet = renderSheet();
    const panelStyle = () => StyleSheet.flatten(sheet.getByTestId('bottom-sheet-panel').props.style);
    expect(panelStyle()).toMatchObject({ maxHeight: '80%', paddingBottom: spacing.xs });
    mockKeyboardHeight = 0;
    sheet.rerender(sheetElement(true));
    expect(panelStyle()).toMatchObject({ maxHeight: '80%', paddingBottom: spacing.lg });
  });

  test('keeps the bottom padding and wrapper when keyboard avoidance is off', () => {
    mockKeyboardHeight = 300;
    const sheet = renderSheet({ keyboardAvoiding: false });
    const panel = sheet.getByTestId('bottom-sheet-panel');
    expect(StyleSheet.flatten(panel.props.style)).toMatchObject({ maxHeight: '80%', paddingBottom: spacing.lg });
    expect(sheet.UNSAFE_queryByType(KeyboardAvoidingView)).toBeNull();
  });

  test('footerStyle overrides the footer rule', () => {
    const sheet = renderSheet({
      footer: <Text>Footer</Text>,
      footerStyle: { borderTopWidth: 0, paddingTop: spacing.md },
    });
    let footer = sheet.getByText('Footer').parent;
    while (footer.type !== 'View') footer = footer.parent;
    expect(StyleSheet.flatten(footer.props.style)).toMatchObject({
      borderTopWidth: 0, paddingTop: spacing.md, paddingHorizontal: spacing.lg,
    });
  });

  test('the measured panel height drives the rise without diagnostics', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const sheet = renderSheet();
    fireEvent(sheet.getByTestId('bottom-sheet-panel'), 'layout', { nativeEvent: { layout: { height: 300 } } });
    const panelStyle = StyleSheet.flatten(sheet.getByTestId('bottom-sheet-panel').props.style);
    expect(panelStyle.transform[0].translateY).toBe(300);
    expect(log).not.toHaveBeenCalled();
  });
});

// Model only the native animation clock: retain the current value until its
// duration elapses, and honour cancellation. No sheet internals are mocked.
beforeEach(() => {
  jest.clearAllMocks();
  mockKeyboardHeight = 0;
  jest.useFakeTimers();
  jest.spyOn(Animated, 'timing').mockImplementation((value, config) => {
    let timer;
    let complete;
    return {
      start: (callback) => {
        complete = callback;
        timer = setTimeout(() => { value.setValue(config.toValue); callback?.({ finished: true }); }, config.duration);
      },
      stop: () => { clearTimeout(timer); complete?.({ finished: false }); },
      reset: () => {},
    };
  });
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test('the title is a header in the sheet face and the scrim uses its token', () => {
  const sheet = renderSheet();
  expect(StyleSheet.flatten(sheet.getByRole('header').props.style)).toMatchObject(typeRoles.displaySheetTitle);
  expect(StyleSheet.flatten(sheet.getByTestId('bottom-sheet-scrim').props.style).backgroundColor).toBe(tints.scrim);
});
test.each(['full', 'calm', 'still'])('at %s the panel uses the motion contract', (motionLevel) => {
  const sheet = renderSheet({}, { motion: { tier: 'high', reduceMotion: motionLevel === 'still', motionLevel } });
  const style = StyleSheet.flatten(sheet.getByTestId('bottom-sheet-panel').props.style);
  if (motionLevel === 'still') expect(style.transform).toBeUndefined();
  else expect(style.transform[0]).toHaveProperty('translateY');
  const timings = Animated.timing.mock.calls.map(([, config]) => config);
  expect(timings.every((config) => config.useNativeDriver)).toBe(true);
  expect(timings.map((config) => config.duration)).toEqual(motionLevel === 'still' ? [duration.fade, duration.fade] : [duration.quick, duration.base]);
});
const sheetElement = (visible, onDismiss = jest.fn()) => <BottomSheet visible={visible} onDismiss={onDismiss} title="Choose a group" dismissLabel="Dismiss test sheet"><Text>Body content</Text></BottomSheet>;
test.each(['ios', 'android'])('an open sheet hides the %s background and closing restores it', platform => {
  jest.replaceProperty(Platform, 'OS', platform);
  const content = visible => <><Text>App content</Text>{sheetElement(visible)}</>;
  const sheet = renderWithProviders(content(false));
  const background = () => sheet.getByTestId('sheet-accessibility-background', { includeHiddenElements: true });
  expect(background().props).toMatchObject({ accessibilityElementsHidden: false, importantForAccessibility: 'auto' });
  sheet.rerender(content(true));
  expect(background().props).toMatchObject({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' });
  expect(sheet.queryByText('App content')).toBeNull();
  expect(sheet.getByRole('header', { name: 'Choose a group' })).toBeTruthy();
  sheet.rerender(content(false));
  expect(background().props).toMatchObject({ accessibilityElementsHidden: false, importantForAccessibility: 'auto' });
  expect(sheet.getByText('App content')).toBeTruthy();
});
test('overlapping sheets hide the background until the last sheet closes or unmounts', () => {
  const content = (first, second, mountSecond = true) => <>
    <Text>App content</Text>
    {sheetElement(first)}
    {mountSecond ? <BottomSheet visible={second} title="Second sheet" /> : null}
  </>;
  const sheet = renderWithProviders(content(true, false));
  sheet.rerender(content(true, true));
  sheet.rerender(content(false, true));
  expect(sheet.queryByText('App content')).toBeNull();
  expect(sheet.getByRole('header', { name: 'Second sheet' })).toBeTruthy();
  sheet.rerender(content(false, false));
  expect(sheet.getByText('App content')).toBeTruthy();
  // A same-commit handoff must not expose the background either.
  sheet.rerender(content(true, false));
  sheet.rerender(content(false, true));
  expect(sheet.queryByText('App content')).toBeNull();
  sheet.rerender(content(false, true, false));
  expect(sheet.getByText('App content')).toBeTruthy();
});
test('a sheet renders without the accessibility provider', () => {
  const sheet = render(<PaperProvider>{sheetElement(true)}</PaperProvider>);
  expect(sheet.getByRole('header', { name: 'Choose a group' })).toBeTruthy();
});
test('opening focuses the title header after the first animation frame', () => {
  const node = jest.spyOn(ReactNative, 'findNodeHandle').mockImplementation(ref => ref ? 201 : null);
  const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus');
  const sheet = renderWithProviders(sheetElement(false));
  sheet.rerender(sheetElement(true));
  expect(node).not.toHaveBeenCalled();
  expect(focus).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(20));
  expect(node).toHaveBeenCalledTimes(1);
  expect(node.mock.calls[0][0].props).toMatchObject({ accessibilityRole: 'header', children: 'Choose a group' });
  expect(focus).toHaveBeenCalledWith(201);
  sheet.rerender(sheetElement(true));
  act(() => jest.advanceTimersByTime(20));
  expect(focus).toHaveBeenCalledTimes(1);
});
test.each(['close', 'unmount'])('%s cancels a pending title-focus frame', action => {
  const requestFrame = jest.spyOn(global, 'requestAnimationFrame');
  const cancelFrame = jest.spyOn(global, 'cancelAnimationFrame');
  const node = jest.spyOn(ReactNative, 'findNodeHandle').mockReturnValue(201);
  const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus');
  const sheet = renderWithProviders(sheetElement(true));
  const frame = requestFrame.mock.results[0].value;
  if (action === 'close') sheet.rerender(sheetElement(false));
  else sheet.unmount();
  expect(cancelFrame).toHaveBeenCalledWith(frame);
  act(() => jest.advanceTimersByTime(20));
  expect(node).not.toHaveBeenCalled();
  expect(focus).not.toHaveBeenCalled();
});
test('opening silently skips focus when the title has no native node', () => {
  jest.spyOn(ReactNative, 'findNodeHandle').mockReturnValue(null);
  const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus');
  renderWithProviders(sheetElement(true));
  act(() => jest.advanceTimersByTime(20));
  expect(focus).not.toHaveBeenCalled();
});
test('on close content is hidden and ignores touches until it unmounts', () => {
  const sheet = renderWithProviders(sheetElement(true));
  act(() => jest.advanceTimersByTime(250));
  sheet.rerender(sheetElement(false));
  expect(sheet.queryByText('Choose a group')).toBeNull();
  expect(sheet.getByText('Choose a group', { includeHiddenElements: true })).toBeTruthy();
  const overlay = sheet.getByTestId('bottom-sheet-overlay', { includeHiddenElements: true });
  expect(overlay.props).toMatchObject({ pointerEvents: 'none', accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' });
  act(() => jest.advanceTimersByTime(250));
  expect(sheet.queryByText('Choose a group', { includeHiddenElements: true })).toBeNull();
});
test('reopening during the exit is interactive after the old exit deadline', () => {
  const onDismiss = jest.fn();
  const sheet = renderWithProviders(sheetElement(true, onDismiss));
  act(() => jest.advanceTimersByTime(250));
  sheet.rerender(sheetElement(false, onDismiss));
  act(() => jest.advanceTimersByTime(100));
  sheet.rerender(sheetElement(true, onDismiss));
  expect(sheet.getByTestId('bottom-sheet-overlay').props.pointerEvents).toBe('box-none');
  act(() => jest.advanceTimersByTime(300));
  expect(sheet.getByText('Choose a group')).toBeTruthy();
  fireEvent.press(sheet.getByLabelText('Dismiss test sheet'));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});
test('hardware back is not handled during the exit', () => {
  const remove = jest.fn();
  jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove });
  const sheet = renderWithProviders(sheetElement(true));
  sheet.rerender(sheetElement(false));
  expect(remove).toHaveBeenCalledTimes(1);
});


test('a non-dismissible sheet ignores backdrop and consumes Back without an accessible dismiss button', () => {
  const backSpy = jest.spyOn(BackHandler, 'addEventListener');
  const onDismiss = jest.fn();
  const sheet = renderSheet({ dismissible: false, onDismiss });
  fireEvent.press(sheet.getByTestId('bottom-sheet-backdrop'));
  const backCall = backSpy.mock.calls.find(([event]) => event === 'hardwareBackPress');
  let consumed;
  act(() => { consumed = backCall[1](); });
  expect(consumed).toBe(true);
  expect(onDismiss).not.toHaveBeenCalled();
  expect(sheet.getByRole('header', { name: 'Choose a group' })).toBeTruthy();
  expect(sheet.queryByRole('button', { name: 'Dismiss test sheet' })).toBeNull();
  expect(sheet.queryAllByRole('button')).toHaveLength(0);
});
