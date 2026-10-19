const mockUseAuth = jest.fn();
const mockUseSessionLaunchGuard = jest.fn();

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('../src/hooks/useSessionLaunchGuard', () => ({
  useSessionLaunchGuard: (...args) => mockUseSessionLaunchGuard(...args),
}));

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable, StyleSheet, Text } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import LockedBottomTabBar, { FAB_OVERHANG } from '../src/components/navigation/LockedBottomTabBar';
import { renderWithProviders } from '../test-support/renderWithProviders';
import { useToast } from '../src/context/ToastContext';
import { colors, shadows } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';

const state = { index: 0, routes: ['Home', 'Children', 'Insights', 'Assessments'].map((name) => ({ key: name, name })) };
const navigation = { emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() };
const bar = <LockedBottomTabBar state={state} descriptors={{}} navigation={navigation} />;
const style = (node) => StyleSheet.flatten(node.props.style);
function Publisher() {
  const toast = useToast();
  return <Pressable accessibilityLabel="Publish" onPress={() => toast.show({ message: 'Saved', tone: 'success' })}><Text>Publish</Text></Pressable>;
}

describe('LockedBottomTabBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'ea-1' } });
    mockUseSessionLaunchGuard.mockReturnValue({
      warningVisible: false,
      requestSessionLaunch: jest.fn(),
      continueAnyway: jest.fn(),
      clockInNow: jest.fn(),
      dismissWarning: jest.fn(),
    });
  });

  test('the Record disc is 60 red600 inside a 70 white ring', () => {
    const screen = renderWithProviders(bar);
    expect(style(screen.getByTestId('record-ring'))).toMatchObject({ width: 70, height: 70, borderRadius: 35, backgroundColor: colors.surface, ...shadows.fab });
    expect(style(screen.getByTestId('record-disc'))).toMatchObject({ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary });
    expect(style(screen.getByLabelText('Record a session'))).toMatchObject({ position: 'absolute', top: -29 });
    expect(style(screen.getByTestId('bottom-tab-bar'))).toMatchObject({ alignItems: 'flex-start', paddingHorizontal: 4, paddingBottom: 8, ...shadows.nav });
    expect(style(screen.getByLabelText('Home tab'))).toMatchObject({ minHeight: 56, paddingTop: 6, gap: 3 });
  });

  test('labels use the nav roles and cap at 1.3', () => {
    const screen = renderWithProviders(bar);
    for (const [label, role, color] of [
      ['Home', typeRoles.textNavActive, colors.tabActive],
      ['Children', typeRoles.textNavInactive, colors.tabInactive],
      ['Record', typeRoles.textNavRecord, colors.text],
    ]) {
      const node = screen.getByText(label);
      expect(style(node)).toMatchObject({ ...role, color });
      expect(node.props.maxFontSizeMultiplier).toBe(1.3);
    }
  });

  test('FAB_OVERHANG is 24', () => expect(FAB_OVERHANG).toBe(24));

  test('the bar registers its height plus the ring overhang with the toast host', () => {
    const screen = renderWithProviders(<>{bar}<Publisher /></>);
    fireEvent(screen.getByTestId('bottom-tab-bar'), 'layout', { nativeEvent: { layout: { height: 90 } } });
    fireEvent.press(screen.getByLabelText('Publish'));
    expect(style(screen.getByTestId('toast')).bottom).toBe(127);
  });

  test('blur clears the toast obstruction, refocus restores it, and unmount removes the listeners', () => {
    const listeners = {};
    const remove = { focus: jest.fn(), blur: jest.fn() };
    const parentNavigation = {
      isFocused: () => false,
      addListener: jest.fn((event, callback) => { listeners[event] = callback; return remove[event]; }),
    };
    const screen = renderWithProviders(<NavigationContext.Provider value={parentNavigation}>{bar}<Publisher /></NavigationContext.Provider>);
    fireEvent(screen.getByTestId('bottom-tab-bar'), 'layout', { nativeEvent: { layout: { height: 90 } } });
    fireEvent.press(screen.getByLabelText('Publish'));
    expect(style(screen.getByTestId('toast')).bottom).toBe(16);
    act(() => listeners.focus());
    expect(style(screen.getByTestId('toast')).bottom).toBe(127);
    act(() => listeners.blur());
    expect(style(screen.getByTestId('toast')).bottom).toBe(16);
    screen.unmount();
    expect(remove.focus).toHaveBeenCalledTimes(1);
    expect(remove.blur).toHaveBeenCalledTimes(1);
  });

  test('tab selection and event cancellation preserve destination navigation', () => {
    const screen = renderWithProviders(bar);
    expect(screen.getByLabelText('Home tab').props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByLabelText('Home tab'));
    expect(navigation.navigate).not.toHaveBeenCalled();
    navigation.emit.mockReturnValueOnce({ defaultPrevented: true });
    fireEvent.press(screen.getByLabelText('Children tab'));
    expect(navigation.emit).toHaveBeenLastCalledWith({ type: 'tabPress', target: 'Children', canPreventDefault: true });
    expect(navigation.navigate).not.toHaveBeenCalled();
    fireEvent(screen.getByLabelText('Insights tab'), 'longPress');
    expect(navigation.emit).toHaveBeenLastCalledWith({ type: 'tabLongPress', target: 'Insights' });
  });

  test('renders four destinations around a centre Record command', () => {
    const navigation = {
      emit: jest.fn(() => ({ defaultPrevented: false })),
      navigate: jest.fn(),
    };
    const state = {
      index: 0,
      routes: [
        { key: 'home', name: 'Home' },
        { key: 'children', name: 'Children' },
        { key: 'insights', name: 'Insights' },
        { key: 'assessments', name: 'Assessments' },
      ],
    };
    const descriptors = {
      home: { options: { tabBarLabel: 'Home' } },
      children: { options: { tabBarLabel: 'Children' } },
      insights: { options: { tabBarLabel: 'Insights' } },
      assessments: { options: { tabBarLabel: 'Assess' } },
    };

    const screen = render(
      <PaperProvider>
        <LockedBottomTabBar
          state={state}
          descriptors={descriptors}
          navigation={navigation}
        />
      </PaperProvider>
    );

    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Children')).toBeTruthy();
    expect(screen.getByText('Record')).toBeTruthy();
    expect(screen.getByText('Insights')).toBeTruthy();
    expect(screen.getByText('Assess')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Record a session'));
    expect(mockUseSessionLaunchGuard.mock.results[0].value.requestSessionLaunch).toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Insights tab'));
    expect(navigation.navigate).toHaveBeenCalledWith('Insights');
  });
});
