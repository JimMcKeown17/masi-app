global.__MASI_NO_DEFAULT_HANDLE__ = true;
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.5.0', nativeBuildVersion: '55' }));
jest.mock('expo-updates', () => ({
  isEmbeddedLaunch: false,
  updateId: '0199a6f2-8add-7aae-9c11-3f0e5d1c2b4a',
  channel: 'preview',
  runtimeVersion: '1.5.0',
  createdAt: new Date('2026-11-05T09:12:47.000Z'),
}));
jest.mock('expo-constants', () => ({
  expoConfig: {
    version: '1.5.0',
    runtimeVersion: { policy: 'appVersion' },
    extra: {
      gitCommit: 'fd053cfc0a1b2c3d4e5f60718293a4b5c6d7e8f9',
      otaRelease: 2,
      otaPublishedAt: '2026-11-05T09:11:02.000Z',
      supabaseTarget: 'sqlite-staging',
      supabaseProjectId: 'segygjzpujphwvrubusm',
    },
  },
}));

import { Platform } from 'react-native';
import { buildReleaseIdentity, formatPublishedAt, getReleaseIdentity } from '../src/utils/releaseMetadata';

const extra = {
  gitCommit: 'fd053cfc0a1b2c3d4e5f60718293a4b5c6d7e8f9',
  supabaseTarget: 'sqlite-staging',
  supabaseProjectId: 'segygjzpujphwvrubusm',
};
const application = { nativeApplicationVersion: '1.5.0', nativeBuildVersion: '55' };
const updateLaunch = {
  isEmbeddedLaunch: false,
  updateId: '0199a6f2-8add-7aae-9c11-3f0e5d1c2b4a',
  channel: 'preview',
  runtimeVersion: '1.5.0',
  createdAt: new Date('2026-11-05T09:12:47.000Z'),
};
const builtInLaunch = {
  isEmbeddedLaunch: true,
  updateId: '7d3e1c55-0b44-4f0e-8a9b-5c6d7e8f9a0b',
  channel: 'preview',
  runtimeVersion: '1.5.0',
  createdAt: new Date('2026-10-30T14:00:00.000Z'),
};
const identity = ({ updates, config = {}, app = application, platformOS = 'android' }) => buildReleaseIdentity({
  expoConfig: { version: '1.5.0', runtimeVersion: { policy: 'appVersion' }, ...config, extra: { ...extra, ...config.extra } },
  application: app, updates, platformOS,
});

test('a numbered update names its release as version+N, with every row the card shows', () => {
  expect(identity({ updates: updateLaunch, config: { extra: { otaRelease: 2 } } })).toEqual({
    releaseLabel: '1.5.0+2',
    version: '1.5.0',
    build: '55',
    buildLabel: '1.5.0 (55)',
    channel: 'preview',
    runtimeVersion: '1.5.0',
    updateId: '0199a6f2-8add-7aae-9c11-3f0e5d1c2b4a',
    shortUpdateId: '0199a6f2',
    launch: 'Update',
    otaRelease: 2,
    publishedAt: '2026-11-05 09:12 UTC',
    publishedAtIso: '2026-11-05T09:12:47.000Z',
    sourceCommit: 'fd053cf',
    gitCommit: 'fd053cfc0a1b2c3d4e5f60718293a4b5c6d7e8f9',
    backendTarget: 'sqlite-staging',
    backendProjectId: 'segygjzpujphwvrubusm',
  });
});

test('the built-in bundle is the plain version, with no release number and no published time', () => {
  // Even if the embedded config somehow carried a number, the built-in bundle is not an update.
  const result = identity({ updates: builtInLaunch, config: { extra: { otaRelease: 7 } } });
  expect(result).toMatchObject({
    releaseLabel: '1.5.0', launch: 'Built-in', otaRelease: null, publishedAt: null, publishedAtIso: null,
    updateId: '7d3e1c55-0b44-4f0e-8a9b-5c6d7e8f9a0b', shortUpdateId: '7d3e1c55', buildLabel: '1.5.0 (55)',
  });
});

