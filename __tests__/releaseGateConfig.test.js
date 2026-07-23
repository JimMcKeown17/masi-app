const packageJson = require('../package.json');
const easConfig = require('../eas.json');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const npmRunTargets = (script) => {
  const matches = script.matchAll(/npm run ([^\s&]+)/g);
  return Array.from(matches, (match) => match[1]);
};

describe('Plan 6 release gate configuration', () => {
  test('release script references defined gates and keeps the staging guard in the chain', () => {
    const releaseScript = packageJson.scripts['test:release'];

    expect(releaseScript).toContain('npm test');
    expect(releaseScript).toContain('npm run test:integration');
    expect(releaseScript).toContain('npm run sqlite:staging:check');

    for (const target of npmRunTargets(releaseScript)) {
      expect(packageJson.scripts[target]).toEqual(expect.any(String));
    }
  });

  test('integration gate changes the SQLite test runtime instead of rerunning the same suite subset', () => {
    const integrationScript = packageJson.scripts['test:integration'];
    expect(integrationScript).toContain('--runInBand');

    const configPathMatch = integrationScript.match(/--config\s+([^\s]+)/);
    expect(configPathMatch).not.toBeNull();
    expect(fs.existsSync(path.join(repoRoot, configPathMatch[1]))).toBe(true);

    const integrationConfig = require('../jest.integration.config');
    expect(integrationConfig.setupFiles).toEqual(['./jest.integration.setup.js']);
    expect(integrationConfig.setupFiles).not.toEqual(packageJson.jest.setupFiles);
    expect(fs.existsSync(path.join(repoRoot, 'jest.integration.setup.js'))).toBe(true);
  });

  test('integration config covers existing files on the SQLite critical path', () => {
    const integrationConfig = require('../jest.integration.config');
    const requiredTestFiles = [
      '<rootDir>/test-support/integration/sqliteRuntime.integration.js',
      '<rootDir>/__tests__/sqliteFoundation.test.js',
      '<rootDir>/__tests__/debugExport.test.js',
      '<rootDir>/__tests__/syncOutboxRepository.test.js',
      '<rootDir>/__tests__/offlineSyncOutbox.test.js',
      '<rootDir>/__tests__/childrenRepository.test.js',
      '<rootDir>/__tests__/classesRepository.test.js',
      '<rootDir>/__tests__/sessionsRepository.test.js',
      '<rootDir>/__tests__/assessmentsRepository.test.js',
      '<rootDir>/__tests__/referenceDataRepository.test.js',
      '<rootDir>/__tests__/ChildrenContext.test.js',
      '<rootDir>/__tests__/ClassesContext.plan5.test.js',
    ];

    expect(integrationConfig.testMatch).toEqual(expect.arrayContaining(requiredTestFiles));

    for (const pattern of integrationConfig.testMatch) {
      const relativePath = pattern.replace('<rootDir>/', '');
      expect(fs.existsSync(path.join(repoRoot, relativePath))).toBe(true);
    }
  });

  test('preview APK builds are pinned to the SQLite staging backend', () => {
    const previewEnv = easConfig.build.preview.env;

    expect(previewEnv).toEqual(expect.objectContaining({
      EXPO_PUBLIC_SUPABASE_TARGET: 'sqlite-staging',
      EXPO_PUBLIC_SUPABASE_PROJECT_ID: 'segygjzpujphwvrubusm',
      EXPO_PUBLIC_SUPABASE_URL: 'https://segygjzpujphwvrubusm.supabase.co',
    }));
    expect(previewEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY).toEqual(expect.stringMatching(/^sb_publishable_/));
  });

  test('pilot store builds are isolated from the legacy field submission path', () => {
    const pilotBuild = easConfig.build.pilot;

    expect(pilotBuild).toEqual(expect.objectContaining({
      environment: 'preview',
      distribution: 'store',
      autoIncrement: true,
      channel: 'preview',
      android: { buildType: 'app-bundle' },
    }));
    expect(pilotBuild.env).toEqual(expect.objectContaining({
      EXPO_PUBLIC_SUPABASE_TARGET: 'sqlite-staging',
      EXPO_PUBLIC_SUPABASE_PROJECT_ID: 'segygjzpujphwvrubusm',
      EXPO_PUBLIC_SUPABASE_URL: 'https://segygjzpujphwvrubusm.supabase.co',
      EXPO_PUBLIC_SENTRY_ENVIRONMENT: 'preview',
    }));
    expect(pilotBuild.env.EXPO_PUBLIC_SUPABASE_ANON_KEY).toEqual(
      expect.stringMatching(/^sb_publishable_/),
    );

    expect(easConfig.submit.pilot.ios).toEqual({
      ascAppId: '6760048185',
      appleId: 'mckeown.james@gmail.com',
    });
    expect(easConfig.submit.pilot.android).toBeUndefined();
    expect(easConfig.submit.production).toBeUndefined();
  });

  test('release 1.3.0 advances the app-version runtime boundary', () => {
    const config = require('../app.config')().expo;

    expect(config.version).toBe('1.3.0');
    expect(config.runtimeVersion).toEqual({ policy: 'appVersion' });
  });
});
