global.__MASI_NO_DEFAULT_HANDLE__ = true;

jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'),
  supabase: { auth: { storageKey: 'test-auth-token' } },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getInstallId, resetInstallIdForTests, INSTALL_ID_KEY } from '../src/services/installId';

beforeEach(async () => { resetInstallIdForTests(); await AsyncStorage.clear(); });

test('creates one UUID, stores it, and returns the same id to concurrent callers', async () => {
  const [a, b] = await Promise.all([getInstallId(), getInstallId()]);
  expect(a).toMatch(/^[0-9a-f-]{36}$/);
  expect(b).toBe(a);
  expect(await AsyncStorage.getItem(INSTALL_ID_KEY)).toBe(a);
});

test('reuses the stored id after a restart', async () => {
  await AsyncStorage.setItem(INSTALL_ID_KEY, '99999999-9999-4999-8999-999999999999');
  expect(await getInstallId()).toBe('99999999-9999-4999-8999-999999999999');
});

test('sign-out does not remove the install id', async () => {
  const id = await getInstallId();
  const { clearPersistedSession } = require('../src/services/persistedAuthSession');
  await clearPersistedSession();
  expect(await AsyncStorage.getItem(INSTALL_ID_KEY)).toBe(id);
});

test('a failed storage operation can be retried without retaining a rejected promise', async () => {
  const error = new Error('storage unavailable');
  AsyncStorage.setItem.mockRejectedValueOnce(error);
  await expect(getInstallId()).rejects.toBe(error);
  const id = await getInstallId();
  expect(await AsyncStorage.getItem(INSTALL_ID_KEY)).toBe(id);
  resetInstallIdForTests();
  expect(await getInstallId()).toBe(id);
});
