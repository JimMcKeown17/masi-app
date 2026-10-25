import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { tokens } from '../../theme/tokens';
import { FlipNotice } from '../FlipNotice';

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('FlipNotice announces its text and hides after 3000 ms', () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  const text = 'Question 1 changed to Incorrect';
  const r = render(<FlipNotice notice={null} />);
  expect(r.queryByTestId('flip-notice')).toBeNull();
  expect(announce).not.toHaveBeenCalled();
  r.rerender(<FlipNotice notice={{ id: 1, text }} />);
  expect(r.getByTestId('flip-notice').props.accessibilityLiveRegion).toBe('polite');
  expect(r.getByTestId('flip-notice')).toHaveStyle({
    position: 'absolute', left: 16, right: 16, bottom: 0, backgroundColor: tokens.color.ink,
    borderRadius: tokens.radius.tile, paddingVertical: 10, paddingHorizontal: 14,
  });
  expect(r.getByText(text)).toHaveStyle({ color: tokens.color.onPrimary, fontWeight: '600' });
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce).toHaveBeenLastCalledWith(text);
  act(() => jest.advanceTimersByTime(1500));
  r.rerender(<FlipNotice notice={{ id: 1, text }} />);
  expect(announce).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(1499));
  expect(r.getByTestId('flip-notice')).toBeTruthy();
  act(() => jest.advanceTimersByTime(1));
  expect(r.queryByTestId('flip-notice')).toBeNull();

  r.rerender(<FlipNotice notice={{ id: 2, text }} />);
  act(() => jest.advanceTimersByTime(2000));
  const latest = 'Question 2 changed to Correct';
  r.rerender(<FlipNotice notice={{ id: 3, text: latest }} />);
  act(() => jest.advanceTimersByTime(1000)); // the old ID's deadline must not hide the new notice
  expect(r.getByText(latest)).toBeTruthy();
  act(() => jest.advanceTimersByTime(1999));
  expect(r.getByTestId('flip-notice')).toBeTruthy();
  act(() => jest.advanceTimersByTime(1));
  expect(r.queryByTestId('flip-notice')).toBeNull();
  expect(announce).toHaveBeenCalledTimes(3);
  expect(announce).toHaveBeenLastCalledWith(latest);

  r.rerender(<FlipNotice notice={{ id: 4, text }} />);
  r.rerender(<FlipNotice notice={null} />);
  expect(r.queryByTestId('flip-notice')).toBeNull();
  expect(jest.getTimerCount()).toBe(0);
  r.rerender(<FlipNotice notice={{ id: 5, text }} />);
  r.unmount();
  expect(jest.getTimerCount()).toBe(0);
});
