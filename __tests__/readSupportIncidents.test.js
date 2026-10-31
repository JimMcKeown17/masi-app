/** @jest-environment-options {"customExportConditions":["node","node-addons"]} */
global.__MASI_NO_DEFAULT_HANDLE__ = true;
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const identityFixture = require('../test-support/fixtures/fieldDiagnosticsIdentity.json');

const readerPath = path.join(__dirname, '../scripts/read-support-incidents.cjs');
const PROJECT = 'segygjzpujphwvrubusm';
const SNAPSHOT = '2026-10-29T16:00:00.000Z';
const ACTOR = '13000000-0000-0000-0000-000000000001';
const receipt = (overrides = {}) => ({
  id: '23000000-0000-0000-0000-000000000001', reporter_id: ACTOR,
  kind: 'upload_terminal', repeat_key: 'install:condition',
  schema_version: 2, report_id: '33000000-0000-0000-0000-000000000001',
  report_generation: 1, occurrence_count: 2,
  first_seen_at: '2026-10-20T12:00:00Z', last_seen_at: '2026-10-28T12:00:00Z',
  received_at: '2026-10-29T12:00:00Z', email: 'fixture@example.invalid',
  first_name: 'Fixture', last_name: 'EA',
  observed: { application: { version: '1.4.0', build: '54' }, update: { id: null }, device: { modelName: 'A03s' } },
  first_observed: {}, delivery: { application: { version: '1.5.0' } },
  payload: { table: 'children', recordId: 'local-id', serverRecordId: '43000000-0000-0000-0000-000000000001', errorClass: 'terminal', errorCode: '23503' },
  bundle_path: null, screenshot_path: null, ...overrides,
});
let cwd;
const git = (...args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull, GIT_AUTHOR_NAME: 'Reader fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Reader fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' } });
  if (result.status !== 0) throw new Error(`Fixture git failed: ${result.stderr}`);
  return result.stdout.trim();
};
const commitRegistry = (records = {}) => {
  fs.mkdirSync(path.join(cwd, 'docs/bugs/records'), { recursive: true });
  for (const [name, body] of Object.entries(records)) fs.writeFileSync(path.join(cwd, 'docs/bugs/records', `${name}.md`), body);
  git('add', 'docs'); git('commit', '--allow-empty', '-qm', 'Synthetic registry');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
};
const record = (id, fields = '', prose = '') => `---\nid: ${id}\n${fields}\n---\n${prose}\n`;
// psql prints the database's read-only confirmation before the JSON result.
const psqlOut = value => `transaction_read_only=on\n${typeof value === 'string' ? value : JSON.stringify(value)}`;
beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-reader-'));
  fs.writeFileSync(path.join(cwd, '.env.local'), [
    `SUPABASE_PROJECT_ID_SQLITE=${PROJECT}`,
    `SUPABASE_PROJECT_URL_SQLITE=https://${PROJECT}.supabase.co`,
    "SUPABASE_DB_PASSWORD_SQLITE='fixture-password'",
    'SUPABASE_PUBLISHABLE_KEY_SQLITE=fixture-public',
  ].join('\n'));
  git('init', '-q');
  fs.mkdirSync(path.join(cwd, 'docs/bugs'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'docs/bugs/README.md'), 'Synthetic registry\n');
  commitRegistry();
});
afterEach(() => fs.rmSync(cwd, { recursive: true, force: true }));
const run = async (rows = [], argv = [], extra = {}) => {
  const output = []; const diagnostics = [];
  const runner = jest.fn(() => ({ status: 0, stdout: psqlOut({ snapshotAt: SNAPSHOT, receipts: rows }) }));
  const code = await require(readerPath).runCli(['--json', ...argv], {
    cwd, env: { PATH: process.env.PATH }, psql: '/fixture/psql', spawnSync: runner,
    log: text => output.push(text), error: text => diagnostics.push(text), ...extra,
  });
  return { code, output, diagnostics, runner, data: output.length ? JSON.parse(output[0]) : null };
};

test('one complete SQL snapshot joins both identities and enumerates over 1,000 receipts', async () => {
  expect(fs.existsSync(readerPath)).toBe(true);
  const rows = Array.from({ length: 1201 }, (_, i) => receipt({ id: String(i), repeat_key: `install:${i}` }));
  const result = await run(rows);
  expect(result.code).toBe(0);
  expect(result.runner).toHaveBeenCalledTimes(1);
  const [, args, options] = result.runner.mock.calls[0];
  expect(args).toEqual(expect.arrayContaining(['-X', '-w', '-Atq', 'ON_ERROR_STOP=1', '-f', '-']));
  const data = options.input.slice(options.input.indexOf('SELECT jsonb_build_object('), options.input.lastIndexOf('ROLLBACK;'));
  expect(data.match(/;/g)).toHaveLength(1);
  expect(options.input).toMatch(/statement_timestamp\(\)/);
  expect(options.input).toMatch(/LEFT JOIN auth.users/);
  expect(options.input).toMatch(/LEFT JOIN public.users/);
  expect(options.input).not.toMatch(/\b(?:WHERE|LIMIT|OFFSET)\b/i);
  expect(result.data).toMatchObject({ snapshotAt: SNAPSHOT, coverage: { complete: true }, receiptCount: 1201 });
  expect(result.data.receipts).toHaveLength(1201);
});

test('a failed psql process cannot turn plausible partial JSON into coverage or expose secrets', async () => {
  const result = await run([], [], { spawnSync: () => ({ status: 1, stdout: psqlOut({ snapshotAt: SNAPSHOT, receipts: [] }), stderr: 'fixture-password private-server-detail' }) });
  expect(result.code).toBe(1);
  expect(result.output).toEqual([]);
  expect(result.diagnostics.join(' ')).not.toMatch(/fixture-password|private-server-detail/);
});

