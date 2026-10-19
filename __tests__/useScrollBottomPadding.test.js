import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { spacing } from '../src/constants/colors';
import { useScrollBottomPadding } from '../src/hooks/useScrollBottomPadding';

test.each([
  [0, undefined, spacing.lg],
  [48, undefined, 48 + spacing.lg],
  [48, spacing.md, 48 + spacing.md],
  [48, 0, 48],
])('bottom inset %s plus extra %s gives %s', (bottom, extra, expected) => {
  const wrapper = ({ children }) => (
    <SafeAreaInsetsContext.Provider value={{ top: 20, right: 0, bottom, left: 0 }}>
      {children}
    </SafeAreaInsetsContext.Provider>
  );
  const { result } = renderHook(() => useScrollBottomPadding(extra), { wrapper });
  expect(result.current).toBe(expected);
});

test('updates when the safe-area inset changes', () => {
  let bottom = 0;
  const wrapper = ({ children }) => (
    <SafeAreaInsetsContext.Provider value={{ top: 20, right: 0, bottom, left: 0 }}>
      {children}
    </SafeAreaInsetsContext.Provider>
  );
  const { result, rerender } = renderHook(() => useScrollBottomPadding(), { wrapper });
  expect(result.current).toBe(spacing.lg);
  bottom = 48;
  rerender();
  expect(result.current).toBe(48 + spacing.lg);
});
