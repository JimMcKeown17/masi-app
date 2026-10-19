import { act, renderHook } from '@testing-library/react-native';

let mockListener;
const mockUnsubscribe = jest.fn();
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn((listener) => { mockListener = listener; return mockUnsubscribe; }),
}));

import NetInfo from '@react-native-community/netinfo';
import { isDefinitelyOffline, useNetworkOffline } from '../src/hooks/useNetworkOffline';

test.each([
  [{ isConnected: false, isInternetReachable: null }, true],
  [{ isConnected: true, isInternetReachable: false }, true],
  [{ isConnected: true, isInternetReachable: true }, false],
  [{ isConnected: null, isInternetReachable: null }, false],
  [{ isConnected: true, isInternetReachable: null }, false],
  [undefined, false],
])('isDefinitelyOffline(%j) is %s', (state, expected) => {
  expect(isDefinitelyOffline(state)).toBe(expected);
});

test('follows NetInfo, starts online, and unsubscribes on unmount', () => {
  const { result, unmount } = renderHook(() => useNetworkOffline());
  expect(result.current).toBe(false);
  expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1);

  act(() => mockListener({ isConnected: false, isInternetReachable: false }));
  expect(result.current).toBe(true);
  act(() => mockListener({ isConnected: true, isInternetReachable: true }));
  expect(result.current).toBe(false);
  expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1);

  unmount();
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});
