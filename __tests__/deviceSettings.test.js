global.__MASI_NO_DEFAULT_HANDLE__ = true;
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireCurrentHandle, requestClose, requestOpen, resetHandleRegistryForTests } from '../src/session/signedInHandle';

import * as engine from '../test-support/expoSQLiteRealEngine';
beforeEach(async () => {
  await resetHandleRegistryForTests(); await engine.__resetMockDatabases(); await AsyncStorage.clear();
  await requestOpen({ userId: '11111111-1111-4111-8111-111111111111', openDatabase: engine.openDatabaseAsync });
});
afterEach(async () => { await resetHandleRegistryForTests(); await engine.__resetMockDatabases(); });
test('returns null when this EA has no cached profile', async () => {
  await expect(requireCurrentHandle().services.deviceProfile.get()).resolves.toBeNull();
});
test('round-trips the profile in its EA file and retains it across sign-out', async () => {
  const a = requireCurrentHandle(); const profile = { id: a.userId, first_name: 'Test' };
  await a.services.deviceProfile.save(profile);
  expect(await a.repositories.localState.get('user_profile')).toEqual(profile);
  await requestClose({ reason: 'profile retention' });
  const b = await requestOpen({ userId: '22222222-2222-4222-8222-222222222222', openDatabase: engine.openDatabaseAsync });
  expect(await b.services.deviceProfile.get()).toBeNull();
  await requestClose({ reason: 'return to A' });
  const again = await requestOpen({ userId: a.userId, openDatabase: engine.openDatabaseAsync });
  expect(await again.services.deviceProfile.get()).toEqual(profile);
});
