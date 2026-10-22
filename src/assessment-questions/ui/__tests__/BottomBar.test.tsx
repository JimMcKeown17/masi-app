import React from 'react';
import { Platform } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { render, renderHook } from '@testing-library/react-native';
import { tokens } from '../../theme/tokens';
import { BottomBar, useBottomInset } from '../BottomBar';
import { UiText } from '../Text';

afterEach(() => jest.restoreAllMocks());

test.each([['ios', 0, 16], ['ios', 34, 34], ['android', 0, 16], ['android', 48, 59]] as const)(
  '%s inset %s pads %s', (os, inset, pad) => {
    jest.replaceProperty(Platform, 'OS', os);
    const wrapper = ({ children }: { children: React.ReactNode }) => <SafeAreaInsetsContext.Provider value={{ top: 0, left: 0, right: 0, bottom: inset }}>{children}</SafeAreaInsetsContext.Provider>;
    const r = render(<BottomBar testID="bar"><UiText>child</UiText></BottomBar>, { wrapper });
    expect(r.getByTestId('bar')).toHaveStyle({ backgroundColor: tokens.color.surface, borderTopWidth: 1, borderTopColor: tokens.color.line, paddingTop: 11, paddingHorizontal: 16, paddingBottom: pad, gap: 10 });
    expect(renderHook(() => useBottomInset(), { wrapper }).result.current).toBe(pad);
    expect(r.getByText('child')).toBeTruthy();
  },
);

test('no safe-area provider pads 16', () => {
  const r = render(<SafeAreaInsetsContext.Provider value={null}><BottomBar testID="bar"><UiText>child</UiText></BottomBar></SafeAreaInsetsContext.Provider>);
  expect(r.getByTestId('bar')).toHaveStyle({ paddingBottom: 16 });
});
