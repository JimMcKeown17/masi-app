#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync: spawnProcess } = require('node:child_process');
const { parseEnvContent } = require('./sqlite-staging.cjs');

const PROJECT_REF = 'segygjzpujphwvrubusm';
const LEGACY_REF = 'jcqrlwetutnpuchjoyyd';
const DEFAULT_HOST = 'aws-1-eu-west-2.pooler.supabase.com';

const parseArgs = (argv) => {
  const [action, ...flags] = argv;
  if (!['status', 'suspend', 'restore'].includes(action)) {
    throw new Error('Expected status, suspend or restore.');
  }
  const options = { action, apply: false };
  const seen = new Set();
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (!['--email', '--reason', '--operator', '--apply'].includes(flag) || seen.has(flag)) {
      throw new Error('Unknown or duplicate flag. Use --email, --reason, --operator and optional --apply.');
    }
    seen.add(flag);
    if (flag === '--apply') options.apply = true;
    else {
      const value = flags[++index];
      if (!value || value.startsWith('--') || value.includes('\0') || !value.trim()) {
        throw new Error(`${flag} requires a nonempty value.`);
      }
      options[flag.slice(2)] = value.trim();
    }
  }
  if (!options.email || !/^[^\s@]+@[^\s@]+$/.test(options.email)) {
    throw new Error('--email requires an exact email address.');
  }
  if (action === 'status') {
    if (options.apply || options.reason || options.operator) throw new Error('status accepts only --email.');
  } else {
    for (const [key, max] of [['reason', 1000], ['operator', 200]]) {
      if (!options[key] || [...options[key]].length > max) {
        throw new Error(`--${key} must contain 1-${max} characters.`);
      }
    }
  }
  return options;
};

const assertSqliteTarget = ({ projectRef, host, user, url = '' }) => {
  if ([projectRef, host, user, url].some(value => String(value).toLowerCase().includes(LEGACY_REF))) {
    throw new Error('Legacy Supabase project refused.');
  }
  if (projectRef !== PROJECT_REF || user !== `postgres.${PROJECT_REF}`
    || !/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)) {
    throw new Error('EA access requires the masi-app-sqlite IPv4 session pooler and postgres role.');
  }
  if (url) {
    const expected = `postgresql://${user}@${host}:5432/postgres?sslmode=require`;
    if (url !== expected) throw new Error('Unexpected EA access connection URL.');
  }
};

const buildConnectionString = ({ host = DEFAULT_HOST, projectRef = PROJECT_REF, user = `postgres.${PROJECT_REF}` } = {}) => {
  assertSqliteTarget({ projectRef, host, user });
  const url = `postgresql://${user}@${host}:5432/postgres?sslmode=require`;
  assertSqliteTarget({ projectRef, host, user, url });
  return url;
};

const isSuspensionConfirmed = (state, now = Date.now()) => state?.is_active === false
  && Date.parse(state.banned_until) > now + 24 * 60 * 60 * 1000;

const resolvePsql = (env) => {
  const candidates = [...(env.PATH || '').split(path.delimiter).filter(Boolean)
    .map(directory => path.join(directory, 'psql')), '/opt/homebrew/opt/libpq/bin/psql'];
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch { /* Try the next installed psql. */ }
  }
  throw new Error('psql is required on PATH or at /opt/homebrew/opt/libpq/bin/psql.');
};

const READ_BY_EMAIL = `BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('id', a.id)), '[]'::jsonb)
FROM auth.users a CROSS JOIN LATERAL private.ea_access_status(a.id) s
WHERE lower(a.email) = lower(:'email');
ROLLBACK;`;
const READ_BY_ID = `BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT to_jsonb(s) || jsonb_build_object('id', :'user_id'::uuid)
FROM private.ea_access_status(:'user_id'::uuid) s;
ROLLBACK;`;
const WRITE_SQL = {
  suspend: `BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
SELECT to_jsonb(e) FROM private.suspend_ea(:'user_id'::uuid, :'reason', :'operator') e;
COMMIT;`,
  restore: `BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
SELECT to_jsonb(e) FROM private.restore_ea(:'user_id'::uuid, :'reason', :'operator') e;
COMMIT;`,
};

