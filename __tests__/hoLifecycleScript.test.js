global.__MASI_NO_DEFAULT_HANDLE__ = true;

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  PROJECT_REF, parseArgs, runCli, deterministicId, buildProgram,
} = require('../scripts/ho-lifecycle.cjs');
const {
  childEaAssignmentDomainId, classEaAssignmentDomainId, deterministicDomainId,
} = require('../src/db/repositories/domainRepositoryUtils');

const CHILD_A = '5a000000-0000-0000-0000-00000000000a';
const CHILD_B = '5a000000-0000-0000-0000-00000000000b';
const CLASS = '4a000000-0000-0000-0000-000000000001';
const GROUP = '7a000000-0000-0000-0000-000000000001';
const reasonFlags = ['--reason', "Handover 'quoted' reason", '--operator', 'Operator'];

describe('argument parsing', () => {
  test.each([
    [['handover', 'child', '--from', 'A@example.test', '--to', 'b@example.test', '--children', `${CHILD_B.toUpperCase()}, ${CHILD_A}`, ...reasonFlags],
      { command: 'handover', scope: 'child', from: 'A@example.test', to: 'b@example.test', children: [CHILD_A, CHILD_B] }],
    [['handover', 'class', '--from', 'a@example.test', '--to', 'b@example.test', '--class', CLASS, '--programme', 'literacy', '--delivery', 'move', ...reasonFlags],
      { command: 'handover', scope: 'class', from: 'a@example.test', to: 'b@example.test', class: CLASS, programme: 'literacy', delivery: 'move' }],
    [['handover', 'group', '--from', 'a@example.test', '--to', 'b@example.test', '--group', GROUP, ...reasonFlags],
      { command: 'handover', scope: 'group', from: 'a@example.test', to: 'b@example.test', group: GROUP }],
    [['end-delivery', '--ea', 'a@example.test', '--children', CHILD_A, ...reasonFlags],
      { command: 'end-delivery', scope: 'child', ea: 'a@example.test', children: [CHILD_A] }],
    [['reopen', 'child', '--ea', 'a@example.test', '--children', CHILD_A, ...reasonFlags],
      { command: 'reopen', scope: 'child', ea: 'a@example.test', children: [CHILD_A] }],
    [['reopen', 'class', '--ea', 'a@example.test', '--class', CLASS, '--programme', 'numeracy', ...reasonFlags],
      { command: 'reopen', scope: 'class', ea: 'a@example.test', class: CLASS, programme: 'numeracy' }],
  ])('%j is a dry run with an explicit target and audit details', (argv, expected) => {
    expect(parseArgs(argv)).toEqual({
      ...expected, reason: "Handover 'quoted' reason", operator: 'Operator', apply: false,
    });
  });

  test('changes require an explicit --apply flag', () => {
    expect(parseArgs(['end-delivery', '--ea', 'a@example.test', '--children', CHILD_A, ...reasonFlags, '--apply']).apply).toBe(true);
  });

  const handoverChild = ['handover', 'child', '--from', 'a@example.test', '--to', 'b@example.test', '--children', CHILD_A];
  test.each([
    [], ['delete'], ['handover'], ['handover', 'teacher'], ['reopen', 'group', '--ea', 'a@example.test', '--group', GROUP, ...reasonFlags],
    ['end-delivery', 'child', '--ea', 'a@example.test', '--children', CHILD_A, ...reasonFlags],
    [...handoverChild, '--reason', 'Review'],
    [...handoverChild, '--operator', 'Operator'],
    [...handoverChild, ...reasonFlags, '--apply', '--apply'],
    [...handoverChild, ...reasonFlags, '--from', 'c@example.test'],
    [...handoverChild, ...reasonFlags, '--unknown', 'x'],
    [...handoverChild, ...reasonFlags, '--class', CLASS],
    [...handoverChild, ...reasonFlags, '--ea', 'a@example.test'],
    ['handover', 'child', '--from', 'a@example.test', '--to', 'A@Example.test', '--children', CHILD_A, ...reasonFlags],
    ['handover', 'child', '--from', 'not an email', '--to', 'b@example.test', '--children', CHILD_A, ...reasonFlags],
    ['handover', 'child', '--from', 'a@example.test', '--to', 'b@example.test', '--children', 'not-a-uuid', ...reasonFlags],
    ['handover', 'child', '--from', 'a@example.test', '--to', 'b@example.test', '--children', `${CHILD_A},${CHILD_A.toUpperCase()}`, ...reasonFlags],
    ['handover', 'child', '--from', 'a@example.test', '--to', 'b@example.test', '--children', `${CHILD_A},`, ...reasonFlags],
    ['handover', 'child', '--from', 'a@example.test', '--to', 'b@example.test', ...reasonFlags],
    ['handover', 'class', '--from', 'a@example.test', '--to', 'b@example.test', '--class', CLASS, '--programme', 'literacy', ...reasonFlags],
    ['handover', 'class', '--from', 'a@example.test', '--to', 'b@example.test', '--class', CLASS, '--programme', 'literacy', '--delivery', 'all', ...reasonFlags],
    ['handover', 'class', '--from', 'a@example.test', '--to', 'b@example.test', '--class', CLASS, '--delivery', 'move', ...reasonFlags],
    ['handover', 'class', '--from', 'a@example.test', '--to', 'b@example.test', '--class', CLASS, '--programme', "literacy'; drop", '--delivery', 'move', ...reasonFlags],
    ['reopen', 'class', '--ea', 'a@example.test', '--class', CLASS, '--programme', 'literacy', '--delivery', 'move', ...reasonFlags],
    ['handover', 'group', '--from', 'a@example.test', '--to', 'b@example.test', '--group', `${GROUP},${CLASS}`, ...reasonFlags],
    [...handoverChild, '--reason', ' ', '--operator', 'Operator'],
    [...handoverChild, '--reason', 'x'.repeat(1001), '--operator', 'Operator'],
    [...handoverChild, '--reason', 'Review', '--operator', 'x'.repeat(201)],
    [...handoverChild, '--reason', '--apply', '--operator', 'Operator'],
  ])('rejects invalid or incomplete arguments: %j', (...argv) => {
    expect(() => parseArgs(argv)).toThrow();
  });
});

