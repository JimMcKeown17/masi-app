#!/usr/bin/env node

// Disposable-PostgreSQL proof for the Head Office lifecycle script (scripts/ho-lifecycle.cjs)
// and the daily invariant query (scripts/lifecycle-invariants.sql); lifecycle-safety plan H1.
// Replays every canonical migration, then drives the real operator CLI (runCli) end to end.
// The only substitution is psql's --dbname: the harness asserts the script built its pinned
// masi-app-sqlite target, then points that one psql call at this localhost database.
// Localhost only, with the same disposable-name and confirmation guard as the other harnesses.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const {
  MIGRATIONS_DIR, assertDisposableAdminTarget, bootstrapSql, buildDatabaseUrl, buildPsqlEnv, expectSqlState, runPsql,
} = require('./history-authorization-postgres-harness.cjs');
const { PROJECT_REF, runCli, deterministicId } = require('./ho-lifecycle.cjs');

const PINNED = `postgresql://postgres.${PROJECT_REF}@aws-1-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require`;
const INVARIANTS_SQL = fs.readFileSync(path.join(__dirname, 'lifecycle-invariants.sql'), 'utf8');
const ORG = 'a111879f-d066-47c9-95a1-bed2a400319a';
const REASON = "Harness handover 'quoted'";
const OPERATOR = 'Disposable harness';

const id = (prefix, n) => `${prefix}000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const HO = id('1b', 1);
const A = id('1b', 2);
const B = id('1b', 3);
const C = id('1b', 4);
const S = id('1b', 5);
const SCHOOL = id('2b', 1);
const K = id('4b', 1);
const K2 = id('4b', 2);
const YEAR_2027 = id('3b', 1);
const X1 = id('5b', 1);
const X2 = id('5b', 2);
const X3 = id('5b', 3);
const XA = id('5b', 4);
const G = id('7b', 1);
const EMAIL = { A: 'ea.a@example.test', B: 'ea.b@example.test', C: 'ea.c@example.test', S: 'ea.s@example.test' };
const DET = {
  childA1: deterministicId('child_ea_assignments', A, X1),
  childA2: deterministicId('child_ea_assignments', A, X2),
  childB1: deterministicId('child_ea_assignments', B, X1),
  childB2: deterministicId('child_ea_assignments', B, X2),
  classA: null,
  classB: null,
  group: deterministicId('group_ea_assignments', G),
};
const programme = code => `(SELECT id FROM public.programmes WHERE code = '${code}')`;
const activeYear = '(SELECT id FROM public.academic_years WHERE is_active)';

// Seeded rows carry row_versions above 1 so "never bumps row_version" is observable.
const fixtureSql = () => `
INSERT INTO auth.users (id, email, banned_until) VALUES
  ('${HO}', 'ho@example.test', NULL), ('${A}', '${EMAIL.A}', NULL), ('${B}', 'EA.B@Example.test', NULL),
  ('${C}', '${EMAIL.C}', NULL), ('${S}', '${EMAIL.S}', now() + interval '876000 hours');
INSERT INTO public.schools (id, name) VALUES ('${SCHOOL}', 'HO lifecycle harness school');
INSERT INTO public.users (id, first_name, last_name, school_id, organization_id) VALUES
  ('${HO}', 'Head', 'Office', '${SCHOOL}', '${ORG}'), ('${A}', 'EA', 'A', '${SCHOOL}', '${ORG}'),
  ('${B}', 'EA', 'B', '${SCHOOL}', '${ORG}'), ('${C}', 'EA', 'C', '${SCHOOL}', '${ORG}'),
  ('${S}', 'EA', 'Suspended', '${SCHOOL}', '${ORG}');
INSERT INTO public.staff_programme_assignments (user_id, programme_id, school_id, created_by) VALUES
  ('${A}', ${programme('literacy')}, '${SCHOOL}', '${HO}'), ('${B}', ${programme('literacy')}, '${SCHOOL}', '${HO}'),
  ('${C}', ${programme('numeracy')}, '${SCHOOL}', '${HO}'), ('${S}', ${programme('literacy')}, '${SCHOOL}', '${HO}');
INSERT INTO public.academic_years (id, label, starts_on, ends_on, is_active) VALUES
  ('${YEAR_2027}', 'harness-2027', '2027-01-15', '2027-12-15', false);
INSERT INTO public.classes (id, school_id, name, grade, academic_year_id, created_by) VALUES
  ('${K}', '${SCHOOL}', 'Harness class K', '1', ${activeYear}, '${HO}'),
  ('${K2}', '${SCHOOL}', 'Harness class K2 (2027)', '2', '${YEAR_2027}', '${HO}');
INSERT INTO public.children (id, first_name, last_name, class_id, created_by, archived_at) VALUES
  ('${X1}', 'Child', 'One', '${K}', '${HO}', NULL), ('${X2}', 'Child', 'Two', '${K}', '${HO}', NULL),
  ('${X3}', 'Child', 'Three', '${K}', '${HO}', NULL), ('${XA}', 'Child', 'Archived', '${K}', '${HO}', now() - interval '1 day');
INSERT INTO public.child_class_memberships (child_id, class_id, academic_year_id, enrolled_at, created_by)
SELECT c, '${K}', ${activeYear}, TIMESTAMPTZ '2026-02-01 08:00:00+02', '${HO}'
FROM unnest(ARRAY['${X1}', '${X2}', '${X3}']::uuid[]) c;
INSERT INTO public.child_class_memberships (child_id, class_id, academic_year_id, enrolled_at, created_by) VALUES
  ('${X2}', '${K2}', '${YEAR_2027}', TIMESTAMPTZ '2026-11-01 08:00:00+02', '${HO}');
INSERT INTO public.child_ea_assignments (id, user_id, child_id, assigned_at, created_by, created_at, row_version) VALUES
  ('${DET.childA1}', '${A}', '${X1}', TIMESTAMPTZ '2026-02-01 08:00:00+02', '${HO}', TIMESTAMPTZ '2026-02-01 08:00:00+02', 3),
  ('${DET.childA2}', '${A}', '${X2}', TIMESTAMPTZ '2026-02-01 08:00:00+02', '${HO}', TIMESTAMPTZ '2026-02-01 08:00:00+02', 3),
  ('${deterministicId('child_ea_assignments', A, XA)}', '${A}', '${XA}', TIMESTAMPTZ '2026-02-01 08:00:00+02', '${HO}', TIMESTAMPTZ '2026-02-01 08:00:00+02', 1);
UPDATE public.child_ea_assignments SET unassigned_at = TIMESTAMPTZ '2026-10-01 08:00:00+02' WHERE child_id = '${XA}';
INSERT INTO public.class_ea_assignments (id, class_id, ea_user_id, programme_id, assigned_at, created_by, created_at, row_version) VALUES
  ('${DET.classA}', '${K}', '${A}', ${programme('literacy')}, TIMESTAMPTZ '2026-02-01 08:00:00+02', '${HO}', TIMESTAMPTZ '2026-02-01 08:00:00+02', 2);
INSERT INTO public.groups (id, name, programme_id, class_id, created_by) VALUES
  ('${G}', 'Harness group G', ${programme('literacy')}, '${K}', '${HO}');
INSERT INTO public.group_ea_assignments (id, group_id, ea_user_id, programme_id, assigned_at, created_by, created_at) VALUES
  ('${DET.group}', '${G}', '${A}', ${programme('literacy')}, TIMESTAMPTZ '2026-02-01 08:00:00+02', '${HO}', TIMESTAMPTZ '2026-02-01 08:00:00+02');
INSERT INTO public.child_group_memberships (child_id, group_id, joined_at, created_by) VALUES
  ('${X1}', '${G}', TIMESTAMPTZ '2026-02-01 08:00:00+02', '${HO}');
`;

// ---------------------------------------------------------------- invariant fixtures
const inv = n => id('9c', n);
const IA = inv(1); const IB = inv(2); const IS = inv(3); const IW = inv(4); const IN = inv(5);
const KC = inv(11); const KH = inv(12); const KG = inv(13); const KU = inv(14);
const XC = inv(21); const XH = inv(22); const XU = inv(23); const XD = inv(24); const XK = inv(25); const XG = inv(26);
const GC = inv(31); const GH = inv(32); const GL = inv(33);
const receipt = (reporter, kind, receivedAt, payload, byStatus) => `INSERT INTO public.mobile_support_incidents
  (reporter_id, kind, repeat_key, payload, report_id, received_at, schema_version, delivery) VALUES
  ('${reporter}', '${kind}', 'install:${kind}:${receivedAt}', '${JSON.stringify(payload)}'::jsonb, gen_random_uuid(),
   TIMESTAMPTZ '${receivedAt}', 2, ${byStatus ? `'${JSON.stringify({ outboxSummary: { byStatus } })}'::jsonb` : 'NULL'});`;
const user = (userId, email, suspended) => `INSERT INTO auth.users (id, email, banned_until) VALUES
  ('${userId}', '${email}', ${suspended ? "now() + interval '876000 hours'" : 'NULL'});