const runCli = (argv, {
  cwd = process.cwd(), env = process.env, spawnSync = spawnProcess, log = console.log,
  psql, now = Date.now,
} = {}) => {
  const options = parseArgs(argv);
  const connection = buildConnectionString({ host: env.MASI_DB_POOLER_HOST || DEFAULT_HOST });
  const filePath = path.join(cwd, '.env.local');
  if (!fs.existsSync(filePath)) throw new Error('.env.local with SUPABASE_DB_PASSWORD_SQLITE is required.');
  const fileEnv = parseEnvContent(fs.readFileSync(filePath, 'utf8'), { filename: '.env.local' });
  const password = fileEnv.SUPABASE_DB_PASSWORD_SQLITE;
  if (!password || password.includes('\0')) throw new Error('SUPABASE_DB_PASSWORD_SQLITE is required in .env.local.');
  const redact = value => [password, JSON.stringify(password).slice(1, -1)]
    .reduce((text, secret) => text.split(secret).join('[redacted]'), String(value));
  const print = value => log(redact(JSON.stringify(value)));
  try {
    const command = psql || resolvePsql(env);
    // Discard inherited libpq routing/service/options variables and all Supabase credentials.
    const childEnv = Object.fromEntries(['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TMPDIR']
      .filter(key => env[key] !== undefined).map(key => [key, env[key]]));
    Object.assign(childEnv, { PGPASSWORD: password, PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'masi-ea-access' });
    const query = (sql, variables) => {
      const args = ['-X', '-w', '-v', 'ON_ERROR_STOP=1', '-Atq', '--dbname', connection];
      for (const [key, value] of Object.entries(variables)) args.push('-v', `${key}=${value}`);
      // psql expands :'variables' in stdin scripts, not SQL passed with -c.
      args.push('-f', '-');
      const result = spawnSync(command, args, {
        input: sql, encoding: 'utf8', env: childEnv, timeout: 60_000, maxBuffer: 1024 * 1024,
      });
      if (result.error || result.status !== 0) {
        throw new Error(`psql failed: ${result.stderr || result.error?.message || 'non-zero exit'}`);
      }
      try { return JSON.parse(result.stdout.trim()); }
      catch { throw new Error('psql returned an unexpected result; no confirmation available.'); }
    };
    print({ project_ref: PROJECT_REF, action: options.action, mode: options.apply ? 'apply' : 'dry_run' });
    const matches = query(READ_BY_EMAIL, { email: options.email });
    if (!Array.isArray(matches) || matches.length !== 1) {
      throw new Error(matches?.length > 1 ? 'Ambiguous email: more than one Auth user matches.' : 'No Auth user matches that email.');
    }
    const target = matches[0];
    print({ target });
    if (options.action === 'status') return 0;
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(target.id)
      || typeof target.is_active !== 'boolean') throw new Error('Target has no valid EA profile.');
    if (options.action === 'restore' && target.latest_event?.action !== 'suspend') {
      throw new Error('restore_not_available: latest audit event must be a suspension.');
    }
    print({ would_change: {
      banned_until: options.action === 'suspend' ? 'server now() + 876000 hours' : null,
      is_active: options.action === 'suspend' ? false : target.restore_is_active,
      audit_action: options.action, reason: options.reason, operator: options.operator,
    } });
    if (!options.apply) return 0;
    const event = query(WRITE_SQL[options.action], {
      user_id: target.id, reason: options.reason, operator: options.operator,
    });
    const after = query(READ_BY_ID, { user_id: target.id });
    print({ event, after });
    const confirmed = after?.latest_event?.id === event?.id
      && event?.user_id === target.id && event?.action === options.action
      && (options.action === 'suspend'
        ? isSuspensionConfirmed(after, now())
        : after.banned_until === null && after.is_active === event.is_active_after);
    if (!confirmed) throw new Error('read_back_unconfirmed: inspect ea:status before another action; the transaction may have committed.');
    print({ confirmed: true });
    return 0;
  } catch (error) {
    throw new Error(redact(error.message));
  }
};

if (require.main === module) {
  try { process.exitCode = runCli(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { PROJECT_REF, parseArgs, assertSqliteTarget, buildConnectionString, isSuspensionConfirmed, runCli };
