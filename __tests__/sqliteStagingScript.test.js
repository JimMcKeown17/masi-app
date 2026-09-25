const fs = require('fs');
const os = require('os');
const path = require('path');
jest.mock('child_process', () => ({ spawnSync: jest.fn() }));
const { spawnSync } = require('child_process');
const {
  buildAndroidSdkEnv,
  buildCommandPlan,
  parseEnvContent,
  runAction,
  validateSqliteEnv,
} = require('../scripts/sqlite-staging.cjs');

describe('sqlite staging script helpers', () => {
  test('accepts dotenv colon/export assignments, whitespace, comments, quotes and CRLF as data', () => {
    const content = [
      '\uFEFF# fixture', '',
      'EXPO_PUBLIC_SENTRY_DSN: fixture-dsn',
      'export\tPROJECT = "fixture-project" # comment',
      "PASSWORD='fixture # password=a=b' # comment",
      'URL=fixture-url?x=a=b # comment',
      'EMPTY=',
      'DOUBLE="first\\nsecond\\rthird"',
      "MULTILINE='first", "second' # comment",
      'BACKTICK=`fixture # literal`',
      'LITERAL=${PROJECT}$(never-run) `never-run`',
      'DOTTED.KEY=first', 'DOTTED.KEY=last',
    ].join('\r\n');
    expect(parseEnvContent(content)).toEqual({
      EXPO_PUBLIC_SENTRY_DSN: 'fixture-dsn', PROJECT: 'fixture-project',
      PASSWORD: 'fixture # password=a=b', URL: 'fixture-url?x=a=b', EMPTY: '',
      DOUBLE: 'first\nsecond\rthird', MULTILINE: 'first\nsecond',
      BACKTICK: 'fixture # literal', LITERAL: '${PROJECT}$(never-run) `never-run`',
      'DOTTED.KEY': 'last',
    });
  });

  test.each([
    ['PASSWORD="private-unclosed', /\.env\.local:2.*PASSWORD.*unterminated/],
    ["PASSWORD='private-closed' private-trailing", /\.env\.local:2.*PASSWORD.*closing quote/],
    ['  - private-orphan', /\.env\.local:2.*unknown.*comment/],
  ])('fails safely on malformed dotenv content %#', (line, diagnostic) => {
    expect(() => parseEnvContent(`# fixture\n${line}`, { filename: '.env.local' })).toThrow(diagnostic);
    try { parseEnvContent(`# fixture\n${line}`, { filename: '.env.local' }); }
    catch (error) { expect(error.message).not.toContain('private-'); }
  });

  test('preserves whitespace inside multiline quotes and accepts an empty colon assignment', () => {
    expect(parseEnvContent('EMPTY: \nPASSWORD="first  \n  second" # comment')).toEqual({
      EMPTY: '', PASSWORD: 'first  \n  second',
    });
  });

  test('rejects pasted prose with its line and preceding key, without exposing values', () => {
    // Same syntax as the parent .env.local: a colon assignment followed by a bullet.
    const content = '# fixture\nEXPO_PUBLIC_SENTRY_DSN: private-dsn\n  - private-prose\n';
    expect(() => parseEnvContent(content, { filename: '.env.local' })).toThrow(
      /\.env\.local:3.*EXPO_PUBLIC_SENTRY_DSN.*line 2.*comment.*#/s
    );
    try {
      parseEnvContent(content, { filename: '.env.local' });
    } catch (error) {
      expect(error.message).not.toMatch(/private-dsn|private-prose/);
    }
  });

  test('parses DB passwords with shell metacharacters without executing env content', () => {
    const parsed = parseEnvContent(`
SUPABASE_PROJECT_ID_SQLITE=segygjzpujphwvrubusm
SUPABASE_PROJECT_URL_SQLITE=https://segygjzpujphwvrubusm.supabase.co
SUPABASE_DB_PASSWORD_SQLITE=TD!PuwV2f^dBI
SUPABASE_PUBLISHABLE_KEY_SQLITE=sb_publishable_test
`);

    expect(parsed.SUPABASE_DB_PASSWORD_SQLITE).toBe('TD!PuwV2f^dBI');
  });

  test('requires every sqlite Supabase env var and checks URL/project match', () => {
    expect(() => validateSqliteEnv({
      SUPABASE_PROJECT_ID_SQLITE: 'segygjzpujphwvrubusm',
      SUPABASE_PROJECT_URL_SQLITE: 'https://different-ref.supabase.co',
      SUPABASE_DB_PASSWORD_SQLITE: 'secret',
      SUPABASE_PUBLISHABLE_KEY_SQLITE: 'sb_publishable_test',
    })).toThrow(/must be https:\/\/segygjzpujphwvrubusm\.supabase\.co/);

    expect(() => validateSqliteEnv({
      SUPABASE_PROJECT_ID_SQLITE: 'segygjzpujphwvrubusm',
      SUPABASE_PROJECT_URL_SQLITE: 'https://segygjzpujphwvrubusm.supabase.co',
      SUPABASE_DB_PASSWORD_SQLITE: 'secret',
    })).toThrow(/SUPABASE_PUBLISHABLE_KEY_SQLITE/);
  });

  test('rejects primary or malformed project URLs for sqlite staging commands', () => {
    expect(() => validateSqliteEnv({
      SUPABASE_PROJECT_ID_SQLITE: 'jcqrlwetutnpuchjoyyd',
      SUPABASE_PROJECT_URL_SQLITE: 'https://jcqrlwetutnpuchjoyyd.supabase.co',
      SUPABASE_DB_PASSWORD_SQLITE: 'secret',
      SUPABASE_PUBLISHABLE_KEY_SQLITE: 'sb_publishable_test',
    })).toThrow(/segygjzpujphwvrubusm/);

    expect(() => validateSqliteEnv({
      SUPABASE_PROJECT_ID_SQLITE: 'segygjzpujphwvrubusm',
      SUPABASE_PROJECT_URL_SQLITE: 'https://evil.example.com/segygjzpujphwvrubusm.supabase.co',
      SUPABASE_DB_PASSWORD_SQLITE: 'secret',
      SUPABASE_PUBLISHABLE_KEY_SQLITE: 'sb_publishable_test',
    })).toThrow(/must be https:\/\/segygjzpujphwvrubusm\.supabase\.co/);
  });

  test('maps sqlite env vars into Supabase and Expo command env without printing secrets', () => {
    const plan = buildCommandPlan('start', {
      SUPABASE_PROJECT_ID_SQLITE: 'segygjzpujphwvrubusm',
      SUPABASE_PROJECT_URL_SQLITE: 'https://segygjzpujphwvrubusm.supabase.co',
      SUPABASE_DB_PASSWORD_SQLITE: 'secret-password',
      SUPABASE_PUBLISHABLE_KEY_SQLITE: 'sb_publishable_test',
    });

    expect(plan.command).toBe('npx');
    expect(plan.args).toEqual(['expo', 'start', '--port', '8082']);
    expect(plan.env).toMatchObject({
      SUPABASE_DB_PASSWORD: 'secret-password',
      EXPO_PUBLIC_SUPABASE_TARGET: 'sqlite-staging',
      EXPO_PUBLIC_SUPABASE_PROJECT_ID: 'segygjzpujphwvrubusm',
      EXPO_PUBLIC_SUPABASE_URL: 'https://segygjzpujphwvrubusm.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_test',
    });
    expect(plan.safeSummary.join('\n')).not.toContain('secret-password');
    expect(plan.safeSummary.join('\n')).not.toContain('sb_publishable_test');
  });

  test('adds Android SDK tools to command env when the SDK is available', () => {
    const sdkRoot = '/Users/tester/Library/Android/sdk';
    const androidEnv = buildAndroidSdkEnv({
      env: { PATH: '/usr/bin' },
      homeDir: '/Users/tester',
      existsSync: (candidate) => candidate.startsWith(sdkRoot),
    });

    expect(androidEnv).toMatchObject({
      ANDROID_HOME: sdkRoot,
      ANDROID_SDK_ROOT: sdkRoot,
    });
    expect(androidEnv.PATH.split(':')).toEqual([
      `${sdkRoot}/emulator`,
      `${sdkRoot}/platform-tools`,
      '/usr/bin',
    ]);
  });

  test('android launcher uses the fixed sqlite staging Metro port', () => {
    const plan = buildCommandPlan('android', {
      SUPABASE_PROJECT_ID_SQLITE: 'segygjzpujphwvrubusm',
      SUPABASE_PROJECT_URL_SQLITE: 'https://segygjzpujphwvrubusm.supabase.co',
      SUPABASE_DB_PASSWORD_SQLITE: 'secret-password',
      SUPABASE_PUBLISHABLE_KEY_SQLITE: 'sb_publishable_test',
    });

    expect(plan.command).toBe('npx');
    expect(plan.args).toEqual(['expo', 'start', '--android', '--port', '8082']);
  });

  test('push command is non-interactive', () => {
    const plan = buildCommandPlan('db-push', {
      SUPABASE_PROJECT_ID_SQLITE: 'segygjzpujphwvrubusm',
      SUPABASE_PROJECT_URL_SQLITE: 'https://segygjzpujphwvrubusm.supabase.co',
      SUPABASE_DB_PASSWORD_SQLITE: 'secret-password',
      SUPABASE_PUBLISHABLE_KEY_SQLITE: 'sb_publishable_test',
    });

    expect(plan.command).toBe('supabase');
    expect(plan.args).toEqual(['--yes', 'db', 'push', '--linked']);
  });

  test('link command does not expose the database password as a process argument', () => {
    const plan = buildCommandPlan('link', {
      SUPABASE_PROJECT_ID_SQLITE: 'segygjzpujphwvrubusm',
      SUPABASE_PROJECT_URL_SQLITE: 'https://segygjzpujphwvrubusm.supabase.co',
      SUPABASE_DB_PASSWORD_SQLITE: 'secret-password',
      SUPABASE_PUBLISHABLE_KEY_SQLITE: 'sb_publishable_test',
    });

    expect(plan.command).toBe('supabase');
    expect(plan.args).toEqual([
      '--yes',
      'link',
      '--project-ref',
      'segygjzpujphwvrubusm',
    ]);
    expect(plan.args).not.toContain('secret-password');
    expect(plan.env.SUPABASE_DB_PASSWORD).toBe('secret-password');
  });
});