describe('deterministic ids', () => {
  const userId = '1a000000-0000-0000-0000-000000000003';
  const programmeId = '0f5c3f9e-8f7a-4f87-9d36-2f0c7d2a9e11';
  test('mirror the app derivation exactly (UUIDv5, namespace and U+001F join)', () => {
    expect(deterministicId('child_ea_assignments', userId, CHILD_A))
      .toBe(childEaAssignmentDomainId({ userId, childId: CHILD_A }));
    expect(deterministicId('class_ea_assignments', CLASS, userId, programmeId))
      .toBe(classEaAssignmentDomainId({ classId: CLASS, eaUserId: userId, programmeId }));
    for (const parts of [['letter_mastery', CHILD_A, 'a', 'xh'], ['x', '', 'é ü', '\u001f']]) {
      expect(deterministicId(...parts)).toBe(deterministicDomainId(...parts));
    }
  });

  test('match an id recorded from the server reproduction (MA-BUG-20261104-010)', () => {
    // fixture.sql: EA_A's deterministic child_ea_assignments row for child 5a..01.
    expect(deterministicId('child_ea_assignments', '1a000000-0000-0000-0000-000000000002',
      '5a000000-0000-0000-0000-000000000001')).toBe('0988d63d-a3ce-5ea8-9f06-6a21d0a828e5');
  });
});

