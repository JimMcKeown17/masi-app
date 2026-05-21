#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { KNOWN_SUPABASE_PROJECTS } = require('../config/supabaseProjectConfig');

const SQLITE_PROJECT_ID = KNOWN_SUPABASE_PROJECTS['sqlite-staging'];
const SQLITE_STAGING_METRO_PORT = '8082';

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
  'start',
  'ios',
  'android',
]);

const parseEnvContent = (content) => {
  const parsed = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const line = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[match[1]] = value;
  }

  return parsed;
};

const loadEnvFiles = (cwd = process.cwd()) => {
  const env = {};
  for (const filename of ['.env', '.env.local']) {
    const filePath = path.join(cwd, filename);
    if (fs.existsSync(filePath)) {
      Object.assign(env, parseEnvContent(fs.readFileSync(filePath, 'utf8')));
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
  ...buildAndroidSdkEnv(),
});

const buildCommandPlan = (action, env) => {
  validateSqliteEnv(env);
  const commandEnv = buildCommandEnv(env);
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

const runAction = (action, { cwd = process.cwd() } = {}) => {
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

  const plan = buildCommandPlan(action, env);
  console.log(plan.safeSummary.join('\n'));

  const result = spawnSync(plan.command, plan.args, {
    cwd,
    env: {
      ...process.env,
      ...plan.env,
    },
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 0;
};

if (require.main === module) {
  try {
    const action = process.argv[2] || 'check';
    process.exitCode = runAction(action);
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
