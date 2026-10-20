global.__MASI_NO_DEFAULT_HANDLE__ = true;
const mockNavigators = [];
const mockScreens = [];
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => ({ isOnline: true, isSyncing: false, waitingCount: 0, needsAttentionCount: 0 }) }));
jest.mock('../src/services/observability', () => ({ registerNavigationContainer: jest.fn(), setObservabilityUser: jest.fn() }));
jest.mock('@react-navigation/native-stack', () => {
  const React = require('react');
  return {
    createNativeStackNavigator: () => ({
      Navigator: ({ screenOptions, children }) => {
        mockNavigators.push({ kind: 'stack', screenOptions, routes: React.Children.toArray(children).map((child) => child.props.name) });
        return <>{children}</>;
      },
      Screen: ({ name, options, component: Component }) => {
        mockScreens.push({ kind: 'stack', name, options });
        return name === 'MainTabs' ? <Component /> : null;
      },
    }),
  };
});
jest.mock('@react-navigation/bottom-tabs', () => {
  const React = require('react');
  return {
    createBottomTabNavigator: () => ({
      Navigator: ({ screenOptions, children }) => {
        mockNavigators.push({ kind: 'tab', screenOptions, routes: React.Children.toArray(children).map((child) => child.props.name) });
        return <>{children}</>;
      },
      Screen: ({ name, options, component: Component }) => {
        mockScreens.push({ kind: 'tab', name, options });
        return name === 'Children' ? <Component /> : null;
      },
    }),
  };
});

import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import AppNavigator from '../src/navigation/AppNavigator';
import { colors } from '../src/constants/colors';

const TITLES = {
  ForgotPassword: 'Reset password',
  Profile: 'Profile', TimeTracking: 'Time tracking', TimeEntriesList: 'Work history',
  ClassOnboarding: 'Set up your class', CreateClass: 'Create class', ChildOnboarding: 'Add your children',
  EditClass: 'Edit class', AddChild: 'Add child', EditChild: 'Edit child',
  SessionForm: 'New session', SessionHistory: 'Session history',
  AssessmentChildSelect: 'Select child', AssessmentHistory: 'Assessment history', LetterTracker: 'Letter tracker',
  AssessmentDetail: 'Assessment detail', LetterMasteryRanking: 'Letter mastery', AssessmentRanking: 'Assessment scores',
  SessionCountRanking: 'Session count', SyncStatus: 'Sync status',
  ChildrenList: 'Children', ClassDetail: '', ChildResults: 'Child results',
};
const navigation = { goBack: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
const resolve = (options, name) => typeof options === 'function' ? options({ navigation, route: { name } }) : options ?? {};
function optionsFor(name) {
  const screen = mockScreens.find((item) => item.name === name);
  const navigator = mockNavigators.find((item) => item.routes.includes(name));
  return { ...resolve(navigator.screenOptions, name), ...resolve(screen.options, name) };
}
function renderChrome(name, back = { title: 'Previous' }) {
  const options = optionsFor(name);
  return renderWithProviders(options.header({ navigation, route: { name }, options, back }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNavigators.length = 0;
  mockScreens.length = 0;
  const screen = renderWithProviders(<AppNavigator signedIn={false} />);
  screen.rerender(<AppNavigator signedIn />);
});

test.each(Object.entries(TITLES))('%s renders its exact title and navigation action', (name, title) => {
  const screen = renderChrome(name);
  if (title === '') {
    expect(screen.queryByRole('header')).toBeNull();
  } else {
    expect(screen.getByRole('header')).toHaveTextContent(title);
    expect(StyleSheet.flatten(screen.getByRole('header').props.style).textAlign).toBe('left');
  }
  if (name === 'ChildOnboarding') {
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    expect(optionsFor(name).gestureEnabled).toBe(false);
  } else {
    fireEvent.press(screen.getByRole('button', { name: name === 'SessionForm' ? 'Close' : 'Back' }));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  }
});

test('the title table covers every visible stack header', () => {
  const visible = mockScreens.filter(({ kind, name }) => kind === 'stack' && optionsFor(name).headerShown !== false).map(({ name }) => name);
  expect(visible.sort()).toEqual(Object.keys(TITLES).sort());
  expect(mockScreens.filter(({ name }) => optionsFor(name).headerShown === false).map(({ name }) => name).sort()).toEqual([
    'Login', 'MainTabs', 'Home', 'Children', 'SessionComplete', 'StandaloneTest', 'AssessmentResults',
  ].sort());
});

test('SessionForm configures only the New session title and Close action', () => {
  expect(mockScreens.find(({ name }) => name === 'SessionForm').options).toEqual({
    title: 'New session', headerLeftIcon: 'close',
  });
});

test.each(['ChildrenList', 'Insights', 'Assessments'])('%s tab root shows the sync pill, which opens SyncStatus', (name) => {
  const options = optionsFor(name);
  const screen = renderChrome(name, null);
  expect(screen.getByRole('header')).toHaveTextContent(name === 'ChildrenList' ? 'Children' : name);
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  const pill = renderWithProviders(options.headerRight({ canGoBack: false, tintColor: colors.text }));
  fireEvent.press(pill.getByLabelText('Open sync status, All saved and synced'));
  expect(navigation.navigate).toHaveBeenCalledWith('SyncStatus');
});

test('contentStyle and sceneStyle are the canvas', () => {
  expect(mockNavigators).toHaveLength(4);
  mockNavigators.forEach(({ kind, screenOptions, routes }) => {
    const options = resolve(screenOptions, routes[0]);
    expect(options[kind === 'tab' ? 'sceneStyle' : 'contentStyle']).toEqual({ backgroundColor: colors.background });
    expect(typeof options.header).toBe('function');
  });
  expect(optionsFor('Children').title).toBe('Children');
});

test('the auth stack has no back title or centred title left', () => {
  ['Login', 'ForgotPassword'].forEach((name) => {
    const options = optionsFor(name);
    expect(options.headerBackTitle).toBeUndefined();
    expect(options.headerTitleAlign).toBeUndefined();
    expect(options.headerLeft).toBeUndefined();
  });
  expect(optionsFor('Login').headerShown).toBe(false);
  expect(optionsFor('ForgotPassword').headerShown).toBe(true);
});


test('SessionComplete has no header and disables the native back gesture', () => {
  expect(mockScreens.find(({ name }) => name === 'SessionComplete').options).toEqual({
    headerShown: false, gestureEnabled: false,
  });
});
