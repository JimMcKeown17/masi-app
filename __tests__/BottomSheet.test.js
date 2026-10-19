import React from 'react';
import {
  Animated,
  BackHandler,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import { colors, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';
import { duration } from '../src/constants/motion';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
import BottomSheet from '../src/components/common/BottomSheet';

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