test('help needs no credentials and malformed options fail before any subprocess', async () => {
  fs.unlinkSync(path.join(cwd, '.env.local'));
  const help = await run([], ['--help']);
  expect(help.code).toBe(0);
  expect(help.runner).not.toHaveBeenCalled();
  expect(help.data.help).toContain('--registry-ref');
});

test.each([
  ['--unknown'], ['--json'], ['--actor'], ['--kind', 'invented'], ['--since', 'yesterday'],
  ['--review-since', '2026-10-29'], ['--fetch', '../../escape'], ['--registry-ref', '-bad'],
  ['--since', '2026-02-30T12:00:00Z'], ['--review-since', '2026-10-29T24:00:00Z'],
])('rejects malformed arguments before psql: %j', async (...argv) => {
  const result = await run([], argv);
  expect(result.code).toBe(1);
  expect(result.runner).not.toHaveBeenCalled();
});

test('validates the checkout session pooler and removes hostile inherited libpq routing', async () => {
  fs.mkdirSync(path.join(cwd, 'supabase/.temp'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'supabase/.temp/pooler-url'), `postgresql://postgres.${PROJECT}@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`);
  const result = await run([], [], { env: { PATH: process.env.PATH, HOME: '/hostile-home', PGHOSTADDR: 'evil', PGSERVICE: 'evil', PGOPTIONS: '-c role=evil', PGPASSWORD: 'wrong', SUPABASE_SECRET_KEY_SQLITE: 'do-not-inherit' } });
  expect(result.code).toBe(0);
  const [, args, options] = result.runner.mock.calls[0];
  expect(args[args.indexOf('--dbname') + 1]).toBe(`postgresql://postgres.${PROJECT}@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require`);
  expect(options.env).toMatchObject({ PGPASSWORD: 'fixture-password', PGCONNECT_TIMEOUT: '10' });
  // The session pooler ignores startup options, so none are sent; the transaction carries them.
  expect(options.env).not.toHaveProperty('PGOPTIONS');
  expect(options.env).not.toHaveProperty('PGHOSTADDR');
  expect(options.env).not.toHaveProperty('PGSERVICE');
  expect(options.env).not.toHaveProperty('HOME');
  expect(options.env).not.toHaveProperty('SUPABASE_SECRET_KEY_SQLITE');
  expect(options.timeout).toBe(60000);
  expect(args.join(' ')).not.toContain('fixture-password');
});

test.each([
  `postgresql://postgres.jcqrlwetutnpuchjoyyd@aws-1-eu-west-2.pooler.supabase.com:5432/postgres`,
  `postgresql://postgres.${PROJECT}@db.${PROJECT}.supabase.co:5432/postgres`,
  `postgresql://postgres.${PROJECT}@aws-1-eu-west-2.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres.${PROJECT}@aws-1-eu-west-2.pooler.supabase.com:5432/other`,
  `postgresql://postgres.${PROJECT}@aws-1-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=disable`,
  `postgresql://postgres.${PROJECT}:secret@aws-1-eu-west-2.pooler.supabase.com:5432/postgres`,
])('refuses unsafe checkout routing before psql %#', async connection => {
  fs.mkdirSync(path.join(cwd, 'supabase/.temp'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'supabase/.temp/pooler-url'), connection);
  const result = await run();
  expect(result.code).toBe(1);
  expect(result.runner).not.toHaveBeenCalled();
  expect(result.diagnostics.join(' ')).not.toContain('secret');
});

test.each(['', 'SUPABASE_PROJECT_ID_SQLITE=jcqrlwetutnpuchjoyyd', 'BROKEN="private-unclosed'])('fails safely on missing, legacy or malformed staging configuration %#', async config => {
  fs.writeFileSync(path.join(cwd, '.env.local'), config);
  const result = await run();
  expect(result.code).toBe(1);
  expect(result.runner).not.toHaveBeenCalled();
  expect(result.diagnostics.join(' ')).not.toContain('private-unclosed');
});

test('dotenv shell syntax stays literal password data and an empty set is an exact snapshot', async () => {
  const password = '${NO_EXPANSION}$(touch /never-run) `never-run`';
  fs.appendFileSync(path.join(cwd, '.env.local'), `\nSUPABASE_DB_PASSWORD_SQLITE='${password}'`);
  const result = await run();
  expect(result.code).toBe(0);
  expect(result.runner.mock.calls[0][2].env.PGPASSWORD).toBe(password);
  expect(result.data).toMatchObject({ snapshotAt: SNAPSHOT, receipts: [], coverage: { complete: true }, receiptCount: 0 });
  expect(result.output.join(' ') + result.diagnostics.join(' ')).not.toContain(password);
});

test.each([
  { status: 0, stdout: psqlOut('{"snapshotAt":') },
  { status: 0, stdout: psqlOut('{}') },
  { status: 0, stdout: psqlOut('{"snapshotAt":"bad","receipts":[]}') },
  { status: null, error: new Error('ETIMEDOUT fixture-password') },
  { status: 0, error: new Error('ENOBUFS'), stdout: psqlOut('{"snapshotAt":"2026-10-29T16:00:00Z","receipts":[]}') },
])('invalid or bounded-process results cannot claim coverage %#', async processResult => {
  const result = await run([], [], { spawnSync: () => processResult });
  expect(result.code).toBe(1);
  expect(result.output).toEqual([]);
  expect(result.diagnostics.join(' ')).not.toContain('fixture-password');
});

