import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { FollowScrollView, FollowTarget, scrollOffsetFor } from '../FollowScrollView';

test('scrollOffsetFor keeps the target inside the viewport with a margin', () => {
  const viewport = { offset: 0, height: 600 };
  expect(scrollOffsetFor({ y: 100, height: 72 }, viewport, 16)).toBeNull();
  expect(scrollOffsetFor({ y: 700, height: 72 }, viewport, 16)).toBe(188);
  expect(scrollOffsetFor({ y: 10, height: 72 }, { offset: 300, height: 600 }, 16)).toBe(0);
  expect(scrollOffsetFor({ y: 400, height: 900 }, viewport, 16)).toBe(384);
});

test('focus measures a native target against the content and follows layout and scroll offsets', () => {
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
  const measureLayout = jest.spyOn(View.prototype, 'measureLayout').mockImplementation((_relative, success) => {
    success(0, 700, 100, 72);
  });
  try {
    const screen = (focus?: number) => <FollowScrollView testID="scroll" focus={focus}>
      <FollowTarget index={0}><Text>First</Text></FollowTarget>
      <FollowTarget index={1}><Text>Second</Text></FollowTarget>
      <FollowTarget index={2}><Text>Third</Text></FollowTarget>
    </FollowScrollView>;
    const r = render(screen(0));
    expect(measureLayout).not.toHaveBeenCalled();
    fireEvent(r.getByTestId('scroll'), 'layout', { nativeEvent: { layout: { height: 600 } } });
    expect(measureLayout.mock.instances[0]).toBe(r.UNSAFE_getAllByType(FollowTarget)[0].findByType(View).instance);
    const content = r.UNSAFE_getByType(ScrollView).findAllByType(View)
      .find((view: { props: { onLayout?: unknown; collapsable?: boolean } }) =>
        view.props.onLayout && view.props.collapsable === false)!;
    expect(measureLayout.mock.calls[0][0]).toBe(content.instance);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 188, animated: true });
    scrollTo.mockClear();
    fireEvent.scroll(r.getByTestId('scroll'), { nativeEvent: { contentOffset: { y: 300 } } });
    r.rerender(screen(1));
    expect(scrollTo).not.toHaveBeenCalled(); // y=700 is already inside offset 300's viewport.
    fireEvent(r.getByTestId('scroll'), 'layout', { nativeEvent: { layout: { height: 400 } } });
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 388, animated: true });
    measureLayout.mockImplementation((_relative, success) => success(0, 10, 100, 72));
    r.rerender(screen(0));
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: true });
    scrollTo.mockClear();
    r.rerender(screen());
    fireEvent(r.getByTestId('scroll'), 'layout', { nativeEvent: { layout: { height: 400 } } });
    expect(scrollTo).not.toHaveBeenCalled();
  } finally {
    measureLayout.mockRestore();
    scrollTo.mockRestore();
  }
});

test('late target layout follows the ring and stale native measurements cannot scroll review or an unmounted body', () => {
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
  const callbacks: Array<(x: number, y: number, width: number, height: number) => void> = [];
  const measureLayout = jest.spyOn(View.prototype, 'measureLayout').mockImplementation((_relative, success) => {
    callbacks.push(success);
  });
  try {
    const screen = (focus?: number) => <FollowScrollView testID="scroll" focus={focus}>
      <FollowTarget index={0}><Text>First</Text></FollowTarget>
      <FollowTarget index={1}><Text>Second</Text></FollowTarget>
    </FollowScrollView>;
    const r = render(screen(0));
    fireEvent(r.getByTestId('scroll'), 'layout', { nativeEvent: { layout: { height: 600 } } });
    r.rerender(screen(1));
    act(() => callbacks[0](0, 900, 100, 72));
    expect(scrollTo).not.toHaveBeenCalled();
    const target = r.UNSAFE_getAllByType(FollowTarget)[1].findByType(View);
    expect(target.props.collapsable).toBe(false);
    fireEvent(target, 'layout', { nativeEvent: { layout: { height: 72 } } });
    act(() => callbacks[callbacks.length - 1](0, 700, 100, 72));
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 188, animated: true });
    scrollTo.mockClear();
    r.rerender(screen());
    act(() => callbacks[1](0, 900, 100, 72));
    expect(scrollTo).not.toHaveBeenCalled();
    r.rerender(screen(0));
    r.unmount();
    act(() => callbacks[callbacks.length - 1](0, 900, 100, 72));
    expect(scrollTo).not.toHaveBeenCalled();
  } finally {
    measureLayout.mockRestore();
    scrollTo.mockRestore();
  }
});

test('the last target scrolls to the end so its group card and the content padding show', () => {
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
  const scrollToEnd = jest.spyOn(ScrollView.prototype, 'scrollToEnd');
  const measureLayout = jest.spyOn(View.prototype, 'measureLayout').mockImplementation((_relative, success) => {
    success(0, 700, 100, 72);
  });
  try {
    const screen = (focus: number) => <FollowScrollView testID="scroll" focus={focus} lastIndex={1}>
      <FollowTarget index={0}><Text>First</Text></FollowTarget>
      <FollowTarget index={1}><Text>Last</Text></FollowTarget>
    </FollowScrollView>;
    const r = render(screen(0));
    fireEvent(r.getByTestId('scroll'), 'layout', { nativeEvent: { layout: { height: 600 } } });
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 188, animated: true });
    expect(scrollToEnd).not.toHaveBeenCalled();
    scrollTo.mockClear();
    r.rerender(screen(1));
    expect(scrollToEnd).toHaveBeenLastCalledWith({ animated: true });
    expect(scrollTo).not.toHaveBeenCalled();
    // A last target already in view, or taller than the viewport, keeps the ordinary rule.
    scrollToEnd.mockClear();
    measureLayout.mockImplementation((_relative, success) => success(0, 100, 100, 72));
    fireEvent(r.getByTestId('scroll'), 'layout', { nativeEvent: { layout: { height: 600 } } });
    expect(scrollToEnd).not.toHaveBeenCalled();
    measureLayout.mockImplementation((_relative, success) => success(0, 700, 100, 900));
    fireEvent(r.getByTestId('scroll'), 'layout', { nativeEvent: { layout: { height: 600 } } });
    expect(scrollToEnd).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 684, animated: true });
  } finally {
    measureLayout.mockRestore();
    scrollTo.mockRestore();
    scrollToEnd.mockRestore();
  }
});
