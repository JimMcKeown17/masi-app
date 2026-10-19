import React from 'react';
import { TextInput } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import LoginScreen from '../src/screens/auth/LoginScreen';
import ForgotPasswordScreen from '../src/screens/auth/ForgotPasswordScreen';

const mockSignIn = jest.fn();
const mockResetPassword = jest.fn();
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ signIn: mockSignIn, resetPassword: mockResetPassword }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

function fillLogin(email = 'ea@example.com', password = 'test-password') {
  const fields = screen.UNSAFE_getAllByType(TextInput);
  fireEvent.changeText(fields[0], email);
  fireEvent.changeText(fields[1], password);
}
beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); });
afterEach(() => jest.useRealTimers());

test('a banned EA sees the supervisor copy and never the raw message', async () => {
  mockSignIn.mockResolvedValue({ error: { code: 'user_banned', message: 'User is banned' } });
  renderWithProviders(<LoginScreen navigation={{ navigate: jest.fn() }} />);
  fillLogin();
  await act(async () => fireEvent.press(screen.getByText('Sign In')));
  expect(mockSignIn).toHaveBeenCalledWith('ea@example.com', 'test-password');
  expect(screen.getByRole('alert')).toHaveTextContent('Your access is paused. Please contact your supervisor.');
  expect(screen.queryByText('User is banned')).toBeNull();
});

test('an unknown error shows the fallback, not its message', async () => {
  mockSignIn.mockResolvedValue({ error: { message: 'boom' } });
  renderWithProviders(<LoginScreen navigation={{ navigate: jest.fn() }} />);
  fillLogin();
  await act(async () => fireEvent.press(screen.getByText('Sign In')));
  expect(screen.getByText('Couldn’t sign in. Please try again.')).toBeTruthy();
  expect(screen.queryByText('boom')).toBeNull();
});

test('empty fields still show the existing validation copy as a toast for 4000ms', () => {
  renderWithProviders(<LoginScreen navigation={{ navigate: jest.fn() }} />);
  fireEvent.press(screen.getByText('Sign In'));
  expect(screen.getByRole('alert')).toHaveTextContent('Please enter both email and password');
  expect(mockSignIn).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(3999));
  expect(screen.getByText('Please enter both email and password')).toBeTruthy();
  act(() => jest.advanceTimersByTime(1));
  act(() => jest.advanceTimersByTime(200));
  expect(screen.queryByText('Please enter both email and password')).toBeNull();
});

test('invalid login email keeps the existing validation copy', () => {
  renderWithProviders(<LoginScreen navigation={{ navigate: jest.fn() }} />);
  fillLogin('invalid');
  fireEvent.press(screen.getByText('Sign In'));
  expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid email address');
  expect(mockSignIn).not.toHaveBeenCalled();
});

test('reset errors use reset copy and never reveal raw server text', async () => {
  mockResetPassword.mockResolvedValue({ error: { message: 'boom' } });
  renderWithProviders(<ForgotPasswordScreen navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />);
  fireEvent.changeText(screen.UNSAFE_getByType(TextInput), 'ea@example.com');
  await act(async () => fireEvent.press(screen.getByText('Send Reset Link')));
  expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t send the reset link. Please try again.');
  expect(screen.queryByText('boom')).toBeNull();
});

test('reset validation uses the existing copy and successful sends keep the existing confirmation', async () => {
  mockResetPassword.mockResolvedValue({ error: null });
  renderWithProviders(<ForgotPasswordScreen navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />);
  fireEvent.press(screen.getByText('Send Reset Link'));
  expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid email address');
  expect(mockResetPassword).not.toHaveBeenCalled();
  fireEvent.changeText(screen.UNSAFE_getByType(TextInput), 'ea@example.com');
  await act(async () => fireEvent.press(screen.getByText('Send Reset Link')));
  act(() => jest.advanceTimersByTime(200));
  expect(screen.getByText('Check Your Email')).toBeTruthy();
  expect(screen.getByText('If an account exists with ea@example.com, you will receive a password reset link shortly.')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});
