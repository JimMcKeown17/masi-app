const fs = require('fs');
const os = require('os');
const path = require('path');
const PROJECT_REF = 'segygjzpujphwvrubusm';
const DEFAULT_CONNECTION = `postgresql://postgres.${PROJECT_REF}@aws-1-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require`;
const connectionFor = cwd => {
  const filename = path.join(cwd, 'supabase/.temp/pooler-url');
  const raw = fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8').trim() : DEFAULT_CONNECTION;
  let url;
  try { url = new URL(raw); } catch { throw new Error('Invalid checkout pooler URL.'); }
  if (url.protocol !== 'postgresql:' || url.username !== `postgres.${PROJECT_REF}` || url.password
    || !/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)
    || url.port !== '5432' || url.pathname !== '/postgres' || url.hash
    || [...url.searchParams.keys()].some(key => key !== 'sslmode')
    || url.searchParams.getAll('sslmode').length > 1
    || (url.search && url.searchParams.get('sslmode') !== 'require')) throw new Error('SQLite session pooler target refused.');
  url.searchParams.set('sslmode', 'require');
  return url.toString();
};
const resolvePsql = env => {
  for (const candidate of [...(env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, 'psql')), '/opt/homebrew/opt/libpq/bin/psql']) {
    try { fs.accessSync(candidate, fs.constants.X_OK); return candidate; } catch { /* next installed executable */ }
  }
  throw new Error('Install psql on PATH or /opt/homebrew/opt/libpq/bin/psql.');
};
const subprocessEnv = (env, password) => {
  if (password.includes('\0')) throw new Error('Invalid staging password.');
  // Do not inherit routing, service or alternate credential files from libpq.
  const clean = Object.fromEntries(['PATH', 'LANG', 'LC_ALL', 'TMPDIR'].filter(key => env[key] !== undefined).map(key => [key, env[key]]));
  // No PGOPTIONS: the Supabase session pooler silently ignores startup options
  // (verified 2026-10-30), so read-only mode and timeouts live in the transaction.
  return { ...clean, PGPASSWORD: password, PGPASSFILE: os.devNull, PGSERVICEFILE: os.devNull,
    PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'masi-incident-reader' };
};
// Every query runs in a READ ONLY transaction. The guard aborts before the read
// unless the database itself reports read-only, and the reported value is
// printed first so the caller can check it too. ROLLBACK: nothing is kept.
const READ_ONLY_PROOF = 'transaction_read_only=on';
const readOnlyScript = sql => [
  'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;',
  "SET LOCAL statement_timeout = '30s';",
  "SET LOCAL lock_timeout = '10s';",
  "DO $guard$ BEGIN IF current_setting('transaction_read_only') <> 'on' THEN RAISE EXCEPTION 'incident reader transaction is not read-only'; END IF; END $guard$;",
  "SELECT 'transaction_read_only=' || current_setting('transaction_read_only');",
  sql,
  'ROLLBACK;',
].join('\n');
const queryJson = (runner, psql, connection, childEnv, sql, variables = {}) => {
  const args = ['-X', '-w', '-v', 'ON_ERROR_STOP=1', '-Atq', '--dbname', connection];
  for (const [key, value] of Object.entries(variables)) args.push('-v', `${key}=${value}`);
  args.push('-f', '-');
  const result = runner(psql, args, {
    input: readOnlyScript(sql), encoding: 'utf8', env: childEnv, timeout: 60_000, maxBuffer: 256 * 1024 * 1024,
  });
  // Never forward database output on failures: it can contain credentials or row bodies.
  if (result.error || result.status !== 0 || result.signal) throw new Error('psql failed or exceeded process bounds.');
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const newline = stdout.indexOf('\n');
  if (newline < 0 || stdout.slice(0, newline) !== READ_ONLY_PROOF) throw new Error('Database did not confirm a read-only transaction.');
  try { return JSON.parse(stdout.slice(newline + 1)); }
  catch { throw new Error('Invalid or truncated psql JSON.'); }
};
module.exports = { PROJECT_REF, connectionFor, resolvePsql, subprocessEnv, READ_ONLY_PROOF, readOnlyScript, queryJson };
