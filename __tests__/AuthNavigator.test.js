global.__MASI_NO_DEFAULT_HANDLE__ = true;
import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import { AuthNavigator } from '../src/navigation/AppNavigator';

const mockResetPassword = jest.fn();
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: null, resetPassword: mockResetPassword }) }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => ({ isOnline: true, isSyncing: false, waitingCount: 0, needsAttentionCount: 0 }) }));
jest.mock('../src/services/observability', () => ({ registerNavigationContainer: jest.fn(), setObservabilityUser: jest.fn() }));
jest.mock('../src/screens/auth/LoginScreen', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return () => <Text>Login screen</Text>;
});

function renderResetStack() {
  const ref = createNavigationContainerRef();
  const screen = renderWithProviders(
    <NavigationContainer ref={ref} initialState={{ index: 1, routes: [{ name: 'Login' }, { name: 'ForgotPassword' }] }}>
      <AuthNavigator />
    </NavigationContainer>,
  );
  return { ref, screen };
}
beforeEach(() => mockResetPassword.mockReset().mockResolvedValue({ error: null }));

test('sent → Back to sign in leaves exactly one Login and Back cannot reopen Reset', async () => {
  const { ref, screen } = renderResetStack();
  expect(ref.getRootState().routeNames).toEqual(['Login', 'ForgotPassword']);
  expect(await screen.findByRole('header', { name: 'Reset password' })).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Email'), 'asanda.mbeki@masinyusane.org');
  fireEvent.press(screen.getByText('Send reset link'));
  expect(await screen.findByText('Check your email')).toBeTruthy();
  expect(screen.queryByRole('header', { name: 'Reset password' })).toBeNull();
  expect(screen.getAllByRole('header')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  fireEvent.press(screen.getByText('Back to sign in'));
  await waitFor(() => expect(ref.getRootState().routes.map((route) => route.name)).toEqual(['Login']));
  expect(ref.canGoBack()).toBe(false);
  expect(screen.getByText('Login screen')).toBeTruthy();
});

test('the header Back circle returns to Login', async () => {
  const { ref, screen } = renderResetStack();
  fireEvent.press(await screen.findByRole('button', { name: 'Back' }));
  await waitFor(() => expect(ref.getRootState().routes.map((route) => route.name)).toEqual(['Login']));
  expect(ref.canGoBack()).toBe(false);
  expect(screen.getByText('Login screen')).toBeTruthy();
});