test('an update published before numbering says so honestly instead of inventing a number', () => {
  expect(identity({ updates: updateLaunch })).toMatchObject({
    releaseLabel: '1.5.0+?', launch: 'Update', otaRelease: null, publishedAt: '2026-11-05 09:12 UTC',
  });
});

test.each([0, -1, 2.5, '2', NaN, null])('a release number that is not a positive whole number (%p) is not shown', (otaRelease) => {
  expect(identity({ updates: updateLaunch, config: { extra: { otaRelease } } })).toMatchObject({
    releaseLabel: '1.5.0+?', otaRelease: null,
  });
});

test('an update without an EAS creation time falls back to the time stamped at publish', () => {
  expect(identity({ updates: { ...updateLaunch, createdAt: null }, config: { extra: { otaRelease: 3, otaPublishedAt: '2026-11-05T09:11:02.000Z' } } }))
    .toMatchObject({ releaseLabel: '1.5.0+3', publishedAt: '2026-11-05 09:11 UTC', publishedAtIso: '2026-11-05T09:11:02.000Z' });
});

test('a development launch (expo-updates off) is neither an update nor the built-in bundle', () => {
  expect(identity({ updates: { isEmbeddedLaunch: false, updateId: null, channel: null, runtimeVersion: null }, config: { extra: { otaRelease: 4 } } }))
    .toMatchObject({ releaseLabel: '1.5.0', launch: 'Development', otaRelease: null, channel: null, runtimeVersion: '1.5.0', updateId: null, shortUpdateId: null });
});

test('missing native and config facts become null rather than invented values', () => {
  const result = buildReleaseIdentity({ expoConfig: {}, application: {}, updates: {}, platformOS: 'ios' });
  expect(result).toEqual({
    releaseLabel: 'unknown', version: 'unknown', build: null, buildLabel: 'unknown (?)', channel: null,
    runtimeVersion: null, updateId: null, shortUpdateId: null, launch: 'Development', otaRelease: null,
    publishedAt: null, publishedAtIso: null, sourceCommit: null, gitCommit: null,
    backendTarget: 'unknown', backendProjectId: 'unknown',
  });
});

test('a null that the Expo config serializer turned into {} is treated as missing, never shown or sliced', () => {
  expect(identity({ updates: updateLaunch, config: { extra: { gitCommit: {}, otaRelease: {}, otaPublishedAt: {} } } })).toMatchObject({
    releaseLabel: '1.5.0+?', otaRelease: null, sourceCommit: null, gitCommit: null, publishedAt: '2026-11-05 09:12 UTC',
  });
});

test('the native build falls back to the platform config build when the binary does not report one', () => {
  const app = { nativeApplicationVersion: '1.5.0', nativeBuildVersion: null };
  expect(identity({ updates: builtInLaunch, app, platformOS: 'ios', config: { ios: { buildNumber: '26' } } }).buildLabel).toBe('1.5.0 (26)');
  expect(identity({ updates: builtInLaunch, app, platformOS: 'android', config: { android: { versionCode: 54 } } }).buildLabel).toBe('1.5.0 (54)');
});

test.each([
  [new Date('2026-01-02T03:04:59.999Z'), '2026-01-02 03:04 UTC'],
  ['2026-11-05T23:59:00+02:00', '2026-11-05 21:59 UTC'],
  ['not a date', null],
  [null, null],
])('formatPublishedAt(%p) is %p', (value, expected) => {
  expect(formatPublishedAt(value)).toBe(expected);
});

test('getReleaseIdentity reads the running app: expo-application, expo-updates and the running manifest config', () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  expect(getReleaseIdentity()).toMatchObject({
    releaseLabel: '1.5.0+2', buildLabel: '1.5.0 (55)', channel: 'preview', shortUpdateId: '0199a6f2',
    launch: 'Update', publishedAt: '2026-11-05 09:12 UTC', sourceCommit: 'fd053cf', backendTarget: 'sqlite-staging',
  });
});
