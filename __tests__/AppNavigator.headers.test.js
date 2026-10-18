global.__MASI_NO_DEFAULT_HANDLE__ = true;

const mockStackOptions = jest.fn();

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../src/services/observability', () => ({
  registerNavigationContainer: jest.fn(),
  setObservabilityUser: jest.fn(),
}));
jest.mock('@react-navigation/native-stack', () => {
  const React = require('react');
  return {
    createNativeStackNavigator: () => ({
      Navigator: ({ screenOptions, children }) => {
        mockStackOptions({ screenOptions, routes: React.Children.toArray(children).map(child => child.props.name) });
        return <>{children}</>;
      },
      Screen: ({ name, component: Component }) => name === 'MainTabs' ? <Component /> : null,
    }),
  };
});
jest.mock('@react-navigation/bottom-tabs', () => {
  const React = require('react');
  return {
    createBottomTabNavigator: () => ({
      Navigator: ({ children }) => <>{children}</>,
      Screen: ({ name, component: Component }) => name === 'Children' ? <Component /> : null,
    }),
  };
});

import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import AppNavigator from '../src/navigation/AppNavigator';

function optionsFor(route, navigation) {
  const { screenOptions } = mockStackOptions.mock.calls
    .map(([props]) => props)
    .find(({ routes }) => routes.includes(route));
  return typeof screenOptions === 'function' ? screenOptions({ navigation }) : screenOptions;
}

beforeEach(() => {
  mockStackOptions.mockClear();
});

test('auth, main and children stacks centre their header titles', () => {
  const navigation = { canGoBack: () => true, goBack: jest.fn() };
  const screen = render(<AppNavigator signedIn={false} />);
  screen.rerender(<AppNavigator signedIn />);

  expect(optionsFor('Login', navigation).headerTitleAlign).toBe('center');
  expect(optionsFor('Profile', navigation).headerTitleAlign).toBe('center');
  expect(optionsFor('ChildrenList', navigation).headerTitleAlign).toBe('center');
});

test.each([
  ['Profile', 'android', 0],
  ['ChildrenList', 'android', 0],
  ['Profile', 'ios', -8],
  ['ChildrenList', 'ios', -8],
])('%s Back button navigates back with the existing %s margin', (route, platform, marginLeft) => {
  jest.replaceProperty(Platform, 'OS', platform);
  try {
    const navigation = { canGoBack: () => true, goBack: jest.fn() };
    render(<AppNavigator signedIn />);
    const screen = render(optionsFor(route, navigation).headerLeft());
    const backButton = screen.getByRole('button', { name: 'Back' });

    expect(screen.getByText('Back')).toBeTruthy();
    expect(backButton.props.hitSlop).toBe(8);
    expect(StyleSheet.flatten(backButton.props.style).marginLeft).toBe(marginLeft);
    fireEvent.press(backButton);
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  } finally {
    jest.restoreAllMocks();
  }
});
