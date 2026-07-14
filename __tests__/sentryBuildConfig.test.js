const mockGetSentryExpoConfig = jest.fn(() => ({ transformer: { sentry: true } }));
const fs = require('fs');
const path = require('path');

jest.mock('@sentry/react-native/metro', () => ({
  getSentryExpoConfig: (...args) => mockGetSentryExpoConfig(...args),
}));

describe('Sentry build configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      SENTRY_ORG: 'masinyusane',
      SENTRY_PROJECT: 'masi-mobile',
      EXPO_PUBLIC_SENTRY_DSN: 'https://public@example.ingest.sentry.io/123',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('adds the Expo plugin when project identifiers are configured', () => {
    const buildConfig = require('../app.config')().expo;

    expect(buildConfig.plugins).toContainEqual([
      '@sentry/react-native/expo',
      {
        url: 'https://sentry.io/',
        organization: 'masinyusane',
        project: 'masi-mobile',
      },
    ]);
    expect(buildConfig.extra.sentryConfigured).toBe(true);
  });

  test('uses the Sentry Metro serializer so production bundles receive Debug IDs', () => {
    const metroConfig = require('../metro.config');

    expect(mockGetSentryExpoConfig).toHaveBeenCalledWith(expect.stringContaining('masi-app'));
    expect(metroConfig).toEqual({ transformer: { sentry: true } });
  });

  test('initializes observability before loading the React application module', () => {
    const entrySource = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
    const initializeIndex = entrySource.indexOf('initializeObservability();');
    const appLoadIndex = entrySource.indexOf("require('./App')");

    expect(initializeIndex).toBeGreaterThanOrEqual(0);
    expect(appLoadIndex).toBeGreaterThanOrEqual(0);
    expect(initializeIndex).toBeLessThan(appLoadIndex);
  });

  test('pins EAS environments and provides a repeatable OTA source-map upload command', () => {
    const easConfig = require('../eas.json');
    const packageJson = require('../package.json');

    expect(easConfig.build.preview.environment).toBe('preview');
    expect(easConfig.build.production.environment).toBe('production');
    expect(packageJson.scripts['sentry:sourcemaps']).toBe('sentry-expo-upload-sourcemaps dist');
  });

  test('keeps local builds usable when Sentry project credentials are absent', () => {
    delete process.env.SENTRY_ORG;
    delete process.env.SENTRY_PROJECT;
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    jest.resetModules();

    const buildConfig = require('../app.config')().expo;

    expect(buildConfig.plugins).not.toContainEqual(expect.arrayContaining(['@sentry/react-native/expo']));
    expect(buildConfig.extra.sentryConfigured).toBe(false);
  });
});
