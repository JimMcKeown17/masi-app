#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parse: parseDotenv } = require('dotenv');
const { KNOWN_SUPABASE_PROJECTS } = require('../config/supabaseProjectConfig');

const SQLITE_PROJECT_ID = KNOWN_SUPABASE_PROJECTS['sqlite-staging'];
const SQLITE_STAGING_METRO_PORT = '8082';

const SUPABASE_INHERITED_ENV_ALLOWLIST = [
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'TERM', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'CI',
];

const REQUIRED_ENV = [
  'SUPABASE_PROJECT_ID_SQLITE',
  'SUPABASE_PROJECT_URL_SQLITE',
  'SUPABASE_DB_PASSWORD_SQLITE',
  'SUPABASE_PUBLISHABLE_KEY_SQLITE',
];

const ACTIONS = new Set([
  'check',
  'link',
  'migration-list',
  'db-push-dry-run',
  'db-push',
  'advisors',
  'query',
  'start',
  'ios',
  'android',
]);

const parseEnvContent = (content, { filename = '.env' } = {}) => {
  const parsed = {};
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  let previousKey;
  let previousLine;
  const fail = (line, key, detail) => {
    const error = new Error(`Cannot parse ${filename}:${line} (key ${key || '[unknown]'}): ${detail}. Values are not shown.`);
    error.name = 'EnvConfigParseError';
    throw error;
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trimStart();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^(?:export[ \t]+)?([\w.-]+)[ \t]*(?:=[ \t]*|:[ \t]+)(.*)$/);
    if (!match) {
      fail(index + 1, previousKey, `expected KEY=value or KEY: value${previousKey ? ` after the assignment at line ${previousLine}` : ''}; comment prose with #`);
    }

    const key = match[1];
    const startLine = index + 1;
    let value = match[2];
    // dotenv.parse deliberately ignores malformed lines. Validate the complete record
    // first so skipped prose/unclosed quotes cannot reach the CLI's own dotenv loader.
    if (/^["'`]/.test(value)) {
      let quoted;
      while (!(quoted = value.match(/^("(?:\\"|[^"])*"|'(?:\\'|[^'])*'|`(?:\\`|[^`])*`)(.*)$/s))) {
        if (++index >= lines.length) fail(startLine, key, 'unterminated quoted value');
        value += `\n${lines[index]}`;
      }
      if (!/^[ \t]*(?:#.*)?$/.test(quoted[2])) {
        fail(index + 1, key, 'expected end of line or # comment after the closing quote');
      }
    }

    // Parse data only: never source the file, expand variables, or populate process.env.
    const record = parseDotenv(`VALUE=${value}`);
    Object.defineProperty(parsed, key, {
      value: record.VALUE, enumerable: true, writable: true, configurable: true,
    });
    previousKey = key;
    previousLine = startLine;
  }

  return parsed;
};

const loadEnvFiles = (cwd = process.cwd()) => {
  const env = {};
  for (const filename of ['.env', '.env.local']) {
    const filePath = path.join(cwd, filename);
    if (fs.existsSync(filePath)) {
      Object.assign(env, parseEnvContent(fs.readFileSync(filePath, 'utf8'), { filename }));
    }
  }
  return env;
};

const validateSqliteEnv = (env) => {
  for (const key of REQUIRED_ENV) {
    if (!env[key]) {
      throw new Error(`${key} is required for SQLite staging commands.`);
    }
  }

  if (env.SUPABASE_PROJECT_ID_SQLITE !== SQLITE_PROJECT_ID) {
    throw new Error(
      `SUPABASE_PROJECT_ID_SQLITE must be ${SQLITE_PROJECT_ID} for SQLite staging commands.`
    );
  }

  const expectedUrl = `https://${SQLITE_PROJECT_ID}.supabase.co`;
  if (env.SUPABASE_PROJECT_URL_SQLITE.replace(/\/+$/, '') !== expectedUrl) {
    throw new Error(
      `SUPABASE_PROJECT_URL_SQLITE must be ${expectedUrl}.`
    );
  }

  return env;
};

const unique = (values) => [...new Set(values.filter(Boolean))];

const buildAndroidSdkEnv = ({
  env = process.env,
  homeDir = os.homedir(),
  existsSync = fs.existsSync,
} = {}) => {
  const candidateRoots = unique([
    env.ANDROID_HOME,
    env.ANDROID_SDK_ROOT,
    path.join(homeDir, 'Library', 'Android', 'sdk'),
  ]);
  const sdkRoot = candidateRoots.find((candidate) => (
    existsSync(path.join(candidate, 'emulator', 'emulator')) &&
    existsSync(path.join(candidate, 'platform-tools', 'adb'))
  ));

  if (!sdkRoot) {
    return {};
  }

  const toolPaths = [
    path.join(sdkRoot, 'emulator'),
    path.join(sdkRoot, 'platform-tools'),
  ];

  return {
    ANDROID_HOME: env.ANDROID_HOME || sdkRoot,
    ANDROID_SDK_ROOT: env.ANDROID_SDK_ROOT || sdkRoot,
    PATH: unique([...toolPaths, env.PATH]).join(path.delimiter),
  };
};

const buildCommandEnv = (env) => ({
  SUPABASE_DB_PASSWORD: env.SUPABASE_DB_PASSWORD_SQLITE,
  EXPO_PUBLIC_SUPABASE_TARGET: 'sqlite-staging',
  EXPO_PUBLIC_SUPABASE_PROJECT_ID: env.SUPABASE_PROJECT_ID_SQLITE,
  EXPO_PUBLIC_SUPABASE_URL: env.SUPABASE_PROJECT_URL_SQLITE,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: env.SUPABASE_PUBLISHABLE_KEY_SQLITE,
});

const buildCommandPlan = (action, env, options = {}) => {
  validateSqliteEnv(env);
  const commandEnv = buildCommandEnv(env);
  if (['start', 'ios', 'android'].includes(action)) {
    Object.assign(commandEnv, buildAndroidSdkEnv());
  }
  const safeSummary = [
    `target=sqlite-staging`,
    `project_ref=${env.SUPABASE_PROJECT_ID_SQLITE}`,
    `project_url=${env.SUPABASE_PROJECT_URL_SQLITE}`,
    'db_password=[redacted]',
    'publishable_key=[redacted]',
  ];

  switch (action) {
    case 'link':
      return {
        command: 'supabase',
        args: [
          '--yes',
          'link',
          '--project-ref',
          env.SUPABASE_PROJECT_ID_SQLITE,
        ],
        env: commandEnv,
        safeSummary,
      };
    case 'migration-list':
      return {
        command: 'supabase',
        args: ['migration', 'list', '--linked'],
        env: commandEnv,
        safeSummary,
      };
    case 'db-push-dry-run':
      return {
        command: 'supabase',
        args: ['db', 'push', '--linked', '--dry-run'],
        env: commandEnv,
        safeSummary,
      };
    case 'db-push':
      return {
        command: 'supabase',
        args: ['--yes', 'db', 'push', '--linked'],
        env: commandEnv,
        safeSummary,
      };
    case 'advisors':
      return {
        command: 'supabase',
        args: ['db', 'advisors', '--linked', '--level', 'warn'],
        env: commandEnv,
        safeSummary,
      };
    case 'query':
      // Run an ad-hoc SQL statement against masi-app-sqlite ONLY (--linked resolves it; the
      // clean command env never carries the legacy connection). For read-only preflights,
      // verification, and disposable-data cleanup — NOT for DDL/schema changes (use migrations).
      if (!options.sql) {
        throw new Error('sqlite staging "query" requires a SQL string, e.g. `node scripts/sqlite-staging.cjs query "select 1"`');
      }
      return {
        command: 'supabase',
        args: ['db', 'query', '--linked', options.sql],
        env: commandEnv,
        safeSummary,
      };
    case 'start':
      return {
        command: 'npx',
        args: ['expo', 'start', '--port', SQLITE_STAGING_METRO_PORT],
        env: commandEnv,
        safeSummary,
      };
    case 'ios':
      return {
        command: 'npx',
        args: ['expo', 'start', '--ios', '--port', SQLITE_STAGING_METRO_PORT],
        env: commandEnv,
        safeSummary,
      };
    case 'android':
      return {
        command: 'npx',
        args: ['expo', 'start', '--android', '--port', SQLITE_STAGING_METRO_PORT],
        env: commandEnv,
        safeSummary,
      };
    default:
      throw new Error(`Unknown sqlite staging action "${action}".`);
  }
};

const runAction = (action, { cwd = process.cwd(), sql } = {}) => {
  if (!ACTIONS.has(action)) {
    throw new Error(`Unknown sqlite staging action "${action}".`);
  }

  const env = validateSqliteEnv(loadEnvFiles(cwd));

  if (action === 'check') {
    console.log('SQLite Supabase staging configuration OK');
    console.log(`target=sqlite-staging`);
    console.log(`project_ref=${env.SUPABASE_PROJECT_ID_SQLITE}`);
    console.log(`project_url=${env.SUPABASE_PROJECT_URL_SQLITE}`);
    console.log('db_password=[redacted]');
    console.log('publishable_key=[redacted]');
    return 0;
  }

  const plan = buildCommandPlan(action, env, { sql });
  console.log(plan.safeSummary.join('\n'));

  const isSupabase = plan.command === 'supabase';
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const childEnv = isSupabase ? {
    ...Object.fromEntries(SUPABASE_INHERITED_ENV_ALLOWLIST
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]])),
    ...(accessToken ? { SUPABASE_ACCESS_TOKEN: accessToken } : {}),
    ...plan.env,
  } : { ...process.env, ...plan.env };
  if (isSupabase) {
    console.log('cli_cwd=isolated (symlink supabase -> <repo>/supabase; no env files)');
    console.log('cli_env=allowlist (inherited SUPABASE_* dropped except SUPABASE_ACCESS_TOKEN)');
    console.log(accessToken
      ? 'auth_path=environment-token (inherited SUPABASE_ACCESS_TOKEN; overrides stored login)'
      : 'auth_path=keychain (stored CLI login; may be unavailable non-interactively)');
    // An empty inherited value must not mask stored CLI credentials.
    if (!accessToken) delete childEnv.SUPABASE_ACCESS_TOKEN;
  }

  let cliCwd;
  let result;
  try {
    if (isSupabase) {
      // The CLI loads dotenv files from its cwd even when --linked/--workdir is used.
      // Expose only the invoking checkout's Supabase project, never its root env files.
      cliCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-sqlite-staging-'));
      fs.symlinkSync(path.resolve(cwd, 'supabase'), path.join(cliCwd, 'supabase'), 'dir');
    }
    result = spawnSync(plan.command, plan.args, {
      cwd: cliCwd || cwd,
      env: childEnv,
      // Inspect CLI diagnostics before displaying them. Expo keeps its interactive streams.
      stdio: isSupabase ? ['inherit', 'pipe', 'pipe'] : 'inherit',
      ...(isSupabase ? { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 } : {}),
    });
  } finally {
    // rmSync removes the symlink itself; it does not traverse its checkout target.
    if (cliCwd) fs.rmSync(cliCwd, { recursive: true, force: true });
  }

  const redact = (text) => [accessToken, env.SUPABASE_DB_PASSWORD_SQLITE, env.SUPABASE_PUBLISHABLE_KEY_SQLITE]
    .filter(Boolean).reduce((safe, secret) => safe.split(secret).join('[redacted]'), String(text || ''));
  if (isSupabase) {
    const diagnostics = `${result.stdout || ''}\n${result.stderr || ''}\n${result.error?.message || ''}`;
    if (/\bUnauthorized\b|\b401\b/i.test(diagnostics) && (result.status !== 0 || result.error)) {
      throw new Error('Supabase CLI Unauthorized (401). '
        + (accessToken
          ? 'The inherited environment token overrides stored login. Run unset SUPABASE_ACCESS_TOKEN to use keychain auth, or refresh SUPABASE_ACCESS_TOKEN with a valid access token. '
          : 'The keychain/stored CLI login was rejected or is unavailable in this non-interactive shell. ')
        + 'Run an interactive supabase login with SUPABASE_ACCESS_TOKEN unset, then retry in that same terminal; for non-interactive use, supply a refreshed SUPABASE_ACCESS_TOKEN. No automatic retry was attempted.');
    }
    if (result.stdout) process.stdout.write(redact(result.stdout));
    if (result.stderr) process.stderr.write(redact(result.stderr));
  }

  if (result.error) {
    throw isSupabase ? new Error(redact(result.error.message)) : result.error;
  }

  return result.status ?? 1;
};

if (require.main === module) {
  try {
    const action = process.argv[2] || 'check';
    process.exitCode = runAction(action, { sql: process.argv[3] });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  buildAndroidSdkEnv,
  buildCommandPlan,
  loadEnvFiles,
  parseEnvContent,
  runAction,
  validateSqliteEnv,
};
