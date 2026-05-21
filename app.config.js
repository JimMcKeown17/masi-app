const { resolveSupabaseProjectConfig } = require('./config/supabaseProjectConfig');

module.exports = () => {
  const supabaseConfig = resolveSupabaseProjectConfig();

  return {
    expo: {
      name: 'Masi',
      slug: 'masi-mobile-app',
      version: '1.2.0',
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
      ],
      web: {
        favicon: './assets/favicon.png',
      },
      extra: {
        ...supabaseConfig,
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
