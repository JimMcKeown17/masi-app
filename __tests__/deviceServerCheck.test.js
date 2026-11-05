/** @jest-environment-options {"customExportConditions":["node","node-addons"]} */
const fs = require('fs');
const os = require('os');
const path = require('path');
const checker = () => require('../scripts/device/server-check.cjs');
const good = ['--ea', 'test@example.invalid', '--since', '2026-11-05T10:00:00Z'];
test('requires EA and a valid ISO instant and rejects unknown flags', () => {
  expect(checker().parseArgs(good)).toMatchObject({ ea: good[1], since: good[3] });
  expect(checker().parseArgs(['--help']).help).toBe(true);
  for (const args of [[], ['--ea', 'x'], ['--since', good[3]], [...good, '--unknown'], [...good, '--ea', 'other'], ['--ea', good[1], '--since', '2026-02-30T12:00:00Z'], ['--ea', good[1], '--since', '2026-11-05'], ['--ea', good[1], '--since', '2026-11-05T24:00:00Z']]) expect(() => checker().parseArgs(args)).toThrow();
});
let cwd;
beforeEach(() => { cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'device-check-')); fs.writeFileSync(path.join(cwd, '.env.local'), `SUPABASE_PROJECT_ID_SQLITE=segygjzpujphwvrubusm\nSUPABASE_PROJECT_URL_SQLITE=https://segygjzpujphwvrubusm.supabase.co\nSUPABASE_DB_PASSWORD_SQLITE=fixture-secret\nSUPABASE_PUBLISHABLE_KEY_SQLITE=fixture-public\n`); });
afterEach(() => fs.rmSync(cwd, { recursive: true, force: true }));
const report = () => ({ snapshotAt: '2026-11-05T12:00:00Z', ea: { id: 'fixture', email: 'test@example.invalid', is_test_account: 'true' }, ...Object.fromEntries(['time_entries', 'children', 'sessions', 'letter_mastery', 'skill_mastery', 'assessments', 'battery_runs', 'support_incidents'].map(k => [k, []])), health_checks: Object.fromEntries(['empty_active_groups', 'sessions_without_attendees', 'assessments_without_items', 'children_without_ea'].map(k => [k, { status: 'OK', ids: [] }])) });
const run = async (data = report(), extra = {}) => {
  const log = jest.fn(); const error = jest.fn();
  const runner = jest.fn(() => ({ status: 0, stdout: `transaction_read_only=on\n${JSON.stringify(data)}` }));
  const code = await checker().runCli([...good, '--json'], { cwd, env: { PATH: process.env.PATH, PGHOSTADDR: 'hostile', PGPASSWORD: 'hostile' }, psql: '/fixture/psql', spawnSync: runner, log, error, ...extra });
  return { code, log, error, runner };
};
test('one snapshot uses the shared confirmed read-only wrapper with safe SQL and variables', async () => {
  const result = await run(); expect(result.code).toBe(0); expect(result.runner).toHaveBeenCalledTimes(1);
  const [, args, opts] = result.runner.mock.calls[0];
  expect(opts.input).toMatch(/^BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
  expect(opts.input.trim()).toMatch(/ROLLBACK;$/);
  expect(opts.input).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|GRANT)\b/i);
  expect(opts.input.indexOf("SELECT 'transaction_read_only='")).toBeLessThan(opts.input.indexOf('WITH\n ea'));
  expect(opts.env.PGPASSWORD).toBe('fixture-secret'); expect(opts.env).not.toHaveProperty('PGHOSTADDR');
  expect(args).toEqual(expect.arrayContaining(['-X', '-w', '-Atq', 'ON_ERROR_STOP=1', 'ea=test@example.invalid', `since=${good[3]}`]));
  expect(result.error).toHaveBeenCalledWith('project_ref=segygjzpujphwvrubusm access=psql-read-only');
  expect(JSON.parse(result.log.mock.calls[0][0])).toMatchObject({ warning: null, health_checks: { empty_active_groups: { status: 'OK', ids: [] } } });
});
test('refuses other project refs before psql', async () => {
  fs.writeFileSync(path.join(cwd, '.env.local'), 'SUPABASE_PROJECT_ID_SQLITE=jcqrlwetutnpuchjoyyd');
  const r = await run(); expect(r.code).toBe(1); expect(r.runner).not.toHaveBeenCalled();
});
test('refuses foreign pooler and does not expose the supplied URL password', async () => {
  fs.mkdirSync(path.join(cwd, 'supabase/.temp'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'supabase/.temp/pooler-url'), 'postgresql://postgres.jcqrlwetutnpuchjoyyd:private@aws-1-eu-west-2.pooler.supabase.com:5432/postgres');
  const r = await run(); expect(r.code).toBe(1); expect(r.runner).not.toHaveBeenCalled(); expect(JSON.stringify(r.error.mock.calls)).not.toContain('private');
});
test.each(['transaction_read_only=off\n{}', '{}', 'transaction_read_only=on\n{"snapshotAt":'])('refuses missing proof and partial results', async stdout => {
  const r = await run(undefined, { spawnSync: () => ({ status: 0, stdout }) }); expect(r.code).toBe(1); expect(r.log).not.toHaveBeenCalled();
});
test('non-test warning is included in JSON, and EA absence has a distinct failure', async () => {
  const data = report(); data.ea.is_test_account = null;
  const r = await run(data); expect(JSON.parse(r.log.mock.calls[0][0]).warning).toBe('WARNING not a test account');
  data.ea = null; expect((await run(data)).code).toBe(2);
});
test('help and malformed arguments never invoke psql or require env', async () => {
  fs.unlinkSync(path.join(cwd, '.env.local')); const runner = jest.fn(); const log = jest.fn();
  expect(await checker().runCli(['--help'], { cwd, spawnSync: runner, log })).toBe(0);
  expect(await checker().runCli(['--wat'], { cwd, spawnSync: runner, error: jest.fn() })).toBe(1);
  expect(runner).not.toHaveBeenCalled();
});
test('queries use actual assignment key and item rows, with all four health checks', () => {
  const sql = checker().SQL;
  expect(sql).toContain('ca.user_id'); expect(sql).not.toContain('ca.ea_user_id'); expect(sql).not.toContain('items_tested');
  expect(sql).toContain('i.is_correct'); expect(sql).toContain("->'lesson'->'plan'->>'blend_tier'");
  expect(sql).toContain('m.removed_at IS NULL'); expect(sql).toContain('c.archived_at IS NULL');
});
