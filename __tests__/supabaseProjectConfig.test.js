const {
  KNOWN_SUPABASE_PROJECTS,
  resolveSupabaseProjectConfig,
} = require('../config/supabaseProjectConfig');

describe('supabase project config resolver', () => {
  test('defaults to the current primary project', () => {
    const config = resolveSupabaseProjectConfig({
      env: {},
      expoExtra: {
        supabaseUrl: 'https://jcqrlwetutnpuchjoyyd.supabase.co',
        supabaseAnonKey: 'primary-key',
      },
    });

    expect(config).toEqual({
      supabaseTarget: 'primary',
      supabaseProjectId: 'jcqrlwetutnpuchjoyyd',
      supabaseUrl: 'https://jcqrlwetutnpuchjoyyd.supabase.co',
      supabaseAnonKey: 'primary-key',
    });
    expect(KNOWN_SUPABASE_PROJECTS.primary).toBe('jcqrlwetutnpuchjoyyd');
  });

  test('requires explicit project ID, URL, and key for sqlite staging', () => {
    expect(() => resolveSupabaseProjectConfig({
      env: {
        EXPO_PUBLIC_SUPABASE_TARGET: 'sqlite-staging',
        EXPO_PUBLIC_SUPABASE_PROJECT_ID: 'segygjzpujphwvrubusm',
        EXPO_PUBLIC_SUPABASE_URL: 'https://segygjzpujphwvrubusm.supabase.co',
      },
      expoExtra: {},
    })).toThrow(/EXPO_PUBLIC_SUPABASE_ANON_KEY/);
  });

  test('resolves the sqlite staging target from explicit env values', () => {
    expect(resolveSupabaseProjectConfig({
      env: {
        EXPO_PUBLIC_SUPABASE_TARGET: 'sqlite-staging',
        EXPO_PUBLIC_SUPABASE_PROJECT_ID: 'segygjzpujphwvrubusm',
        EXPO_PUBLIC_SUPABASE_URL: 'https://segygjzpujphwvrubusm.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sqlite-key',
      },
      expoExtra: {},
    })).toEqual({
      supabaseTarget: 'sqlite-staging',
      supabaseProjectId: 'segygjzpujphwvrubusm',
      supabaseUrl: 'https://segygjzpujphwvrubusm.supabase.co',
      supabaseAnonKey: 'sqlite-key',
    });
  });

  test('rejects mismatched project ID and URL', () => {
    expect(() => resolveSupabaseProjectConfig({
      env: {
        EXPO_PUBLIC_SUPABASE_TARGET: 'sqlite-staging',
        EXPO_PUBLIC_SUPABASE_PROJECT_ID: 'segygjzpujphwvrubusm',
        EXPO_PUBLIC_SUPABASE_URL: 'https://different-ref.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sqlite-key',
      },
      expoExtra: {},
    })).toThrow(/must be https:\/\/segygjzpujphwvrubusm\.supabase\.co/);
  });

  test('rejects URLs that only contain the project ID outside the Supabase hostname', () => {
    expect(() => resolveSupabaseProjectConfig({
      env: {
        EXPO_PUBLIC_SUPABASE_TARGET: 'sqlite-staging',
        EXPO_PUBLIC_SUPABASE_PROJECT_ID: 'segygjzpujphwvrubusm',
        EXPO_PUBLIC_SUPABASE_URL: 'https://evil.example.com/segygjzpujphwvrubusm.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sqlite-key',
      },
      expoExtra: {},
    })).toThrow(/must be https:\/\/segygjzpujphwvrubusm\.supabase\.co/);
  });

  test('rejects unknown Supabase targets', () => {
    expect(() => resolveSupabaseProjectConfig({
      env: { EXPO_PUBLIC_SUPABASE_TARGET: 'other-project' },
      expoExtra: {},
    })).toThrow(/Unknown Supabase target/);
  });
});

describe('Expo app config', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  test('preserves app identity and injects sqlite Supabase target values', () => {
    process.env.EXPO_PUBLIC_SUPABASE_TARGET = 'sqlite-staging';
    process.env.EXPO_PUBLIC_SUPABASE_PROJECT_ID = 'segygjzpujphwvrubusm';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://segygjzpujphwvrubusm.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'sqlite-key';

    const buildConfig = require('../app.config');
    const { expo } = buildConfig();

    expect(expo.name).toBe('Masi');
    expect(expo.slug).toBe('masi-mobile-app');
    expect(expo.ios.bundleIdentifier).toBe('org.masinyusane.masi');
    expect(expo.android.package).toBe('org.masinyusane.masi');
    expect(expo.extra.eas.projectId).toBe('6a430b63-345e-4313-90ea-e332700295e9');
    expect(expo.updates.url).toBe('https://u.expo.dev/6a430b63-345e-4313-90ea-e332700295e9');
    expect(expo.runtimeVersion).toEqual({ policy: 'appVersion' });
    expect(expo.extra).toMatchObject({
      supabaseTarget: 'sqlite-staging',
      supabaseProjectId: 'segygjzpujphwvrubusm',
      supabaseUrl: 'https://segygjzpujphwvrubusm.supabase.co',
      supabaseAnonKey: 'sqlite-key',
    });
  });
});