test('every psql script reads inside a READ ONLY transaction that the database confirms first', async () => {
  const rows = [receipt()]; const handle = (await run(rows)).data.conditions[0].handle;
  const runner = jest.fn().mockReturnValueOnce({ status: 0, stdout: psqlOut({ snapshotAt: SNAPSHOT, receipts: rows }) }).mockReturnValueOnce({ status: 0, stdout: psqlOut('[]') });
  const result = await run(rows, ['--resolve', handle], { spawnSync: runner });
  expect(result.code).toBe(0);
  expect(runner).toHaveBeenCalledTimes(2);
  for (const [, , options] of runner.mock.calls) {
    const lines = options.input.split('\n');
    expect(lines[0]).toBe('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;');
    expect(lines).toEqual(expect.arrayContaining(["SET LOCAL statement_timeout = '30s';", "SET LOCAL lock_timeout = '10s';"]));
    const guard = options.input.indexOf("IF current_setting('transaction_read_only') <> 'on' THEN RAISE EXCEPTION");
    const proof = options.input.indexOf("SELECT 'transaction_read_only=' || current_setting('transaction_read_only');");
    const read = options.input.search(/SELECT (?:jsonb_build_object|coalesce)\(/);
    expect(guard).toBeGreaterThan(0);
    expect(proof).toBeGreaterThan(guard);
    expect(read).toBeGreaterThan(proof);
    expect(options.input.trimEnd().endsWith('ROLLBACK;')).toBe(true);
    expect(options.input).not.toMatch(/\bCOMMIT\b/i);
    expect(options.env).not.toHaveProperty('PGOPTIONS');
  }
});

test.each([
  ['the database reports a writable transaction', `transaction_read_only=off\n${JSON.stringify({ snapshotAt: SNAPSHOT, receipts: [] })}`],
  ['the confirmation line is missing', JSON.stringify({ snapshotAt: SNAPSHOT, receipts: [] })],
  ['only the confirmation arrives', 'transaction_read_only=on'],
  ['the proof text arrives on the second line', `NOTICE: something\ntransaction_read_only=on\n${JSON.stringify({ snapshotAt: SNAPSHOT, receipts: [] })}`],
  ['the proof line carries extra text', `transaction_read_only=on trailing\n${JSON.stringify({ snapshotAt: SNAPSHOT, receipts: [] })}`],
  ['two result documents follow the proof', `transaction_read_only=on\n${JSON.stringify({ snapshotAt: SNAPSHOT, receipts: [] })}\n${JSON.stringify({ snapshotAt: SNAPSHOT, receipts: [] })}`],
])('a read the database did not confirm as read-only fails closed: %s', async (_, stdout) => {
  const result = await run([], [], { spawnSync: () => ({ status: 0, stdout }) });
  expect(result.code).toBe(1);
  expect(result.output).toEqual([]);
});

test('malformed receipt rows fail the entire snapshot instead of quietly omitting them', async () => {
  const result = await run([receipt(), { id: 'partial-row' }]);
  expect(result.code).toBe(1);
  expect(result.output).toEqual([]);
});

test('uses the selected Git ref and accepts empty records, ignoring working-copy claims and prose', async () => {
  const key = `${ACTOR}/upload_terminal/install:condition`;
  fs.writeFileSync(path.join(cwd, 'docs/bugs/records/uncommitted.md'), record('MA-BUG-WORKING', `support_incident_keys:\n  - ${key}`));
  const result = await run([receipt()]);
  expect(result.code).toBe(0);
  expect(result.data.conditions).toHaveLength(1);
  expect(result.data.conditions[0]).toMatchObject({ key, recordedBy: null, receiptCount: 1 });
  expect(result.data.registryRef).toBe('origin/main');
});

test('exact keys precede signatures, EA reports use actor-qualified field ids, and other refs are isolated', async () => {
  const key = `${ACTOR}/upload_terminal/install:condition`;
  const humanKey = `${ACTOR}/ea_report/install:human`;
  commitRegistry({
    exact: record('MA-BUG-EXACT', `support_incident_keys:\n  - ${key}\nfield_report_ids:\n  - ${humanKey}`),
    broad: record('MA-BUG-BROAD', 'support_incident_signatures:\n  - upload_terminal/terminal/23503'),
    prose: record('MA-BUG-PROSE', 'support_incident_keys: []', `support_incident_keys:\n  - ${ACTOR}/diagnostics_sent/install:manual`),
  });
  const selected = git('rev-parse', 'HEAD');
  commitRegistry({ other: record('MA-BUG-OTHER', `support_incident_keys:\n  - ${ACTOR}/diagnostics_sent/install:manual`) });
  const result = await run([receipt(), receipt({ kind: 'ea_report', repeat_key: 'install:human' }), receipt({ kind: 'diagnostics_sent', repeat_key: 'install:manual' })], ['--registry-ref', selected]);
  expect(result.code).toBe(0);
  const byKind = Object.fromEntries(result.data.conditions.map(c => [c.kind, c]));
  expect(byKind.upload_terminal.recordedBy).toBe('MA-BUG-EXACT');
  expect(byKind.ea_report.recordedBy).toBe('MA-BUG-EXACT');
  expect(byKind.diagnostics_sent.recordedBy).toBeNull();
});

test.each(['support_incident_signatures', 'support_incident_keys'])('contested %s aborts with exit 2 even with an exact match or empty display', async field => {
  const key = `${ACTOR}/upload_terminal/install:condition`;
  const value = field === 'support_incident_keys' ? key : 'upload_terminal/terminal/23503';
  commitRegistry({ a: record('MA-BUG-A', `${field}:\n  - ${value}\n${field === 'support_incident_keys' ? '' : `support_incident_keys:\n  - ${key}`}`), b: record('MA-BUG-B', `${field}:\n  - ${value}`) });
  const result = await run([receipt()], ['--actor', 'nobody']);
  expect(result.code).toBe(2);
  expect(result.data.coverage.complete).toBe(false);
  expect(result.data.conflicts).toHaveLength(1);
});

test('groups restored generations by condition, retains observed provenance, and uses receipt id to break latest ties', async () => {
  const result = await run([
    receipt({ id: 'z', payload: { marker: 'latest' }, occurrence_count: 3 }),
    receipt({ id: 'a', report_generation: 2, occurrence_count: 50, observed: { application: { version: '1.3.0' }, device: { modelName: 'Other' } }, last_seen_at: '2026-10-27T12:00:00Z' }),
    receipt({ id: 'legacy', kind: 'foreign_owner_in_file', repeat_key: 'install:old', schema_version: 1, observed: null, first_observed: null, delivery: null, first_seen_at: null, last_seen_at: null }),
  ]);
  const current = result.data.conditions.find(c => c.kind === 'upload_terminal');
  expect(current).toMatchObject({ receiptCount: 2, latestPayload: { marker: 'latest' }, firstSeenAt: '2026-10-20T12:00:00Z', latestSeenAt: '2026-10-28T12:00:00Z', latestOccurrenceCount: 3 });
  expect(current.releases).toEqual(expect.arrayContaining([{ version: '1.4.0', build: '54', updateId: null }, { version: '1.3.0', build: null, updateId: null }]));
  expect(current.releases).not.toContainEqual(expect.objectContaining({ version: '1.5.0' }));
  expect(current.devices).toHaveLength(2);
  const legacy = result.data.conditions.find(c => c.kind === 'foreign_owner_in_file');
  expect(legacy).toMatchObject({ firstSeenAt: null, latestSeenAt: null, latestOccurrenceCount: null, observed: null, firstObserved: null, delivery: null, signature: null });
  expect(legacy.releases).toEqual([{ version: null, build: null, updateId: null }]);
  expect(legacy.handle).toMatch(/^fo:/);
});

test('review selection uses receipt time, preserves all unrecorded conditions, and filters never claim coverage', async () => {
  const key = `${ACTOR}/upload_terminal/install:condition`;
  commitRegistry({ a: record('MA-BUG-A', `support_incident_keys:\n  - ${key}`) });
  const rows = [receipt({ last_seen_at: '2020-01-01T00:00:00Z' }), receipt({ kind: 'ea_report', repeat_key: 'install:human', received_at: '2026-10-01T00:00:00Z' }), receipt({ kind: 'pull_failing', repeat_key: 'install:pull' })];
  const review = await run(rows, ['--review-since', '2026-10-29T11:50:00Z']);
  expect(review.data.coverage.complete).toBe(true);
  expect(review.data.conditions.map(c => c.kind)).toEqual(['ea_report', 'pull_failing', 'upload_terminal']);
  expect(review.data.conditions[2].reviewRequired).toBe(true);
  const after = await run(rows, ['--review-since', '2026-10-29T12:00:00Z']);
  expect(after.data.conditions.map(c => c.kind)).toEqual(['ea_report', 'pull_failing']);
  const overlap = await run(rows, ['--review-since', '2026-10-29T11:55:00Z']);
  expect(overlap.data.conditions).toHaveLength(3);
  for (const flags of [['--actor', 'nobody'], ['--kind', 'diagnostics_sent'], ['--since', '2027-01-01T00:00:00Z']]) {
    const filtered = await run(rows, flags);
    expect(filtered.data).toMatchObject({ snapshotAt: SNAPSHOT, receiptCount: 3, coverage: { complete: false, reason: 'filtered' }, conditions: [] });
    expect(filtered.data.receipts).toHaveLength(3);
  }
});

test('eight-hex handle collisions lengthen both handles deterministically', async () => {
  // Real SHA-256 collision at eight hex, discovered deterministically from synthetic keys.
  const { createHash } = require('crypto'); const seen = new Map(); let pair;
  for (let i = 0; !pair && i < 300000; i++) {
    const repeat = `install:collision-${i}`;
    const hash = createHash('sha256').update(`${ACTOR}/upload_terminal/${repeat}`).digest('hex');
    if (seen.has(hash.slice(0, 8))) pair = [seen.get(hash.slice(0, 8)), { repeat, hash }];
    else seen.set(hash.slice(0, 8), { repeat, hash });
  }
  expect(pair).toBeDefined();
  const result = await run(pair.map(item => receipt({ repeat_key: item.repeat })));
  expect(result.data.conditions.map(c => c.handle).sort()).toEqual(pair.map(item => `ut:${item.hash.slice(0, 12)}`).sort());
  const reversed = await run(pair.slice().reverse().map(item => receipt({ repeat_key: item.repeat })));
  expect(reversed.data.conditions.map(c => c.handle)).toEqual(result.data.conditions.map(c => c.handle));
});

test('frontmatter block lists alone declare ownership; prose, comments, fenced text and inline lists do not', async () => {
  const key = `${ACTOR}/upload_terminal/install:condition`;
  commitRegistry({
    inline: record('MA-BUG-INLINE', `support_incident_keys: ["${key}"]\nsupport_incident_signatures: []`),
    comment: record('MA-BUG-COMMENT', `# support_incident_keys:\n#   - ${key}\nunknown_field:\n  - ${key}`, `\n\x60\x60\x60yaml\nsupport_incident_keys:\n  - ${key}\n\x60\x60\x60`),
  });
  const result = await run([receipt()]);
  expect(result.code).toBe(0);
  expect(result.data.conditions[0].recordedBy).toBeNull();
  expect(result.diagnostics.join(' ')).toMatch(/non-block declarations ignored/);
});

test('invalid registry refs and malformed frontmatter fail instead of becoming an empty registry', async () => {
  const invalid = await run([], ['--registry-ref', 'missing-ref']);
  expect(invalid.code).toBe(1);
  expect(invalid.data).toBeNull();
  commitRegistry({ bad: '---\nid: MA-BUG-BAD\nsupport_incident_keys: [unclosed\n---\n' });
  expect((await run()).code).toBe(1);
});

test('all ten kinds have the ruled abbreviations and only the five machine families have signatures', async () => {
  const kinds = ['upload_terminal', 'upload_backlog_stale', 'reconcile_breaker_tripped', 'pull_failing', 'app_error_caught', 'ea_report', 'diagnostics_sent', 'left_behind_unsent_work', 'foreign_owner_in_file', 'legacy_shared_file_unsent'];
  const abbreviations = ['ut', 'bl', 'rb', 'pf', 'ae', 'er', 'dg', 'lb', 'fo', 'ls'];
  const { message: raw, messageDigest: digest } = identityFixture.messages[0];
  const result = await run(kinds.map(kind => receipt({ kind, payload: { errorClass: 'terminal', errorCode: '23503', scopeFamily: 'session_history', failureKind: 'query', errorName: 'Error', message: raw, messageDigest: digest } })));
  const byKind = Object.fromEntries(result.data.conditions.map(c => [c.kind, c]));
  kinds.forEach((kind, i) => expect(byKind[kind].handle.startsWith(`${abbreviations[i]}:`)).toBe(true));
  expect(kinds.map(kind => byKind[kind].signature)).toEqual(['upload_terminal/terminal/23503', 'upload_backlog_stale/-/-', 'reconcile_breaker_tripped/session_history/-', 'pull_failing/session_history/query', `app_error_caught/Error/${digest.slice(0, 8)}`, null, null, null, null, null]);
  expect(byKind.app_error_caught.latestPayload.message).toBe(raw);
});

test.each(identityFixture.messages)('shared R-O8 vectors preserve raw evidence and use the producer digest: $messageDigest', async vector => {
  const result = await run([{
    ...identityFixture.storageRow,
    payload: { ...identityFixture.envelope.payload, message: vector.message, messageDigest: vector.messageDigest },
  }]);
  expect(result.code).toBe(0);
  const [condition] = result.data.conditions;
  expect(condition.signature).toBe(`app_error_caught/Error/${vector.messageDigest.slice(0, 8)}`);
  expect(condition.latestPayload).toMatchObject({ message: vector.message, messageDigest: vector.messageDigest });
});

test('shared R-O9 identity preserves the condition, report generation and observed release through the reader', async () => {
  const { storageRow: row, envelope, report, releaseIdentity } = identityFixture;
  const result = await run([row]);
  expect(result.code).toBe(0);
  const [condition] = result.data.conditions;
  expect(condition.key).toBe(`${row.reporter_id}/${envelope.kind}/${envelope.repeat_key}`);
  expect(condition.releases).toEqual([releaseIdentity]);
  expect(condition.observed).toEqual(envelope.observed);
  expect(condition.firstObserved).toEqual(envelope.first_observed);
  expect(condition.delivery).toEqual(envelope.delivery);
  expect(condition.receipts[0]).toMatchObject({ report_id: report.reportId, report_generation: report.generation });
  expect(condition.bundles).toEqual([{
    reportId: report.reportId, bundlePath: envelope.bundle_path,
    screenshotPath: envelope.screenshot_path, receivedAt: row.received_at,
  }]);
});

test('fetch downloads the latest bundle-bearing receipt with its own companion screenshot and report id', async () => {
  const rows = [
    receipt({ id: 'a', report_id: 'report-a', bundle_path: `${ACTOR}/bundle-a.json`, screenshot_path: `${ACTOR}/shot-a.png` }),
    receipt({ id: 'z', report_id: 'report-z', bundle_path: `${ACTOR}/bundle-z.json`, screenshot_path: `${ACTOR}/shot-z.heic` }),
    receipt({ id: 'newer', received_at: '2026-10-29T13:00:00Z', bundle_path: null, screenshot_path: `${ACTOR}/unpaired.jpg` }),
  ];
  const first = await run(rows); const handle = first.data.conditions[0].handle;
  const downloads = jest.fn(async object => ({ data: { arrayBuffer: async () => Buffer.from(object.endsWith('.json') ? '{"capture":"raw"}' : 'original-heic') }, error: null }));
  const from = jest.fn(() => ({ download: downloads }));
  const factory = jest.fn(() => ({ storage: { from } }));
  fs.appendFileSync(path.join(cwd, '.env.local'), '\nSUPABASE_SECRET_KEY_SQLITE=fixture-service-secret');
  const result = await run(rows, ['--fetch', handle], { createStorageClient: factory });
  expect(result.code).toBe(0);
  expect(factory).toHaveBeenCalledWith(`https://${PROJECT}.supabase.co`, 'fixture-service-secret', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  expect(from).toHaveBeenCalledWith('support-bundles');
  expect(downloads.mock.calls.map(call => call[0])).toEqual([`${ACTOR}/bundle-z.json`, `${ACTOR}/shot-z.heic`]);
  expect(result.data.fetch).toMatchObject({ status: 'downloaded', reportId: 'report-z' });
  expect(fs.readFileSync(path.join(cwd, 'docs/bugs/user-submissions-bundles', handle, 'bundle-report-z.json'), 'utf8')).toBe('{"capture":"raw"}');
  expect(fs.readFileSync(path.join(cwd, 'docs/bugs/user-submissions-bundles', handle, 'screenshot-report-z.heic'), 'utf8')).toBe('original-heic');
  expect(result.output.join(' ') + result.diagnostics.join(' ')).not.toContain('fixture-service-secret');
});

test('resolve binds the server id and selects fixed sync columns instead of a local or nested RPC id', async () => {
  const rows = [receipt({ payload: { table: 'assessments', recordId: 'local-record-id', serverRecordId: '43000000-0000-0000-0000-000000000001', wirePayload: { p_assessment: { id: '43000000-0000-0000-0000-000000000001' } } } })];
  const handle = (await run(rows)).data.conditions[0].handle;
  const runner = jest.fn().mockReturnValueOnce({ status: 0, stdout: psqlOut({ snapshotAt: SNAPSHOT, receipts: rows }) }).mockReturnValueOnce({ status: 0, stdout: psqlOut([{ id: rows[0].payload.serverRecordId, created_at: '2026-10-29T10:00:00Z' }]) });
  const result = await run(rows, ['--resolve', handle], { spawnSync: runner });
  expect(result.code).toBe(0);
  expect(runner).toHaveBeenCalledTimes(2);
  const [, args, options] = runner.mock.calls[1];
  expect(args).toEqual(expect.arrayContaining(['-v', `record_id=${rows[0].payload.serverRecordId}`, '-f', '-']));
  expect(options.input).toContain('FROM public."assessments"');
  expect(options.input).toContain('WHERE "id" = :\'record_id\'::uuid');
  expect(options.input).not.toContain('local-record-id');
  expect(options.input).not.toContain(rows[0].payload.serverRecordId);
  const lookup = options.input.split('\n').find(line => line.startsWith('SELECT coalesce('));
  expect(lookup).toContain('FROM public."assessments"');
  expect(lookup).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CALL|DO)\b/);
  expect(result.data.resolve).toMatchObject({ status: 'present', serverRecordId: rows[0].payload.serverRecordId, rows: [{ id: rows[0].payload.serverRecordId }], limitation: 'Existence is not UI visibility, correct relationships, recovery, or convergence.' });
});

