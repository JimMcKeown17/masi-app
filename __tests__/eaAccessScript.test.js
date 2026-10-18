global.__MASI_NO_DEFAULT_HANDLE__ = true;

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  PROJECT_REF, parseArgs, runCli, assertSqliteTarget, buildConnectionString, isSuspensionConfirmed,
} = require('../scripts/ea-access.cjs');

test.each(['suspend', 'restore'])('%s defaults to a dry run with an explicit target and audit details', (action) => {
  expect(parseArgs([action, '--email', 'EA@example.test', '--reason', 'Access review', '--operator', 'Operator']))
    .toEqual({ action, email: 'EA@example.test', reason: 'Access review', operator: 'Operator', apply: false });
});

test.each([
  [], ['delete'], ['status'], ['suspend', '--email', 'ea@example.test'],
  ['restore', '--email', 'ea@example.test', '--reason', 'Review'],
  ['suspend', '--email', 'ea@example.test', '--operator', 'Operator'],
  ['status', '--email', 'ea@example.test', '--apply'],
  ['status', '--email', 'ea@example.test', '--reason', 'Review'],
  ['status', '--email', 'ea@example.test', '--email', 'other@example.test'],
  ['status', '--email', '--apply'], ['status', '--email', 'not an email'],
  ['status', '--email', 'ea@example.test', '--unknown'],
  ['suspend', '--email', 'ea@example.test', '--reason', ' ', '--operator', 'Operator'],
  ['suspend', '--email', 'ea@example.test', '--reason', 'x'.repeat(1001), '--operator', 'Operator'],
  ['suspend', '--email', 'ea@example.test', '--reason', 'Review', '--operator', 'x'.repeat(201)],
])('rejects invalid or incomplete arguments: %j', (...argv) => {
  expect(() => parseArgs(argv)).toThrow();
});

test('writes require an explicit --apply flag', () => {
  expect(parseArgs(['suspend', '--email', 'ea@example.test', '--reason', 'Review', '--operator', 'Operator', '--apply']).apply).toBe(true);
  expect(parseArgs(['status', '--email', 'ea@example.test'])).toEqual({ action: 'status', email: 'ea@example.test', apply: false });
});

test('the connection is fixed to the SQLite project, session port and required TLS', () => {
  expect(buildConnectionString()).toBe(`postgresql://postgres.${PROJECT_REF}@aws-1-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require`);
});

test.each(['projectRef', 'host', 'user', 'url'])('refuses the legacy ref in resolved %s', key => {
  expect(() => assertSqliteTarget({
    projectRef: PROJECT_REF, host: 'aws-1-eu-west-2.pooler.supabase.com', user: `postgres.${PROJECT_REF}`,
    [key]: 'jcqrlwetutnpuchjoyyd',
  })).toThrow('Legacy');
});

test.each([
  { host: 'attacker.example' }, { host: 'aws-1-eu-west-2.pooler.supabase.com?host=attacker' },
  { user: 'postgres.other-project' }, { projectRef: 'other-project' },
])('refuses non-SQLite routing: %j', overrides => {
  expect(() => buildConnectionString(overrides)).toThrow();
});

test.each([
  ['2026-10-19T00:00:01Z', false, true],
  ['2026-10-19T00:00:00Z', false, false],
  ['2026-10-20T00:00:00Z', true, false],
  ['2026-10-20T00:00:00Z', 'false', false],
  [null, false, false], ['invalid', false, false], ['2026-10-17T00:00:00Z', false, false],
])('confirms only a ban over 24 hours away and an inactive profile (%s, %s)', (banned_until, is_active, expected) => {
  expect(isSuspensionConfirmed({ banned_until, is_active }, Date.parse('2026-10-18T00:00:00Z'))).toBe(expected);
});

