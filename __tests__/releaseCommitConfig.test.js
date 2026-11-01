global.__MASI_NO_DEFAULT_HANDLE__ = true;
jest.mock('child_process', () => ({ execFileSync: jest.fn() }));
const { execFileSync } = require('child_process');
const appConfig = require('../app.config');
const saved = process.env.EAS_BUILD_GIT_COMMIT_HASH;
afterEach(() => {
  if (saved === undefined) delete process.env.EAS_BUILD_GIT_COMMIT_HASH;
  else process.env.EAS_BUILD_GIT_COMMIT_HASH = saved;
  jest.clearAllMocks();
});
test('EAS build commit takes precedence without invoking git', () => {
  process.env.EAS_BUILD_GIT_COMMIT_HASH = 'e'.repeat(40);
  expect(appConfig().expo.extra.gitCommit).toBe('e'.repeat(40));
  expect(execFileSync).not.toHaveBeenCalled();
});
test('local config uses full HEAD synchronously with a short timeout', () => {
  delete process.env.EAS_BUILD_GIT_COMMIT_HASH;
  execFileSync.mockReturnValue('a'.repeat(40) + '\n');
  expect(appConfig().expo.extra.gitCommit).toBe('a'.repeat(40));
  expect(execFileSync).toHaveBeenCalledWith('git', ['rev-parse', 'HEAD'], expect.objectContaining({ timeout: 1000, encoding: 'utf8' }));
});
test('missing git or repository never prevents config evaluation', () => {
  delete process.env.EAS_BUILD_GIT_COMMIT_HASH;
  execFileSync.mockImplementation(() => { throw new Error('git unavailable'); });
  expect(appConfig().expo.extra.gitCommit).toBeNull();
});
