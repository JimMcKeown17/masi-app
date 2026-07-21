const { resolveSupabaseProjectConfig } = require('./config/supabaseProjectConfig');

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
      version: '1.3.0',
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
        supportsTablet: false,
        bundleIdentifier: 'org.masinyusane.masi',
        infoPlist: {
          NSLocationWhenInUseUsageDescription:
            'Masi needs your location to verify you are at the school when signing in and out for time tracking.',
          ITSAppUsesNonExemptEncryption: false,
        },
      },
      android: {
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
        'expo-sqlite',
        [
          'expo-location',
          {
            locationWhenInUsePermission:
              'Masi needs your location to verify you are at the school when signing in and out for time tracking.',
          },
        ],
        ...sentryPlugin,
      ],
      web: {
        favicon: './assets/favicon.png',
      },
      extra: {
        ...supabaseConfig,
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
