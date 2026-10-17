import React, { ReactNode } from 'react';
import { renderHook } from '@testing-library/react-native';
import {
  useChildReadingFontSize,
  ChildReadingFontSizeProvider,
} from '../useChildReadingFontSize';

describe('useChildReadingFontSize', () => {
  test('returns 1.0 by default when no provider is mounted', () => {
    const { result } = renderHook(() => useChildReadingFontSize());
    expect(result.current).toBe(1.0);
  });

  test('returns the provided value when a Provider wraps the tree', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ChildReadingFontSizeProvider value={1.5}>
        {children}
      </ChildReadingFontSizeProvider>
    );

    const { result } = renderHook(() => useChildReadingFontSize(), { wrapper });

    expect(result.current).toBe(1.5);
  });
});
