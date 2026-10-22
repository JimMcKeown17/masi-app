global.__MASI_NO_DEFAULT_HANDLE__ = true;

const eas = require('../eas.json');
const defaultConstants = require('expo-constants');
const {
  PREVIEW_CONTENT_ENV,
  FIELD_BUILD_PROFILES,
  FIELD_UPDATE_CHANNELS,
  resolvePreviewContentBuildConfig,
  isPreviewContentAllowed,
} = require('../config/previewContentConfig');

jest.mock('expo-updates', () => ({ channel: null }));

const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...originalEnv };
  delete process.env.MASI_PREVIEW_CONTENT;
  delete process.env.EAS_BUILD_PROFILE;
});

afterEach(() => {
  process.env = originalEnv;
  jest.doMock('expo-constants', () => defaultConstants);
  jest.doMock('expo-updates', () => ({ channel: null }));
});

test.each([[{}, false], [{ MASI_PREVIEW_CONTENT: '1' }, true], [{ MASI_PREVIEW_CONTENT: 'true' }, false],
  [{ MASI_PREVIEW_CONTENT: '0' }, false], [{ MASI_PREVIEW_CONTENT: '' }, false]])('setting %p → %p', (env, on) => {
  expect(PREVIEW_CONTENT_ENV).toBe('MASI_PREVIEW_CONTENT');
  expect(resolvePreviewContentBuildConfig({ env })).toEqual({ previewContent: on });
});

test.each(['pilot', 'production'])('the %s profile refuses the setting', profile => {
  expect(() => resolvePreviewContentBuildConfig({ env: { MASI_PREVIEW_CONTENT: '1', EAS_BUILD_PROFILE: profile } }))
    .toThrow(`MASI_PREVIEW_CONTENT=1 is refused for the "${profile}" build profile: preview content packs may hold unreviewed words (lesson-plan spec C12).`);
});

test.each(['development', 'preview', 'preview-content'])('the %s profile allows it', profile => {
  expect(resolvePreviewContentBuildConfig({ env: { MASI_PREVIEW_CONTENT: '1', EAS_BUILD_PROFILE: profile } }))
    .toEqual({ previewContent: true });
});

test('field profiles are exactly the store-distributed eas.json profiles', () => {
  expect(Object.entries(eas.build).filter(([, p]) => p.distribution !== 'internal').map(([n]) => n).sort())
    .toEqual([...FIELD_BUILD_PROFILES].sort());
  expect(Object.isFrozen(FIELD_BUILD_PROFILES)).toBe(true);
});

test('field channels are exactly the channels of the field profiles', () => {
  expect([...new Set(FIELD_BUILD_PROFILES.map(n => eas.build[n].channel))].sort())
    .toEqual([...FIELD_UPDATE_CHANNELS].sort());
  expect(Object.isFrozen(FIELD_UPDATE_CHANNELS)).toBe(true);
});

test('no field profile sets the preview setting', () => {
  for (const profile of FIELD_BUILD_PROFILES) {
    expect(eas.build[profile].env).not.toHaveProperty('MASI_PREVIEW_CONTENT');
    expect(resolvePreviewContentBuildConfig({ env: { EAS_BUILD_PROFILE: profile } }))
      .toEqual({ previewContent: false });
  }
});

test('preview-content is internal, has no channel, and is the preview env plus the setting', () => {
  expect(eas.build['preview-content']).toEqual(expect.objectContaining({
    environment: 'preview', distribution: 'internal', autoIncrement: true, android: { buildType: 'apk' },
  }));
  expect(eas.build['preview-content'].channel).toBeUndefined();
  expect(eas.build['preview-content'].env).toEqual({ ...eas.build.preview.env, MASI_PREVIEW_CONTENT: '1' });
});

test('app.config.js throws for a pilot build with the setting, and exposes a boolean otherwise', () => {
  process.env.EAS_BUILD_PROFILE = 'pilot';
  process.env.MASI_PREVIEW_CONTENT = '1';
  expect(() => require('../app.config')()).toThrow('MASI_PREVIEW_CONTENT=1 is refused for the "pilot" build profile');

  delete process.env.MASI_PREVIEW_CONTENT;
  jest.resetModules();
  expect(require('../app.config')().expo.extra.previewContent).toBe(false);

  process.env.EAS_BUILD_PROFILE = 'preview';
  process.env.MASI_PREVIEW_CONTENT = '1';
  jest.resetModules();
  expect(require('../app.config')().expo.extra.previewContent).toBe(true);
});

test.each([
  [{ previewContent: true }, null, true], [{ previewContent: true }, undefined, true], [{ previewContent: true }, '', true],
  [{ previewContent: true }, 'preview', false], [{ previewContent: true }, 'production', false],
  [{ previewContent: false }, null, false], [{ previewContent: 'true' }, null, false], [undefined, null, false],
])('isPreviewContentAllowed(%p, %p) → %p', (extra, channel, allowed) => {
  expect(isPreviewContentAllowed({ extra, channel })).toBe(allowed);
});

test('isPreviewContentEnabled is false under the default test config', () => {
  expect(isPreviewContentAllowed()).toBe(false);
  expect(require('../src/lessonPlan/packs/previewContent').isPreviewContentEnabled()).toBe(false);
});

function runtimeEnabled(extra, channel) {
  jest.doMock('expo-constants', () => ({ expoConfig: { extra } }));
  jest.doMock('expo-updates', () => ({ channel }));
  let enabled;
  jest.isolateModules(() => {
    enabled = require('../src/lessonPlan/packs/previewContent').isPreviewContentEnabled();
  });
  return enabled;
}

test('isPreviewContentEnabled is true for a developer build with the setting', () => {
  expect(runtimeEnabled({ previewContent: true }, null)).toBe(true);
});

test.each(['preview', 'production'])('isPreviewContentEnabled refuses OTA preview content on the %s field channel', channel => {
  expect(runtimeEnabled({ previewContent: true }, channel)).toBe(false);
});

test('isPreviewContentEnabled returns false when reading native configuration fails', () => {
  jest.doMock('expo-constants', () => ({
    get expoConfig() { throw new Error('native configuration unavailable'); },
  }));
  jest.isolateModules(() => {
    expect(require('../src/lessonPlan/packs/previewContent').isPreviewContentEnabled()).toBe(false);
  });
});
