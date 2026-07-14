jest.mock('expo-application', () => ({
  applicationId: 'org.masinyusane.masi',
  applicationName: 'Masi',
  nativeApplicationVersion: '1.2.0',
  nativeBuildVersion: '47',
}));

jest.mock('expo-device', () => ({
  brand: 'google',
  manufacturer: 'Google',
  modelName: 'Pixel 8a',
  modelId: null,
  deviceName: 'Field phone',
  deviceType: 1,
  isDevice: true,
  osName: 'Android',
  osVersion: '15',
  osBuildId: 'AP4A.250205.002',
  platformApiLevel: 35,
  supportedCpuArchitectures: ['arm64-v8a'],
  totalMemory: 8_000_000_000,
}));

jest.mock('expo-updates', () => ({
  updateId: 'update-123',
  channel: 'production',
  runtimeVersion: '1.2.0',
  isEmbeddedLaunch: false,
  isEmergencyLaunch: false,
}));

jest.mock('../src/utils/releaseMetadata', () => ({
  getReleaseMetadata: () => ({
    appVersion: '1.2.0',
    gitCommit: 'abc1234',
    supabaseTarget: 'sqlite-staging',
    supabaseProjectId: 'segygjzpujphwvrubusm',
  }),
}));

jest.mock('../src/db/migrations', () => ({
  CURRENT_SCHEMA_VERSION: 8,
}));

import { getRuntimeDiagnostics } from '../src/utils/runtimeDiagnostics';

describe('getRuntimeDiagnostics', () => {
  test('identifies the installed binary, device, update, backend, and SQLite schema', () => {
    expect(getRuntimeDiagnostics()).toEqual(expect.objectContaining({
      application: expect.objectContaining({
        id: 'org.masinyusane.masi',
        version: '1.2.0',
        build: '47',
      }),
      device: expect.objectContaining({
        manufacturer: 'Google',
        modelName: 'Pixel 8a',
        osName: 'Android',
        osVersion: '15',
        isPhysicalDevice: true,
      }),
      update: expect.objectContaining({
        id: 'update-123',
        channel: 'production',
        runtimeVersion: '1.2.0',
        isEmbedded: false,
      }),
      backend: {
        target: 'sqlite-staging',
        projectId: 'segygjzpujphwvrubusm',
      },
      sqlite: { schemaVersion: 8 },
    }));
  });
});