describe('operator execution', () => {
  const password = 'fixture-db-password';
  const target = {
    id: '13000000-0000-0000-0000-000000000001', email: 'ea@example.test',
    banned_until: null, is_active: true, latest_event: null, restore_is_active: null,
  };
  let cwd;
  let log;
  let spawnSync;
  const args = (action, apply = false) => [action, '--email', target.email,
    ...(action === 'status' ? [] : ['--reason', "Review 'quoted' access", '--operator', 'Operator']),
    ...(apply ? ['--apply'] : [])];
  const run = (argv) => runCli(argv, { cwd, log, spawnSync, psql: '/fixture/psql', env: {}, now: () => Date.parse('2026-10-18T00:00:00Z') });
  const reply = value => ({ status: 0, stdout: JSON.stringify(value) });

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-ea-access-'));
    fs.writeFileSync(path.join(cwd, '.env.local'), `SUPABASE_DB_PASSWORD_SQLITE='${password}'\n`);
    log = jest.fn();
    spawnSync = jest.fn();
  });
  afterEach(() => fs.rmSync(cwd, { recursive: true, force: true }));

  test('status is read-only and redacts secrets even in returned audit text', () => {
    spawnSync.mockReturnValue(reply([{ ...target, latest_event: { reason: password } }]));
    expect(run(args('status'))).toBe(0);
    expect(spawnSync).toHaveBeenCalledTimes(1);
    const printed = log.mock.calls.flat().join('\n');
    expect(printed).toContain(target.email);
    expect(printed).toContain('[redacted]');
    expect(printed).not.toContain(password);
  });

  test.each([
    { matches: [], message: 'No Auth user matches' },
    { matches: [target, { ...target, id: 'other' }], message: 'Ambiguous email' },
  ])('refuses missing or ambiguous email matches before writing: $message', ({ matches, message }) => {
    spawnSync.mockReturnValue(reply(matches));
    expect(() => run(args('suspend', true))).toThrow(message);
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  test('refuses an Auth user without an EA profile', () => {
    spawnSync.mockReturnValue(reply([{ ...target, is_active: null }]));
    expect(() => run(args('suspend', true))).toThrow('EA profile');
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  test('refuses restore without a script suspension', () => {
    spawnSync.mockReturnValue(reply([target]));
    expect(() => run(args('restore', true))).toThrow('restore_not_available');
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  test('restore dry run uses the original suspension state reported by SQL', () => {
    spawnSync.mockReturnValue(reply([{ ...target, is_active: false,
      latest_event: { action: 'suspend', was_active_before: false }, restore_is_active: true,
    }]));
    expect(run(args('restore'))).toBe(0);
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.map(([text]) => JSON.parse(text)).find(value => value.would_change).would_change.is_active).toBe(true);
  });

  test.each(['suspend', 'restore'])('%s applies a parameterized statement and confirms state by UUID', action => {
    const event = { id: 'audit-event', user_id: target.id, action, is_active_after: action === 'restore' };
    const after = { ...target, is_active: event.is_active_after, latest_event: event,
      banned_until: action === 'suspend' ? '2126-10-18T00:00:00Z' : null,
    };
    spawnSync.mockReturnValueOnce(reply([{ ...target, latest_event: { action: 'suspend' }, restore_is_active: true }]))
      .mockReturnValueOnce(reply(event)).mockReturnValueOnce(reply(after));
    expect(run(args(action, true))).toBe(0);
    const [, argv, options] = spawnSync.mock.calls[1];
    expect(argv).toEqual(expect.arrayContaining([`user_id=${target.id}`, "reason=Review 'quoted' access", 'operator=Operator']));
    expect(argv).not.toContain('-c');
    expect(options.input).toContain(`private.${action}_ea(:'user_id'::uuid, :'reason', :'operator')`);
    expect(options.input).not.toContain("Review 'quoted' access");
    expect(spawnSync.mock.calls[2][2].input).toContain("private.ea_access_status(:'user_id'::uuid)");
    expect(log.mock.calls.flat().join('\n')).toContain('"confirmed":true');
    expect(spawnSync.mock.calls.map(call => call[1]).flat().join(' ')).not.toContain(password);
  });

  test('a failed read-back never reports a confirmed suspension', () => {
    const event = { id: 'audit-event', user_id: target.id, action: 'suspend' };
    spawnSync.mockReturnValueOnce(reply([target])).mockReturnValueOnce(reply(event))
      .mockReturnValueOnce(reply({ ...target, latest_event: event }));
    expect(() => run(args('suspend', true))).toThrow('read_back_unconfirmed');
    expect(log.mock.calls.flat().join('\n')).not.toContain('"confirmed":true');
  });

  test('psql failure diagnostics never expose the password', () => {
    spawnSync.mockReturnValue({ status: 1, stderr: `connection failed ${password}` });
    expect(() => run(args('status'))).toThrow('connection failed [redacted]');
    expect(log.mock.calls.flat().join('\n')).not.toContain(password);
  });

  test('an inherited password cannot replace the required local file', () => {
    fs.unlinkSync(path.join(cwd, '.env.local'));
    expect(() => runCli(args('status'), { cwd, env: { PGPASSWORD: password }, spawnSync, log })).toThrow('.env.local');
    expect(spawnSync).not.toHaveBeenCalled();
  });
});

test('dry run reads the exact target without a write and isolates the password and connection environment', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-ea-access-'));
  const password = 'fixture-password-not-for-argv';
  fs.writeFileSync(path.join(cwd, '.env.local'), `SUPABASE_DB_PASSWORD_SQLITE="${password}"\n`);
  const target = {
    id: '13000000-0000-0000-0000-000000000001', email: 'EA@example.test',
    banned_until: null, is_active: true, latest_event: null, restore_is_active: null,
  };
  const spawnSync = jest.fn(() => ({ status: 0, stdout: JSON.stringify([target]) }));
  const log = jest.fn();
  try {
    expect(runCli(['suspend', '--email', 'EA@example.test', '--reason', "Review 'quoted' access", '--operator', 'Operator'], {
      cwd, spawnSync, log, psql: '/fixture/psql',
      env: { PATH: '/bin', PGHOSTADDR: 'legacy-routing', PGSERVICE: 'wrong', PGPASSWORD: 'wrong-password' },
    })).toBe(0);
    expect(spawnSync).toHaveBeenCalledTimes(1);
    const [command, argv, options] = spawnSync.mock.calls[0];
    expect(command).toBe('/fixture/psql');
    expect(argv).toEqual(expect.arrayContaining(['-X', '-w', 'ON_ERROR_STOP=1', 'email=EA@example.test', '-f', '-']));
    expect(argv.join(' ')).not.toContain(password);
    expect(options.input).toContain('BEGIN READ ONLY');
    expect(options.input).toContain("lower(a.email) = lower(:'email')");
    expect(options.input).not.toMatch(/private\.(suspend|restore)_ea/);
    expect(options.env.PGPASSWORD).toBe(password);
    expect(options.env.PGHOSTADDR).toBeUndefined();
    expect(options.env.PGSERVICE).toBeUndefined();
    expect(log.mock.calls.flat().join('\n')).toContain('dry_run');
    expect(log.mock.calls.flat().join('\n')).not.toContain(password);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
