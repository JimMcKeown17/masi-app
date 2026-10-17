import React from 'react';
import { Alert, TouchableOpacity } from 'react-native';
import { act, render, waitFor, fireEvent, cleanup } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { requestOpen, requestClose, resetHandleRegistryForTests } from '../src/session/signedInHandle';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { ChildrenProvider } from '../src/context/ChildrenContext';
import { TimeTrackingProvider } from '../src/context/TimeTrackingContext';
import GroupPickerBottomSheet from '../src/components/children/GroupPickerBottomSheet';
import ProfileScreen from '../src/screens/main/ProfileScreen';
import SyncStatusScreen from '../src/screens/main/SyncStatusScreen';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system/next';
import { exportDatabase } from '../src/utils/debugExport';
import * as engine from '../test-support/expoSQLiteRealEngine';

global.__MASI_NO_DEFAULT_HANDLE__ = true;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const barrier = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const mockOffline = { isOnline: false, refreshSyncStatus: jest.fn(), syncNow: jest.fn(), syncStatus: {} };
jest.mock('../src/context/AuthContext', () => ({ ...jest.requireActual('../src/context/AuthContext'), useAuth: () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, profile: {} }) }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockOffline }));
jest.mock('@react-navigation/native', () => ({ NavigationContext: require('react').createContext(null), useFocusEffect: (fn) => require('react').useEffect(fn, [fn]) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
jest.mock('expo-file-system/next', () => ({ File: jest.fn(() => ({ exists: false, create: jest.fn(), write: jest.fn(), uri: 'test.json' })), Paths: { cache: '/cache' } }));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react'); const insets = { top: 0, bottom: 0, left: 0, right: 0 };
  const frame = { x: 0, y: 0, width: 320, height: 640 }; const c = React.createContext(insets);
  return { useSafeAreaInsets: () => insets, useSafeAreaFrame: () => frame, SafeAreaInsetsContext: c, SafeAreaFrameContext: React.createContext(frame), SafeAreaProvider: ({ children }) => children, SafeAreaView: ({ children }) => children, SafeAreaConsumer: c.Consumer, initialWindowMetrics: { insets, frame } };
});
const open = (userId) => requestOpen({ userId, openDatabase: engine.openDatabaseAsync });
const wrapper = (handle, child) => <SignedInEAContext.Provider value={{ handle, repositories: handle.repositories, services: handle.services }}><PaperProvider>{child}</PaperProvider></SignedInEAContext.Provider>;
beforeEach(async () => { jest.clearAllMocks(); await resetHandleRegistryForTests(); await engine.__resetMockDatabases(); mockOffline.isOnline = false; mockOffline.syncStatus = {}; });
afterEach(async () => { cleanup(); await resetHandleRegistryForTests(); await engine.__resetMockDatabases(); jest.restoreAllMocks(); });

test('GroupPicker remove-then-add continuation cannot assign a group after A closes', async () => {
  const a = await open(A);
  await a.withTransaction(async (tx) => {
    await tx.runAsync("insert into programmes(id,code,name) values ('literacy','literacy','Literacy')");
    await tx.runAsync("insert into staff_programme_assignments(id,user_id,programme_id) values ('spa',?,'literacy')", A);
  });
  await a.repositories.children.save({ id: 'child', first_name: 'Test', last_name: 'Child', programme_id: 'literacy', created_by: A });
  for (const id of ['old','new']) await a.repositories.groups.saveGroup({ id, name: id, programme_id: 'literacy', staff_id: A, created_by: A });
  await a.repositories.groups.addChildToGroup({ id: 'old-membership', child_id: 'child', group_id: 'old', created_by: A });
  const entered = barrier(); const release = barrier();
  const remove = a.repositories.groups.removeChildFromGroup;
  jest.spyOn(a.repositories.groups, 'removeChildFromGroup').mockImplementation(async (...args) => { await remove(...args); entered.resolve(); await release.promise; });
  const view = render(wrapper(a, <ChildrenProvider><GroupPickerBottomSheet visible childId="child" childName="Test" currentGroupId="old" onDismiss={jest.fn()} /></ChildrenProvider>));
  await waitFor(() => expect(view.getByLabelText('Assign Test to new')).toBeTruthy());
  let pending;
  act(() => { pending = view.UNSAFE_getAllByType(TouchableOpacity).find((node) => node.props.accessibilityLabel === 'Assign Test to new').props.onPress(); });
  const rejected = expect(pending).rejects.toMatchObject({ name: 'StaleActorError' });
  await entered.promise; view.unmount(); await requestClose({ reason: 'switch' });
  const b = await open(B);
  release.resolve(); await act(async () => { await rejected; });
  expect(await b.repositories.groups.getChildrenGroups()).toEqual([]);
  await requestClose({ reason: 'inspect A' }); const again = await open(A);
  expect(await again.repositories.groups.getChildrenGroups()).toEqual([]);
});

test('A saved Export Database confirmation never reads or shares B data', async () => {
  const a = await open(A); const alert = jest.spyOn(Alert, 'alert');
  const view = render(wrapper(a, <TimeTrackingProvider><ProfileScreen navigation={{ navigate: jest.fn() }} /></TimeTrackingProvider>));
  fireEvent.press(view.getByText('Share Database (Contains Sensitive Data)'));
  const firstConfirm = alert.mock.calls.find(([title]) => title === 'Export Database')[2].find((button) => button.text === 'Export').onPress;
  await act(async () => { await firstConfirm(); });
  expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
  Sharing.shareAsync.mockClear();
  alert.mockClear();
  fireEvent.press(view.getByText('Share Database (Contains Sensitive Data)'));
  const confirm = alert.mock.calls.find(([title]) => title === 'Export Database')[2].find((button) => button.text === 'Export').onPress;
  view.unmount(); await requestClose({ reason: 'switch' }); const b = await open(B);
  await b.repositories.syncOutbox.enqueue({ tableName: 'children', recordId: 'b-failed', operation: 'insert', payload: { id: 'b-failed' } });
  await b.withTransaction((tx) => tx.runAsync("update sync_outbox set status='failed' where record_id='b-failed'"));
  const read = jest.spyOn(b, 'getReader');
  await act(async () => { await confirm(); });
  expect(read).not.toHaveBeenCalled(); expect(Sharing.shareAsync).not.toHaveBeenCalled();
});

test('Sync Status Retry changes A failed outbox row to pending through its bound engine', async () => {
  const a = await open(A);
  await a.repositories.syncOutbox.enqueue({ tableName: 'time_entries', recordId: 'retry-me', operation: 'insert', payload: { id: 'retry-me', user_id: A } });
  await a.withTransaction((tx) => tx.runAsync("update sync_outbox set status='failed' where record_id='retry-me'"));
  mockOffline.isOnline = true;
  mockOffline.syncStatus = { needsAttentionItems: [{ table: 'time_entries', id: 'retry-me', terminal: true, reason: 'failed' }] };
  const view = render(wrapper(a, <SyncStatusScreen />));
  fireEvent.press(view.getByText('Retry'));
  await waitFor(async () => expect((await (await a.getReader()).getFirstAsync("select status from sync_outbox where record_id='retry-me'")).status).toBe('pending'));
  expect(mockOffline.syncNow).toHaveBeenCalledWith({ force: true });
});


test('Export closing during its read rejects stale before writing or sharing', async () => {
  const a = await open(A);
  const reader = await a.getReader();
  const entered = barrier(); const release = barrier();
  jest.spyOn(a, 'getReader').mockResolvedValue({ ...reader, getFirstAsync: async (...args) => {
    entered.resolve(); await release.promise; return reader.getFirstAsync(...args);
  } });
  const pending = exportDatabase({ handle: a });
  const outcome = pending.then((value) => ({ value }), (error) => ({ error }));
  await entered.promise;
  await requestClose({ reason: 'switch during export' });
  const b = await open(B); const bRead = jest.spyOn(b, 'getReader');
  release.resolve();
  expect((await outcome).error).toMatchObject({ name: 'StaleActorError' });
  expect(bRead).not.toHaveBeenCalled();
  expect(File).not.toHaveBeenCalled();
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});
