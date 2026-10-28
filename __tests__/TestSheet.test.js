import React from 'react';
import { AccessibilityInfo, Animated, BackHandler, Modal } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
const ReactNative = require('react-native');
import { duration, easing } from '../src/constants/motion';
import { AssessmentThemeProvider, tokens } from '../src/assessment-questions';
import TestSheet from '../src/components/assessments/TestSheet';

const props = { visible: true, testID: 'test-sheet', title: 'Leave?', message: 'Unsaved.', confirmLabel: 'Discard', confirmTone: 'danger', onConfirm: jest.fn(), cancelLabel: 'Keep' };
afterEach(() => jest.restoreAllMocks());

test('host sheet uses the shared panel in a Portal, never a native Modal, and hides the background only while visible', () => {
  const onCancel = jest.fn();
  const screen = renderWithProviders(<TestSheet {...props} onCancel={onCancel} />);
  expect(screen.UNSAFE_queryAllByType(Modal)).toHaveLength(0);
  const scrim = screen.getByTestId('test-sheet');
  expect(scrim).toHaveStyle({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end', backgroundColor: tokens.color.scrim });
  expect(scrim.props.accessibilityViewIsModal).toBe(true);
  expect(screen.getByRole('header', { name: 'Leave?' })).toBeTruthy();
  expect(screen.getByText('Unsaved.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Discard' })).toHaveStyle({ backgroundColor: tokens.color.primary });
  expect(screen.getByTestId('sheet-accessibility-background', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: 'Keep' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  screen.rerender(<TestSheet {...props} visible={false} />);
  expect(screen.queryByTestId('test-sheet')).toBeNull();
  expect(screen.queryByText('Leave?')).toBeNull();
  expect(screen.getByTestId('sheet-accessibility-background', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(false);
});

test.each([true, false])('hardware Back is consumed with cancel supplied = %s and unsubscribes when hidden', canCancel => {
  const remove = jest.fn();
  const back = jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove });
  const onCancel = jest.fn();
  const onConfirm = jest.fn();
  const screen = renderWithProviders(<TestSheet {...props} onConfirm={onConfirm} onCancel={canCancel ? onCancel : undefined} />);
  const handler = back.mock.calls.find(([event]) => event === 'hardwareBackPress')[1];
  act(() => expect(handler()).toBe(true));
  expect(onCancel).toHaveBeenCalledTimes(canCancel ? 1 : 0);
  expect(onConfirm).not.toHaveBeenCalled();
  screen.rerender(<TestSheet {...props} visible={false} />);
  expect(remove).toHaveBeenCalledTimes(1);
});

describe('host sheet focus and motion', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test.each(['full', 'calm', 'still'])('opening at %s uses motion tokens and closing unmounts at once', motionLevel => {
    const stop = jest.fn();
    const timing = jest.spyOn(Animated, 'timing').mockReturnValue({ start: jest.fn(), stop });
    const screen = renderWithProviders(<TestSheet {...props} />, { motion: { motionLevel } });
    if (motionLevel === 'still') {
      expect(timing).not.toHaveBeenCalled();
      expect(screen.getByTestId('test-sheet')).toHaveStyle({ opacity: 1 });
    } else expect(timing).toHaveBeenCalledWith(expect.anything(), {
      toValue: 1, duration: duration.fade, easing: easing.enter, useNativeDriver: true,
    });
    screen.rerender(<TestSheet {...props} visible={false} />);
    expect(screen.queryByTestId('test-sheet')).toBeNull();
    expect(timing).toHaveBeenCalledTimes(motionLevel === 'still' ? 0 : 1);
    expect(stop).toHaveBeenCalledTimes(motionLevel === 'still' ? 0 : 1);
  });

  test('opening focuses the native title after a frame, and hiding cancels the next focus', () => {
    const node = jest.spyOn(ReactNative, 'findNodeHandle').mockImplementation(ref => ref ? 201 : null);
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus');
    const screen = renderWithProviders(<TestSheet {...props} visible={false} />);
    screen.rerender(<TestSheet {...props} />);
    expect(focus).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(20));
    expect(node.mock.calls[0][0].props).toMatchObject({ accessibilityRole: 'header', children: 'Leave?' });
    expect(focus).toHaveBeenCalledWith(201);
    screen.rerender(<TestSheet {...props} visible={false} />);
    screen.rerender(<TestSheet {...props} />);
    screen.rerender(<TestSheet {...props} visible={false} />);
    act(() => jest.advanceTimersByTime(20));
    expect(focus).toHaveBeenCalledTimes(1);
  });
});

test('the Portal preserves the app assessment fonts for the shared heading, body and buttons', () => {
  const fonts = { text: 'Assessment Regular', textBold: 'Assessment Bold', textSemi: 'Assessment Semi' };
  const screen = renderWithProviders(<AssessmentThemeProvider fonts={fonts}><TestSheet {...props} /></AssessmentThemeProvider>);
  expect(screen.getByRole('header', { name: 'Leave?' })).toHaveStyle({ fontFamily: fonts.textBold });
  expect(screen.getByText('Unsaved.')).toHaveStyle({ fontFamily: fonts.text });
  expect(screen.getByText('Discard')).toHaveStyle({ fontFamily: fonts.textSemi });
});
