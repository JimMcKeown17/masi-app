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
      // Icon, adaptive foreground and splash PNGs are rendered from one mark geometry by
      // scripts/render-app-icons.cjs; __tests__/appIcon.test.js keeps them in step.
      icon: './assets/app-icon/icon.png',
      userInterfaceStyle: 'light',
      newArchEnabled: true,
      ios: {
        // iOS needs full-bleed, opaque artwork: it applies its own rounded mask and fills any
        // transparency with white. Android uses the inset adaptive foreground below instead.
        icon: './assets/app-icon/icon.png',
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
          // White mark on transparent over brand red (colors.red600). The same layer doubles as
          // the Android 13+ themed-icon monochrome image.
          foregroundImage: './assets/app-icon/android-foreground.png',
          monochromeImage: './assets/app-icon/android-foreground.png',
          backgroundColor: '#C81F3E',
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
        [
          // White mark on brand red (colors.red600), so cold start runs straight into red Login.
          'expo-splash-screen',
          {
            image: './assets/app-icon/splash.png',
            imageWidth: 200,
            resizeMode: 'contain',
            backgroundColor: '#C81F3E',
          },
        ],
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
