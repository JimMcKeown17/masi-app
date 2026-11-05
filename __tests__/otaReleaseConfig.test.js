global.__MASI_NO_DEFAULT_HANDLE__ = true;
// app.config.js is evaluated by `eas update` (through `expo config --type public`) with the
// publish script's environment; its `extra` becomes the update manifest's expoClient.extra,
// which is what Constants.expoConfig.extra returns on the phone during an update launch.
jest.mock('child_process', () => ({ execFileSync: jest.fn(() => `${'c'.repeat(40)}\n`) }));
const appConfig = require('../app.config');

const KEYS = ['MASI_OTA_RELEASE', 'MASI_OTA_PUBLISHED_AT', 'EAS_BUILD_GIT_COMMIT_HASH'];
const saved = Object.fromEntries(KEYS.map(key => [key, process.env[key]]));
afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

test('the publish script\'s release number and time land in extra, next to the source commit', () => {
  process.env.MASI_OTA_RELEASE = '2';
  process.env.MASI_OTA_PUBLISHED_AT = '2026-11-05T09:11:02.000Z';
  expect(appConfig().expo.extra).toMatchObject({
    otaRelease: 2,
    otaPublishedAt: '2026-11-05T09:11:02.000Z',
    gitCommit: 'c'.repeat(40),
  });
});

// Absent, not null: @expo/config's serializeAndEvaluate turns a null in a dynamic config into
// {} (typeof null === 'object'), and that {} is what EAS would embed or publish.
test.each([undefined, ''])('a build or a plain `eas update` (release %p) carries no release number at all', (value) => {
  if (value === undefined) delete process.env.MASI_OTA_RELEASE;
  else process.env.MASI_OTA_RELEASE = value;
  delete process.env.MASI_OTA_PUBLISHED_AT;
  const { extra } = appConfig().expo;
  expect(extra).not.toHaveProperty('otaRelease');
  expect(extra).not.toHaveProperty('otaPublishedAt');
  expect(extra.gitCommit).toBe('c'.repeat(40));
});

test.each(['0', '-1', '2.5', 'two', '2x', ' 3'])('a malformed release number %p stops config evaluation instead of shipping', (value) => {
  process.env.MASI_OTA_RELEASE = value;
  expect(() => appConfig()).toThrow(/MASI_OTA_RELEASE must be a positive whole number/);
});

test.each(['yesterday', '2026-11-05', '2026-13-45T00:00:00.000Z'])('a malformed publish time %p stops config evaluation', (value) => {
  delete process.env.MASI_OTA_RELEASE;
  process.env.MASI_OTA_PUBLISHED_AT = value;
  expect(() => appConfig()).toThrow(/MASI_OTA_PUBLISHED_AT must be an ISO 8601 UTC time/);
});
