import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
jest.mock('expo-application', () => ({ nativeBuildVersion: '55' }));
jest.mock('expo-updates', () => ({ __esModule: true, isEmbeddedLaunch: true, updateId: 'embedded-id', channel: 'preview', runtimeVersion: '1.2.0' }));
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
    Application.nativeBuildVersion = null;
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
      otaRelease: null,
      otaPublishedAt: null,
    }));
  });
});

test.each(['android', 'ios'])('running %s binary supplies build and extra commit; the release label is the release identity', platform => {
  jest.replaceProperty(Platform, 'OS', platform);
  Application.nativeBuildVersion = '55';
  const saved = Constants.expoConfig;
  Constants.expoConfig = { version: '1.5.0', extra: { gitCommit: 'abcdef1234567890' } };
  expect(getReleaseMetadata()).toMatchObject({
    [platform === 'android' ? 'androidVersionCode' : 'iosBuildNumber']: platform === 'android' ? 55 : '55',
    // The built-in bundle's release is its version; the build number has its own field.
    gitCommit: 'abcdef1234567890', releaseLabel: '1.5.0', buildMessage: '1.5.0',
  });
  Application.nativeBuildVersion = null;
  expect(getReleaseMetadata()).toMatchObject({ releaseLabel: '1.5.0' });
  Constants.expoConfig = { version: '1.5.0', android: { versionCode: 42 }, ios: { buildNumber: '7' } };
  expect(getReleaseMetadata()).toMatchObject({ androidVersionCode: 42, iosBuildNumber: '7', gitCommit: 'unknown' });
  Constants.expoConfig = saved;
  Application.nativeBuildVersion = '55';
});

test('export metadata reports a serializer {} as no release number or publish time', () => {
  const saved = Constants.expoConfig;
  Constants.expoConfig = { version: '1.5.0', extra: { otaRelease: {}, otaPublishedAt: {} } };
  try {
    expect(getReleaseMetadata()).toMatchObject({ otaRelease: null, otaPublishedAt: null });
  } finally {
    Constants.expoConfig = saved;
  }
});

test('an update launch labels its release from the running manifest\'s release number', () => {
  const Updates = jest.requireMock('expo-updates');
  const saved = Constants.expoConfig;
  Updates.isEmbeddedLaunch = false;
  Constants.expoConfig = { version: '1.5.0', extra: { otaRelease: 4, otaPublishedAt: '2026-11-05T09:11:02.000Z' } };
  try {
    expect(getReleaseMetadata()).toMatchObject({
      releaseLabel: '1.5.0+4', buildMessage: '1.5.0+4', otaRelease: 4, otaPublishedAt: '2026-11-05T09:11:02.000Z',
    });
  } finally {
    Updates.isEmbeddedLaunch = true;
    Constants.expoConfig = saved;
  }
});