INSERT INTO public.users (id, first_name, last_name, organization_id) VALUES ('${userId}', 'Inv', '${email}', '${ORG}');`;

// Every invariant holds: held children in live held classes (XK only through the class, XG only
// through the group, so each holder arm is load-bearing), one membership each, no terminal
// receipts, and the only suspended EA's newest receipt shows nothing waiting (an older one did).
const cleanInvariantSql = `
${user(IA, 'inv.a@example.test', false)}
${user(IB, 'inv.b@example.test', false)}
${user(IS, 'inv.s@example.test', true)}
INSERT INTO public.schools (id, name) VALUES ('${inv(99)}', 'Invariant school');
INSERT INTO public.classes (id, school_id, name, grade, created_by) VALUES ('${KC}', '${inv(99)}', 'Clean class', '1', '${IA}');
INSERT INTO public.class_ea_assignments (class_id, ea_user_id, programme_id) VALUES ('${KC}', '${IA}', ${programme('literacy')});
INSERT INTO public.children (id, first_name, last_name, created_by) VALUES ('${XC}', 'Clean', 'Child', '${IA}');
INSERT INTO public.child_class_memberships (child_id, class_id, academic_year_id) VALUES ('${XC}', '${KC}', ${activeYear});
INSERT INTO public.child_ea_assignments (user_id, child_id) VALUES ('${IA}', '${XC}');
INSERT INTO public.groups (id, name, programme_id, class_id) VALUES ('${GC}', 'Clean group', ${programme('literacy')}, '${KC}');
INSERT INTO public.group_ea_assignments (group_id, ea_user_id, programme_id) VALUES ('${GC}', '${IA}', ${programme('literacy')});
INSERT INTO public.child_group_memberships (child_id, group_id) VALUES ('${XC}', '${GC}');
INSERT INTO public.children (id, first_name, last_name) VALUES ('${XK}', 'Class', 'Only'), ('${XG}', 'Group', 'Only');
INSERT INTO public.child_class_memberships (child_id, class_id, academic_year_id) VALUES ('${XK}', '${KC}', ${activeYear});
INSERT INTO public.child_group_memberships (child_id, group_id) VALUES ('${XG}', '${GC}');
${receipt(IS, 'diagnostics_sent', '2026-11-01T08:00:00Z', { trigger: 'manual' }, { pending: 3 })}
${receipt(IS, 'diagnostics_sent', '2026-11-02T08:00:00Z', { trigger: 'manual' }, { terminal: 1 })}
${receipt(IB, 'diagnostics_sent', '2026-11-02T08:00:00Z', { trigger: 'manual' }, { pending: 4 })}
${receipt(IB, 'upload_backlog_stale', '2026-11-02T09:00:00Z', { unsentByTable: { sessions: 4 } }, { pending: 4 })}
`;

// Exactly one hit per check on top of the clean fixture.
const seededHits = {
  archived_child_still_held: { entity_table: 'children', entity_id: XH },
  archived_class_still_assigned: { entity_table: 'classes', entity_id: KH },
  archived_group_still_assigned: { entity_table: 'groups', entity_id: GH },
  live_group_in_archived_class: { entity_table: 'groups', entity_id: GL },
  unheld_live_child: { entity_table: 'children', entity_id: XU },
  unheld_live_class: { entity_table: 'classes', entity_id: KU },
  delivery_child_without_live_class: { entity_table: 'children', entity_id: XD },
  duplicate_active_group_membership: { entity_table: 'children', entity_id: XC },
  upload_terminal_receipts: { entity_table: 'session_attendees', entity_id: null },
  suspended_ea_with_backlog: { entity_table: 'users', entity_id: IW },
};
const seededInvariantSql = `
INSERT INTO public.children (id, first_name, last_name, archived_at) VALUES
  ('${XH}', 'Archived', 'Held', now()), ('${XU}', 'Unheld', 'Child', NULL), ('${XD}', 'Classless', 'Delivered', NULL);
INSERT INTO public.child_ea_assignments (user_id, child_id) VALUES ('${IA}', '${XH}'), ('${IA}', '${XD}');
INSERT INTO public.classes (id, school_id, name, grade, archived_at) VALUES
  ('${KH}', '${inv(99)}', 'Archived held', '1', now()), ('${KG}', '${inv(99)}', 'Archived with live group', '1', now()),
  ('${KU}', '${inv(99)}', 'Unheld class', '1', NULL);
INSERT INTO public.class_ea_assignments (class_id, ea_user_id, programme_id) VALUES ('${KH}', '${IA}', ${programme('literacy')});
INSERT INTO public.groups (id, name, programme_id, class_id, archived_at) VALUES
  ('${GH}', 'Archived held group', ${programme('literacy')}, '${KC}', now()),
  ('${GL}', 'Live group, archived class', ${programme('literacy')}, '${KG}', NULL);
