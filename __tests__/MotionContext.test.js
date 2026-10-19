import React from 'react';
import { AccessibilityInfo, Platform, Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { DEFAULT_MOTION, MotionProvider, useMotion } from '../src/context/MotionContext';

jest.mock('expo-device', () => ({ totalMemory: 6 * 1024 ** 3, deviceYearClass: 2022 }));

function Probe() {
  return <Text>{JSON.stringify(useMotion())}</Text>;
}

let changeMotion;
let remove;
beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  remove = jest.fn();
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((event, listener) => {
    expect(event).toBe('reduceMotionChanged');
    changeMotion = listener;
    return { remove };
  });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('renders full, then still when reduceMotionChanged fires true, and full again when it fires false', async () => {
  const { unmount } = render(<MotionProvider><Probe /></MotionProvider>);
  await act(async () => {});
  expect(screen.getByText(JSON.stringify(DEFAULT_MOTION))).toBeTruthy();
  act(() => changeMotion(true));
  expect(screen.getByText(JSON.stringify({ tier: 'static', reduceMotion: true, motionLevel: 'still' }))).toBeTruthy();
  act(() => changeMotion(false));
  expect(screen.getByText(JSON.stringify(DEFAULT_MOTION))).toBeTruthy();
  unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});

test('an explicit value overrides detection', () => {
  const value = { tier: 'low', reduceMotion: false, motionLevel: 'calm' };
  render(<MotionProvider value={value}><Probe /></MotionProvider>);
  expect(screen.getByText(JSON.stringify(value))).toBeTruthy();
  expect(AccessibilityInfo.isReduceMotionEnabled).not.toHaveBeenCalled();
  expect(AccessibilityInfo.addEventListener).not.toHaveBeenCalled();
});

test('without a provider useMotion returns DEFAULT_MOTION', () => {
  render(<Probe />);
  expect(screen.getByText(JSON.stringify(DEFAULT_MOTION))).toBeTruthy();
});

test('logs the device tier once on mount', async () => {
  render(<MotionProvider><Probe /></MotionProvider>);
  await act(async () => {});
  act(() => changeMotion(true));
  expect(console.log).toHaveBeenCalledTimes(1);
  expect(console.log).toHaveBeenCalledWith('[motion] device tier', {
    platform: 'android', totalMemory: 6 * 1024 ** 3, deviceYearClass: 2022, tier: 'high',
  });
});

test('a rejected initial preference defaults to false', async () => {
  AccessibilityInfo.isReduceMotionEnabled.mockRejectedValue(new Error('unavailable'));
  render(<MotionProvider><Probe /></MotionProvider>);
  await act(async () => {});
  expect(screen.getByText(JSON.stringify(DEFAULT_MOTION))).toBeTruthy();
});

test('a late initial preference does not overwrite a newer change event', async () => {
  let resolve;
  AccessibilityInfo.isReduceMotionEnabled.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<MotionProvider><Probe /></MotionProvider>);
  act(() => changeMotion(true));
  await act(async () => resolve(false));
  expect(screen.getByText(JSON.stringify({ tier: 'static', reduceMotion: true, motionLevel: 'still' }))).toBeTruthy();
});
