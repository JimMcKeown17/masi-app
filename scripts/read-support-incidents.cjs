#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { createHash } = require('crypto');
const YAML = require('yaml');
const { loadEnvFiles, validateSqliteEnv } = require('./sqlite-staging.cjs');

const PROJECT_REF = 'segygjzpujphwvrubusm';
const DEFAULT_CONNECTION = `postgresql://postgres.${PROJECT_REF}@aws-1-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require`;
const ABBREVIATIONS = {
  upload_terminal: 'ut', upload_backlog_stale: 'bl', reconcile_breaker_tripped: 'rb',
  pull_failing: 'pf', app_error_caught: 'ae', ea_report: 'er', diagnostics_sent: 'dg',
  left_behind_unsent_work: 'lb', foreign_owner_in_file: 'fo', legacy_shared_file_unsent: 'ls',
};
const HELP = `Usage: node scripts/read-support-incidents.cjs [options]
  --json                    Machine-readable stdout (use direct node to avoid npm banners)
  --registry-ref <ref>       Committed registry, default origin/main
  --actor <id|email>         Display filter
  --kind <kind>             Display filter
  --since <ISO>             Display filter by receipt received_at
  --review-since <ISO>      Recorded receipts received after this boundary
  --fetch <handle>          Download latest bundle and companion screenshot
  --resolve <handle>        SELECT server row existence; existence is not convergence
  --help                    No database access
Access: .env then .env.local through sqlite-staging validation. psql uses the
SQLite DB password; only --fetch requires SUPABASE_SECRET_KEY_SQLITE for Storage.
Exit 0: successful read (attachments may be unavailable); 1: failed/unsupported
operation; 2: contested registry ownership. Filtered and targeted runs do not
claim full-sweep coverage. --review-since alone still enumerates all unrecorded.
Coverage is exact only for the unfiltered SQL statement snapshot. Caller supplies
previous boundary minus ten minutes once. This bounded overlap does not protect
against unlimited commit delay. Downloaded originals remain under gitignored paths.`;
const isoTime = value => {
  const match = typeof value === 'string' && value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!match || !Number.isFinite(Date.parse(value)) || +match[2] > 23 || +match[3] > 59 || +match[4] > 59) return false;
  const calendar = new Date(`${match[1]}T00:00:00Z`);
  return Number.isFinite(calendar.getTime()) && calendar.toISOString().slice(0, 10) === match[1];
};
// PostgreSQL timestamps retain microseconds; Date.parse alone rounds them down.
const instant = value => {
  if (typeof value !== 'string' || !isoTime(value)) throw new Error('Invalid receipt timestamp.');
  const match = value.match(/^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/);
  return BigInt(Date.parse(match[1] + match[3])) * 1000000n + BigInt((match[2] || '').padEnd(9, '0').slice(0, 9));
};
const compareTimes = (a, b) => {
  const left = instant(a); const right = instant(b);
  return left < right ? -1 : left > right ? 1 : 0;
};
const parseArgs = argv => {
  const options = { 'registry-ref': 'origin/main' }; const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!['--json', '--help', '--registry-ref', '--actor', '--kind', '--since', '--review-since', '--fetch', '--resolve'].includes(flag)
      || seen.has(flag)) throw new Error('Unknown or duplicate argument.');
    seen.add(flag);
    const key = flag.slice(2);
    if (key === 'json' || key === 'help') { options[key] = true; continue; }
    const value = argv[++i];
    if (!value || value.startsWith('-') || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Missing or malformed argument.');
    if (['since', 'review-since'].includes(key) && !isoTime(value)) throw new Error('Expected an ISO timestamp with timezone.');
    if (key === 'kind' && !Object.hasOwn(ABBREVIATIONS, value)) throw new Error('Unknown kind.');
    if (['fetch', 'resolve'].includes(key) && !/^(ut|bl|rb|pf|ae|er|dg|lb|fo|ls):(?:[a-f0-9]{8}|[a-f0-9]{12})$/.test(value)) throw new Error('Malformed condition handle.');
    options[key] = value;
  }
  return options;
};
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
  return { ...clean, PGPASSWORD: password, PGPASSFILE: os.devNull, PGSERVICEFILE: os.devNull,
    PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'masi-incident-reader',
    PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=10000' };
};
const SNAPSHOT_SQL = `SELECT jsonb_build_object(
  'snapshotAt', statement_timestamp(),
  'receipts', coalesce(jsonb_agg(to_jsonb(i) || jsonb_build_object(
    'email', a.email, 'first_name', u.first_name, 'last_name', u.last_name
  ) ORDER BY i.received_at, i.id), '[]'::jsonb)
)
FROM public.mobile_support_incidents i
LEFT JOIN auth.users a ON a.id = i.reporter_id
LEFT JOIN public.users u ON u.id = i.reporter_id;`;