INSERT INTO public.group_ea_assignments (group_id, ea_user_id, programme_id) VALUES ('${GH}', '${IA}', ${programme('literacy')});
INSERT INTO public.child_group_memberships (child_id, group_id) VALUES ('${XC}', '${GC}');
${receipt(IA, 'upload_terminal', '2026-11-03T08:00:00Z', { table: 'session_attendees', errorCode: '42501', errorClass: 'terminal' })}
${user(IW, 'inv.w@example.test', true)}
${receipt(IW, 'diagnostics_sent', '2026-11-03T09:00:00Z', { trigger: 'manual' }, { pending: 2, terminal: 1 })}
`;

const psqlScript = (databaseUrl, sql, label) => {
  const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-Atq', databaseUrl, '-f', '-'], {
    input: sql, encoding: 'utf8', env: buildPsqlEnv(label), timeout: 180_000,
  });
  assert.equal(result.status, 0, `${label} failed:\n${(result.stderr || result.stdout || '').trim()}`);
  return result.stdout.trim();
};
const invariantRows = (databaseUrl, setupSql, label) => JSON.parse(psqlScript(databaseUrl, `BEGIN;
${setupSql}
SELECT coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb) FROM (${INVARIANTS_SQL.trim().replace(/;$/, '')}) h;
ROLLBACK;`, label));

const runInvariantCases = (databaseUrl, summary) => {
  const pass = label => { summary[label] = 'passed'; };
  assert.deepEqual(invariantRows(databaseUrl, '', 'invariants-migrated-only'), [], 'reference data alone is clean');
  pass('invariants-migrations-only-no-hits');
  assert.deepEqual(invariantRows(databaseUrl, cleanInvariantSql, 'invariants-clean'), [], 'clean fixture has no hits');
  pass('invariants-clean-fixture-no-hits');

  const rows = invariantRows(databaseUrl, `${cleanInvariantSql}\n${seededInvariantSql}`, 'invariants-seeded');
  assert.deepEqual(rows.map(row => row.check_name).sort(), Object.keys(seededHits).sort(), JSON.stringify(rows, null, 1));
  for (const row of rows) {
    const expected = seededHits[row.check_name];
    assert.equal(row.entity_table, expected.entity_table, row.check_name);
    assert.equal(row.entity_id, expected.entity_id, row.check_name);
  }
  const byCheck = Object.fromEntries(rows.map(row => [row.check_name, row.detail]));
  assert.deepEqual(byCheck.archived_child_still_held.holders.map(h => [h.ea_user_id, h.path]), [[IA, 'direct']]);
  assert.equal(byCheck.duplicate_active_group_membership.group_id, GC);
  assert.equal(byCheck.duplicate_active_group_membership.membership_ids.length, 2);
  assert.deepEqual([byCheck.upload_terminal_receipts.error_code, byCheck.upload_terminal_receipts.receipts], ['42501', 1]);
  assert.deepEqual([byCheck.suspended_ea_with_backlog.waiting, byCheck.suspended_ea_with_backlog.needs_attention], [2, 1]);
  pass('invariants-seeded-one-hit-per-check');

  const noReceipt = invariantRows(databaseUrl, `${cleanInvariantSql}\n${user(IN, 'inv.n@example.test', true)}`, 'invariants-no-receipt');
  assert.deepEqual(noReceipt.map(row => [row.check_name, row.entity_id, row.detail.backlog]),
    [['suspended_ea_with_backlog', IN, 'unknown, no receipt']]);
  pass('invariants-suspended-without-receipt-is-listed');

  // The file runs unchanged as one statement inside a READ ONLY transaction (as the helper runs it).
  const raw = psqlScript(databaseUrl, `BEGIN;\n${cleanInvariantSql}\n${seededInvariantSql}\nSET TRANSACTION READ ONLY;\n${INVARIANTS_SQL}\nROLLBACK;`,
    'invariants-raw-read-only');
  assert.equal(raw.split('\n').filter(Boolean).length, Object.keys(seededHits).length);
  pass('invariants-file-runs-read-only-as-one-statement');
};

// ---------------------------------------------------------------- operator command cases
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const makeCli = (databaseUrl) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-ho-lifecycle-harness-'));
  fs.writeFileSync(path.join(cwd, '.env.local'), "SUPABASE_DB_PASSWORD_SQLITE='harness-not-a-real-password'\n");
  const cli = (argv, { loseResponse = false } = {}) => {
    const log = [];
    const calls = [];
    let lost = false;
    const spawnPsql = (_command, args, options) => {
      const index = args.indexOf('--dbname');
      assert.equal(args[index + 1], PINNED, 'the script must build its pinned masi-app-sqlite target');
      const localArgs = [...args];
      localArgs[index + 1] = databaseUrl;
      const result = spawnSync('psql', localArgs, { ...options, env: { ...options.env, ...buildPsqlEnv('ho-lifecycle-cli') } });
      calls.push(options.input);
      if (loseResponse && !lost && result.status === 0 && /COMMIT;\s*$/.test(options.input)) {
        lost = true;
        return { status: 1, stdout: '', stderr: 'simulated lost response after COMMIT' };
      }
      return result;
    };
    let error = null;
    try {
      runCli(argv, { cwd, env: { PATH: process.env.PATH }, spawnSync: spawnPsql, psql: 'psql',
        log: line => log.push(JSON.parse(line)) });
    } catch (caught) { error = caught; }
    const pick = key => log.find(entry => entry[key])?.[key];
    return { error, calls, targets: pick('targets'), plan: pick('plan'), applied: pick('applied'),
      confirmed: log.some(entry => entry.confirmed === true) };
  };
  cli.cleanup = () => fs.rmSync(cwd, { recursive: true, force: true });
  return cli;
};

const ok = (result, label) => {
  assert.equal(result.error, null, `${label}: ${result.error?.message}`);
  return result;
};

// A second session holds one row lock for 4 s. The dry run must not wait for it; apply must,
// because the server's archive decisions (private.other_active_holder) rely on every Head
// Office grant locking the classes and groups whose holders it can change.
const makeLockProbe = (databaseUrl, cli, prefix) => {
  let holders = 0;
  return (table, rowId, argv, label) => {
    holders += 1;
    const name = `${prefix}-lock-holder-${holders}`;
    const holder = spawn('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-Atq', databaseUrl, '-c',
      `BEGIN; SELECT 1 FROM public.${table} WHERE id = '${rowId}' FOR UPDATE; SELECT pg_sleep(4); COMMIT;`],
    { env: buildPsqlEnv(name), stdio: 'ignore' });
    holder.unref();
    let held = false;
    for (let attempt = 0; attempt < 100 && !held; attempt += 1) {
      held = runPsql({ databaseUrl, label: 'lock-holder-ready',
        sql: `SELECT count(*) FROM pg_stat_activity WHERE application_name = 'masi-history-rls-${name}'
        AND wait_event = 'PgSleep';` }) === '1';
      if (!held) sleep(100);
    }
    assert.ok(held, `${label}: lock holder did not start`);
    const started = Date.now();
    ok(cli(argv), `${label}-dry-run-under-lock`);
    assert.ok(Date.now() - started < 1500, `${label}: the dry run waited for a row lock`);
    const result = ok(cli([...argv, '--apply']), label);
    const waited = Date.now() - started;
    assert.ok(waited >= 2500, `${label}: apply did not wait for the held ${table} row lock (${waited} ms)`);
    return result;
  };
};

const runCommandCases = (databaseUrl, summary) => {
  const pass = label => { summary[label] = 'passed'; };
  const sql = (text, label) => runPsql({ databaseUrl, sql: text, label });
  const json = (text, label) => JSON.parse(sql(text, label));
  const snapshot = () => sql(`SELECT jsonb_build_object(
    'child_ea', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.child_ea_assignments t),
    'class_ea', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.class_ea_assignments t),
    'group_ea', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.group_ea_assignments t),
    'ccm', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.child_class_memberships t),
    'cgm', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.child_group_memberships t),
    'children', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.children t),
    'classes', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.classes t),
    'groups', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.groups t))::text;`, 'snapshot');
  const row = (table, rowId) => json(`SELECT coalesce(to_jsonb(t), 'null'::jsonb) FROM (SELECT 1) one
    LEFT JOIN public.${table} t ON t.id = '${rowId}';`, `row-${table}`);
  const rows = (table, where) => json(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.assigned_at, t.id), '[]'::jsonb)
    FROM public.${table} t WHERE ${where};`, `rows-${table}`);
  const cli = makeCli(databaseUrl);
  const reason = ['--reason', REASON, '--operator', OPERATOR];
  const handoverChild = (from, to, children) => ['handover', 'child', '--from', from, '--to', to, '--children', children, ...reason];
  const handoverClass = (from, to, delivery, code = 'literacy') => ['handover', 'class', '--from', from, '--to', to,
    '--class', K, '--programme', code, '--delivery', delivery, ...reason];
  const handoverGroup = (from, to) => ['handover', 'group', '--from', from, '--to', to, '--group', G, ...reason];
  const endDelivery = (ea, children) => ['end-delivery', '--ea', ea, '--children', children, ...reason];
  const reopenChild = (ea, children) => ['reopen', 'child', '--ea', ea, '--children', children, ...reason];
  const reopenClass = ea => ['reopen', 'class', '--ea', ea, '--class', K, '--programme', 'literacy', ...reason];
  const apply = argv => [...argv, '--apply'];
  const kinds = actions => actions.map(action => `${action.action}:${action.table}`).sort();
  const underHeldLock = makeLockProbe(databaseUrl, cli, 'ho');
  const versionsSql = `SELECT jsonb_object_agg(id, row_version) FROM (
    SELECT id, row_version FROM public.child_ea_assignments UNION ALL SELECT id, row_version FROM public.class_ea_assignments
    UNION ALL SELECT id, row_version FROM public.group_ea_assignments) v;`;
  const literacy = json(`SELECT to_jsonb(${programme('literacy')});`, 'literacy-id');
  DET.classA = deterministicId('class_ea_assignments', K, A, literacy);
  sql(fixtureSql(), 'ho-lifecycle-fixture');
  const seededVersions = json(versionsSql, 'seeded-versions');

  try {
    // Every command's dry run changes nothing, and is planned in a read-only transaction.
    const base = snapshot();
    for (const [label, argv, expected] of [
      ['handover-child', handoverChild(EMAIL.A, EMAIL.B, X1), ['end:child_ea_assignments', 'insert:child_ea_assignments']],
      ['handover-class', handoverClass(EMAIL.A, EMAIL.B, 'move'), ['end:child_ea_assignments', 'end:child_ea_assignments',
        'end:class_ea_assignments', 'insert:child_ea_assignments', 'insert:child_ea_assignments', 'insert:class_ea_assignments']],
      ['handover-group', handoverGroup(EMAIL.A, EMAIL.B), ['end:group_ea_assignments', 'insert:group_ea_assignments']],
      ['end-delivery', endDelivery(EMAIL.A, X2), ['end:child_ea_assignments']],
      ['reopen-child', reopenChild(EMAIL.A, X1), ['already_active:child_ea_assignments']],
      ['reopen-class', reopenClass(EMAIL.A), ['already_active:class_ea_assignments']],
    ]) {
      const result = ok(cli(argv), `dry-run-${label}`);
      assert.equal(result.plan.read_only, 'on');
      if (label === 'handover-child') {
        assert.deepEqual(result.targets.entities, [{ kind: 'child', id: X1, name: 'Child One', archived: false }]);
        assert.deepEqual([result.targets.from.id, result.targets.to.id, result.targets.to.email], [A, B, 'EA.B@Example.test']);
      }
      assert.deepEqual(kinds(result.plan.actions), expected, label);
      assert.equal(result.calls.length, 2);
      assert.ok(result.calls.every(input => /^BEGIN READ ONLY;/.test(input) && !/\bCOMMIT\b/.test(input)));
      assert.equal(snapshot(), base, `${label} dry run changed the database`);
      pass(`dry-run-${label}-changes-nothing`);
    }

    // Child handover A -> B with the response lost after COMMIT, then the operator's rerun.
    const lost = cli(apply(handoverChild(EMAIL.A, 'EA.B@EXAMPLE.TEST', X1)), { loseResponse: true });
    assert.match(lost.error?.message ?? '', /simulated lost response/);
    const a1 = row('child_ea_assignments', DET.childA1);
    const b1 = row('child_ea_assignments', DET.childB1);
    assert.ok(a1.unassigned_at, 'predecessor row ended');
    assert.deepEqual([a1.row_version, a1.assigned_at, a1.created_by], [3, '2026-02-01T06:00:00+00:00', HO]);
    assert.deepEqual([b1.user_id, b1.child_id, b1.unassigned_at, b1.row_version, b1.created_by], [B, X1, null, 1, null]);
    assert.equal(b1.assigned_at, a1.unassigned_at, 'successor starts when the predecessor ends');
    pass('child-handover-commits-deterministic-successor');
    const afterLost = snapshot();
    const rerun = ok(cli(apply(handoverChild(EMAIL.A, EMAIL.B, X1))), 'child-handover-rerun');
    assert.deepEqual(kinds(rerun.applied.actions), ['already_active:child_ea_assignments', 'not_active:child_ea_assignments']);
    assert.ok(rerun.confirmed);
    assert.equal(snapshot(), afterLost, 'rerun after a lost response changed nothing');
    pass('child-handover-rerun-after-lost-response-is-idempotent');

    // B -> A: A's deterministic row is reopened in place (identity and start kept), gap reported.
    const back = underHeldLock('classes', K, handoverChild(EMAIL.B, EMAIL.A, X1), 'child-handover-back');
    pass('child-handover-waits-for-the-child-class-lock');
    assert.ok(back.confirmed);
    const reopened = back.applied.actions.find(action => action.action === 'reopen');
    assert.equal(reopened.id, DET.childA1);
    assert.equal(reopened.gap.from, a1.unassigned_at);
    const a1Again = row('child_ea_assignments', DET.childA1);
    assert.deepEqual([a1Again.unassigned_at, a1Again.assigned_at, a1Again.created_at, a1Again.created_by, a1Again.row_version],
      [null, a1.assigned_at, a1.created_at, HO, 3]);
    assert.equal(rows('child_ea_assignments', `user_id = '${A}' AND child_id = '${X1}'`).length, 1);
    assert.ok(row('child_ea_assignments', DET.childB1).unassigned_at);
    pass('child-handover-back-to-former-holder-reopens-in-place');

    // The identity trigger is live, so the reopen above really kept identity columns.
    expectSqlState({ databaseUrl, label: 'identity-trigger', sqlState: '23514',
      sql: `UPDATE public.child_ea_assignments SET assigned_at = now() WHERE id = '${DET.childA1}';` });
    pass('identity-trigger-active-on-reopened-row');

    // Class handover A -> B with delivery: class row and A's delivery rows for the class move.
    // B's ended deterministic row for X1 is reopened; X2 gets B's deterministic row.
    const classMove = underHeldLock('classes', K2, handoverClass(EMAIL.A, EMAIL.B, 'move'), 'class-handover-move');
    pass('class-handover-move-waits-for-a-moved-child-other-class-lock');
    assert.ok(classMove.confirmed);
    DET.classB = classMove.applied.actions.find(action => action.table === 'class_ea_assignments' && action.action === 'insert').id;
    assert.equal(DET.classB, deterministicId('class_ea_assignments', K, B, literacy));
    assert.deepEqual(kinds(classMove.applied.actions), ['end:child_ea_assignments', 'end:child_ea_assignments',
      'end:class_ea_assignments', 'insert:child_ea_assignments', 'insert:class_ea_assignments', 'reopen:child_ea_assignments']);
    assert.equal(row('class_ea_assignments', DET.classA).handover_reason, REASON);
    assert.equal(row('class_ea_assignments', DET.classA).row_version, 2);
    assert.equal(row('child_ea_assignments', DET.childB1).unassigned_at, null);
    assert.equal(row('child_ea_assignments', DET.childB2).unassigned_at, null);
    assert.ok(row('child_ea_assignments', DET.childA1).unassigned_at && row('child_ea_assignments', DET.childA2).unassigned_at);
    assert.deepEqual(classMove.applied.notes.map(note => [note.code, note.group_ids]), [['groups_not_moved', [G]]]);
    const afterMove = snapshot();
    const classRerun = ok(cli(apply(handoverClass(EMAIL.A, EMAIL.B, 'move'))), 'class-handover-rerun');
    assert.ok(classRerun.confirmed);
    assert.equal(snapshot(), afterMove);
    pass('class-handover-moves-class-and-delivery-idempotently');

    // Class handover B -> A without delivery: A's class row is reopened in place; delivery stays.
    const classBack = ok(cli(apply(handoverClass(EMAIL.B, EMAIL.A, 'stay'))), 'class-handover-stay');
    assert.ok(classBack.confirmed);
    const classA = row('class_ea_assignments', DET.classA);
    assert.deepEqual([classA.unassigned_at, classA.handover_reason, classA.assigned_at, classA.row_version],
      [null, null, '2026-02-01T06:00:00+00:00', 2]);
    assert.equal(row('class_ea_assignments', DET.classB).handover_reason, REASON);
    assert.deepEqual(classBack.applied.notes.find(note => note.code === 'delivery_stays_with_predecessor').child_ids, [X1, X2]);
    assert.equal(row('child_ea_assignments', DET.childB1).unassigned_at, null);
    pass('class-handover-back-reopens-class-row-and-keeps-delivery');

    // Group handover A -> B: fresh successor id (the group's id is f(group) and ea_user_id is
    // immutable), rerun after a lost response, then back to A with another fresh id.
    const groupLost = cli(apply(handoverGroup(EMAIL.A, EMAIL.B)), { loseResponse: true });
    assert.match(groupLost.error?.message ?? '', /simulated lost response/);
    const groupRerun = ok(cli(apply(handoverGroup(EMAIL.A, EMAIL.B))), 'group-handover-rerun');
    assert.ok(groupRerun.confirmed);
    assert.deepEqual(kinds(groupRerun.applied.actions), ['already_active:group_ea_assignments', 'not_active:group_ea_assignments']);
    let groupRows = rows('group_ea_assignments', `group_id = '${G}'`);
    assert.equal(groupRows.length, 2);
    assert.deepEqual([groupRows[0].id, groupRows[0].ea_user_id, groupRows[0].handover_reason], [DET.group, A, REASON]);
    assert.ok(groupRows[0].unassigned_at);
    assert.notEqual(groupRows[1].id, DET.group);
    assert.deepEqual([groupRows[1].ea_user_id, groupRows[1].unassigned_at, groupRows[1].created_by], [B, null, null]);
    const groupBack = underHeldLock('classes', K, handoverGroup(EMAIL.B, EMAIL.A), 'group-handover-back');
    pass('group-handover-waits-for-the-group-class-lock');
    assert.ok(groupBack.confirmed);
    groupRows = rows('group_ea_assignments', `group_id = '${G}'`);
    assert.equal(groupRows.length, 3);
    assert.deepEqual(groupRows.filter(entry => entry.unassigned_at === null).map(entry => entry.ea_user_id), [A]);
    assert.equal(new Set(groupRows.map(entry => entry.id)).size, 3);
    assert.ok(row('group_ea_assignments', DET.group).unassigned_at, 'the original row is not reopened');
    pass('group-handover-uses-fresh-successor-ids-and-is-idempotent');

    // end-delivery waits for a held child-row lock (the dry run does not), then ends only X1.
    const ended = underHeldLock('children', X1, endDelivery(EMAIL.B, X1), 'end-delivery');
    assert.ok(ended.confirmed);
    const b1Ended = row('child_ea_assignments', DET.childB1);
    assert.ok(b1Ended.unassigned_at);
    assert.equal(row('child_ea_assignments', DET.childB2).unassigned_at, null);
    const afterEnd = snapshot();
    const endRerun = ok(cli(apply(endDelivery(EMAIL.B, X1))), 'end-delivery-rerun');
    assert.deepEqual(kinds(endRerun.applied.actions), ['not_active:child_ea_assignments']);
    assert.ok(endRerun.confirmed);
    assert.equal(snapshot(), afterEnd);
    pass('end-delivery-locks-ends-only-named-children-idempotently');

    // reopen clears the end in place on the deterministic rows and reports the gap.
    const reopenedChild = underHeldLock('groups', G, reopenChild(EMAIL.B, X1), 'reopen-child');
    pass('reopen-child-waits-for-the-child-group-lock');
    assert.ok(reopenedChild.confirmed);
    assert.equal(reopenedChild.applied.actions[0].gap.from, b1Ended.unassigned_at);
    assert.equal(row('child_ea_assignments', DET.childB1).unassigned_at, null);
    assert.equal(row('child_ea_assignments', DET.childB1).assigned_at, b1.assigned_at);
    const reopenedClass = ok(cli(apply(reopenClass(EMAIL.B))), 'reopen-class');
    assert.ok(reopenedClass.confirmed);
    assert.deepEqual([row('class_ea_assignments', DET.classB).unassigned_at, row('class_ea_assignments', DET.classB).handover_reason], [null, null]);
    assert.equal(rows('class_ea_assignments', `unassigned_at IS NULL AND class_id = '${K}'`).length, 2);
    pass('reopen-child-and-class-clear-the-end-in-place');

    // Refusals change nothing and never reach a COMMIT.
    const beforeRefusals = snapshot();
    for (const [label, argv, message] of [
      ['archived-child', apply(reopenChild(EMAIL.A, XA)), /refused: child_archived/],
      ['outside-programme', apply(handoverClass(EMAIL.A, EMAIL.C, 'stay')), /refused: ea_not_in_programme/],
      ['predecessor-not-holding', apply(handoverChild(EMAIL.A, EMAIL.B, X3)), /refused: predecessor_not_holding/],
      ['no-row-to-reopen', apply(reopenChild(EMAIL.C, X3)), /refused: no_row_to_reopen/],
      ['unknown-email', apply(handoverChild('nobody@example.test', EMAIL.B, X2)), /No Auth user matches/],
      ['prefix-email', apply(handoverChild('ea.b@example', EMAIL.A, X2)), /No Auth user matches/],
      ['suspended-successor', apply(handoverChild(EMAIL.B, EMAIL.S, X2)), /suspended/],
      ['unknown-programme', apply(handoverClass(EMAIL.A, EMAIL.B, 'stay', 'not_a_programme')), /No programme/],
    ]) {
      const result = cli(argv);
      assert.match(result.error?.message ?? '', message, label);
      assert.ok(result.calls.every(input => !/\bCOMMIT\b/.test(input)), `${label} reached an apply`);
      assert.equal(result.confirmed, false);
      pass(`refuse-${label}`);
    }
    assert.equal(snapshot(), beforeRefusals);
    pass('refusals-change-nothing');

    // row_version: seeded rows keep their versions; script-inserted rows stay at the default.
    const versions = json(versionsSql, 'final-versions');
    for (const [rowId, version] of Object.entries(versions)) {
      assert.equal(version, seededVersions[rowId] ?? 1, `row_version changed on ${rowId}`);
    }
    pass('row-version-never-bumped');
  } finally {
    cli.cleanup();
  }
};