test.each([
  `${ACTOR}/../other/bundle.json`, 'different-reporter/bundle.json', `${ACTOR}/%2e%2e/secret.json`, `${ACTOR}/folder\\escape.json`,
])('fetch rejects unsafe object paths before any client call: %s', async object => {
  const rows = [receipt({ bundle_path: object })];
  const handle = (await run(rows)).data.conditions[0].handle;
  fs.appendFileSync(path.join(cwd, '.env.local'), '\nSUPABASE_SECRET_KEY_SQLITE=fixture-service-secret');
  const factory = jest.fn(() => ({ storage: { from: () => ({ download: async () => ({ data: { arrayBuffer: async () => Buffer.from('private') } }) }) } }));
  const result = await run(rows, ['--fetch', handle], { createStorageClient: factory });
  expect(result.code).toBe(1);
  expect(factory).not.toHaveBeenCalled();
  expect(fs.existsSync(path.join(cwd, 'docs/bugs/user-submissions-bundles'))).toBe(false);
});

test('fetch refuses a symlink destination so private originals cannot escape the ignored directory', async () => {
  const rows = [receipt({ bundle_path: `${ACTOR}/bundle.json` })];
  const handle = (await run(rows)).data.conditions[0].handle;
  const outside = path.join(cwd, 'outside'); fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(cwd, 'docs/bugs/user-submissions-bundles'));
  fs.appendFileSync(path.join(cwd, '.env.local'), '\nSUPABASE_SECRET_KEY_SQLITE=fixture-service-secret');
  const download = jest.fn(async () => ({ data: { arrayBuffer: async () => Buffer.from('private') } }));
  const result = await run(rows, ['--fetch', handle], { createStorageClient: () => ({ storage: { from: () => ({ download }) } }) });
  expect(result.code).toBe(1);
  expect(download).not.toHaveBeenCalled();
  expect(fs.readdirSync(outside)).toEqual([]);
});

