import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockInitializeDatabase = jest.fn();
const mockExportLogs = jest.fn();
const mockCaptureOperationalError = jest.fn();

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}), { virtual: true });

jest.mock('../src/db/client', () => ({
  initializeDatabase: (...args) => mockInitializeDatabase(...args),
}));

jest.mock('../src/utils/debugExport', () => ({
  exportLogs: (...args) => mockExportLogs(...args),
}));

jest.mock('../src/services/observability', () => ({
  captureOperationalError: (...args) => mockCaptureOperationalError(...args),
}));

import DatabaseBootstrapGate from '../src/components/bootstrap/DatabaseBootstrapGate';

beforeEach(() => {
  jest.clearAllMocks();
});

test('blocks app providers after SQLite bootstrap failure and recovers on a clean retry', async () => {
  const bootstrapError = Object.assign(new Error('database is locked'), {
    code: 'SQLITE_BUSY',
  });
  mockInitializeDatabase
    .mockRejectedValueOnce(bootstrapError)
    .mockResolvedValueOnce({});

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

  fireEvent.press(view.getByText('Try Again'));

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
  fireEvent.press(view.getByText('Share Error Logs'));

  expect(await view.findByText('Could not export the error logs.')).toBeTruthy();
  expect(view.getByText('Try Again')).toBeTruthy();
  expect(mockExportLogs).toHaveBeenCalledTimes(1);
});
