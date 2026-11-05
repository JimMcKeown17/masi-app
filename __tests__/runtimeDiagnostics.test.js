global.__MASI_NO_DEFAULT_HANDLE__ = true;
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
  __esModule: true,
  updateId: 'update-123',
  channel: 'production',
  runtimeVersion: '1.2.0',
  isEmbeddedLaunch: false,
  isEmergencyLaunch: false,
  createdAt: null,
}));

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: {
  version: '1.2.0', extra: { gitCommit: 'abc1234', supabaseTarget: 'sqlite-staging', supabaseProjectId: 'segygjzpujphwvrubusm' },
} } }));
const mockUpdates = jest.requireMock('expo-updates');
const mockConstants = jest.requireMock('expo-constants').default;
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
        // An update published before release numbering: honest, not invented.
        releaseLabel: '1.2.0+?', gitCommit: 'abc1234',
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
        launch: 'Update',
        otaRelease: null,
        createdAt: null,
      }),
      backend: {
        target: 'sqlite-staging',
        projectId: 'segygjzpujphwvrubusm',
      },
      sqlite: { schemaVersion: 8 },
    }));
  });
});

test('a numbered update carries its release number and EAS creation time into receipts and exports', () => {
  const saved = { ...mockConstants.expoConfig };
  mockConstants.expoConfig = { ...saved, extra: { ...saved.extra, otaRelease: 3 } };
  mockUpdates.createdAt = new Date('2026-11-05T09:12:47.000Z');
  try {
    const diagnostics = getRuntimeDiagnostics();
    expect(diagnostics.application).toMatchObject({ version: '1.2.0', build: '47', releaseLabel: '1.2.0+3' });
    expect(diagnostics.update).toMatchObject({ id: 'update-123', launch: 'Update', otaRelease: 3, createdAt: '2026-11-05T09:12:47.000Z' });
  } finally {
    mockConstants.expoConfig = saved;
    mockUpdates.createdAt = null;
  }
});

test('the built-in bundle reports its plain version and no update creation time', () => {
  mockUpdates.isEmbeddedLaunch = true;
  try {
    const diagnostics = getRuntimeDiagnostics();
    expect(diagnostics.application.releaseLabel).toBe('1.2.0');
    expect(diagnostics.update).toMatchObject({ isEmbedded: true, launch: 'Built-in', otaRelease: null, createdAt: null });
  } finally {
    mockUpdates.isEmbeddedLaunch = false;
  }
});
