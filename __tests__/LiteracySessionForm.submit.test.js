global.__MASI_NO_DEFAULT_HANDLE__ = true;

import React from 'react';
import { AccessibilityInfo, FlatList, Platform } from 'react-native';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react-native';
import { AllProviders } from '../test-support/renderWithProviders';
import { renderInTestStack } from '../test-support/renderInTestStack';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { requestOpen, resetHandleRegistryForTests } from '../src/session/signedInHandle';
import * as engine from '../test-support/expoSQLiteRealEngine';
import LiteracySessionForm from '../src/screens/sessions/LiteracySessionForm';
import { READING_LEVELS } from '../src/constants/literacyConstants';

const EA = '11111111-1111-4111-8111-111111111111';
const PROGRAMME = '22222222-2222-4222-8222-222222222222';
const mockClass = { id: 'class-1', name: 'Grade 1A', home_language: 'English' };
const mockChild = { id: '33333333-3333-4333-8333-333333333333', first_name: 'Amahle', last_name: 'Dlamini', class_id: 'class-1' };
const mockOffline = { refreshSyncStatus: jest.fn(async () => {}), triggerBackgroundSync: jest.fn() };

jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, profile: {} }) }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockOffline }));
jest.mock('../src/context/ClassesContext', () => ({ useClasses: () => ({ classes: [mockClass] }) }));
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
  mockClass.home_language = 'English';
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
    await tx.runAsync("insert into programmes (id, code, name) values (?, 'literacy', 'Literacy')", PROGRAMME);
    await tx.runAsync("insert into staff_programme_assignments (id, user_id, programme_id) values ('assignment', ?, ?)", EA, PROGRAMME);
    await tx.runAsync("insert into children (id, first_name, last_name, created_by) values (?, ?, ?, ?)", mockChild.id, mockChild.first_name, mockChild.last_name, EA);
  });
});
afterEach(async () => {
  cleanup();
  jest.restoreAllMocks();
  await resetHandleRegistryForTests();
  await engine.__resetMockDatabases();
});

const mockCompleteMounted = jest.fn();
function HomeStub() { return null; }
function SessionCompleteStub({ route }) {
  React.useEffect(() => { mockCompleteMounted(route.params); }, []);
  return null;
}
function FormProviders({ children }) {
  return (
    <SignedInEAContext.Provider value={{ handle, repositories: handle.repositories, services: handle.services }}>
      <AllProviders>{children}</AllProviders>
    </SignedInEAContext.Provider>
  );
}
const renderForm = () => renderInTestStack({
  routes: [
    { name: 'Home', component: HomeStub },
    { name: 'SessionForm', component: LiteracySessionForm },
    { name: 'SessionComplete', component: SessionCompleteStub },
  ],
  initialIndex: 1,
  wrapper: FormProviders,
});
const fillValidForm = (screen) => {
  fireEvent.press(screen.getByText('Amahle Dlamini'));
  fireEvent.press(screen.getByLabelText('A, not selected'));
  fireEvent.press(screen.getByText('Select a level'));
  fireEvent.press(screen.getByText(READING_LEVELS[0]));
};
const readSessions = () => handle.repositories.sessions.getSessions({ userId: EA });
const SAVE_ERROR = 'Failed to save session. Please try again.';
function expectFooterAlert(screen) {
  const alert = screen.getByRole('alert');
  expect(alert).toHaveTextContent(SAVE_ERROR);
  expect(alert.props.accessibilityLiveRegion).toBe('assertive');
  let parent = alert.parent;
  let inFooter = false;
  while (parent) {
    expect(parent.type).not.toBe(FlatList);
    if (parent.props.testID === 'sticky-action-footer') inFooter = true;
    parent = parent.parent;
  }
  expect(inFooter).toBe(true);
}
function injectAttendeeFailures(count) {
  const run = writer.runAsync.bind(writer);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  return jest.spyOn(writer, 'runAsync').mockImplementation(async (sql, ...params) => {
    const result = await run(sql, ...params);
    if (sql.includes('insert into "session_attendees"') && count-- > 0) {
      throw new Error('Injected attendee failure');
    }
    return result;
  });
}


