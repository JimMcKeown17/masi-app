global.__MASI_NO_DEFAULT_HANDLE__ = true;
import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockInitializeDatabase = jest.fn();
const mockExportLogs = jest.fn();
const mockCaptureOperationalError = jest.fn();

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}), { virtual: true });

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: (...args) => mockInitializeDatabase(...args),
}));

jest.mock('../src/utils/debugExport', () => ({
  exportLogs: (...args) => mockExportLogs(...args),
}));

jest.mock('../src/services/observability', () => ({
  captureOperationalError: (...args) => mockCaptureOperationalError(...args),
}));

import DatabaseBootstrapGate from '../src/components/bootstrap/DatabaseBootstrapGate';
import HandleOpenError from '../src/components/bootstrap/HandleOpenError';
import { CURRENT_SCHEMA_VERSION, SchemaTooNewError } from '../src/db/migrations';

beforeEach(() => {
  jest.clearAllMocks();
});

test('a newer schema explains the update and offers Sign out instead of Retry', () => {
  const onSignOut = jest.fn();
  const onRetry = jest.fn();
  const view = render(<HandleOpenError
    error={new SchemaTooNewError(CURRENT_SCHEMA_VERSION + 86, CURRENT_SCHEMA_VERSION)}
    onRetry={onRetry}
    onSignOut={onSignOut}
  />);

  expect(view.getByText('Update Masi to continue')).toBeTruthy();
  expect(view.getByText('This phone has data from a newer version of Masi. Install the latest version from the app store, then open Masi again.')).toBeTruthy();
  expect(view.queryByText(/try again/i)).toBeNull();
  expect(view.getAllByRole('button')).toHaveLength(1);
  fireEvent.press(view.getByRole('button', { name: 'Sign out' }));
  expect(onSignOut).toHaveBeenCalledTimes(1);
  expect(onRetry).not.toHaveBeenCalled();
});

test('a newer-schema bootstrap failure shows no action when no EA is signed in', async () => {
  mockInitializeDatabase.mockRejectedValueOnce(new SchemaTooNewError(CURRENT_SCHEMA_VERSION + 86, CURRENT_SCHEMA_VERSION));
  const view = render(
    <DatabaseBootstrapGate>
      <Text>App providers mounted</Text>
    </DatabaseBootstrapGate>
  );

  expect(await view.findByText('Update Masi to continue')).toBeTruthy();
  expect(view.queryByText('App providers mounted')).toBeNull();
  expect(view.queryAllByRole('button')).toEqual([]);
  expect(mockInitializeDatabase).toHaveBeenCalledTimes(1);
});

test('blocks app providers after SQLite bootstrap failure and recovers on a clean retry', async () => {
  const bootstrapError = Object.assign(new Error('database is locked'), {
    code: 'SQLITE_BUSY',
  });
  mockInitializeDatabase
    .mockRejectedValueOnce(bootstrapError)
    .mockResolvedValueOnce({ closeAsync: jest.fn(async () => {}) });

  const view = render(
    <DatabaseBootstrapGate>
      <Text>App providers mounted</Text>
    </DatabaseBootstrapGate>
  );

  expect(await view.findByText('We could not open your offline data')).toBeTruthy();
  expect(view.queryByText('App providers mounted')).toBeNull();
  expect(mockCaptureOperationalError).toHaveBeenCalledWith(bootstrapError, {
    category: 'sqlite_bootstrap_failed',
    context: {
      attempt: 1,
      code: 'SQLITE_BUSY',
    },
  });

  fireEvent.press(view.getByText('Try again'));

  expect(await view.findByText('App providers mounted')).toBeTruthy();
  expect(mockInitializeDatabase).toHaveBeenCalledTimes(2);
  await waitFor(() => {
    expect(view.queryByText('We could not open your offline data')).toBeNull();
  });
});

test('keeps the recovery screen usable when error-log sharing fails', async () => {
  mockInitializeDatabase.mockRejectedValueOnce(new Error('database open failed'));
  mockExportLogs.mockRejectedValueOnce(new Error('share sheet unavailable'));

  const view = render(
    <DatabaseBootstrapGate>
      <Text>App providers mounted</Text>
    </DatabaseBootstrapGate>
  );

  expect(await view.findByText('We could not open your offline data')).toBeTruthy();
  fireEvent.press(view.getByText('Share error logs'));

  expect(await view.findByText('Could not export the error logs.')).toBeTruthy();
  expect(view.getByText('Try again')).toBeTruthy();
  expect(mockExportLogs).toHaveBeenCalledTimes(1);
});
