import Constants from 'expo-constants';
import releaseMetadata from '../constants/releaseMetadata.json';

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

  return {
    appVersion: fallback(expoConfig.version),
    iosBuildNumber: expoConfig.ios?.buildNumber ?? null,
    androidVersionCode: expoConfig.android?.versionCode ?? null,
    releaseLabel: fallback(releaseMetadata.releaseLabel),
    buildMessage: fallback(releaseMetadata.buildMessage),
    gitCommit: fallback(releaseMetadata.gitCommit),
    runtimeVersion: expoConfig.runtimeVersion ?? null,
    runtimeVersionSummary: summarizeRuntimeVersion(expoConfig.runtimeVersion),
    updateUrl: expoConfig.updates?.url ?? null,
    supabaseTarget: fallback(extra.supabaseTarget),
    supabaseProjectId: fallback(extra.supabaseProjectId),
  };
};
