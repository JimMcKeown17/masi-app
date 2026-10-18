import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { requestOpen, requestClose, resetHandleRegistryForTests } from '../src/session/signedInHandle';
import { StaleActorError, UnboundRepositoryError } from '../src/session/staleActor';
import { createClassOnboardingRepository } from '../src/db/repositories/classOnboardingRepository';
import { createLocalStateRepository } from '../src/db/repositories/localStateRepository';
import { childrenRepository } from '../src/db/repositories/childrenRepository';
import { disableAmbientHandleForTests } from '../src/db/repositories/repositoryRuntime';
import { SignedInEAProvider } from '../src/context/SignedInEAContext';
import { ClassesProvider, useClasses } from '../src/context/ClassesContext';
import * as engine from '../test-support/expoSQLiteRealEngine';

global.__MASI_NO_DEFAULT_HANDLE__ = true;
jest.mock('@react-native-community/netinfo', () => ({ fetch: async () => ({ isConnected: false }), addEventListener: () => () => {} }));
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const barrier = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const mockSubscribeToAuthEvents = jest.fn(() => () => {});
jest.mock('../src/context/AuthContext', () => ({ ...jest.requireActual('../src/context/AuthContext'), useAuth: () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, setProfile: jest.fn(), subscribeToAuthEvents: mockSubscribeToAuthEvents }) }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => ({ isOnline: false, refreshSyncStatus: jest.fn() }) }));
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => ({ children: [], refreshFromCache: jest.fn() }) }));

beforeEach(async () => { disableAmbientHandleForTests(); await resetHandleRegistryForTests(); await engine.__resetMockDatabases(); });
afterEach(async () => { await resetHandleRegistryForTests(); await engine.__resetMockDatabases(); });
const open = (userId) => requestOpen({ userId, openDatabase: engine.openDatabaseAsync });

test('production singleton access refuses an ambient database', async () => {
  await expect(childrenRepository.getChildren()).rejects.toBeInstanceOf(UnboundRepositoryError);
});

test.each([B, A])('onboarding completion captured by A cannot remove a marker after switching to %s', async (nextUser) => {
  const a = await open(A);
  const entered = barrier(); const release = barrier();
  const local = createLocalStateRepository({ database: a });
  await local.set(`class_onboarding:${A}`, { classId: 'old' });
  // Pause the factory's own reader, so this covers its default dependency graph.
  const reader = await a.getReader();
  const captured = { ...a, getReader: async () => ({
    ...reader,
    getFirstAsync: async (...args) => {
      const row = await reader.getFirstAsync(...args);
      if (args[0].includes('local_state') && args.includes(`class_onboarding:${A}`)) {
        entered.resolve(); await release.promise;
      }
      return row;
    },
  }) };
  const completion = createClassOnboardingRepository({ database: captured }).complete({ userId: A, classId: 'old' });
  const rejected = expect(completion).rejects.toBeInstanceOf(StaleActorError);
  await entered.promise;
  await requestClose({ reason: 'switch' });
  const next = await open(nextUser);
  await next.repositories.localState.set(`class_onboarding:${A}`, { classId: 'new' });
  release.resolve(); await rejected;
  expect(await next.repositories.localState.get(`class_onboarding:${A}`)).toEqual({ classId: 'new' });
  if (nextUser !== A) {
    await requestClose({ reason: 'inspect A' });
    const again = await open(A);
    expect(await again.repositories.localState.get(`class_onboarding:${A}`)).toEqual({ classId: 'old' });
  }
});

test('ClassesProvider addClass refuses after its reference read resumes under B', async () => {
  const a = await open(A);
  const entered = barrier(); const release = barrier();
  jest.spyOn(a.repositories.academicYears, 'getActive').mockImplementation(async () => {
    entered.resolve(); await release.promise; return { id: 'year' };
  });
  const wrapper = ({ children }) => <SignedInEAProvider handle={a}><ClassesProvider>{children}</ClassesProvider></SignedInEAProvider>;
  const { result, unmount } = renderHook(() => useClasses(), { wrapper });
  let action;
  act(() => { action = result.current.addClass({ name: 'A class' }); });
  const rejected = expect(action).rejects.toBeInstanceOf(StaleActorError);
  await entered.promise;
  unmount();
  await requestClose({ reason: 'switch' });
  const b = await open(B);
  release.resolve(); await act(async () => { await rejected; });
  expect(await b.repositories.classes.getClasses()).toEqual([]);
  await requestClose({ reason: 'inspect A' });
  const again = await open(A);
  expect(await again.repositories.classes.getClasses()).toEqual([]);
});