describe('SQL programs', () => {
  const args = { command: 'handover', scope: 'class', class_id: CLASS };
  test('the dry run is a server-enforced read-only transaction with no lock or write statement', () => {
    const sql = buildProgram('plan', { apply: false });
    expect(sql).toMatch(/^BEGIN READ ONLY;/);
    expect(sql.trim()).toMatch(/ROLLBACK;$/);
    expect(sql).not.toMatch(/\bCOMMIT\b|FOR UPDATE|UPDATE public\.|INSERT INTO public\./);
    expect(sql).toContain("SET LOCAL masi_ho.args = :'args';");
    expect(buildProgram('resolve', args)).toMatch(/^BEGIN READ ONLY;[\s\S]*ROLLBACK;$/);
    expect(buildProgram('readback', args)).toMatch(/^BEGIN READ ONLY;[\s\S]*ROLLBACK;$/);
  });

  test('apply takes row locks children -> classes -> groups before any grant changes', () => {
    const sql = buildProgram('plan', { apply: true });
    expect(sql).toMatch(/^BEGIN;/);
    expect(sql.trim()).toMatch(/COMMIT;$/);
    expect(sql).toContain("SET LOCAL lock_timeout = '10s';");
    const children = sql.indexOf('FROM public.children WHERE id = ANY');
    const classes = sql.indexOf('FROM public.classes WHERE id = v_class ORDER BY id FOR UPDATE');
    const groups = sql.indexOf('FROM public.groups WHERE id = v_group ORDER BY id FOR UPDATE');
    const firstWrite = Math.min(...['UPDATE public.', 'INSERT INTO public.']
      .map(statement => sql.indexOf(statement)).filter(index => index >= 0));
    expect(children).toBeGreaterThan(0);
    expect(classes).toBeGreaterThan(children);
    expect(groups).toBeGreaterThan(classes);
    expect(firstWrite).toBeGreaterThan(groups);
  });

  test('never writes row_version', () => {
    expect(buildProgram('plan', { apply: true })).not.toMatch(/row_version\s*=/);
  });
});

describe('daily lifecycle invariant query', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../scripts/lifecycle-invariants.sql'), 'utf8');
  const code = sql.replace(/--[^\n]*/g, '').trim();
  test('is one read-only statement the staging query helper can run as a string', () => {
    expect(code).toMatch(/^WITH\b/i);
    expect(code.endsWith(';')).toBe(true);
    expect(code.slice(0, -1)).not.toContain(';');
    expect(code).not.toMatch(/\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|CALL|DO|SET|FOR\s+UPDATE)\b|(?<!:):(?!:)/i);
  });

  test('names every check from the plan', () => {
    for (const check of ['archived_child_still_held', 'archived_class_still_assigned', 'archived_group_still_assigned',
      'live_group_in_archived_class', 'unheld_live_child', 'unheld_live_class', 'delivery_child_without_live_class',
      'duplicate_active_group_membership', 'upload_terminal_receipts', 'suspended_ea_with_backlog']) {
      expect(code).toContain(`'${check}'`);
    }
  });
});