test('back-to-back submit presses persist one session and navigate once', async () => {
  const screen = renderForm();
  fillValidForm(screen);
  const submit = screen.getByText('Submit session');

  await act(async () => {
    fireEvent.press(submit);
    fireEvent.press(submit);
  });
  await waitFor(() => expect(mockCompleteMounted).toHaveBeenCalled());
  // Wait behind both submitted transactions before inspecting the durable result.
  await handle.withTransaction(async () => {});

  const sessions = await readSessions();
  expect(sessions).toHaveLength(1);
  expect(sessions[0].children_ids).toEqual([mockChild.id]);
  expect(mockCompleteMounted).toHaveBeenCalledTimes(1);
  expect(mockCompleteMounted).toHaveBeenCalledWith({
    childCount: 1,
    childNames: [mockChild.first_name],
    letters: ['a'],
    readingLevel: READING_LEVELS[0],
    sessionDate: sessions[0].session_date,
  });
  expect(screen.routeNames()).toEqual(['Home', 'SessionComplete']);
  expect(screen.queryByText('Discard this session?')).toBeNull();
});

test('a failed save rolls back and retry persists exactly one session with the original id', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
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
  fireEvent.press(screen.getByText('Submit session'));

  expect(await screen.findByText('Failed to save session. Please try again.')).toBeTruthy();
  expectFooterAlert(screen);
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce).toHaveBeenCalledWith(SAVE_ERROR);
  expect(errorLog).toHaveBeenCalledWith('Error saving session:', failure);
  expect(firstAttemptId).toEqual(expect.any(String));
  expect(await readSessions()).toEqual([]);
  const reader = await handle.getReader();
  expect(await reader.getAllAsync('select id from session_attendees')).toEqual([]);
  expect(await reader.getAllAsync('select id from sync_outbox')).toEqual([]);
  expect(mockCompleteMounted).not.toHaveBeenCalled();
  expect(screen.routeNames()).toEqual(['Home', 'SessionForm']);
  act(() => { screen.navigationRef.goBack(); });
  expect(screen.getByText('Discard this session?')).toBeTruthy();
  expect(screen.routeNames()).toEqual(['Home', 'SessionForm']);
  fireEvent.press(screen.getByText('Keep editing'));
  expect(screen.queryByText('Discard this session?')).toBeNull();
  nativeWrite.mockRestore();

  fireEvent.press(screen.getByText('Submit session'));
  expect(screen.queryByRole('alert')).toBeNull();
  await waitFor(() => expect(mockCompleteMounted).toHaveBeenCalledTimes(1));
  expect(mockCompleteMounted).toHaveBeenCalledWith({
    childCount: 1,
    childNames: [mockChild.first_name],
    letters: ['a'],
    readingLevel: READING_LEVELS[0],
    sessionDate: (await readSessions())[0].session_date,
  });
  expect(screen.routeNames()).toEqual(['Home', 'SessionComplete']);
  expect(screen.queryByText('Discard this session?')).toBeNull();

  expect(await readSessions()).toEqual([expect.objectContaining({ id: firstAttemptId })]);
  expect(await reader.getAllAsync('select session_id, child_id from session_attendees'))
    .toEqual([{ session_id: firstAttemptId, child_id: mockChild.id }]);
  expect(await reader.getAllAsync('select table_name from sync_outbox order by table_name'))
    .toEqual([{ table_name: 'session_attendees' }, { table_name: 'sessions' }]);
});

test('validation failure leaves submit available after the input is corrected', async () => {
  const screen = renderForm();
  fireEvent.press(screen.getByText('Submit session'));

  expect(screen.getByText('Select at least one child')).toBeTruthy();
  expect(screen.getByText('Select at least one letter')).toBeTruthy();
  expect(screen.getByText('Select a reading level')).toBeTruthy();
  expect(await readSessions()).toEqual([]);
  expect(mockCompleteMounted).not.toHaveBeenCalled();
  expect(screen.routeNames()).toEqual(['Home', 'SessionForm']);

  fillValidForm(screen);
  fireEvent.press(screen.getByText('Submit session'));
  await waitFor(() => expect(mockCompleteMounted).toHaveBeenCalledTimes(1));
  expect(mockCompleteMounted).toHaveBeenCalledWith({
    childCount: 1,
    childNames: [mockChild.first_name],
    letters: ['a'],
    readingLevel: READING_LEVELS[0],
    sessionDate: (await readSessions())[0].session_date,
  });
  expect(screen.routeNames()).toEqual(['Home', 'SessionComplete']);

  expect(await readSessions()).toHaveLength(1);
});