test('targeted fetch cannot advance a full sweep boundary and no attachment needs no service secret', async () => {
  const rows = [receipt()]; const handle = (await run(rows)).data.conditions[0].handle;
  const factory = jest.fn();
  const result = await run(rows, ['--fetch', handle], { createStorageClient: factory });
  expect(result.code).toBe(0);
  expect(result.data.fetch).toMatchObject({ status: 'unavailable', reportId: null });
  expect(factory).not.toHaveBeenCalled();
  expect(result.data.coverage).toMatchObject({ complete: false, reason: 'targeted' });
});

test('latest receipt and review comparisons preserve PostgreSQL microseconds', async () => {
  const rows = [receipt({ id: 'z', received_at: '2026-10-29T12:00:00.000001Z', payload: { marker: 'earlier' } }), receipt({ id: 'a', received_at: '2026-10-29T12:00:00.000002Z', payload: { marker: 'later' } })];
  commitRegistry({ a: record('MA-BUG-A', `support_incident_keys:\n  - ${ACTOR}/upload_terminal/install:condition`) });
  const result = await run(rows, ['--review-since', '2026-10-29T12:00:00.000001Z']);
  expect(result.data.conditions).toHaveLength(1);
  expect(result.data.conditions[0].latestPayload).toEqual({ marker: 'later' });
});