// ---------------------------------------------------------------- restore child
// Undo a mistaken Delete child. Each removal is produced through the real path, as the EA
// (role authenticated with the EA's JWT claims): the server's Delete child
// (public.delete_child_if_no_history, lifecycle migration 20261105120300) or the 1.5.0 phone's
// archiveChild chain (one UPDATE ... RETURNING id per row, in its push order, all stamped with
// the same phone time). These cases need the server lifecycle batch (20261105120000-120300);
// see collectMigrations.
const rid = (prefix, n) => id(prefix, n);
const RHO = rid('1d', 1); const RX = rid('1d', 2); const RY = rid('1d', 3); const RS = rid('1d', 4); const RN = rid('1d', 5);
const R_EMAIL = { X: 'restore.x@example.test', Y: 'restore.y@example.test', S: 'restore.s@example.test', N: 'restore.n@example.test' };
const R_SCHOOL = rid('2d', 1);
const R_YEAR_2028 = rid('3d', 1);
const RK = rid('4d', 1); const RKB = rid('4d', 2); const RK5 = rid('4d', 5);
const R1 = rid('5d', 1); const R2 = rid('5d', 2); const R3 = rid('5d', 3); const R4 = rid('5d', 4);
const R5 = rid('5d', 5); const R7 = rid('5d', 7); const R_MISSING = rid('5d', 99);
// Review cases (2026-11-05): creator removals after a Head Office change, wrong phone clocks, and a
// second open membership of one group.
const R8 = rid('5d', 8); const R9 = rid('5d', 9); const R10 = rid('5d', 10); const R11 = rid('5d', 11);
const R12 = rid('5d', 12); const R13 = rid('5d', 13);
const V7 = rid('6d', 7);
const G1 = rid('7d', 1); const G2 = rid('7d', 2); const GB = rid('7d', 3); const GY = rid('7d', 4);
const G5E = rid('7d', 5); const G5A = rid('7d', 6); const G5N = rid('7d', 7); const G7A = rid('7d', 8);
const G7B = rid('7d', 9); const G3F = rid('7d', 10);
const G8 = rid('7d', 11); const G9 = rid('7d', 12); const G10 = rid('7d', 13); const G11 = rid('7d', 14);
const G12 = rid('7d', 15); const G13 = rid('7d', 16);
const enrolment = n => rid('ad', n);
const classMembership = (n, k = 0) => rid('bd', n * 10 + k);
const groupMembership = (n, k) => rid('cd', n * 10 + k);
const R_GRANT_START = '2026-09-01T07:00:00+02:00';
const restoreDet = (ea, child) => deterministicId('child_ea_assignments', ea, child);

