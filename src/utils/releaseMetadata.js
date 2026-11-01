import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { Platform } from 'react-native';

const fallback = (value, defaultValue = 'unknown') => (
  value === undefined || value === null || value === '' ? defaultValue : value
);

const summarizeRuntimeVersion = (runtimeVersion) => {
  if (!runtimeVersion) return 'unknown';
  if (typeof runtimeVersion === 'string') return runtimeVersion;
  if (runtimeVersion.policy) return runtimeVersion.policy;
  return JSON.stringify(runtimeVersion);
};

export const getReleaseMetadata = () => {
  const expoConfig = Constants.expoConfig || {};
  const extra = expoConfig.extra || {};

  const appVersion = fallback(expoConfig.version);
  const iosBuildNumber = (Platform.OS === 'ios' ? Application.nativeBuildVersion : null) || expoConfig.ios?.buildNumber || null;
  const nativeAndroidBuild = Platform.OS === 'android' ? Application.nativeBuildVersion : null;
  const androidVersionCode = nativeAndroidBuild ? Number(nativeAndroidBuild) : expoConfig.android?.versionCode ?? null;
  const build = Platform.OS === 'ios' ? iosBuildNumber : Platform.OS === 'android' ? androidVersionCode : null;
  const releaseLabel = build == null ? appVersion : appVersion + ' (' + build + ')';
  return {
    appVersion,
    iosBuildNumber,
    androidVersionCode,
    releaseLabel,
    buildMessage: releaseLabel,
    gitCommit: fallback(extra.gitCommit),
    runtimeVersion: expoConfig.runtimeVersion ?? null,
    runtimeVersionSummary: summarizeRuntimeVersion(expoConfig.runtimeVersion),
    updateUrl: expoConfig.updates?.url ?? null,
    supabaseTarget: fallback(extra.supabaseTarget),
    supabaseProjectId: fallback(extra.supabaseProjectId),
  };
};