test('ordinary sweeps never construct a service client and missing fetch credentials fail without exposing them', async () => {
  const rows = [receipt({ bundle_path: `${ACTOR}/bundle.json` })]; const factory = jest.fn();
  const sweep = await run(rows, [], { createStorageClient: factory });
  expect(factory).not.toHaveBeenCalled();
  const result = await run(rows, ['--fetch', sweep.data.conditions[0].handle], { createStorageClient: factory });
  expect(result.code).toBe(1);
  expect(factory).not.toHaveBeenCalled();
});

test.each(['denied', 'lost', 'partial'])('download %s stays visible and never claims complete fetch', async mode => {
  const rows = [receipt({ bundle_path: `${ACTOR}/bundle.json`, screenshot_path: `${ACTOR}/screenshot.PNG` })];
  const handle = (await run(rows)).data.conditions[0].handle;
  fs.appendFileSync(path.join(cwd, '.env.local'), '\nSUPABASE_SECRET_KEY_SQLITE=fixture-service-secret');
  const download = jest.fn(async object => {
    if (mode === 'lost') throw new Error('fixture-service-secret');
    if (mode === 'denied' || object.endsWith('.PNG')) return { error: new Error('fixture-service-secret') };
    return { data: { arrayBuffer: async () => Buffer.from('original-json') } };
  });
  const result = await run(rows, ['--fetch', handle], { createStorageClient: () => ({ storage: { from: () => ({ download }) } }) });
  expect(result.code).toBe(1);
  expect(result.data.fetch.status).toBe('failed');
  expect(result.data.fetch.files.map(file => file.status)).toEqual(mode === 'partial' ? ['downloaded', 'failed'] : ['failed', 'failed']);
  expect(result.output.join(' ') + result.diagnostics.join(' ')).not.toContain('fixture-service-secret');
});