const restoreFixtureSql = () => `
INSERT INTO auth.users (id, email, banned_until) VALUES
  ('${RHO}', 'restore.ho@example.test', NULL), ('${RX}', '${R_EMAIL.X}', NULL), ('${RY}', '${R_EMAIL.Y}', NULL),
  ('${RS}', '${R_EMAIL.S}', now() + interval '876000 hours'), ('${RN}', '${R_EMAIL.N}', NULL);
INSERT INTO public.schools (id, name) VALUES ('${R_SCHOOL}', 'Restore harness school');
INSERT INTO public.users (id, first_name, last_name, school_id, organization_id) VALUES
  ('${RHO}', 'Restore', 'Office', '${R_SCHOOL}', '${ORG}'), ('${RX}', 'EA', 'X', '${R_SCHOOL}', '${ORG}'),
  ('${RY}', 'EA', 'Y', '${R_SCHOOL}', '${ORG}'), ('${RS}', 'EA', 'Suspended', '${R_SCHOOL}', '${ORG}'),
  ('${RN}', 'EA', 'Never', '${R_SCHOOL}', '${ORG}');
INSERT INTO public.staff_programme_assignments (user_id, programme_id, school_id, assigned_at, created_by)
SELECT u, ${programme('literacy')}, '${R_SCHOOL}', TIMESTAMPTZ '${R_GRANT_START}', '${RHO}'
FROM unnest(ARRAY['${RX}', '${RY}', '${RS}', '${RN}']::uuid[]) u;
INSERT INTO public.academic_years (id, label, starts_on, ends_on, is_active) VALUES
  ('${R_YEAR_2028}', 'restore-harness-2028', '2028-01-15', '2028-12-15', false);
INSERT INTO public.classes (id, school_id, name, grade, academic_year_id, created_by) VALUES
  ('${RK}', '${R_SCHOOL}', 'Restore class K', '1', ${activeYear}, '${RHO}'),
  ('${RKB}', '${R_SCHOOL}', 'Restore class KB', '2', ${activeYear}, '${RHO}'),
  ('${RK5}', '${R_SCHOOL}', 'Restore class K5 (2028)', '3', '${R_YEAR_2028}', '${RHO}');
INSERT INTO public.class_ea_assignments (class_id, ea_user_id, programme_id, assigned_at, created_by) VALUES
  ('${RK}', '${RX}', ${programme('literacy')}, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}'),
  ('${RKB}', '${RY}', ${programme('literacy')}, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}'),
  ('${RK5}', '${RX}', ${programme('literacy')}, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}');
INSERT INTO public.grouping_versions (id, class_id, academic_year_id, version_number) VALUES
  ('${V7}', '${RK}', ${activeYear}, 1);
INSERT INTO public.groups (id, name, programme_id, class_id, grouping_version_id, created_by) VALUES
  ('${G1}', 'Restore group 1 (no class)', ${programme('literacy')}, NULL, NULL, '${RHO}'),
  ('${G2}', 'Restore group 2 (X created, unheld)', ${programme('literacy')}, '${RKB}', NULL, '${RX}'),
  ('${GB}', 'Restore group B (class KB)', ${programme('literacy')}, '${RKB}', NULL, '${RHO}'),
  ('${GY}', 'Restore group Y', ${programme('literacy')}, '${RK}', NULL, '${RHO}'),
  ('${G5E}', 'Restore group 5E (ended earlier)', ${programme('literacy')}, '${RK}', NULL, '${RHO}'),
  ('${G5A}', 'Restore group 5A (archived later)', ${programme('literacy')}, '${RK}', NULL, '${RHO}'),
  ('${G5N}', 'Restore group 5N (unheld)', ${programme('literacy')}, '${RK}', NULL, '${RHO}'),
  ('${G7A}', 'Restore group 7A', ${programme('literacy')}, '${RK}', '${V7}', '${RHO}'),
  ('${G7B}', 'Restore group 7B', ${programme('literacy')}, '${RK}', '${V7}', '${RHO}'),
  ('${G3F}', 'Restore group 3F (fast clock)', ${programme('literacy')}, '${RK}', NULL, '${RHO}'),
  ('${G8}', 'Restore group 8', ${programme('literacy')}, '${RK}', NULL, '${RHO}'),
  ('${G9}', 'Restore group 9', ${programme('literacy')}, '${RK}', NULL, '${RHO}'),
  ('${G10}', 'Restore group 10', ${programme('literacy')}, '${RK}', NULL, '${RHO}'),
  ('${G11}', 'Restore group 11', ${programme('literacy')}, '${RK}', NULL, '${RHO}'),
  ('${G12}', 'Restore group 12', ${programme('literacy')}, '${RK}', NULL, '${RHO}'),
  ('${G13}', 'Restore group 13 (no grouping version)', ${programme('literacy')}, '${RK}', NULL, '${RHO}');
INSERT INTO public.group_ea_assignments (group_id, ea_user_id, programme_id, assigned_at, created_by)
SELECT g, '${RX}', ${programme('literacy')}, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}'
FROM unnest(ARRAY['${G1}', '${GB}', '${G3F}', '${G5E}', '${G5A}', '${G7A}', '${G8}', '${G9}', '${G10}', '${G11}',
  '${G12}', '${G13}']::uuid[]) g;
INSERT INTO public.group_ea_assignments (group_id, ea_user_id, programme_id, assigned_at, created_by)
SELECT g, '${RY}', ${programme('literacy')}, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}'
FROM unnest(ARRAY['${GY}', '${G7B}']::uuid[]) g;
INSERT INTO public.children (id, first_name, last_name, class_id, created_by) VALUES
  ('${R1}', 'Restore', 'One', '${RK}', '${RHO}'), ('${R2}', 'Restore', 'Two', '${RK}', '${RHO}'),
  ('${R3}', 'Restore', 'Three', '${RK}', '${RHO}'), ('${R4}', 'Restore', 'Four', '${RK}', '${RHO}'),
  ('${R5}', 'Restore', 'Five', '${RK}', '${RHO}'), ('${R7}', 'Restore', 'Seven', '${RK}', '${RHO}'),
  ('${R10}', 'Restore', 'Ten', '${RK}', '${RHO}'), ('${R11}', 'Restore', 'Eleven', '${RK}', '${RHO}'),
  ('${R12}', 'Restore', 'Twelve', '${RK}', '${RHO}'), ('${R13}', 'Restore', 'Thirteen', '${RK}', '${RHO}');
-- X added R8 and R9 in the app, so X may Delete child them (the app allows the creator) even
-- after Head Office has moved or ended X's delivery.
INSERT INTO public.children (id, first_name, last_name, class_id, created_by) VALUES
  ('${R8}', 'Restore', 'Eight', '${RK}', '${RX}'), ('${R9}', 'Restore', 'Nine', '${RK}', '${RX}');
-- Seeded row_versions above 1 make "restore never writes row_version" observable.
INSERT INTO public.child_ea_assignments (id, user_id, child_id, assigned_at, created_by, row_version)
SELECT d.id, d.ea, d.child, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}', 3
FROM (VALUES ('${restoreDet(RX, R1)}'::uuid, '${RX}'::uuid, '${R1}'::uuid), ('${restoreDet(RX, R2)}', '${RX}', '${R2}'),
  ('${restoreDet(RY, R2)}', '${RY}', '${R2}'), ('${restoreDet(RX, R3)}', '${RX}', '${R3}'),
  ('${restoreDet(RX, R4)}', '${RX}', '${R4}'), ('${restoreDet(RY, R4)}', '${RY}', '${R4}'),
  ('${restoreDet(RX, R5)}', '${RX}', '${R5}'), ('${restoreDet(RX, R7)}', '${RX}', '${R7}'),
  ('${restoreDet(RY, R7)}', '${RY}', '${R7}'), ('${restoreDet(RX, R8)}', '${RX}', '${R8}'), ('${restoreDet(RX, R9)}', '${RX}', '${R9}'),
  ('${restoreDet(RX, R10)}', '${RX}', '${R10}'), ('${restoreDet(RX, R11)}', '${RX}', '${R11}'),
  ('${restoreDet(RX, R12)}', '${RX}', '${R12}'), ('${restoreDet(RY, R12)}', '${RY}', '${R12}'),
  ('${restoreDet(RX, R13)}', '${RX}', '${R13}'), ('${restoreDet(RY, R13)}', '${RY}', '${R13}')) d(id, ea, child);
INSERT INTO public.child_programme_enrollments (id, child_id, programme_id, enrolled_at, created_by, row_version)
SELECT ('ad000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, ('5d000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  ${programme('literacy')}, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}', 2
FROM unnest(ARRAY[1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13]) n;
INSERT INTO public.child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at, created_by)
SELECT ('bd000000-0000-0000-0000-' || lpad((n * 10)::text, 12, '0'))::uuid, ('5d000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  '${RK}', ${activeYear}, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}'
FROM unnest(ARRAY[1, 2, 3, 5, 7, 8, 9, 10, 11, 12, 13]) n;
-- R4's class is taught by Y, so after X leaves, Y is R4's last holder and Y's Delete child archives it.
INSERT INTO public.child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at, created_by) VALUES
  ('${classMembership(4)}', '${R4}', '${RKB}', ${activeYear}, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}'),
  ('${classMembership(5, 1)}', '${R5}', '${RK5}', '${R_YEAR_2028}', TIMESTAMPTZ '${R_GRANT_START}', '${RHO}');
INSERT INTO public.child_group_memberships (id, child_id, group_id, grouping_version_id, joined_at, created_by) VALUES
  ('${groupMembership(1, 1)}', '${R1}', '${G1}', NULL, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}'),
  ('${groupMembership(1, 2)}', '${R1}', '${G2}', NULL, TIMESTAMPTZ '${R_GRANT_START}', '${RX}'),
  ('${groupMembership(2, 1)}', '${R2}', '${GB}', NULL, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}'),
  ('${groupMembership(2, 2)}', '${R2}', '${GY}', NULL, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}'),
  ('${groupMembership(3, 1)}', '${R3}', '${G1}', NULL, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}'),
  ('${groupMembership(3, 2)}', '${R3}', '${G3F}', NULL, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}'),
  ('${groupMembership(4, 1)}', '${R4}', '${G1}', NULL, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}'),
  ('${groupMembership(4, 2)}', '${R4}', '${GY}', NULL, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}'),
  ('${groupMembership(5, 1)}', '${R5}', '${G1}', NULL, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}'),
  ('${groupMembership(5, 2)}', '${R5}', '${G5E}', NULL, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}'),
  ('${groupMembership(5, 3)}', '${R5}', '${G5A}', NULL, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}'),
  ('${groupMembership(5, 4)}', '${R5}', '${G5N}', NULL, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}'),
  ('${groupMembership(7, 1)}', '${R7}', '${G7A}', '${V7}', TIMESTAMPTZ '${R_GRANT_START}', '${RHO}'),
  ('${groupMembership(8, 1)}', '${R8}', '${G8}', NULL, TIMESTAMPTZ '${R_GRANT_START}', '${RX}'),
  ('${groupMembership(9, 1)}', '${R9}', '${G9}', NULL, TIMESTAMPTZ '${R_GRANT_START}', '${RX}'),
  ('${groupMembership(10, 1)}', '${R10}', '${G10}', NULL, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}'),
  ('${groupMembership(11, 1)}', '${R11}', '${G11}', NULL, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}'),
  ('${groupMembership(12, 1)}', '${R12}', '${G12}', NULL, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}'),
  ('${groupMembership(13, 1)}', '${R13}', '${G13}', NULL, TIMESTAMPTZ '${R_GRANT_START}', '${RHO}');
`;

// Extra migrations (the server lifecycle batch, before it is merged) come from a directory
// named in HO_LIFECYCLE_EXTRA_MIGRATIONS_DIR. They are merged with supabase/migrations by file
// name and replayed in one sorted order; a file present in both must be byte-identical, so the
// variable stays harmless once the batch is merged.
const collectMigrations = () => {
  const byName = new Map(fs.readdirSync(MIGRATIONS_DIR).filter(name => name.endsWith('.sql'))
    .map(name => [name, path.join(MIGRATIONS_DIR, name)]));
  const extraDir = process.env.HO_LIFECYCLE_EXTRA_MIGRATIONS_DIR;
  if (extraDir) {
    for (const name of fs.readdirSync(extraDir).filter(entry => entry.endsWith('.sql'))) {
      const file = path.join(extraDir, name);
      if (byName.has(name)) {
        assert.ok(fs.readFileSync(byName.get(name)).equals(fs.readFileSync(file)),
          `${name} differs between supabase/migrations and HO_LIFECYCLE_EXTRA_MIGRATIONS_DIR`);
      } else {
        byName.set(name, file);
      }
    }
  }
  return [...byName.keys()].sort().map(name => ({ name, file: byName.get(name) }));
};

const serverBatchApplied = databaseUrl => runPsql({ databaseUrl, label: 'server-batch-probe', sql: `SELECT
  to_regprocedure('private.other_active_holder(text,uuid,uuid,boolean)') IS NOT NULL
  AND to_regprocedure('private.guard_lifecycle_row()') IS NOT NULL;` }) === 't';