describe('operator execution', () => {
  const password = 'fixture-db-password';
  const A = { id: '1a000000-0000-0000-0000-000000000002', email: 'a@example.test', has_profile: true, suspended: false };
  const B = { id: '1a000000-0000-0000-0000-000000000003', email: 'b@example.test', has_profile: true, suspended: false };
  const NOW = '2026-11-05T10:00:00+00:00';
  const endA = {
    action: 'end', table: 'child_ea_assignments', id: deterministicId('child_ea_assignments', A.id, CHILD_A),
    ea_user_id: A.id, child_id: CHILD_A, assigned_at: '2026-02-01T06:00:00+00:00', unassigned_at: null,
    row_version: 3, end_at: NOW, pair: CHILD_A,
  };
  const insertB = {
    action: 'insert', table: 'child_ea_assignments', id: deterministicId('child_ea_assignments', B.id, CHILD_A),
    ea_user_id: B.id, child_id: CHILD_A, assigned_at: NOW, pair: CHILD_A,
  };
  const plan = (overrides = {}) => ({
    server_now: NOW, read_only: 'on', actions: [endA, insertB], notes: [], refusals: [], ...overrides,
  });
  const resolved = (users = { from: [A], to: [B] }) => ({ read_only: 'on', users, programmes: [] });
  const after = rows => ({ read_only: 'on', rows });
  const reply = value => ({ status: 0, stdout: JSON.stringify(value) });
  const argv = (apply = false) => ['handover', 'child', '--from', A.email, '--to', B.email,
    '--children', CHILD_A, ...reasonFlags, ...(apply ? ['--apply'] : [])];
  let cwd;
  let log;
  let spawnSync;
  const run = (args, options = {}) => runCli(args, {
    cwd, log, spawnSync, psql: '/fixture/psql', env: {}, randomUUID: () => 'f0000000-0000-4000-8000-000000000001', ...options,
  });
  const printed = () => log.mock.calls.map(([text]) => JSON.parse(text));
  const variables = call => Object.fromEntries(call[1].flatMap((value, index, all) => (
    all[index - 1] === '-v' && value.startsWith('args=') ? [['args', JSON.parse(value.slice(5))]] : [])));

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-ho-lifecycle-'));
    fs.writeFileSync(path.join(cwd, '.env.local'), `SUPABASE_DB_PASSWORD_SQLITE='${password}'\n`);
    log = jest.fn();
    spawnSync = jest.fn();
  });
  afterEach(() => fs.rmSync(cwd, { recursive: true, force: true }));

  test('a dry run resolves the exact targets and prints the plan without any write', () => {
    spawnSync.mockReturnValueOnce(reply(resolved())).mockReturnValueOnce(reply(plan()));
    expect(run(argv())).toBe(0);
    expect(spawnSync).toHaveBeenCalledTimes(2);
    for (const call of spawnSync.mock.calls) {
      const [command, args, options] = call;
      expect(command).toBe('/fixture/psql');
      expect(args).toEqual(expect.arrayContaining(['-X', '-w', 'ON_ERROR_STOP=1', '--dbname',
        `postgresql://postgres.${PROJECT_REF}@aws-1-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require`, '-f', '-']));
      expect(args).not.toContain('-c');
      expect(options.input).toMatch(/^BEGIN READ ONLY;/);
      expect(options.input).not.toMatch(/\bCOMMIT\b|FOR UPDATE/);
    }
    expect(variables(spawnSync.mock.calls[0]).args).toEqual(expect.objectContaining({
      emails: { from: A.email, to: B.email }, ids: [CHILD_A] }));
    expect(spawnSync.mock.calls[0][2].input).toContain("lower(a.email) = lower(e.value)");
    expect(variables(spawnSync.mock.calls[1]).args).toEqual(expect.objectContaining({
      command: 'handover', scope: 'child', from_id: A.id, to_id: B.id, child_ids: [CHILD_A],
      reason: "Handover 'quoted' reason",
    }));
    expect(spawnSync.mock.calls[1][2].input).not.toMatch(/UPDATE public\.|INSERT INTO public\./);
    const output = printed();
    expect(output[0]).toEqual({ project_ref: PROJECT_REF, command: 'handover child', mode: 'dry_run' });
    expect(output.find(value => value.plan).plan.actions).toEqual([endA, insertB]);
    expect(output.some(value => value.confirmed)).toBe(false);
  });

  test.each([
    [{ from: [], to: [B] }, 'No Auth user matches'],
    [{ from: [A, { ...A, id: 'other' }], to: [B] }, 'Ambiguous email'],
    [{ from: [A], to: [{ ...B, has_profile: false }] }, 'EA profile'],
    [{ from: [A], to: [{ ...B, suspended: true }] }, 'suspended'],
    [{ from: [A], to: [{ ...B, id: A.id }] }, 'same EA'],
  ])('refuses before planning when the email targets are not exact: %j', (users, message) => {
    spawnSync.mockReturnValueOnce(reply(resolved(users)));
    expect(() => run(argv(true))).toThrow(message);
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  test('a database that does not confirm read-only mode stops the dry run', () => {
    spawnSync.mockReturnValueOnce(reply(resolved())).mockReturnValueOnce(reply(plan({ read_only: 'off' })));
    expect(() => run(argv())).toThrow('read-only');
  });

  test('refusals stop the command before anything is applied', () => {
    spawnSync.mockReturnValueOnce(reply(resolved()))
      .mockReturnValueOnce(reply(plan({ refusals: [{ code: 'predecessor_not_holding', pair: CHILD_A }] })));
    expect(() => run(argv(true))).toThrow('refused: predecessor_not_holding');
    expect(spawnSync).toHaveBeenCalledTimes(2);
  });

  test('a deterministic id that differs from the app derivation stops the command before apply', () => {
    spawnSync.mockReturnValueOnce(reply(resolved()))
      .mockReturnValueOnce(reply(plan({ actions: [endA, { ...insertB, id: '00000000-0000-4000-8000-000000000000' }] })));
    expect(() => run(argv(true))).toThrow('deterministic_id_mismatch');
    expect(spawnSync).toHaveBeenCalledTimes(2);
  });

  test('apply locks, recomputes, changes, then confirms by a separate read-back', () => {
    spawnSync.mockReturnValueOnce(reply(resolved()))
      .mockReturnValueOnce(reply(plan()))
      .mockReturnValueOnce(reply(plan({ read_only: 'off' })))
      .mockReturnValueOnce(reply(after([
        { table: 'child_ea_assignments', id: endA.id, ea_user_id: A.id, assigned_at: endA.assigned_at, unassigned_at: NOW, row_version: 3 },
        { table: 'child_ea_assignments', id: insertB.id, ea_user_id: B.id, assigned_at: NOW, unassigned_at: null, row_version: 1 },
      ])));
    expect(run(argv(true))).toBe(0);
    expect(spawnSync).toHaveBeenCalledTimes(4);
    const applyCall = spawnSync.mock.calls[2];
    expect(applyCall[2].input).toMatch(/^BEGIN;[\s\S]*FOR UPDATE[\s\S]*UPDATE public\.[\s\S]*COMMIT;$/);
    expect(variables(spawnSync.mock.calls[3]).args.ids).toEqual([endA.id, insertB.id]);
    expect(spawnSync.mock.calls[3][2].input).toMatch(/^BEGIN READ ONLY;/);
    const output = printed();
    expect(output[0].mode).toBe('apply');
    expect(output.at(-1)).toEqual({ confirmed: true });
    expect(spawnSync.mock.calls.map(call => call[1]).flat().join(' ')).not.toContain(password);
  });

  test.each([
    ['the predecessor row is still open', { unassigned_at: null }, {}],
    ['the successor row is not open', {}, { unassigned_at: NOW }],
    ['row_version moved', { row_version: 4 }, {}],
  ])('a read-back where %s never reports confirmation', (_label, endOverrides, openOverrides) => {
    spawnSync.mockReturnValueOnce(reply(resolved())).mockReturnValueOnce(reply(plan()))
      .mockReturnValueOnce(reply(plan({ read_only: 'off' })))
      .mockReturnValueOnce(reply(after([
        { table: 'child_ea_assignments', id: endA.id, assigned_at: endA.assigned_at, unassigned_at: NOW, row_version: 3, ...endOverrides },
        { table: 'child_ea_assignments', id: insertB.id, assigned_at: NOW, unassigned_at: null, row_version: 1, ...openOverrides },
      ])));
    expect(() => run(argv(true))).toThrow('read_back_unconfirmed');
    expect(printed().some(value => value.confirmed)).toBe(false);
  });

  test('a group handover passes a fresh successor id only when applying', () => {
    const group = ['handover', 'group', '--from', A.email, '--to', B.email, '--group', GROUP, ...reasonFlags];
    const groupPlan = plan({ actions: [
      { action: 'end', table: 'group_ea_assignments', id: 'c189a976-3679-542d-966d-c9e28c04112e', ea_user_id: A.id,
        group_id: GROUP, assigned_at: '2026-02-01T06:00:00+00:00', row_version: 1, pair: GROUP },
      { action: 'insert', table: 'group_ea_assignments', id: null, ea_user_id: B.id, group_id: GROUP, pair: GROUP },
    ] });
    spawnSync.mockReturnValueOnce(reply(resolved())).mockReturnValueOnce(reply(groupPlan));
    expect(run(group)).toBe(0);
    expect(variables(spawnSync.mock.calls[1]).args.fresh_id).toBeUndefined();

    spawnSync.mockReset();
    const applied = plan({ read_only: 'off', actions: [groupPlan.actions[0],
      { ...groupPlan.actions[1], id: 'f0000000-0000-4000-8000-000000000001' }] });
    spawnSync.mockReturnValueOnce(reply(resolved())).mockReturnValueOnce(reply(groupPlan))
      .mockReturnValueOnce(reply(applied))
      .mockReturnValueOnce(reply(after([
        { table: 'group_ea_assignments', id: groupPlan.actions[0].id, unassigned_at: NOW, row_version: 1 },
        { table: 'group_ea_assignments', id: 'f0000000-0000-4000-8000-000000000001', unassigned_at: null, row_version: 1 },
      ])));
    expect(run([...group, '--apply'])).toBe(0);
    expect(variables(spawnSync.mock.calls[2]).args.fresh_id).toBe('f0000000-0000-4000-8000-000000000001');
  });

  test('resolves the programme code exactly for class commands', () => {
    const reopenClass = ['reopen', 'class', '--ea', A.email, '--class', CLASS, '--programme', 'literacy', ...reasonFlags];
    spawnSync.mockReturnValueOnce(reply({ read_only: 'on', users: { ea: [A] }, programmes: [] }));
    expect(() => run(reopenClass)).toThrow('No programme');
    expect(variables(spawnSync.mock.calls[0]).args.programme_code).toBe('literacy');
  });

  test('refuses the legacy project before any connection', () => {
    expect(() => run(argv(), { env: { MASI_DB_POOLER_HOST: 'jcqrlwetutnpuchjoyyd.pooler.supabase.com' } })).toThrow('Legacy');
    expect(() => run(argv(), { env: { MASI_DB_POOLER_HOST: 'attacker.example' } })).toThrow();
    expect(spawnSync).not.toHaveBeenCalled();
  });

  test('isolates the password and connection environment and redacts it from failures', () => {
    spawnSync.mockReturnValue({ status: 1, stderr: `connection failed ${password}` });
    expect(() => run(argv(), { env: { PATH: '/bin', PGHOSTADDR: 'legacy-routing', PGSERVICE: 'wrong', PGPASSWORD: 'wrong' } }))
      .toThrow('connection failed [redacted]');
    const [, args, options] = spawnSync.mock.calls[0];
    expect(options.env.PGPASSWORD).toBe(password);
    expect(options.env.PGHOSTADDR).toBeUndefined();
    expect(options.env.PGSERVICE).toBeUndefined();
    expect(args.join(' ')).not.toContain(password);
    expect(log.mock.calls.flat().join('\n')).not.toContain(password);
  });

  test('an inherited password cannot replace the required local file', () => {
    fs.unlinkSync(path.join(cwd, '.env.local'));
    expect(() => runCli(argv(), { cwd, env: { PGPASSWORD: password }, spawnSync, log })).toThrow('.env.local');
    expect(spawnSync).not.toHaveBeenCalled();
  });
});
