jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { colors } from '../src/constants/colors';
import BottomTabIcon, { getTabIconName } from '../src/components/navigation/BottomTabIcon';

describe('BottomTabIcon — active indicator', () => {
  test('the focused destination shows the red50 pill and no dot', () => {
    const focused = render(<BottomTabIcon routeName="Home" focused color={colors.tabActive} size={24} />);
    expect(focused.queryByTestId('tab-active-indicator')).toBeNull();
    expect(StyleSheet.flatten(focused.getByTestId('tab-icon-pill').props.style)).toMatchObject({
      width: 56, height: 30, borderRadius: 15, backgroundColor: colors.red50,
    });

    const idle = render(<BottomTabIcon routeName="Home" focused={false} color={colors.tabInactive} size={24} />);
    expect(idle.queryByTestId('tab-active-indicator')).toBeNull();
    expect(StyleSheet.flatten(idle.getByTestId('tab-icon-pill').props.style).backgroundColor).toBe('transparent');
  });
});

describe('getTabIconName — one place for the route→icon mapping', () => {
  test('Home: filled when focused, outline otherwise', () => {
    expect(getTabIconName('Home', true)).toBe('home');
    expect(getTabIconName('Home', false)).toBe('home-outline');
  });

  test('maps the four locked destinations around the Record command', () => {
    expect(getTabIconName('Children', true)).toBe('people');
    expect(getTabIconName('Insights', true)).toBe('bar-chart');
    expect(getTabIconName('Assessments', true)).toBe('clipboard');
    // outline variants
    expect(getTabIconName('Children', false)).toBe('people-outline');
    expect(getTabIconName('Insights', false)).toBe('bar-chart-outline');
    expect(getTabIconName('Assessments', false)).toBe('clipboard-outline');
  });

  test('unknown route falls back to a valid glyph, never undefined', () => {
    expect(getTabIconName('Mystery', true)).toBe('ellipse');
    expect(getTabIconName('Mystery', false)).toBe('ellipse-outline');
  });
});
