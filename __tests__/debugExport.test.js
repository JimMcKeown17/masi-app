let mockWrittenContent;

jest.mock('expo-file-system/next', () => ({
  Paths: { cache: '/tmp' },
  File: jest.fn().mockImplementation(function MockFile(_path, filename) {
    this.uri = `file:///tmp/${filename}`;
    this.exists = false;
    this.delete = jest.fn();
    this.create = jest.fn();
    this.write = jest.fn((content) => {
      mockWrittenContent = content;
    });
  }),
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-constants', () => ({
  expoConfig: {
    version: '1.2.0',
    runtimeVersion: { policy: 'appVersion' },
    ios: { buildNumber: '1' },
    android: { versionCode: 1 },
  },
}), { virtual: true });

import AsyncStorage from '@react-native-async-storage/async-storage';
import { exportDatabase } from '../src/utils/debugExport';

beforeEach(async () => {
  mockWrittenContent = null;
  await AsyncStorage.clear();
});

describe('debug database export metadata', () => {
  test('marks Build B exports with the released app version', async () => {
    await AsyncStorage.setItem('@sessions', JSON.stringify([]));

    const result = await exportDatabase();

    expect(result).toEqual({ success: true });
    const exported = JSON.parse(mockWrittenContent);
    expect(exported.schema_hardening_build).toBe('build-b');
    expect(exported.app_version).toBe('1.2.0');
    expect(exported.database['@sessions']).toEqual([]);
  });
});
