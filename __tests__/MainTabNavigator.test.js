const mockUseAuth = jest.fn();
const mockUseSessionLaunchGuard = jest.fn();

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('../src/hooks/useSessionLaunchGuard', () => ({
  useSessionLaunchGuard: (...args) => mockUseSessionLaunchGuard(...args),
}));
jest.mock('../src/screens/main/HomeScreen', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return () => <Text>Home screen</Text>;
});
jest.mock('../src/screens/main/ChildrenListScreen', () => () => null);
jest.mock('../src/screens/main/InsightsScreen', () => () => null);
jest.mock('../src/screens/main/AssessmentsScreen', () => () => null);

import React from 'react';
import { render } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import { MainTabNavigator } from '../src/navigation/AppNavigator';

describe('MainTabNavigator', () => {
  test('mounts the locked four-route shell around the centre Record command', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'ea-1' } });
    mockUseSessionLaunchGuard.mockReturnValue({
      warningVisible: false,
      requestSessionLaunch: jest.fn(),
      continueAnyway: jest.fn(),
      clockInNow: jest.fn(),
      dismissWarning: jest.fn(),
    });

    const screen = render(
      <PaperProvider>
        <NavigationContainer>
          <MainTabNavigator />
        </NavigationContainer>
      </PaperProvider>
    );

    expect(await screen.findByText('Home screen')).toBeTruthy();
    expect(screen.getByLabelText('Home tab')).toBeTruthy();
    expect(screen.getByLabelText('Children tab')).toBeTruthy();
    expect(screen.getByLabelText('Record a session')).toBeTruthy();
    expect(screen.getByLabelText('Insights tab')).toBeTruthy();
    expect(screen.getByLabelText('Assess tab')).toBeTruthy();
    expect(screen.queryByLabelText('Sessions tab')).toBeNull();
  });
});
