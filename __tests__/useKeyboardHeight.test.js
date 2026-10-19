import { Keyboard, Platform } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useKeyboardHeight } from '../src/hooks/useKeyboardHeight';

afterEach(() => jest.restoreAllMocks());
test.each([['ios', 'Will'], ['android', 'Did']])('%s tracks keyboard%s events and removes listeners', (platform, phase) => {
  jest.replaceProperty(Platform, 'OS', platform);
  const listeners = {};
  const removals = [];
  jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
    listeners[event] = listener;
    const remove = jest.fn();
    removals.push(remove);
    return { remove };
  });
  const { result, unmount } = renderHook(useKeyboardHeight);
  expect(result.current).toBe(0);
  expect(Object.keys(listeners)).toEqual([`keyboard${phase}Show`, `keyboard${phase}Hide`]);
  act(() => listeners[`keyboard${phase}Show`]({ endCoordinates: { height: 300 } }));
  expect(result.current).toBe(300);
  act(() => listeners[`keyboard${phase}Hide`]());
  expect(result.current).toBe(0);
  unmount();
  removals.forEach((remove) => expect(remove).toHaveBeenCalledTimes(1));
});