const queryJson = (runner, psql, connection, childEnv, sql, variables = {}) => {
  const args = ['-X', '-w', '-v', 'ON_ERROR_STOP=1', '-Atq', '--dbname', connection];
  for (const [key, value] of Object.entries(variables)) args.push('-v', `${key}=${value}`);
  args.push('-f', '-');
  const result = runner(psql, args, {
    input: sql, encoding: 'utf8', env: childEnv, timeout: 60_000, maxBuffer: 256 * 1024 * 1024,
  });
  // Never forward database output on failures: it can contain credentials or row bodies.
  if (result.error || result.status !== 0 || result.signal) throw new Error('psql failed or exceeded process bounds.');
  try { return JSON.parse(result.stdout); }
  catch { throw new Error('Invalid or truncated psql JSON.'); }
};
const readRegistry = (cwd, ref, env, gitRunner) => {
  const git = args => {
    const result = gitRunner('git', args, { cwd, encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
      env: { PATH: env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull } });
    if (result.error || result.status !== 0 || result.signal) throw new Error('Registry Git ref read failed.');
    return result.stdout;
  };
  const commit = git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
  const files = git(['ls-tree', '-r', '--name-only', '-z', commit, '--', 'docs/bugs/records/']).split('\0')
    .filter(name => /^docs\/bugs\/records\/[^/]+\.md$/.test(name));
  return { commit, files: files.map(name => ({ name, body: git(['show', `${commit}:${name}`]) })) };
};
const signatureFor = (kind, payload) => {
  const pair = {
    upload_terminal: [payload.errorClass, payload.errorCode],
    pull_failing: [payload.scopeFamily, payload.failureKind],
    reconcile_breaker_tripped: [payload.scopeFamily, '-'],
    app_error_caught: [payload.errorName, typeof payload.messageDigest === 'string' ? payload.messageDigest.slice(0, 8) : null],
    upload_backlog_stale: ['-', '-'],
  }[kind];
  return pair?.every(value => typeof value === 'string' && value.length) ? `${kind}/${pair.join('/')}` : null;
};
const registryOwnership = (registry, diagnostic) => {
  const fields = { support_incident_keys: new Map(), support_incident_signatures: new Map(), field_report_ids: new Map() };
  for (const { body } of registry.files) {
    const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!match) continue;
    const document = YAML.parseDocument(match[1], { uniqueKeys: true });
    if (document.errors.length || !YAML.isMap(document.contents)) throw new Error('Invalid registry frontmatter.');
    const id = document.get('id');
    if (typeof id !== 'string' || !id) throw new Error('Registry record id missing.');
    for (const [field, owners] of Object.entries(fields)) {
      const values = document.get(field, true);
      if (values === undefined) continue;
      if (!YAML.isSeq(values) || (values.flow && values.items.length)) {
        diagnostic(`${field}: non-block declarations ignored.`); continue;
      }
      for (const item of values.items) {
        if (!YAML.isScalar(item) || typeof item.value !== 'string') throw new Error('Invalid registry declaration.');
        const value = item.value;
        if (!owners.has(value)) owners.set(value, new Set());
        owners.get(value).add(id);
      }
    }
  }
  return fields;
};
const matchOwnership = (conditions, fields) => conditions.map(condition => {
  const signature = signatureFor(condition.kind, condition.latestPayload);
  const exact = new Set(fields.support_incident_keys.get(condition.key) || []);
  if (condition.kind === 'ea_report') for (const id of fields.field_report_ids.get(condition.key) || []) exact.add(id);
  return { ...condition, signature, recordedBy: [...exact][0] ?? [...(fields.support_incident_signatures.get(signature) || [])][0] ?? null };
});
const ownershipConflicts = fields => {
  const conflicts = [];
  const keys = new Map();
  for (const [key, owners] of fields.support_incident_keys) keys.set(key, new Set(owners));
  for (const [key, owners] of fields.field_report_ids) {
    if (!key.includes('/ea_report/')) continue;
    if (!keys.has(key)) keys.set(key, new Set());
    for (const owner of owners) keys.get(key).add(owner);
  }
  for (const [field, values] of [['exact', keys], ['signature', fields.support_incident_signatures]]) {
    for (const [value, owners] of values) if (owners.size > 1) conflicts.push({ field, value, owners: [...owners].sort() });
  }
  return conflicts.sort((a, b) => a.value.localeCompare(b.value));
};
const conditionKey = row => `${row.reporter_id}/${row.kind}/${row.repeat_key}`;
const compareReceipts = (a, b) => compareTimes(a.received_at, b.received_at) || a.id.localeCompare(b.id);
const distinct = values => [...new Map(values.map(value => [JSON.stringify(value), value])).values()];
const knownTime = (rows, field, direction) => rows.map(row => row[field]).filter(value => Number.isFinite(Date.parse(value)))
  .sort((a, b) => direction * compareTimes(a, b))[0] ?? null;
