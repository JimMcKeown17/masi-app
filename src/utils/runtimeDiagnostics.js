import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Updates from 'expo-updates';
import { CURRENT_SCHEMA_VERSION } from '../db/migrations';
import { getReleaseMetadata } from './releaseMetadata';

const DEVICE_TYPE_NAMES = {
  0: 'unknown',
  1: 'phone',
  2: 'tablet',
  3: 'desktop',
  4: 'tv',
};

const present = (value, fallback = null) => (
  value === undefined || value === null || value === '' ? fallback : value
);

/**
 * Return one synchronous, JSON-safe description of the running app instance.
 *
 * Build-time Expo config is useful but can be stale when EAS remotely increments
 * a native build number. expo-application reads the installed binary, while
 * expo-updates identifies the JavaScript update actually executing on top of it.
 */
export const getRuntimeDiagnostics = () => {
  const release = getReleaseMetadata();
  const deviceType = present(Device.deviceType);

  return {
    application: {
      id: present(Application.applicationId),
      name: present(Application.applicationName),
      version: present(Application.nativeApplicationVersion, release.appVersion),
      build: present(
        Application.nativeBuildVersion,
        Platform.OS === 'ios' ? release.iosBuildNumber : release.androidVersionCode
      ),
      releaseLabel: present(release.releaseLabel),
      gitCommit: present(release.gitCommit),
    },
    device: {
      platform: Platform.OS,
      platformVersion: present(Platform.Version),
      brand: present(Device.brand),
      manufacturer: present(Device.manufacturer),
      modelName: present(Device.modelName),
      modelId: present(Device.modelId),
      deviceName: present(Device.deviceName),
      deviceType,
      deviceTypeName: DEVICE_TYPE_NAMES[deviceType] || 'unknown',
      isPhysicalDevice: Boolean(Device.isDevice),
      osName: present(Device.osName),
      osVersion: present(Device.osVersion),
      osBuildId: present(Device.osBuildId),
      platformApiLevel: present(Device.platformApiLevel),
      supportedCpuArchitectures: present(Device.supportedCpuArchitectures, []),
      totalMemoryBytes: present(Device.totalMemory),
    },
    update: {
      id: present(Updates.updateId),
      channel: present(Updates.channel),
      runtimeVersion: present(Updates.runtimeVersion, release.runtimeVersionSummary),
      isEmbedded: Boolean(Updates.isEmbeddedLaunch),
      isEmergencyLaunch: Boolean(Updates.isEmergencyLaunch),
    },
    backend: {
      target: present(release.supabaseTarget, 'unknown'),
      projectId: present(release.supabaseProjectId, 'unknown'),
    },
    sqlite: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
    },
  };
};