test.each([
  { table: 'children; DELETE FROM children', serverRecordId: '43000000-0000-0000-0000-000000000001', status: 'unsupported' },
  { table: '__proto__', serverRecordId: '43000000-0000-0000-0000-000000000001', status: 'unsupported' },
  { table: 'children', serverRecordId: "x'; DELETE FROM children; --", status: 'indeterminate' },
  { table: 'children', serverRecordId: null, status: 'indeterminate' },
  { table: 'letter_mastery', serverRecordId: null, wirePayload: { p_child_id: 'child' }, status: 'unsupported' },
])('unsupported or unsafe resolve is never absent %#', async ({ status, ...payload }) => {
  const rows = [receipt({ payload })]; const handle = (await run(rows)).data.conditions[0].handle;
  const result = await run(rows, ['--resolve', handle]);
  expect(result.code).toBe(1);
  expect(result.runner).toHaveBeenCalledTimes(1);
  expect(result.data.resolve.status).toBe(status);
});

test.each([
  [{ status: 0, stdout: psqlOut('[]') }, 'absent', 0],
  [{ status: 1, stderr: 'fixture-password' }, 'indeterminate', 1],
  [{ status: null, error: new Error('timeout') }, 'indeterminate', 1],
  [{ status: 0, stdout: psqlOut('[truncated') }, 'indeterminate', 1],
  [{ status: 0, stdout: psqlOut('{"error":"failed"}') }, 'indeterminate', 1],
  [{ status: 0, stdout: psqlOut('[{"id":"wrong"}]') }, 'indeterminate', 1],
  [{ status: 0, stdout: 'transaction_read_only=off\n[]' }, 'indeterminate', 1],
  [{ status: 0, stdout: '[]' }, 'indeterminate', 1],
])('resolve zero rows and failed queries retain distinct outcomes %#', async (lookup, status, code) => {
  const rows = [receipt()]; const handle = (await run(rows)).data.conditions[0].handle;
  const runner = jest.fn().mockReturnValueOnce({ status: 0, stdout: psqlOut({ snapshotAt: SNAPSHOT, receipts: rows }) }).mockReturnValueOnce(lookup);
  const result = await run(rows, ['--resolve', handle], { spawnSync: runner });
  expect(result.code).toBe(code);
  expect(result.data.resolve.status).toBe(status);
  expect(result.output.join(' ') + result.diagnostics.join(' ')).not.toContain('fixture-password');
});

test('unknown handles and non-record kinds cannot issue a record lookup', async () => {
  const unknown = await run([receipt()], ['--resolve', 'ut:00000000']);
  expect(unknown.code).toBe(1); expect(unknown.runner).toHaveBeenCalledTimes(1);
  const rows = [receipt({ kind: 'ea_report' })]; const handle = (await run(rows)).data.conditions[0].handle;
  const nonrecord = await run(rows, ['--resolve', handle]);
  expect(nonrecord.code).toBe(1); expect(nonrecord.runner).toHaveBeenCalledTimes(1);
  expect(nonrecord.data.resolve.status).toBe('unsupported');
});

test('both colliding handles resolve and fetch their own condition even when display filters hide them', async () => {
  const rows = [24962, 75404].map((n, i) => receipt({
    id: `receipt-${i}`, report_id: `report-${i}`, repeat_key: `install:collision-${n}`, bundle_path: `${ACTOR}/bundle-${i}.json`,
    payload: { table: 'children', serverRecordId: `43000000-0000-0000-0000-00000000000${i + 1}` },
  }));
  fs.appendFileSync(path.join(cwd, '.env.local'), '\nSUPABASE_SECRET_KEY_SQLITE=fixture-service-secret');
  const conditions = (await run(rows)).data.conditions;
  expect(conditions.every(c => /^ut:[a-f0-9]{12}$/.test(c.handle))).toBe(true);
  for (const condition of conditions) {
    const row = rows.find(item => item.repeat_key === condition.key.split('/').at(-1));
    const download = jest.fn(async () => ({ data: { arrayBuffer: async () => Buffer.from('{}') } }));
    const runner = jest.fn().mockReturnValueOnce({ status: 0, stdout: psqlOut({ snapshotAt: SNAPSHOT, receipts: rows }) }).mockReturnValueOnce({ status: 0, stdout: psqlOut([{ id: row.payload.serverRecordId }]) });
    const result = await run(rows, ['--fetch', condition.handle, '--resolve', condition.handle, '--actor', 'nobody'], { spawnSync: runner, createStorageClient: () => ({ storage: { from: () => ({ download }) } }) });
    expect(result.code).toBe(0);
    expect(result.data.conditions).toEqual([]);
    expect(result.data.fetch.reportId).toBe(row.report_id);
    expect(download).toHaveBeenCalledWith(row.bundle_path);
    expect(result.data.resolve.serverRecordId).toBe(row.payload.serverRecordId);
  }
  const ambiguous = await run(rows, ['--fetch', 'ut:81d27d15']);
  expect(ambiguous.code).toBe(1);
});