describe('sqlite staging command execution (offline)', () => {
  let cwd;
  let originalEnv;
  let output;
  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-staging-test-'));
    fs.mkdirSync(path.join(cwd, 'supabase'));
    fs.writeFileSync(path.join(cwd, 'supabase', 'checkout-marker'), 'preserve-checkout');
    fs.writeFileSync(path.join(cwd, '.env.local'), [
      'SUPABASE_PROJECT_ID_SQLITE=segygjzpujphwvrubusm',
      'SUPABASE_PROJECT_URL_SQLITE=https://segygjzpujphwvrubusm.supabase.co',
      'SUPABASE_DB_PASSWORD_SQLITE=fixture-db-password',
      'SUPABASE_PUBLISHABLE_KEY_SQLITE=fixture-publishable-key',
      'SUPABASE_PROJECT_URL=https://jcqrlwetutnpuchjoyyd.supabase.co',
      'SENTRY_AUTH_TOKEN=fixture-unrelated-secret',
      'SUPABASE_ACCESS_TOKEN=fixture-file-token',
    ].join('\n'));
    originalEnv = process.env;
    process.env = { PATH: '/usr/bin' };
    output = [];
    jest.spyOn(console, 'log').mockImplementation((value) => output.push(value));
    jest.spyOn(console, 'error').mockImplementation((value) => output.push(value));
    jest.spyOn(process.stdout, 'write').mockImplementation((value) => { output.push(String(value)); return true; });
    jest.spyOn(process.stderr, 'write').mockImplementation((value) => { output.push(String(value)); return true; });
    spawnSync.mockReset().mockReturnValue({ status: 0, stdout: '', stderr: '' });
  });
  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  test.each(['link', 'migration-list', 'db-push-dry-run', 'db-push', 'advisors', 'query'])(
    '%s isolates CLI cwd to one checkout symlink and removes only the temporary directory', (action) => {
      let cliCwd;
      spawnSync.mockImplementation((command, args, options) => {
        cliCwd = options.cwd;
        expect(command).toBe('supabase');
        expect(cliCwd).not.toBe(cwd);
        expect(fs.realpathSync(path.dirname(cliCwd))).toBe(fs.realpathSync(os.tmpdir()));
        expect(fs.readdirSync(cliCwd)).toEqual(['supabase']);
        const link = path.join(cliCwd, 'supabase');
        expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
        expect(fs.realpathSync(link)).toBe(fs.realpathSync(path.join(cwd, 'supabase')));
        expect(output).toContain('cli_cwd=isolated (symlink supabase -> <repo>/supabase; no env files)');
        return { status: 0, stdout: '', stderr: '' };
      });
      expect(runAction(action, { cwd, sql: 'select 1' })).toBe(0);
      expect(fs.existsSync(cliCwd)).toBe(false);
      expect(fs.readFileSync(path.join(cwd, 'supabase', 'checkout-marker'), 'utf8')).toBe('preserve-checkout');
    }
  );

  test.each(['link', 'migration-list', 'db-push-dry-run', 'db-push', 'advisors', 'query'])(
    '%s passes exactly the allowed inherited variables and staging mappings', (action) => {
      const allowed = {
        PATH: '/usr/bin', HOME: '/fixture/home', USER: 'fixture-user', LOGNAME: 'fixture-user',
        SHELL: '/bin/sh', TMPDIR: os.tmpdir(), TERM: 'xterm', LANG: 'en_US.UTF-8',
        LC_ALL: '', LC_CTYPE: 'UTF-8', HTTP_PROXY: 'http://fixture-proxy',
        HTTPS_PROXY: 'http://fixture-proxy', NO_PROXY: 'localhost',
        http_proxy: 'http://fixture-proxy', https_proxy: 'http://fixture-proxy',
        no_proxy: 'localhost', CI: 'true', SUPABASE_ACCESS_TOKEN: 'fixture-token',
      };
      const sdkRoot = path.join(cwd, 'android-sdk');
      fs.mkdirSync(path.join(sdkRoot, 'emulator'), { recursive: true });
      fs.mkdirSync(path.join(sdkRoot, 'platform-tools'));
      fs.writeFileSync(path.join(sdkRoot, 'emulator', 'emulator'), 'fixture');
      fs.writeFileSync(path.join(sdkRoot, 'platform-tools', 'adb'), 'fixture');
      process.env = {
        ...allowed,
        SUPABASE_PROJECT_ID: 'jcqrlwetutnpuchjoyyd', SUPABASE_PROJECT_REF: 'fixture-ref',
        SUPABASE_DB_URL: 'fixture-db-url', SUPABASE_URL: 'fixture-url',
        SUPABASE_ANON_KEY: 'fixture-anon', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-role',
        SUPABASE_SECRET_KEY: 'fixture-secret', SUPABASE_ENV: 'fixture-env',
        SUPABASE_WORKDIR: '/fixture/wrong-checkout', SUPABASE_DB_PASSWORD: 'fixture-wrong-password',
        ANDROID_HOME: sdkRoot, ANDROID_SDK_ROOT: sdkRoot,
        NODE_OPTIONS: '--fixture-option', UNRELATED_VARIABLE: 'fixture-unrelated',
      };
      fs.appendFileSync(path.join(cwd, '.env.local'), '\nSUPABASE_PROJECT_ID=jcqrlwetutnpuchjoyyd');
      spawnSync.mockImplementation((command, args, options) => {
        expect(options.env).toEqual({
          ...allowed,
          SUPABASE_DB_PASSWORD: 'fixture-db-password',
          EXPO_PUBLIC_SUPABASE_TARGET: 'sqlite-staging',
          EXPO_PUBLIC_SUPABASE_PROJECT_ID: 'segygjzpujphwvrubusm',
          EXPO_PUBLIC_SUPABASE_URL: 'https://segygjzpujphwvrubusm.supabase.co',
          EXPO_PUBLIC_SUPABASE_ANON_KEY: 'fixture-publishable-key',
        });
        expect(output).toContain('cli_env=allowlist (inherited SUPABASE_* dropped except SUPABASE_ACCESS_TOKEN)');
        return { status: 0, stdout: '', stderr: '' };
      });
      expect(runAction(action, { cwd, sql: 'select 1' })).toBe(0);
      expect(process.env.SUPABASE_PROJECT_ID).toBe('jcqrlwetutnpuchjoyyd');
      expect(output.join('\n')).not.toMatch(/fixture-token|fixture-secret|fixture-proxy|fixture-user|fixture-db-password/);
    }
  );

  test.each(['link', 'migration-list', 'db-push-dry-run', 'db-push', 'advisors', 'query'])(
    '%s cleans up its isolated cwd even when spawn throws', (action) => {
      let cliCwd;
      spawnSync.mockImplementation((command, args, options) => {
        cliCwd = options.cwd;
        expect(cliCwd).not.toBe(cwd);
        expect(fs.readdirSync(cliCwd)).toEqual(['supabase']);
        expect(fs.lstatSync(path.join(cliCwd, 'supabase')).isSymbolicLink()).toBe(true);
        expect(fs.realpathSync(path.join(cliCwd, 'supabase'))).toBe(fs.realpathSync(path.join(cwd, 'supabase')));
        throw new Error('fixture spawn failure');
      });
      expect(() => runAction(action, { cwd, sql: 'select 1' })).toThrow('fixture spawn failure');
      expect(fs.existsSync(cliCwd)).toBe(false);
      expect(fs.readFileSync(path.join(cwd, 'supabase', 'checkout-marker'), 'utf8')).toBe('preserve-checkout');
    }
  );

  test.each(['link', 'migration-list', 'db-push-dry-run', 'db-push', 'advisors', 'query'])(
    '%s omits empty tokens and missing allowlisted variables', (action) => {
      process.env.SUPABASE_ACCESS_TOKEN = '';
      expect(runAction(action, { cwd, sql: 'select 1' })).toBe(0);
      expect(spawnSync.mock.calls[0][2].env).toEqual({
        PATH: '/usr/bin', SUPABASE_DB_PASSWORD: 'fixture-db-password',
        EXPO_PUBLIC_SUPABASE_TARGET: 'sqlite-staging',
        EXPO_PUBLIC_SUPABASE_PROJECT_ID: 'segygjzpujphwvrubusm',
        EXPO_PUBLIC_SUPABASE_URL: 'https://segygjzpujphwvrubusm.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'fixture-publishable-key',
      });
    }
  );

  test('each invocation creates a fresh temporary directory', () => {
    expect(runAction('migration-list', { cwd })).toBe(0);
    expect(runAction('migration-list', { cwd })).toBe(0);
    const directories = spawnSync.mock.calls.map((call) => call[2].cwd);
    expect(new Set(directories).size).toBe(2);
    directories.forEach((directory) => expect(fs.existsSync(directory)).toBe(false));
  });

  test('removes the temporary directory if symlink creation fails before spawn', () => {
    const mkdir = jest.spyOn(fs, 'mkdtempSync');
    jest.spyOn(fs, 'symlinkSync').mockImplementation(() => { throw new Error('fixture symlink failure'); });
    expect(() => runAction('migration-list', { cwd })).toThrow('fixture symlink failure');
    expect(spawnSync).not.toHaveBeenCalled();
    expect(mkdir).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(mkdir.mock.results[0].value)).toBe(false);
    expect(fs.readFileSync(path.join(cwd, 'supabase', 'checkout-marker'), 'utf8')).toBe('preserve-checkout');
  });

  test('a relative invoking cwd still links to the correct checkout', () => {
    spawnSync.mockImplementation((command, args, options) => {
      expect(fs.realpathSync(path.join(options.cwd, 'supabase'))).toBe(fs.realpathSync(path.join(cwd, 'supabase')));
      return { status: 0, stdout: '', stderr: '' };
    });
    expect(runAction('migration-list', { cwd: path.relative(process.cwd(), cwd) })).toBe(0);
    expect(fs.existsSync(spawnSync.mock.calls[0][2].cwd)).toBe(false);
  });

  test.each(['start', 'ios', 'android'])('%s preserves the invoking cwd and inherited Expo environment', (action) => {
    process.env.SUPABASE_PROJECT_ID = 'fixture-inherited-project';
    process.env.SUPABASE_SECRET_KEY = 'fixture-inherited-secret';
    process.env.SUPABASE_ACCESS_TOKEN = '';
    process.env.EXPO_CUSTOM_SETTING = 'fixture-expo-setting';
    const { PATH: inheritedPath, ...inheritedEnv } = process.env;
    expect(runAction(action, { cwd })).toBe(0);
    expect(spawnSync.mock.calls[0][2]).toMatchObject({
      cwd, stdio: 'inherit', env: {
        ...inheritedEnv, EXPO_PUBLIC_SUPABASE_TARGET: 'sqlite-staging',
        SUPABASE_DB_PASSWORD: 'fixture-db-password',
      },
    });
    // Existing Expo SDK setup may prepend tool paths, but must retain the inherited PATH.
    expect(spawnSync.mock.calls[0][2].env.PATH.split(path.delimiter)).toContain(inheritedPath);
    expect(output.join('\n')).not.toMatch(/cli_cwd=|cli_env=/);
  });

  test('announces inherited token auth before link and explains Unauthorized recovery', () => {
    process.env.SUPABASE_ACCESS_TOKEN = 'fixture-stale-token';
    spawnSync.mockImplementation(() => {
      expect(output.join('\n')).toMatch(/auth_path=environment-token.*SUPABASE_ACCESS_TOKEN/);
      return { status: 1, stderr: 'Unauthorized', stdout: '' };
    });
    expect(() => runAction('link', { cwd })).toThrow(
      /Unauthorized.*unset SUPABASE_ACCESS_TOKEN.*refresh.*interactive.*supabase login/s
    );
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(output.join('\n')).not.toContain('fixture-stale-token');
  });

  test.each(['link', 'migration-list', 'db-push-dry-run', 'db-push', 'advisors', 'query'])(
    '%s reports auth before launch and gives actionable Unauthorized diagnostics without retrying', (action) => {
      process.env.SUPABASE_ACCESS_TOKEN = 'fixture-stale-token';
      spawnSync.mockImplementation(() => {
        expect(output.join('\n')).toContain('auth_path=environment-token');
        return { status: 1, stdout: 'Unauthorized', stderr: 'fixture-stale-token' };
      });
      expect(() => runAction(action, { cwd, sql: 'select 1' })).toThrow(/Unauthorized.*unset SUPABASE_ACCESS_TOKEN/s);
      expect(spawnSync).toHaveBeenCalledTimes(1);
      expect(fs.existsSync(spawnSync.mock.calls[0][2].cwd)).toBe(false);
      expect(spawnSync.mock.calls[0][2].env).toMatchObject({
        SUPABASE_ACCESS_TOKEN: 'fixture-stale-token', SUPABASE_DB_PASSWORD: 'fixture-db-password',
      });
      expect(spawnSync.mock.calls[0][2].env).not.toHaveProperty('SUPABASE_PROJECT_URL');
      expect(spawnSync.mock.calls[0][2].env).not.toHaveProperty('SENTRY_AUTH_TOKEN');
      expect(output.join('\n')).not.toMatch(/fixture-stale-token|fixture-file-token|fixture-db-password/);
    }
  );

  test.each([undefined, ''])('uses stored auth when the inherited token is absent or empty (%#)', (token) => {
    if (token !== undefined) process.env.SUPABASE_ACCESS_TOKEN = token;
    spawnSync.mockImplementation(() => {
      expect(output.join('\n')).toMatch(/auth_path=keychain.*non-interactively/);
      return { status: 1, stderr: 'HTTP 401', stdout: '' };
    });
    expect(() => runAction('migration-list', { cwd })).toThrow(/keychain.*interactive supabase login.*same terminal/s);
    expect(spawnSync.mock.calls[0][2].env).not.toHaveProperty('SUPABASE_ACCESS_TOKEN');
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  test.each(['check', 'link', 'migration-list', 'db-push-dry-run', 'db-push', 'advisors', 'query', 'start', 'ios', 'android'])(
    '%s rejects the real-file syntax defect before any subprocess', (action) => {
      fs.appendFileSync(path.join(cwd, '.env.local'), '\nEXPO_PUBLIC_SENTRY_DSN: private-dsn\n  - private-prose');
      expect(() => runAction(action, { cwd, sql: 'select 1' })).toThrow(/\.env\.local:9.*EXPO_PUBLIC_SENTRY_DSN.*line 8/s);
      expect(spawnSync).not.toHaveBeenCalled();
      expect(output).toEqual([]);
    }
  );

  test('preserves CLI output/status while redacting known secrets on both streams', () => {
    process.env.SUPABASE_ACCESS_TOKEN = 'fixture-stale-token';
    spawnSync.mockReturnValue({ status: 2, stdout: 'fixture-stale-token\nquery details\n', stderr: 'fixture-db-password\nconnection refused\n' });
    expect(runAction('query', { cwd, sql: 'select 1' })).toBe(2);
    expect(output.join('\n')).toMatch(/query details.*connection refused/s);
    expect(output.join('\n')).not.toMatch(/fixture-stale-token|fixture-db-password/);
  });

  test('does not mistake a successful query row containing Unauthorized or 401 for an auth failure', () => {
    spawnSync.mockReturnValue({ status: 0, stdout: 'Unauthorized\n401 rows\n', stderr: '' });
    expect(runAction('query', { cwd, sql: 'select 1' })).toBe(0);
    expect(output.join('\n')).toContain('401 rows');
  });

  test('a terminated child cannot be reported as success', () => {
    spawnSync.mockReturnValue({ status: null, signal: 'SIGTERM' });
    expect(runAction('migration-list', { cwd })).toBe(1);
    expect(fs.existsSync(spawnSync.mock.calls[0][2].cwd)).toBe(false);
  });

  test.each(['link', 'migration-list', 'db-push-dry-run', 'db-push', 'advisors', 'query'])(
    '%s still refuses the legacy project before launching the CLI', (action) => {
      fs.appendFileSync(path.join(cwd, '.env.local'), '\nSUPABASE_PROJECT_ID_SQLITE="jcqrlwetutnpuchjoyyd" # legacy');
      expect(() => runAction(action, { cwd, sql: 'select 1' })).toThrow(/must be segygjzpujphwvrubusm/);
      expect(spawnSync).not.toHaveBeenCalled();
    }
  );

  test('loads .env first and uses the parsed .env.local override without mutating inherited env', () => {
    fs.renameSync(path.join(cwd, '.env.local'), path.join(cwd, '.env'));
    fs.writeFileSync(path.join(cwd, '.env.local'), 'export SUPABASE_DB_PASSWORD_SQLITE = "override # = password" # note');
    expect(runAction('migration-list', { cwd })).toBe(0);
    expect(spawnSync.mock.calls[0][2].env.SUPABASE_DB_PASSWORD).toBe('override # = password');
    expect(process.env).toEqual({ PATH: '/usr/bin' });
    expect(output.join('\n')).not.toContain('override # = password');
  });

  test('handles Unauthorized in a spawn error without exposing its diagnostic contents', () => {
    process.env.SUPABASE_ACCESS_TOKEN = 'fixture-stale-token';
    spawnSync.mockReturnValue({ status: null, error: new Error('Unauthorized fixture-stale-token') });
    expect(() => runAction('link', { cwd })).toThrow(/Unauthorized.*unset SUPABASE_ACCESS_TOKEN/s);
    expect(output.join('\n')).not.toContain('fixture-stale-token');
  });

  test('redacts a non-auth spawn error and preserves its useful message', () => {
    process.env.SUPABASE_ACCESS_TOKEN = 'fixture-stale-token';
    spawnSync.mockReturnValue({ status: null, error: new Error('spawn ENOENT fixture-stale-token') });
    expect(() => runAction('link', { cwd })).toThrow('spawn ENOENT [redacted]');
    expect(fs.existsSync(spawnSync.mock.calls[0][2].cwd)).toBe(false);
  });

  test('check validates configuration without launching any process or announcing CLI auth', () => {
    expect(runAction('check', { cwd })).toBe(0);
    expect(spawnSync).not.toHaveBeenCalled();
    expect(output.join('\n')).not.toContain('auth_path=');
  });

  test.each(['start', 'ios', 'android'])('%s keeps Expo interactive and does not announce CLI auth', (action) => {
    expect(runAction(action, { cwd })).toBe(0);
    expect(spawnSync.mock.calls[0][2].stdio).toBe('inherit');
    expect(output.join('\n')).not.toContain('auth_path=');
  });
});
