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
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import AppNavigator from '../src/navigation/AppNavigator';

const navigation = { navigate: jest.fn(), goBack: jest.fn() };
function optionsFor(name) {
  const { options } = mockScreens.find(screen => screen.name === name);
  return typeof options === 'function' ? options({ navigation }) : options;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockScreens.length = 0;
  mockNavigators.length = 0;
  renderWithProviders(<AppNavigator signedIn />);
});
test('ChildrenList has the Children title and a sync header action', () => {
  const options = optionsFor('ChildrenList');
  expect(options.title).toBe('Children');
  expect(typeof options.headerRight).toBe('function');
  const screen = renderWithProviders(options.headerRight());
  fireEvent.press(screen.getByLabelText('Open sync status, All saved and synced'));
  expect(navigation.navigate).toHaveBeenCalledWith('SyncStatus');
});

test('ClassDetail starts with an empty title before the class is resolved', () => {
  expect(optionsFor('ClassDetail').title).toBe('');
});