test.each(['.jpeg', '.PNG', '.HEIF'])('fetch preserves original screenshot bytes and extension %s', async extension => {
  const rows = [receipt({ bundle_path: `${ACTOR}/bundle.json`, screenshot_path: `${ACTOR}/image${extension}` })];
  const handle = (await run(rows)).data.conditions[0].handle;
  fs.appendFileSync(path.join(cwd, '.env.local'), '\nSUPABASE_SECRET_KEY_SQLITE=fixture-service-secret');
  const bytes = Buffer.from([0, 255, 1, 222]);
  const result = await run(rows, ['--fetch', handle], { createStorageClient: () => ({ storage: { from: () => ({ download: async () => ({ data: { arrayBuffer: async () => bytes } }) }) } }) });
  expect(result.code).toBe(0);
  const screenshot = result.data.fetch.files.find(file => file.type === 'screenshot');
  expect(screenshot.path.endsWith(extension)).toBe(true);
  expect(fs.readFileSync(path.join(cwd, screenshot.path))).toEqual(bytes);
});

test('resolve mappings select only actual synced-table columns and never fall back to the local id', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/syncServerColumns.js'), 'utf8');
  const tables = [...source.matchAll(/^  (\w+): \[([\s\S]*?)\n  \],/gm)].map(match => ({ table: match[1], columns: [...match[2].matchAll(/'([^']+)'/g)].map(column => column[1]) }));
  expect(tables).toHaveLength(18);
  for (const { table, columns } of tables.filter(item => item.table !== 'letter_mastery')) {
    const rows = [receipt({ payload: { table, serverRecordId: '43000000-0000-0000-0000-000000000001', recordId: 'local-id', wirePayload: null, wirePayloadError: 'serialization failed' } })];
    const handle = (await run(rows)).data.conditions[0].handle;
    const runner = jest.fn().mockReturnValueOnce({ status: 0, stdout: psqlOut({ snapshotAt: SNAPSHOT, receipts: rows }) }).mockReturnValueOnce({ status: 0, stdout: psqlOut('[]') });
    const result = await run(rows, ['--resolve', handle], { spawnSync: runner });
    expect(result.data.resolve.status).toBe('absent');
    const sql = runner.mock.calls[1][2].input;
    expect(sql).toContain(`FROM public."${table}"`);
    const selected = sql.match(/FROM \(SELECT (.*?) FROM/)[1];
    for (const column of selected.matchAll(/"([^" ]+)"/g)) expect(columns).toContain(column[1]);
  }
});

test('human output includes snapshot, EA, provenance and safe target diagnostics; help is import safe', async () => {
  const stdout = []; const stderr = []; const runner = jest.fn(() => ({ status: 0, stdout: psqlOut({ snapshotAt: SNAPSHOT, receipts: [receipt()] }) }));
  const code = await require(readerPath).runCli([], { cwd, env: { PATH: process.env.PATH }, psql: '/fixture/psql', spawnSync: runner, log: text => stdout.push(text), error: text => stderr.push(text) });
  expect(code).toBe(0);
  expect(stdout.join(' ')).toContain(`Snapshot: ${SNAPSHOT}`);
  expect(stdout.join(' ')).toContain('fixture@example.invalid');
  expect(stdout.join(' ')).toContain('latestPayload');
  expect(stderr.join(' ')).toContain(`project_ref=${PROJECT}`);
  const cli = spawnSync(process.execPath, [readerPath, '--help'], { cwd, encoding: 'utf8', env: { PATH: process.env.PATH } });
  expect(cli.status).toBe(0);
  expect(cli.stdout).toContain('--fetch <handle>');
  expect(cli.stderr).toBe('');
});

test('a remaining twelve-hex collision refuses coverage rather than guessing a handle', async () => {
  const crypto = require('crypto');
  const hash = jest.spyOn(crypto, 'createHash').mockImplementation(() => ({ update() { return this; }, digest: () => 'a'.repeat(64) }));
  try {
    let isolated;
    jest.isolateModules(() => { isolated = require(readerPath); });
    const log = jest.fn(); const error = jest.fn();
    const code = await isolated.runCli(['--json'], { cwd, env: { PATH: process.env.PATH }, psql: '/fixture/psql',
      spawnSync: () => ({ status: 0, stdout: psqlOut({ snapshotAt: SNAPSHOT, receipts: [receipt(), receipt({ repeat_key: 'install:second' })] }) }), log, error });
    expect(code).toBe(1);
    expect(log).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('Incident read failed; no coverage claim.');
  } finally { hash.mockRestore(); }
});

test('a symlink at the final filename cannot overwrite a file outside the evidence directory', async () => {
  const rows = [receipt({ bundle_path: `${ACTOR}/bundle.json` })]; const handle = (await run(rows)).data.conditions[0].handle;
  fs.appendFileSync(path.join(cwd, '.env.local'), '\nSUPABASE_SECRET_KEY_SQLITE=fixture-service-secret');
  const directory = path.join(cwd, 'docs/bugs/user-submissions-bundles', handle); fs.mkdirSync(directory, { recursive: true });
  const outside = path.join(cwd, 'original.txt'); fs.writeFileSync(outside, 'keep original');
  fs.symlinkSync(outside, path.join(directory, `bundle-${rows[0].report_id}.json`));
  const result = await run(rows, ['--fetch', handle], { createStorageClient: () => ({ storage: { from: () => ({ download: async () => ({ data: { arrayBuffer: async () => Buffer.from('overwrite') } }) }) } }) });
  expect(result.code).toBe(1);
  expect(result.data.fetch.files[0].status).toBe('failed');
  expect(fs.readFileSync(outside, 'utf8')).toBe('keep original');
});