const groupConditions = rows => {
  const groups = new Map();
  for (const row of rows) {
    const key = conditionKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups].map(([key, receipts]) => {
    receipts.sort(compareReceipts);
    const latest = receipts[receipts.length - 1];
    return { key, handle: `${ABBREVIATIONS[latest.kind]}:${createHash('sha256').update(key).digest('hex').slice(0, 8)}`,
      kind: latest.kind, reporterId: latest.reporter_id, ea: { id: latest.reporter_id, email: latest.email ?? null,
        name: [latest.first_name, latest.last_name].filter(Boolean).join(' ') || null },
      receiptCount: receipts.length, firstSeenAt: knownTime(receipts, 'first_seen_at', 1), latestSeenAt: knownTime(receipts, 'last_seen_at', -1),
      firstReceivedAt: receipts[0].received_at, latestReceivedAt: latest.received_at,
      latestOccurrenceCount: latest.schema_version === 1 ? null : latest.occurrence_count ?? null,
      observed: latest.observed ?? null, firstObserved: latest.first_observed ?? null, delivery: latest.delivery ?? null,
      releases: distinct(receipts.map(row => ({ version: row.observed?.application?.version ?? null, build: row.observed?.application?.build ?? null, updateId: row.observed?.update?.id ?? null }))),
      devices: distinct(receipts.map(row => row.observed?.device ?? null)),
      bundles: receipts.filter(row => row.bundle_path !== null && row.bundle_path !== undefined).map(row => ({ reportId: row.report_id ?? null, bundlePath: row.bundle_path, screenshotPath: row.screenshot_path ?? null, receivedAt: row.received_at })),
      latestPayload: latest.payload, recordedBy: null, receipts };
  });
};
const assignHandles = conditions => {
  const short = new Map();
  for (const condition of conditions) short.set(condition.handle, (short.get(condition.handle) || 0) + 1);
  const assigned = conditions.map(condition => short.get(condition.handle) > 1
    ? { ...condition, handle: `${ABBREVIATIONS[condition.kind]}:${createHash('sha256').update(condition.key).digest('hex').slice(0, 12)}` } : condition);
  if (new Set(assigned.map(condition => condition.handle)).size !== assigned.length) throw new Error('Ambiguous 12-hex condition handles.');
  return assigned;
};
const countByEA = conditions => {
  const breadth = new Map();
  for (const condition of conditions) breadth.set(condition.reporterId, (breadth.get(condition.reporterId) || 0) + 1);
  return breadth;
};
const selectConditions = (conditions, options, breadth) => {
  const tier = condition => condition.recordedBy ? 2 : condition.kind === 'ea_report' ? 0 : 1;
  return conditions.map(condition => ({ ...condition,
    reviewRequired: Boolean(condition.recordedBy && (!options['review-since'] || condition.receipts.some(row => compareTimes(row.received_at, options['review-since']) > 0))),
  })).filter(condition => (!condition.recordedBy || condition.reviewRequired)
    && (!options.actor || [condition.reporterId, condition.ea.email].includes(options.actor))
    && (!options.kind || condition.kind === options.kind)
    && (!options.since || condition.receipts.some(row => compareTimes(row.received_at, options.since) >= 0)))
    .sort((a, b) => tier(a) - tier(b) || breadth.get(b.reporterId) - breadth.get(a.reporterId)
      || a.reporterId.localeCompare(b.reporterId) || String(a.latestPayload.serverRecordId ?? '').localeCompare(String(b.latestPayload.serverRecordId ?? ''))
      || String(a.signature ?? '').localeCompare(String(b.signature ?? '')) || a.key.localeCompare(b.key));
};
const formatReport = report => [
  `Snapshot: ${report.snapshotAt}`,
  `Coverage: ${report.coverage.complete ? 'complete for this SQL snapshot' : `${report.coverage.reason}; no full coverage claim`}`,
  `Registry: ${report.registryRef} (${report.registryCommit})`,
  `Receipts: ${report.receiptCount}; conditions: ${report.conditionCount}; displayed: ${report.conditions.length}`,
  'Review overlap: caller supplies previous boundary minus ten minutes; unlimited commit delay can escape this window.',
  ...report.conditions.map(condition => `${condition.handle} ${condition.ea.email ?? condition.reporterId} ${condition.ea.name ?? ''}\n${JSON.stringify(condition, null, 2)}`),
  ...(report.fetch ? [`Fetch: ${JSON.stringify(report.fetch, null, 2)}`] : []),
  ...(report.resolve ? [`Resolve: ${JSON.stringify(report.resolve, null, 2)}`] : []),
].join('\n');
const findCondition = (conditions, handle) => {
  const matches = conditions.filter(condition => condition.handle === handle);
  if (matches.length !== 1) throw new Error('Unknown or ambiguous condition handle.');
  return matches[0];
};
// Deliberate Node-only subset of src/services/syncServerColumns.js. Identifiers
// never come from receipt text. Integration tests pin these against that source.
const RESOLVE_COLUMNS = {
  time_entries: ['id', 'user_id', 'sign_in_time', 'sign_out_time', 'auto_clocked_out', 'created_at', 'updated_at'],
  classes: ['id', 'school_id', 'created_by', 'archived_at', 'row_version', 'created_at', 'updated_at'],
  children: ['id', 'class_id', 'created_by', 'hidden_at', 'archived_at', 'row_version', 'created_at', 'updated_at'],
  child_ea_assignments: ['id', 'user_id', 'child_id', 'assigned_at', 'unassigned_at', 'created_by', 'row_version', 'created_at', 'updated_at'],
  child_programme_enrollments: ['id', 'child_id', 'programme_id', 'enrolled_at', 'ended_at', 'created_by', 'row_version', 'created_at', 'updated_at'],
  child_class_memberships: ['id', 'child_id', 'class_id', 'academic_year_id', 'enrolled_at', 'exited_at', 'created_by', 'row_version', 'created_at', 'updated_at'],
  class_ea_assignments: ['id', 'class_id', 'ea_user_id', 'programme_id', 'assigned_at', 'unassigned_at', 'row_version', 'created_at', 'updated_at'],
  grouping_versions: ['id', 'class_id', 'academic_year_id', 'status', 'archived_at', 'row_version', 'created_at', 'updated_at'],
  class_grouping_state: ['id', 'class_id', 'academic_year_id', 'class_list_status', 'active_grouping_version_id', 'row_version', 'created_at', 'updated_at'],
  groups: ['id', 'programme_id', 'class_id', 'grouping_version_id', 'archived_at', 'created_by', 'row_version', 'created_at', 'updated_at'],
  group_ea_assignments: ['id', 'group_id', 'ea_user_id', 'programme_id', 'assigned_at', 'unassigned_at', 'row_version', 'created_at', 'updated_at'],
  child_group_memberships: ['id', 'child_id', 'group_id', 'grouping_version_id', 'joined_at', 'removed_at', 'row_version', 'created_at', 'updated_at'],
  sessions: ['id', 'user_id', 'programme_id', 'class_id', 'group_id', 'session_date', 'started_at', 'ended_at', 'created_at', 'updated_at'],
  session_attendees: ['id', 'session_id', 'child_id', 'group_id', 'attendance_status', 'created_at', 'updated_at'],
  battery_runs: ['id', 'user_id', 'child_id', 'programme_id', 'class_id', 'battery_code', 'battery_version', 'status', 'started_at', 'completed_at', 'created_at', 'updated_at'],
  assessments: ['id', 'user_id', 'child_id', 'programme_id', 'assessment_tool_id', 'battery_run_id', 'assessment_date', 'created_at', 'updated_at'],
  assessment_items: ['id', 'assessment_id', 'item_key', 'position', 'created_at', 'updated_at'],
};
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const resolveRecord = (condition, query) => {
  const payload = condition.latestPayload;
  const base = { handle: condition.handle, table: payload.table ?? null, serverRecordId: payload.serverRecordId ?? null,
    limitation: 'Existence is not UI visibility, correct relationships, recovery, or convergence.' };
  if (condition.kind !== 'upload_terminal' || !Object.hasOwn(RESOLVE_COLUMNS, payload.table)) return { ...base, status: 'unsupported', reason: 'No record lookup mapping for this kind/table.' };
  if (typeof payload.serverRecordId !== 'string' || !UUID.test(payload.serverRecordId)) return { ...base, status: 'indeterminate', reason: 'Missing or invalid serverRecordId.' };
  const columns = RESOLVE_COLUMNS[payload.table].map(column => `"${column}"`).join(', ');
  const sql = `SELECT coalesce(jsonb_agg(to_jsonb(record)), '[]'::jsonb) FROM (SELECT ${columns} FROM public."${payload.table}" WHERE "id" = :'record_id'::uuid) record;`;
  try {
    const rows = query(sql, { record_id: payload.serverRecordId });
    if (!Array.isArray(rows) || rows.length > 1 || rows.some(row => !row || row.id !== payload.serverRecordId)) throw new Error('Unexpected lookup rows.');
    return { ...base, status: rows.length ? 'present' : 'absent', rows };
  } catch { return { ...base, status: 'indeterminate', reason: 'Server lookup failed or returned invalid JSON/rows.' }; }
};
const downloadDirectory = (cwd, handle) => {
  let directory = fs.realpathSync(cwd);
  for (const part of ['docs', 'bugs', 'user-submissions-bundles', handle]) {
    directory = path.join(directory, part);
    try { fs.mkdirSync(directory, { mode: 0o700 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe local evidence directory.');
  }
  return directory;
};
const fetchEvidence = async (condition, cwd, config, createClient) => {
  const selected = condition.receipts.filter(row => row.bundle_path != null).sort(compareReceipts).at(-1);
  if (!selected) return { status: 'unavailable', reason: 'No bundle-bearing receipt.', handle: condition.handle, reportId: null, files: [] };
  const validObject = object => typeof object === 'string' && object.startsWith(`${condition.reporterId}/`)
    && object.split('/').every(part => /^[a-z0-9._-]+$/i.test(part) && part !== '.' && part !== '..');
  if (!validObject(selected.bundle_path) || (selected.screenshot_path != null && !validObject(selected.screenshot_path))
    || !/^[a-z0-9_-]{1,128}$/i.test(selected.report_id || '')
    || path.posix.extname(selected.bundle_path).toLowerCase() !== '.json'
    || (selected.screenshot_path != null && !/^\.(?:jpe?g|png|heic|heif)$/i.test(path.posix.extname(selected.screenshot_path)))) throw new Error('Unsafe attachment path or format.');
  if (!config.SUPABASE_SECRET_KEY_SQLITE) throw new Error('SUPABASE_SECRET_KEY_SQLITE is required only for fetch.');
  const directory = downloadDirectory(cwd, condition.handle);
  const client = createClient(config.SUPABASE_PROJECT_URL_SQLITE, config.SUPABASE_SECRET_KEY_SQLITE, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const files = [];
  for (const [type, object] of [['bundle', selected.bundle_path], ['screenshot', selected.screenshot_path]]) {
    if (object == null) continue;
    const extension = type === 'bundle' ? '.json' : path.posix.extname(object);
    const filename = path.join(directory, `${type}-${selected.report_id}${extension}`);
    try {
      const { data, error } = await client.storage.from('support-bundles').download(object);
      if (error || !data) throw new Error('Download failed.');
      const bytes = Buffer.from(await data.arrayBuffer());
      const fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW, 0o600);
      try { fs.fchmodSync(fd, 0o600); fs.writeFileSync(fd, bytes); } finally { fs.closeSync(fd); }
      files.push({ type, status: 'downloaded', path: path.relative(cwd, filename) });
    } catch { files.push({ type, status: 'failed', reason: 'Storage download or local write failed.' }); }
  }
  return { handle: condition.handle, reportId: selected.report_id ?? null, status: files.every(file => file.status === 'downloaded') ? 'downloaded' : 'failed', files };
};

const runCli = async (argv, {
  cwd = process.cwd(), env = process.env, spawnSync: runner = spawnSync,
  psql, log = console.log, error = console.error,
  gitRunner = spawnSync,
  createStorageClient = (...args) => require('@supabase/supabase-js').createClient(...args),
} = {}) => {
  try {
    const options = parseArgs(argv);
    if (options.help) { log(options.json ? JSON.stringify({ help: HELP }) : HELP); return 0; }
    const config = validateSqliteEnv(loadEnvFiles(cwd));
    const connection = connectionFor(cwd);
    const childEnv = subprocessEnv(env, config.SUPABASE_DB_PASSWORD_SQLITE);
    error(`project_ref=${PROJECT_REF} access=psql-read-only`);
    const command = psql || resolvePsql(env);
    const query = (sql, variables) => queryJson(runner, command, connection, childEnv, sql, variables);
    const snapshot = query(SNAPSHOT_SQL);
    if (!snapshot || !Number.isFinite(Date.parse(snapshot.snapshotAt)) || !Array.isArray(snapshot.receipts)) throw new Error('Invalid snapshot.');
    if (snapshot.receipts.some(row => !row || typeof row.id !== 'string' || typeof row.reporter_id !== 'string'
      || !Object.hasOwn(ABBREVIATIONS, row.kind) || typeof row.repeat_key !== 'string'
      || !Number.isFinite(Date.parse(row.received_at)) || !row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload))) throw new Error('Invalid receipt row.');
    const registry = readRegistry(cwd, options['registry-ref'], env, gitRunner);
    const ownership = registryOwnership(registry, error);
    const conflicts = ownershipConflicts(ownership);
    if (conflicts.length) {
      log(options.json ? JSON.stringify({ snapshotAt: snapshot.snapshotAt, coverage: { complete: false, reason: 'contested registry ownership' }, conflicts }) : `Snapshot: ${snapshot.snapshotAt}\nContested registry ownership; no coverage claim.\n${JSON.stringify(conflicts)}`);
      return 2;
    }
    const conditions = matchOwnership(assignHandles(groupConditions(snapshot.receipts)), ownership);
    const breadth = countByEA(conditions);
    const filtered = Boolean(options.actor || options.kind || options.since);
    const targeted = Boolean(options.fetch || options.resolve);
    const report = { ...snapshot, receiptCount: snapshot.receipts.length, conditionCount: conditions.length,
      coverage: { complete: !filtered && !targeted, reason: filtered ? 'filtered' : targeted ? 'targeted' : 'complete SQL statement snapshot', snapshotAt: snapshot.snapshotAt,
        limit: 'Ten-minute caller-supplied overlap is bounded; unlimited commit delay can escape the review window.' },
      registryRef: options['registry-ref'], registryCommit: registry.commit, reviewSince: options['review-since'] ?? null,
      breadthByEA: [...breadth].sort(([a], [b]) => a.localeCompare(b)).map(([reporterId, conditionCount]) => ({ reporterId, conditionCount })),
      conditions: selectConditions(conditions, options, breadth) };
    if (options.fetch) report.fetch = await fetchEvidence(findCondition(conditions, options.fetch), cwd, config, createStorageClient);
    if (options.resolve) report.resolve = resolveRecord(findCondition(conditions, options.resolve), query);
    log(options.json ? JSON.stringify(report) : formatReport(report));
    return report.fetch?.status === 'failed' || ['indeterminate', 'unsupported'].includes(report.resolve?.status) ? 1 : 0;
  } catch { error('Incident read failed; no coverage claim.'); return 1; }
};
if (require.main === module) runCli(process.argv.slice(2)).then(code => { process.exitCode = code; });
module.exports = { runCli };
