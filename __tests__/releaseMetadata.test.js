jest.mock('expo-constants', () => ({
  expoConfig: {
    version: '1.2.0',
    runtimeVersion: { policy: 'appVersion' },
    ios: { buildNumber: '7' },
    android: { versionCode: 42 },
    updates: { url: 'https://u.expo.dev/project-id' },
    extra: {
      supabaseTarget: 'sqlite-staging',
      supabaseProjectId: 'segygjzpujphwvrubusm',
    },
  },
}), { virtual: true });

import { getReleaseMetadata } from '../src/utils/releaseMetadata';

describe('release metadata', () => {
  test('reports app, runtime, and Supabase backend identity with explicit fallbacks', () => {
    expect(getReleaseMetadata()).toEqual(expect.objectContaining({
      appVersion: '1.2.0',
      iosBuildNumber: '7',
      androidVersionCode: 42,
      releaseLabel: expect.any(String),
      buildMessage: expect.any(String),
      gitCommit: expect.any(String),
      runtimeVersion: { policy: 'appVersion' },
      updateUrl: 'https://u.expo.dev/project-id',
      supabaseTarget: 'sqlite-staging',
      supabaseProjectId: 'segygjzpujphwvrubusm',
    }));
  });
});
