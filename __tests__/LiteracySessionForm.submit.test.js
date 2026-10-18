global.__MASI_NO_DEFAULT_HANDLE__ = true;

import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { requestOpen, resetHandleRegistryForTests } from '../src/session/signedInHandle';
import * as engine from '../test-support/expoSQLiteRealEngine';
import LiteracySessionForm from '../src/screens/sessions/LiteracySessionForm';
import { READING_LEVELS } from '../src/constants/literacyConstants';

const EA = '11111111-1111-4111-8111-111111111111';
const mockChild = { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini', class_id: 'class-1' };
const mockOffline = { refreshSyncStatus: jest.fn(async () => {}), triggerBackgroundSync: jest.fn() };

jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, profile: {} }) }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockOffline }));
jest.mock('../src/context/ClassesContext', () => ({ useClasses: () => ({ classes: [{ id: 'class-1', name: 'Grade 1A', home_language: 'English' }] }) }));
jest.mock('../src/context/LookupsContext', () => ({ useLookupsContext: () => ({ jobTitles: [] }) }));
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => ({ children: [mockChild], groups: [], getChildrenInGroup: () => [] }) }));
jest.mock('@expo/vector-icons', () => new Proxy({}, {
  get: (target, prop) => {
    if (prop === '__esModule') return true;
    if (!target[prop]) target[prop] = () => null;
    return target[prop];
  },
}), { virtual: true });
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => ({ __esModule: true, default: () => null }), { virtual: true });
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 320, height: 640 };
  const SafeAreaInsetsContext = React.createContext(insets);
  return {
    useSafeAreaInsets: () => insets, useSafeAreaFrame: () => frame,
    SafeAreaInsetsContext, SafeAreaFrameContext: React.createContext(frame),
    SafeAreaProvider: ({ children }) => children, SafeAreaConsumer: SafeAreaInsetsContext.Consumer,
    initialWindowMetrics: { insets, frame },
  };
});

let handle;
let writer;
beforeEach(async () => {
  jest.clearAllMocks();
  await resetHandleRegistryForTests();
  await engine.__resetMockDatabases();
  handle = await requestOpen({
    userId: EA,
    openDatabase: async (name, options) => {
      const db = await engine.openDatabaseAsync(name, options);
      if (!options?.useNewConnection) writer = db;
      return db;
    },
  });
  await handle.withTransaction(async (tx) => {
    await tx.runAsync("insert into programmes (id, code, name) values ('literacy', 'literacy', 'Literacy')");
    await tx.runAsync("insert into staff_programme_assignments (id, user_id, programme_id) values ('assignment', ?, 'literacy')", EA);
    await tx.runAsync("insert into children (id, first_name, last_name, created_by) values (?, ?, ?, ?)", mockChild.id, mockChild.first_name, mockChild.last_name, EA);
  });
});
afterEach(async () => {
  cleanup();
  jest.restoreAllMocks();
  await resetHandleRegistryForTests();
  await engine.__resetMockDatabases();
});

const renderForm = () => {
  const navigation = { replace: jest.fn(), dispatch: jest.fn(), addListener: jest.fn(() => jest.fn()) };
  const screen = render(
    <SignedInEAContext.Provider value={{ handle, repositories: handle.repositories, services: handle.services }}>
      <PaperProvider settings={{ icon: () => null }}>
        <LiteracySessionForm navigation={navigation} />
      </PaperProvider>
    </SignedInEAContext.Provider>
  );
  return { ...screen, navigation };
};
const fillValidForm = (screen) => {
  fireEvent.press(screen.getByText('Amahle Dlamini'));
  fireEvent.press(screen.getByLabelText('A, not selected'));
  fireEvent.press(screen.getByText('Select a level'));
  fireEvent.press(screen.getByText(READING_LEVELS[0]));
};
const readSessions = () => handle.repositories.sessions.getSessions({ userId: EA });

test('back-to-back submit presses persist one session and navigate once', async () => {
  const screen = renderForm();
  fillValidForm(screen);
  const submit = screen.getByText('Submit Session');

  await act(async () => {
    fireEvent.press(submit);
    fireEvent.press(submit);
  });
  await waitFor(() => expect(screen.navigation.replace).toHaveBeenCalled());
  // Wait behind both submitted transactions before inspecting the durable result.
  await handle.withTransaction(async () => {});

  const sessions = await readSessions();
  expect(sessions).toHaveLength(1);
  expect(sessions[0].children_ids).toEqual([mockChild.id]);
  expect(screen.navigation.replace).toHaveBeenCalledTimes(1);
  expect(screen.navigation.replace).toHaveBeenCalledWith('SessionComplete', { childCount: 1 });
});

test('a failed save rolls back and retry persists exactly one session with the original id', async () => {
  const failure = new Error('Injected failure after attendee write');
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  let firstAttemptId;
  const run = writer.runAsync.bind(writer);
  const nativeWrite = jest.spyOn(writer, 'runAsync').mockImplementation(async (sql, ...params) => {
    const result = await run(sql, ...params);
    if (sql.includes('insert into "session_attendees"')) {
      firstAttemptId = (await writer.getFirstAsync('select id from sessions')).id;
      throw failure;
    }
    return result;
  });
  const screen = renderForm();
  fillValidForm(screen);
  fireEvent.press(screen.getByText('Submit Session'));

  expect(await screen.findByText('Failed to save session. Please try again.')).toBeTruthy();
  expect(errorLog).toHaveBeenCalledWith('Error saving session:', failure);
  expect(firstAttemptId).toEqual(expect.any(String));
  expect(await readSessions()).toEqual([]);
  const reader = await handle.getReader();
  expect(await reader.getAllAsync('select id from session_attendees')).toEqual([]);
  expect(await reader.getAllAsync('select id from sync_outbox')).toEqual([]);
  expect(screen.navigation.replace).not.toHaveBeenCalled();
  nativeWrite.mockRestore();

  fireEvent.press(screen.getByText('Submit Session'));
  await waitFor(() => expect(screen.navigation.replace).toHaveBeenCalledTimes(1));

  expect(await readSessions()).toEqual([expect.objectContaining({ id: firstAttemptId })]);
  expect(await reader.getAllAsync('select session_id, child_id from session_attendees'))
    .toEqual([{ session_id: firstAttemptId, child_id: mockChild.id }]);
  expect(await reader.getAllAsync('select table_name from sync_outbox order by table_name'))
    .toEqual([{ table_name: 'session_attendees' }, { table_name: 'sessions' }]);
});

test('validation failure leaves submit available after the input is corrected', async () => {
  const screen = renderForm();
  fireEvent.press(screen.getByText('Submit Session'));

  expect(screen.getByText('Select at least one child')).toBeTruthy();
  expect(screen.getByText('Select at least one letter')).toBeTruthy();
  expect(screen.getByText('Select a reading level')).toBeTruthy();
  expect(await readSessions()).toEqual([]);
  expect(screen.navigation.replace).not.toHaveBeenCalled();

  fillValidForm(screen);
  fireEvent.press(screen.getByText('Submit Session'));
  await waitFor(() => expect(screen.navigation.replace).toHaveBeenCalledTimes(1));

  expect(await readSessions()).toHaveLength(1);
});
