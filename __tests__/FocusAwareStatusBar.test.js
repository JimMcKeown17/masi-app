import React from 'react';
import { render } from '@testing-library/react-native';
import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import FocusAwareStatusBar from '../src/components/common/FocusAwareStatusBar';

jest.mock('@react-navigation/native', () => ({ useIsFocused: jest.fn() }));
jest.mock('expo-status-bar', () => ({ StatusBar: jest.fn(() => null) }));

test('only the focused screen contributes its status bar style', () => {
  useIsFocused.mockReturnValue(false);
  const screen = render(<FocusAwareStatusBar style="light" />);
  expect(StatusBar).not.toHaveBeenCalled();
  useIsFocused.mockReturnValue(true);
  screen.rerender(<FocusAwareStatusBar style="light" />);
  expect(StatusBar.mock.calls.at(-1)[0]).toEqual({ style: 'light' });
  StatusBar.mockClear();
  useIsFocused.mockReturnValue(false);
  screen.rerender(<FocusAwareStatusBar style="light" />);
  expect(StatusBar).not.toHaveBeenCalled();
});