test('a second failure shows and announces the note again', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  injectAttendeeFailures(2);
  const screen = renderForm();
  fillValidForm(screen);
  fireEvent.press(screen.getByRole('button', { name: 'Submit session' }));
  await screen.findByRole('alert');
  expectFooterAlert(screen);
  expect(announce).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByRole('button', { name: 'Submit session' }));
  expect(screen.queryByRole('alert')).toBeNull();
  await screen.findByRole('alert');
  expectFooterAlert(screen);
  expect(announce).toHaveBeenCalledTimes(2);
  expect(announce.mock.calls).toEqual([[SAVE_ERROR], [SAVE_ERROR]]);
  expect(await readSessions()).toEqual([]);
  expect(mockCompleteMounted).not.toHaveBeenCalled();
});

test('a validation failure after a save failure shows only the inline errors', async () => {
  injectAttendeeFailures(1);
  const screen = renderForm();
  fillValidForm(screen);
  fireEvent.press(screen.getByRole('button', { name: 'Submit session' }));
  await screen.findByRole('alert');
  expectFooterAlert(screen);
  fireEvent.press(screen.getByLabelText('A, selected'));
  expectFooterAlert(screen); // Editing does not clear a failed-save note.
  fireEvent.press(screen.getByRole('button', { name: 'Submit session' }));
  expect(screen.queryByText(SAVE_ERROR)).toBeNull();
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  expect(screen.getByRole('alert')).toHaveTextContent('Select at least one letter');
  expect(await readSessions()).toEqual([]);
  expect(mockCompleteMounted).not.toHaveBeenCalled();
});


test('an isiXhosa session shows stored result evidence and saves a new confirmation using the Plan 1 label', async () => {
  mockClass.home_language = 'isiXhosa';
  await handle.repositories.assessments.saveQuestionResult({
    assessmentId: '44444444-4444-4444-8444-444444444444', userId: EA, childId: mockChild.id,
    result: {
      question_code: 'letter_sounds', question_version: '2026.1', item_set_id: 'letter_sounds@2026.1.xh',
      language: 'xh', duration_ms: 2000, stopped_reason: 'completed',
      items: [
        { position: 0, item_key: 'a-upper', prompt: 'A', is_correct: true, metadata: { reached: true } },
        { position: 1, item_key: 'a-lower', prompt: 'a', is_correct: true, metadata: { reached: true } },
      ],
      derived: { total_correct: 2, total_attempted: 2, percent: 100, last_attempted_position: 1 },
    },
  });
  const screen = renderForm();
  fillValidForm(screen);
  fireEvent.press(screen.getByLabelText('Amahle Dlamini, letter tracker, Update'));
  const mastered = await screen.findByLabelText('a, mastered from assessment, locked');
  expect(mastered.props.accessibilityState.disabled).toBe(true);
  fireEvent.press(mastered);
  fireEvent.press(screen.getByLabelText('b, not mastered'));
  expect(screen.getByLabelText('b, taught, added this session')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  fireEvent.press(screen.getByText('Submit session'));
  await waitFor(() => expect(mockCompleteMounted).toHaveBeenCalledTimes(1));

  expect(await handle.repositories.mastery.getLetterMastery({ userId: EA, childId: mockChild.id }))
    .toEqual([expect.objectContaining({ letter: 'b', language: 'isiXhosa', _deleted: false })]);
  const reader = await handle.getReader();
  const outbox = await reader.getFirstAsync("select payload from sync_outbox where table_name = 'letter_mastery'");
  expect(JSON.parse(outbox.payload)).toEqual(expect.objectContaining({ letter: 'b', language: 'isiXhosa' }));
});

test.each([null, 'Afrikaans'])('a class with unknown language %s shows no English tracker grid', async (homeLanguage) => {
  mockClass.home_language = homeLanguage;
  const screen = renderForm();
  fillValidForm(screen);
  fireEvent.press(screen.getByLabelText('Amahle Dlamini, letter tracker, Update'));
  expect(await screen.findByText('No letter set for this class language.')).toBeTruthy();
  expect(screen.queryByLabelText('a, not mastered')).toBeNull();
  expect(screen.queryByLabelText('a, mastered from assessment, locked')).toBeNull();
});
