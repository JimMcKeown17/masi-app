const { execFileSync } = require('child_process');
const { resolveSupabaseProjectConfig } = require('./config/supabaseProjectConfig');
const { resolvePreviewContentBuildConfig } = require('./config/previewContentConfig');

const GALLERY_PROFILES = ['development', 'preview'];

// Evaluated for both builds and updates so the manifest identifies its source.
const gitCommit = () => {
  if (process.env.EAS_BUILD_GIT_COMMIT_HASH) return process.env.EAS_BUILD_GIT_COMMIT_HASH;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: __dirname, encoding: 'utf8', timeout: 1000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch {
    return null;
  }
};

// `npm run ota:publish` sets these for `eas update`, which evaluates this file with its
// environment and publishes the result as the update manifest's extra. On the phone,
// Constants.expoConfig.extra is that manifest's extra during an update launch, so Profile can
// show the update's release number (1.5.0+2). Builds and plain `eas update` leave them unset,
// and then the keys are left out: @expo/config serializes a null here as {}.
const otaRelease = () => {
  const value = process.env.MASI_OTA_RELEASE;
  if (value === undefined || value === '') return null;
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`MASI_OTA_RELEASE must be a positive whole number, not "${value}".`);
  }
  return Number(value);
};

const otaPublishedAt = () => {
  const value = process.env.MASI_OTA_PUBLISHED_AT;
  if (value === undefined || value === '') return null;
  const date = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value) || Number.isNaN(date.getTime())) {
    throw new Error(`MASI_OTA_PUBLISHED_AT must be an ISO 8601 UTC time, not "${value}".`);
  }
  return value;
};

const onlyWhenSet = (key, value) => (value === null ? {} : { [key]: value });

module.exports = () => {
  const supabaseConfig = resolveSupabaseProjectConfig();
  const sentryOrganization = process.env.SENTRY_ORG;
  const sentryProject = process.env.SENTRY_PROJECT;
  const sentryPlugin = sentryOrganization && sentryProject
    ? [[
      '@sentry/react-native/expo',
      {
        url: 'https://sentry.io/',
        organization: sentryOrganization,
        project: sentryProject,
      },
    ]]
    : [];

  return {
    expo: {
      name: 'Masi',
      slug: 'masi-mobile-app',
      version: '1.5.0',
      orientation: 'portrait',
      scheme: 'masi-app',
      icon: './assets/masi-mobile-icon.png',
      userInterfaceStyle: 'light',
      newArchEnabled: true,
      splash: {
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
      },
      ios: {
        // iOS needs full-bleed, opaque artwork: it applies its own rounded mask and fills any
        // transparency with white. The shared icon has the logo inset for Android's adaptive-icon
        // safe zone, which on iOS rendered as a small square inside a white tile.
        icon: './assets/icon-ios.png',
        supportsTablet: false,
        bundleIdentifier: 'org.masinyusane.masi',
        infoPlist: {
          NSLocationWhenInUseUsageDescription:
            'Masi needs your location to verify you are at the school when signing in and out for time tracking.',
          ITSAppUsesNonExemptEncryption: false,
        },
      },
      android: {
        allowBackup: false,
        adaptiveIcon: {
          foregroundImage: './assets/masi-mobile-icon.png',
          backgroundColor: '#ffffff',
        },
        edgeToEdgeEnabled: true,
        package: 'org.masinyusane.masi',
        permissions: [
          'ACCESS_FINE_LOCATION',
          'ACCESS_COARSE_LOCATION',
        ],
      },
      plugins: [
        './plugins/withNoBackupDataExtraction',
        'expo-sqlite',
        [
          'expo-location',
          {
            locationWhenInUsePermission:
              'Masi needs your location to verify you are at the school when signing in and out for time tracking.',
          },
        ],
        [
          'expo-image-picker',
          {
            // Report a problem attaches one screenshot from the gallery. No camera use.
            photosPermission:
              'Masi lets you attach a screenshot when you report a problem to the Masi team.',
            cameraPermission: false,
            microphonePermission: false,
          },
        ],
        ...sentryPlugin,
      ],
      web: {
        favicon: './assets/favicon.png',
      },
      extra: {
        gitCommit: gitCommit(),
        ...onlyWhenSet('otaRelease', otaRelease()),
        ...onlyWhenSet('otaPublishedAt', otaPublishedAt()),
        questionGallery: GALLERY_PROFILES.includes(process.env.EAS_BUILD_PROFILE),
        ...supabaseConfig,
        ...resolvePreviewContentBuildConfig(),
        sentryConfigured: Boolean(
          process.env.EXPO_PUBLIC_SENTRY_DSN
          && sentryOrganization
          && sentryProject
        ),
        eas: {
          projectId: '6a430b63-345e-4313-90ea-e332700295e9',
        },
      },
      runtimeVersion: {
        policy: 'appVersion',
      },
      updates: {
        url: 'https://u.expo.dev/6a430b63-345e-4313-90ea-e332700295e9',
      },
      owner: 'jimmckeown',
    },
  };
};
