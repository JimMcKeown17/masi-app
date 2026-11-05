import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

const fallback = (value, defaultValue = 'unknown') => (
  value === undefined || value === null || value === '' ? defaultValue : value
);
const present = (value) => fallback(value, null);
// A config value must have its JSON type: @expo/config serializes a null in app.config.js as {}.
const text = (value) => (typeof value === 'string' && value !== '' ? value : null);

const summarizeRuntimeVersion = (runtimeVersion) => {
  if (!runtimeVersion) return 'unknown';
  if (typeof runtimeVersion === 'string') return runtimeVersion;
  if (runtimeVersion.policy) return runtimeVersion.policy;
  return JSON.stringify(runtimeVersion);
};

// The installed binary's build wins; the config's build is a fallback for a binary that
// does not report one. On an update launch the config is the update's, which has no build.
const nativeBuilds = ({ application, expoConfig, platformOS }) => {
  const nativeBuild = present(application?.nativeBuildVersion);
  const iosBuildNumber = (platformOS === 'ios' ? nativeBuild : null) || expoConfig.ios?.buildNumber || null;
  const androidVersionCode = platformOS === 'android' && nativeBuild
    ? Number(nativeBuild) : expoConfig.android?.versionCode ?? null;
  const build = platformOS === 'ios' ? iosBuildNumber : platformOS === 'android' ? androidVersionCode : null;
  return { iosBuildNumber, androidVersionCode, build: build == null ? null : String(build) };
};

const positiveWholeNumber = (value) => (Number.isInteger(value) && value > 0 ? value : null);

const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** `YYYY-MM-DD HH:mm UTC`, or null for a missing or unreadable time. */
export const formatPublishedAt = (value) => {
  const date = toDate(value);
  return date ? `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC` : null;
};

const LAUNCH = { update: 'Update', builtIn: 'Built-in', development: 'Development' };

/**
 * The release identity of the running app, from plain inputs: the running config
 * (Constants.expoConfig), expo-application and expo-updates.
 *
 * On an update launch expo-constants returns the running update manifest's
 * `extra.expoClient` as `expoConfig`, so `extra.otaRelease` is the number that
 * `npm run ota:publish` stamped into that update. On a built-in launch it returns the
 * config embedded in the binary, which has no number.
 *
 * releaseLabel: built-in bundle `1.5.0`; numbered update `1.5.0+2`; an update of this code
 * published without `npm run ota:publish` `1.5.0+?` (honest, never invented).
 */
export const buildReleaseIdentity = ({ expoConfig = {}, application = {}, updates = {}, platformOS } = {}) => {
  const config = expoConfig || {};
  const extra = config.extra || {};
  const version = fallback(present(application?.nativeApplicationVersion) ?? present(config.version));
  const { build } = nativeBuilds({ application, expoConfig: config, platformOS });
  const updateId = present(updates?.updateId);
  const launch = updates?.isEmbeddedLaunch ? LAUNCH.builtIn : updateId ? LAUNCH.update : LAUNCH.development;
  const isUpdate = launch === LAUNCH.update;
  const otaRelease = isUpdate ? positiveWholeNumber(extra.otaRelease) : null;
  const published = isUpdate ? toDate(updates?.createdAt) ?? toDate(text(extra.otaPublishedAt)) : null;
  const configRuntime = typeof config.runtimeVersion === 'string' ? config.runtimeVersion
    : config.runtimeVersion?.policy === 'appVersion' && present(config.version) ? config.version : null;
  const gitCommit = text(extra.gitCommit);
  return {
    releaseLabel: isUpdate ? `${version}+${otaRelease ?? '?'}` : version,
    version,
    build,
    buildLabel: `${version} (${build ?? '?'})`,
    channel: present(updates?.channel),
    runtimeVersion: present(updates?.runtimeVersion) ?? configRuntime,
    updateId,
    shortUpdateId: updateId ? updateId.slice(0, 8) : null,
    launch,
    otaRelease,
    publishedAt: formatPublishedAt(published),
    publishedAtIso: published ? published.toISOString() : null,
    sourceCommit: gitCommit ? gitCommit.slice(0, 7) : null,
    gitCommit,
    backendTarget: fallback(extra.supabaseTarget),
    backendProjectId: fallback(extra.supabaseProjectId),
  };
};

/** The one release identity the Profile card, incident receipts and support exports use. */
export const getReleaseIdentity = () => buildReleaseIdentity({
  expoConfig: Constants.expoConfig || {},
  application: Application,
  updates: Updates,
  platformOS: Platform.OS,
});

export const getReleaseMetadata = () => {
  const expoConfig = Constants.expoConfig || {};
  const extra = expoConfig.extra || {};
  const { iosBuildNumber, androidVersionCode } = nativeBuilds({ application: Application, expoConfig, platformOS: Platform.OS });
  const { releaseLabel } = getReleaseIdentity();
  return {
    appVersion: fallback(expoConfig.version),
    iosBuildNumber,
    androidVersionCode,
    releaseLabel,
    buildMessage: releaseLabel,
    gitCommit: fallback(extra.gitCommit),
    otaRelease: positiveWholeNumber(extra.otaRelease),
    otaPublishedAt: text(extra.otaPublishedAt),
    runtimeVersion: expoConfig.runtimeVersion ?? null,
    runtimeVersionSummary: summarizeRuntimeVersion(expoConfig.runtimeVersion),
    updateUrl: expoConfig.updates?.url ?? null,
    supabaseTarget: fallback(extra.supabaseTarget),
    supabaseProjectId: fallback(extra.supabaseProjectId),
  };
};