const runRestoreCases = (databaseUrl, summary) => {
  const pass = label => { summary[label] = 'passed'; };
  const sql = (text, label) => runPsql({ databaseUrl, sql: text, label });
  const json = (text, label) => JSON.parse(sql(text, label));
  const asEa = (actor, statements, label) => psqlScript(databaseUrl, `BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${actor}';
SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: actor, role: 'authenticated' })}';
${statements}
COMMIT;`, label);
  // supabase-js .rpc('delete_child_if_no_history', { p_child_id }) as PostgREST runs it.
  const serverDeleteChild = (actor, child) => {
    assert.equal(asEa(actor, `SELECT public.delete_child_if_no_history(p_child_id := '${child}'::uuid);`,
      `delete-child-${child}`), 't');
  };
  // 1.5.0 archive request: .update({ <end>: <phone time>, row_version }).eq('id', id).select('id').
  // The phone needs exactly one returned id.
  const phoneArchive = (actor, table, rowId, patch) => {
    const set = Object.entries(patch).map(([column, value]) => `${column} = ${typeof value === 'number' ? value : `'${value}'`}`).join(', ');
    assert.equal(asEa(actor, `WITH r AS (UPDATE public.${table} SET ${set} WHERE id = '${rowId}' RETURNING id) SELECT count(*) FROM r;`,
      `phone-archive-${table}`), '1', `${table} ${rowId}: the 1.5.0 archive was not acknowledged`);
  };
  // 1.5.0 session (insert or ignore) and attendee (merge upsert) for a group lesson.
  const recordLesson = (actor, sessionId, attendeeId, child, group, day) => {
    const session = `WITH r AS (INSERT INTO public.sessions (id, user_id, programme_id, class_id, group_id, session_date,
      started_at, ended_at, activities, notes, created_at, updated_at) VALUES ('${sessionId}', '${actor}', ${programme('literacy')},
      '${RK}', '${group}', DATE '${day}', TIMESTAMPTZ '${day} 09:00:00+02', TIMESTAMPTZ '${day} 09:40:00+02', '{}', '',
      TIMESTAMPTZ '${day} 09:00:00+02', TIMESTAMPTZ '${day} 09:40:00+02') ON CONFLICT (id) DO NOTHING RETURNING 1)
      SELECT count(*) FROM r;`;
    const attendee = `WITH r AS (INSERT INTO public.session_attendees (id, session_id, child_id, group_id, attendance_status,
      created_at, updated_at) VALUES ('${attendeeId}', '${sessionId}', '${child}', '${group}', 'present',
      TIMESTAMPTZ '${day} 09:00:00+02', TIMESTAMPTZ '${day} 09:40:00+02') ON CONFLICT (id) DO UPDATE SET
      attendance_status = EXCLUDED.attendance_status, updated_at = EXCLUDED.updated_at RETURNING 1) SELECT count(*) FROM r;`;
    assert.equal(asEa(actor, session, `lesson-session-${sessionId}`), '1', 'the session was refused');
    assert.equal(asEa(actor, attendee, `lesson-attendee-${attendeeId}`), '1', 'the attendee was refused');
  };
  const canWrite = (actor, child) => asEa(actor, `SELECT private.current_user_can_write_for_child('${child}');`, 'can-write');
  const eaEditsChild = (actor, child) => asEa(actor,
    `WITH r AS (UPDATE public.children SET first_name = first_name WHERE id = '${child}' RETURNING id) SELECT count(*) FROM r;`,
    'ea-edit-child');
  // Every row of one child in the tables a restore can touch, plus its history. Row counts and
  // an md5 of every row, so "nothing changed" is exact.
  const childRows = child => json(`SELECT jsonb_build_object(
    'children', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.children t WHERE t.id = '${child}'),
    'child_ea_assignments', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.child_ea_assignments t WHERE t.child_id = '${child}'),
    'child_programme_enrollments', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.child_programme_enrollments t WHERE t.child_id = '${child}'),
    'child_class_memberships', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.child_class_memberships t WHERE t.child_id = '${child}'),
    'child_group_memberships', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.child_group_memberships t WHERE t.child_id = '${child}'),
    'session_attendees', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.session_attendees t WHERE t.child_id = '${child}'));`,
  `child-rows-${child}`);
  const digest = () => sql(`SELECT string_agg(format('%s:%s:%s', x.t, x.n, x.h), ' ' ORDER BY x.t) FROM (
    SELECT 'children' AS t, count(*) AS n, md5(coalesce(string_agg(to_jsonb(r)::text, '' ORDER BY r.id), '')) AS h FROM public.children r
    UNION ALL SELECT 'child_ea_assignments', count(*), md5(coalesce(string_agg(to_jsonb(r)::text, '' ORDER BY r.id), '')) FROM public.child_ea_assignments r
    UNION ALL SELECT 'child_programme_enrollments', count(*), md5(coalesce(string_agg(to_jsonb(r)::text, '' ORDER BY r.id), '')) FROM public.child_programme_enrollments r
    UNION ALL SELECT 'child_class_memberships', count(*), md5(coalesce(string_agg(to_jsonb(r)::text, '' ORDER BY r.id), '')) FROM public.child_class_memberships r
    UNION ALL SELECT 'child_group_memberships', count(*), md5(coalesce(string_agg(to_jsonb(r)::text, '' ORDER BY r.id), '')) FROM public.child_group_memberships r
    UNION ALL SELECT 'classes', count(*), md5(coalesce(string_agg(to_jsonb(r)::text, '' ORDER BY r.id), '')) FROM public.classes r
    UNION ALL SELECT 'groups', count(*), md5(coalesce(string_agg(to_jsonb(r)::text, '' ORDER BY r.id), '')) FROM public.groups r
    UNION ALL SELECT 'sessions', count(*), md5(coalesce(string_agg(to_jsonb(r)::text, '' ORDER BY r.id), '')) FROM public.sessions r
    UNION ALL SELECT 'session_attendees', count(*), md5(coalesce(string_agg(to_jsonb(r)::text, '' ORDER BY r.id), '')) FROM public.session_attendees r) x;`,
  'restore-digest');
  const ends = child => json(`SELECT jsonb_build_object(
    'archived', (SELECT to_jsonb(c) - 'updated_at' - 'created_at' FROM (SELECT archived_at, archived_by_user_id, archive_reason, row_version FROM public.children WHERE id = '${child}') c),
    'rows', (SELECT jsonb_object_agg(x.id, jsonb_build_object('end', x.end_at, 'start', x.start_at, 'row_version', x.row_version)) FROM (
      SELECT id, unassigned_at AS end_at, assigned_at AS start_at, row_version FROM public.child_ea_assignments WHERE child_id = '${child}'
      UNION ALL SELECT id, ended_at, enrolled_at, row_version FROM public.child_programme_enrollments WHERE child_id = '${child}'
      UNION ALL SELECT id, exited_at, enrolled_at, row_version FROM public.child_class_memberships WHERE child_id = '${child}'
      UNION ALL SELECT id, removed_at, joined_at, row_version FROM public.child_group_memberships WHERE child_id = '${child}') x));`,
  `ends-${child}`);
  const cli = makeCli(databaseUrl);
  const underHeldLock = makeLockProbe(databaseUrl, cli, 'ho-restore');
  const restore = (ea, children) => ['restore', 'child', '--ea', ea, '--children', children,
    '--reason', 'Harness: undo a mistaken Delete child', '--operator', OPERATOR];
  const kinds = actions => actions.map(action => `${action.action}:${action.table}`).sort();
  const reopened = actions => actions.filter(action => action.action === 'reopen').map(action => action.id).sort();
  const sqlNowMinus = minutes => JSON.parse(sql(`SELECT to_jsonb(now() - interval '${minutes} minutes');`, 'phone-time'));

  sql(restoreFixtureSql(), 'restore-fixture');
  try {
    // ---- Case 1 (+6, +8): sole holder, server Delete child -> restore.
    recordLesson(RX, rid('e1', 1), rid('e2', 1), R1, G1, '2026-10-28');
    const lessonRow = () => sql(`SELECT to_jsonb(s)::text FROM public.sessions s WHERE id = '${rid('e1', 1)}';`, 'r1-session');
    const r1Session = lessonRow();
    assert.ok(r1Session, 'the lesson landed');
    const r1Before = childRows(R1);
    const r1Lesson = r1Before.session_attendees;
    serverDeleteChild(RX, R1);
    const r1Removed = ends(R1);
    const t1 = r1Removed.archived.archived_at;
    assert.ok(t1, 'the sole holder archived the child');
    assert.deepEqual([r1Removed.archived.archived_by_user_id, r1Removed.archived.archive_reason], [RX, 'removed_by_ea']);
    for (const rowId of [restoreDet(RX, R1), enrolment(1), classMembership(1), groupMembership(1, 1), groupMembership(1, 2)]) {
      assert.equal(r1Removed.rows[rowId].end, t1, `${rowId} ended at the removal instant`);
    }
    assert.deepEqual([canWrite(RX, R1), eaEditsChild(RX, R1)], ['f', '0'], 'the removal took the child away from X');
    pass('restore-setup-server-delete-child-archives-sole-holder-child');

    // Case 6: the dry run changes nothing and plans every row ended at T.
    const beforeDry = digest();
    const dry = ok(cli(restore(R_EMAIL.X, R1)), 'restore-dry-run');
    assert.equal(digest(), beforeDry, 'the restore dry run changed the database');
    assert.ok(dry.calls.every(input => /^BEGIN READ ONLY;/.test(input) && !/\bCOMMIT\b/.test(input)));
    assert.equal(dry.plan.read_only, 'on');
    assert.deepEqual(dry.targets.entities, [{ kind: 'child', id: R1, name: 'Restore One', archived: true }]);
    assert.deepEqual(dry.plan.removals.map(removal => [removal.child_id, removal.removed_at, removal.archived, removal.archived_by_user_id]),
      [[R1, t1, true, RX]]);
    assert.deepEqual(kinds(dry.plan.actions), ['reopen:child_class_memberships', 'reopen:child_ea_assignments',
      'reopen:child_group_memberships', 'reopen:child_group_memberships', 'reopen:child_programme_enrollments', 'unarchive:children']);
    assert.deepEqual(dry.plan.notes, []);
    assert.deepEqual(dry.plan.actions.filter(action => action.table === 'child_group_memberships').map(action => action.group_name).sort(),
      ['Restore group 1 (no class)', 'Restore group 2 (X created, unheld)']);
    pass('restore-dry-run-changes-nothing-and-plans-the-removal');

    // Case 8: apply waits for the lock on the class of a membership it reopens (R1 has no open
    // membership left, so only the ended-at-T arm puts class K in the lock set).
    const applied1 = underHeldLock('classes', RK, restore(R_EMAIL.X, R1), 'restore-sole-holder');
    pass('restore-waits-for-the-class-of-a-membership-it-reopens');
    assert.ok(applied1.confirmed);
    const r1After = childRows(R1);
    assert.deepEqual([r1After.children[0].archived_at, r1After.children[0].archived_by_user_id, r1After.children[0].archive_reason,
      r1After.children[0].row_version], [null, null, null, r1Before.children[0].row_version]);
    const sameRow = (table, before, after, endColumn) => {
      const { updated_at: _b, [endColumn]: _e, ...keep } = before;
      const { updated_at: _a, [endColumn]: end, ...kept } = after;
      assert.equal(end, null, `${table} ${before.id} reopened`);
      assert.deepEqual(kept, keep, `${table} ${before.id}: identity, start and row_version unchanged`);
    };
    for (const [table, endColumn] of [['child_ea_assignments', 'unassigned_at'], ['child_programme_enrollments', 'ended_at'],
      ['child_class_memberships', 'exited_at'], ['child_group_memberships', 'removed_at']]) {
      assert.equal(r1After[table].length, r1Before[table].length, `${table}: no row added`);
      r1Before[table].forEach((row, index) => sameRow(table, row, r1After[table][index], endColumn));
    }
    assert.deepEqual(r1After.session_attendees, r1Lesson, 'attendance untouched');
    assert.equal(lessonRow(), r1Session, 'session untouched');
    pass('restore-sole-holder-reopens-everything-in-place');

    // X has the child back: write access, an edit, and a new lesson.
    assert.deepEqual([canWrite(RX, R1), eaEditsChild(RX, R1)], ['t', '1']);
    recordLesson(RX, rid('e1', 2), rid('e2', 2), R1, G1, '2026-10-29');
    pass('restore-ea-can-record-a-lesson-again');

    // The daily invariant check has nothing to say about the restored child.
    const hits = invariantRows(databaseUrl, '', 'invariants-after-restore');
    assert.deepEqual(hits.filter(hit => hit.entity_id === R1 || JSON.stringify(hit.detail ?? {}).includes(R1)), []);
    pass('restore-invariants-report-nothing-for-the-restored-child');

    // Case 6 continued: rerun after apply (or after a lost response) is a no-op success.
    const beforeRerun = digest();
    const rerun = ok(cli([...restore(R_EMAIL.X, R1), '--apply']), 'restore-rerun');
    assert.ok(rerun.confirmed);
    assert.deepEqual(kinds(rerun.applied.actions), ['already_active:child_ea_assignments']);
    assert.equal(digest(), beforeRerun, 'the rerun changed something');
    pass('restore-rerun-is-a-no-op-success');

    // ---- Case 2: co-held, X's Delete child is a leave; restore gives X back only X's rows.
    serverDeleteChild(RX, R2);
    const r2Removed = ends(R2);
    const t2 = r2Removed.rows[restoreDet(RX, R2)].end;
    assert.ok(t2);
    assert.equal(r2Removed.archived.archived_at, null, 'a co-held child is never archived');
    assert.equal(r2Removed.rows[groupMembership(2, 1)].end, t2, "X's group membership removed");
    for (const rowId of [restoreDet(RY, R2), enrolment(2), classMembership(2), groupMembership(2, 2)]) {
      assert.equal(r2Removed.rows[rowId].end, null, `${rowId} untouched by the leave`);
    }
    const r2Before = childRows(R2);
    // Group B's class KB holds no membership of R2: only the "class of a group" arm locks it.
    const applied2 = underHeldLock('classes', RKB, restore(R_EMAIL.X, R2), 'restore-co-held');
    pass('restore-waits-for-the-class-of-a-group-membership-it-reopens');
    assert.ok(applied2.confirmed);
    assert.deepEqual(reopened(applied2.applied.actions), [restoreDet(RX, R2), groupMembership(2, 1)].sort());
    assert.ok(!applied2.applied.actions.some(action => action.action === 'unarchive'));
    const r2After = childRows(R2);
    assert.deepEqual(r2After.children, r2Before.children, 'the child row is untouched');
    const r2Ends = ends(R2);
    for (const rowId of [restoreDet(RX, R2), restoreDet(RY, R2), enrolment(2), classMembership(2), groupMembership(2, 1), groupMembership(2, 2)]) {
      assert.equal(r2Ends.rows[rowId].end, null, `${rowId} open after restore`);
    }
    for (const table of ['child_programme_enrollments', 'child_class_memberships']) {
      assert.deepEqual(r2After[table], r2Before[table], `${table} untouched`);
    }
    assert.deepEqual(r2After.child_ea_assignments.find(row => row.user_id === RY),
      r2Before.child_ea_assignments.find(row => row.user_id === RY), "the co-holder's assignment untouched");
    assert.deepEqual(r2After.child_group_memberships.find(row => row.id === groupMembership(2, 2)),
      r2Before.child_group_memberships.find(row => row.id === groupMembership(2, 2)), "the co-holder's group membership untouched");
    pass('restore-co-held-gives-back-only-the-eas-own-rows');

    // ---- Case 3: the 1.5.0 phone's archiveChild chain by the sole holder -> restore.
    const t3 = sqlNowMinus(10);
    phoneArchive(RX, 'children', R3, { archived_at: t3, row_version: 2 });
    phoneArchive(RX, 'child_programme_enrollments', enrolment(3), { ended_at: t3, row_version: 3 });
    phoneArchive(RX, 'child_class_memberships', classMembership(3), { exited_at: t3, row_version: 2 });
    phoneArchive(RX, 'child_group_memberships', groupMembership(3, 1), { removed_at: t3, row_version: 2 });
    // One request in the chain landed with a fast phone clock: the end guard clamps it to the
    // server's now, so it is not at T (a near miss, listed and left ended).
    phoneArchive(RX, 'child_group_memberships', groupMembership(3, 2), { removed_at: '2099-01-01T00:00:00+00:00', row_version: 2 });
    phoneArchive(RX, 'child_ea_assignments', restoreDet(RX, R3), { unassigned_at: t3, row_version: 4 });
    const r3Removed = ends(R3);
    assert.deepEqual([r3Removed.archived.archived_at, r3Removed.archived.archived_by_user_id, r3Removed.archived.archive_reason],
      [t3, RX, null], 'the phone archive applied for the sole holder');
    for (const rowId of [restoreDet(RX, R3), enrolment(3), classMembership(3), groupMembership(3, 1)]) {
      assert.equal(r3Removed.rows[rowId].end, t3, `${rowId} ended at the phone time`);
    }
    assert.notEqual(r3Removed.rows[groupMembership(3, 2)].end, t3);
    const applied3 = underHeldLock('groups', G1, restore(R_EMAIL.X, R3), 'restore-phone-archive');
    pass('restore-waits-for-a-group-whose-membership-it-reopens');
    assert.ok(applied3.confirmed);
    assert.deepEqual(reopened(applied3.applied.actions),
      [restoreDet(RX, R3), enrolment(3), classMembership(3), groupMembership(3, 1)].sort());
    const nearMiss = applied3.applied.notes.find(note => note.code === 'near_miss_not_reopened');
    assert.deepEqual(nearMiss?.rows.map(entry => [entry.table, entry.id]), [['child_group_memberships', groupMembership(3, 2)]]);
    assert.ok(nearMiss.rows[0].seconds_from_t > 0 && nearMiss.rows[0].seconds_from_t < 3600);
    const r3Ends = ends(R3);
    assert.deepEqual([r3Ends.archived.archived_at, r3Ends.archived.archived_by_user_id, r3Ends.archived.row_version], [null, null, 2]);
    for (const rowId of [restoreDet(RX, R3), enrolment(3), classMembership(3), groupMembership(3, 1)]) {
      assert.equal(r3Ends.rows[rowId].end, null, `${rowId} reopened`);
      assert.equal(r3Ends.rows[rowId].row_version, r3Removed.rows[rowId].row_version, `${rowId} row_version kept`);
    }
    assert.equal(r3Ends.rows[groupMembership(3, 2)].end, r3Removed.rows[groupMembership(3, 2)].end, 'the near miss stays ended');
    pass('restore-after-a-1-5-0-phone-archive-reopens-everything-ended-at-t');

    // ---- Case 4: the archive is another EA's -> refused; restore that EA first, then X.
    serverDeleteChild(RX, R4); // leave: Y still holds
    serverDeleteChild(RY, R4); // last holder: archives for everyone
    const r4Removed = ends(R4);
    assert.equal(r4Removed.archived.archived_by_user_id, RY);
    const beforeRefusal = digest();
    for (const argv of [restore(R_EMAIL.X, R4), [...restore(R_EMAIL.X, R4), '--apply']]) {
      const refused = cli(argv);
      assert.match(refused.error?.message ?? '', /refused: archived_by_another_ea/);
      const refusal = refused.plan.refusals.find(entry => entry.code === 'archived_by_another_ea');
      assert.equal(refusal.archived_by_user_id, RY);
      assert.ok(refused.calls.every(input => !/\bCOMMIT\b/.test(input)));
    }
    assert.equal(digest(), beforeRefusal);
    pass('restore-refuses-another-eas-archive-and-changes-nothing');
    assert.ok(ok(cli([...restore(R_EMAIL.Y, R4), '--apply']), 'restore-y').confirmed);
    let r4Ends = ends(R4);
    assert.equal(r4Ends.archived.archived_at, null);
    for (const rowId of [restoreDet(RY, R4), enrolment(4), classMembership(4), groupMembership(4, 2)]) {
      assert.equal(r4Ends.rows[rowId].end, null, `${rowId} back with Y`);
    }
    assert.equal(r4Ends.rows[restoreDet(RX, R4)].end, r4Removed.rows[restoreDet(RX, R4)].end, "X's rows wait for X's own restore");
    assert.equal(r4Ends.rows[groupMembership(4, 1)].end, r4Removed.rows[groupMembership(4, 1)].end);
    // R4 is live now, so nothing restore writes touches the child row: only its own child-row
    // lock makes apply wait. The server's Delete child and a phone's child archive lock that row
    // first, so a restore never interleaves with a removal still landing.
    assert.ok(underHeldLock('children', R4, restore(R_EMAIL.X, R4), 'restore-x-after-y').confirmed);
    pass('restore-waits-for-the-child-row-lock');
    r4Ends = ends(R4);
    assert.deepEqual([r4Ends.rows[restoreDet(RX, R4)].end, r4Ends.rows[groupMembership(4, 1)].end], [null, null]);
    pass('restore-the-archiving-ea-first-then-the-earlier-leaver');

    // ---- Case 5: an earlier removal stays; archived group and class are skipped with a note.
    sql(`UPDATE public.child_group_memberships SET removed_at = TIMESTAMPTZ '2026-10-01T08:00:00+02:00' WHERE id = '${groupMembership(5, 2)}';`, 'r5-earlier');
    serverDeleteChild(RX, R5);
    const t5 = ends(R5).archived.archived_at;
    sql(`UPDATE public.groups SET archived_at = now() WHERE id = '${G5A}';
      UPDATE public.classes SET archived_at = now() WHERE id = '${RK5}';
      UPDATE public.child_group_memberships SET removed_at = TIMESTAMPTZ '${t5}' - interval '5 minutes' WHERE id = '${groupMembership(5, 4)}';`,
    'r5-after-removal');
    const r5Removed = ends(R5);
    const dry5 = ok(cli(restore(R_EMAIL.X, R5)), 'restore-r5-dry-run');
    assert.deepEqual(dry5.plan.notes.map(note => note.code).sort(),
      ['class_archived_skipped', 'group_archived_skipped', 'near_miss_not_reopened']);
    assert.equal(dry5.plan.notes.find(note => note.code === 'group_archived_skipped').id, groupMembership(5, 3));
    assert.equal(dry5.plan.notes.find(note => note.code === 'class_archived_skipped').id, classMembership(5, 1));
    assert.deepEqual(dry5.plan.notes.find(note => note.code === 'near_miss_not_reopened').rows.map(entry => [entry.id, entry.seconds_from_t]),
      [[groupMembership(5, 4), -300]]);
    const applied5 = ok(cli([...restore(R_EMAIL.X, R5), '--apply']), 'restore-r5');
    assert.ok(applied5.confirmed);
    assert.deepEqual(reopened(applied5.applied.actions), [restoreDet(RX, R5), enrolment(5), classMembership(5), groupMembership(5, 1)].sort());
    const r5Ends = ends(R5);
    for (const rowId of [groupMembership(5, 2), groupMembership(5, 3), groupMembership(5, 4), classMembership(5, 1)]) {
      assert.equal(r5Ends.rows[rowId].end, r5Removed.rows[rowId].end, `${rowId} stays ended`);
    }
    assert.equal(r5Ends.archived.archived_at, null);
    pass('restore-leaves-other-instants-and-skips-archived-groups-and-classes');

    // ---- Case 7: reopening would break an active-row unique index -> refused, nothing changed.
    serverDeleteChild(RX, R7); // leave: Y still holds; X's group 7A membership ends
    sql(`INSERT INTO public.child_group_memberships (id, child_id, group_id, grouping_version_id, joined_at)
      VALUES ('${groupMembership(7, 2)}', '${R7}', '${G7B}', '${V7}', now());`, 'r7-regrouped');
    const beforeConflict = digest();
    const conflict = cli([...restore(R_EMAIL.X, R7), '--apply']);
    assert.match(conflict.error?.message ?? '', /refused: active_row_conflict/);
    assert.deepEqual(conflict.plan.refusals.map(entry => [entry.code, entry.table, entry.id, entry.conflicting_id]),
      [['active_row_conflict', 'child_group_memberships', groupMembership(7, 1), groupMembership(7, 2)]]);
    assert.ok(conflict.calls.every(input => !/\bCOMMIT\b/.test(input)));
    assert.equal(digest(), beforeConflict);
    pass('restore-refuses-a-unique-index-conflict-and-changes-nothing');

    // ---- Case 9: the child is back in the same group through a new row, in a group with no
    // grouping version (every group made in the app) -> refused, because reopening the old row
    // would leave the child in that group twice (daily check duplicate_active_group_membership).
    const hoApply = (argv, label) => ok(cli([...argv, '--reason', REASON, '--operator', OPERATOR, '--apply']), label);
    serverDeleteChild(RX, R13); // leave: Y still holds; X's delivery row and group 13 membership end
    hoApply(['handover', 'group', '--from', R_EMAIL.X, '--to', R_EMAIL.Y, '--group', G13], 'r13-handover-group');
    assert.equal(asEa(RY, `WITH r AS (INSERT INTO public.child_group_memberships (id, child_id, group_id, joined_at, created_by)
      VALUES ('${groupMembership(13, 2)}', '${R13}', '${G13}', now(), '${RY}') RETURNING 1) SELECT count(*) FROM r;`,
    'r13-y-readds'), '1', 'Y put the child back into group 13');
    const r13Hits = () => invariantRows(databaseUrl, '', 'invariants-r13').filter(hit => hit.entity_id === R13);
    assert.deepEqual(r13Hits(), []);
    const beforeDuplicate = digest();
    for (const argv of [restore(R_EMAIL.X, R13), [...restore(R_EMAIL.X, R13), '--apply']]) {
      const duplicate = cli(argv);
      assert.match(duplicate.error?.message ?? '', /refused: active_row_conflict/);
      assert.deepEqual(duplicate.plan.refusals.map(entry => [entry.code, entry.table, entry.id, entry.conflicting_id]),
        [['active_row_conflict', 'child_group_memberships', groupMembership(13, 1), groupMembership(13, 2)]]);
      assert.ok(duplicate.calls.every(input => !/\bCOMMIT\b/.test(input)));
    }
    assert.equal(digest(), beforeDuplicate);
    assert.deepEqual(r13Hits(), [], 'restore left the child in group 13 once');
    pass('restore-refuses-a-second-open-membership-of-the-same-group');

    // ---- Case 10: a removal that did not end the EA's delivery row -> refused, nothing changed.
    // X added R8 and R9 (the app lets the creator Delete child) and teaches their class, but Head
    // Office moved R8's delivery to Y and ended R9's delivery three days earlier. X's Delete child
    // then ends only X's group membership (R8, a leave: Y delivers) or archives the child (R9: X
    // is its last holder, through the class). Restore must not take the Head Office end for the
    // removal and reopen that delivery row, nor reopen the removal's rows without it.
    const refusedNoChange = (child, label) => {
      const before = digest();
      let refusal;
      for (const argv of [restore(R_EMAIL.X, child), [...restore(R_EMAIL.X, child), '--apply']]) {
        const refused = cli(argv);
        assert.match(refused.error?.message ?? '', new RegExp(`refused: ${label}`));
        assert.ok(refused.calls.every(input => !/\bCOMMIT\b/.test(input)));
        refusal = refused.plan.refusals.find(entry => entry.code === label);
      }
      assert.equal(digest(), before, `${child}: a refused restore changed something`);
      return refusal;
    };
    hoApply(['handover', 'child', '--from', R_EMAIL.X, '--to', R_EMAIL.Y, '--children', R8], 'r8-handover');
    hoApply(['end-delivery', '--ea', R_EMAIL.X, '--children', R9], 'r9-end-delivery');
    sql(`UPDATE public.child_ea_assignments SET unassigned_at = unassigned_at - interval '3 days'
      WHERE id IN ('${restoreDet(RX, R8)}', '${restoreDet(RX, R9)}');`, 'r8-r9-head-office-ends-earlier');
    serverDeleteChild(RX, R8);
    serverDeleteChild(RX, R9);
    const r8Removed = ends(R8);
    const r9Removed = ends(R9);
    assert.equal(r8Removed.archived.archived_at, null, 'Y delivers R8: a leave');
    assert.ok(r8Removed.rows[groupMembership(8, 1)].end, "the leave ended X's group 8 membership");
    assert.deepEqual([r9Removed.archived.archived_by_user_id, r9Removed.rows[groupMembership(9, 1)].end],
      [RX, r9Removed.archived.archived_at], "X's removal archived R9");
    const r8Refusal = refusedNoChange(R8, 'delivery_not_part_of_removal');
    assert.deepEqual([r8Refusal.id, r8Refusal.delivery_ended_at, r8Refusal.removed_at],
      [restoreDet(RX, R8), r8Removed.rows[restoreDet(RX, R8)].end, r8Removed.rows[groupMembership(8, 1)].end]);
    const r9Refusal = refusedNoChange(R9, 'delivery_not_part_of_removal');
    assert.deepEqual([r9Refusal.id, r9Refusal.delivery_ended_at, r9Refusal.removed_at],
      [restoreDet(RX, R9), r9Removed.rows[restoreDet(RX, R9)].end, r9Removed.archived.archived_at]);
    pass('restore-refuses-a-removal-that-did-not-end-the-eas-delivery');

    // ---- Other refusals change nothing and never reach a COMMIT.
    const beforeOther = digest();
    for (const [label, argv, message] of [
      ['never-held', restore(R_EMAIL.N, R1), /refused: ea_never_held_child/],
      ['child-not-found', restore(R_EMAIL.X, R_MISSING), /refused: child_not_found/],
      ['suspended-ea', restore(R_EMAIL.S, R1), /suspended/],
      ['unknown-email', restore('nobody@example.test', R1), /No Auth user matches/],
    ]) {
      const result = cli([...argv, '--apply']);
      assert.match(result.error?.message ?? '', message, label);
      assert.ok(result.calls.every(input => !/\bCOMMIT\b/.test(input)), `${label} reached an apply`);
      pass(`restore-refuse-${label}`);
    }
    assert.equal(digest(), beforeOther);
    pass('restore-refusals-change-nothing');
  } finally {
    cli.cleanup();
  }
};

const main = () => {
  const databaseName = process.env.HISTORY_RLS_DATABASE_NAME && `${process.env.HISTORY_RLS_DATABASE_NAME}_ho_lifecycle`;
  const adminUrl = assertDisposableAdminTarget({
    adminDatabaseUrl: process.env.HISTORY_RLS_ADMIN_DATABASE_URL, databaseName,
    confirmation: process.env.HISTORY_RLS_DISPOSABLE_CONFIRM,
  });
  const adminDatabaseUrl = buildDatabaseUrl(adminUrl, 'postgres').href;
  const databaseUrl = buildDatabaseUrl(adminUrl, databaseName).href;
  const quotedDatabase = `"${databaseName}"`;
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-stale-database' });
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `CREATE DATABASE ${quotedDatabase};`, label: 'create-database' });
  try {
    runPsql({ databaseUrl, sql: bootstrapSql, label: 'bootstrap' });
    const migrations = collectMigrations();
    for (const { name, file } of migrations) {
      runPsql({ databaseUrl, file, label: `migration-${name}` });
    }
    const summary = {};
    runInvariantCases(databaseUrl, summary);
    runCommandCases(databaseUrl, summary);
    // restore child undoes the server batch's removal paths, so its cases need that batch. Until
    // it is merged they run only with HO_LIFECYCLE_EXTRA_MIGRATIONS_DIR; the skip is reported.
    const restoreCases = serverBatchApplied(databaseUrl);
    if (restoreCases) {
      runRestoreCases(databaseUrl, summary);
    } else {
      process.stderr.write('restore child cases SKIPPED: the server lifecycle batch (20261105120000-120300) is not in the migration set\n');
    }
    process.stdout.write(`${JSON.stringify({ migrations: migrations.length, latestMigration: migrations.at(-1).name,
      extraMigrations: migrations.filter(({ file }) => path.dirname(file) !== MIGRATIONS_DIR).map(({ name }) => name),
      restoreCases: restoreCases ? 'ran' : 'skipped (server lifecycle batch not applied)',
      checks: Object.keys(summary).length, results: summary })}\n`);
  } finally {
    runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-database' });
  }
};

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
}

module.exports = { fixtureSql, cleanInvariantSql, seededInvariantSql, seededHits };
