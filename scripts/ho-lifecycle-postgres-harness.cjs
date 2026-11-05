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
  const ok = (result, label) => {
    assert.equal(result.error, null, `${label}: ${result.error?.message}`);
    return result;
  };
  const kinds = actions => actions.map(action => `${action.action}:${action.table}`).sort();
  // A second session holds one row lock for 4 s. The dry run must not wait for it; apply must,
  // because the server's archive decisions (private.other_active_holder) rely on every Head
  // Office grant locking the classes and groups whose holders it can change.
  let holders = 0;
  const underHeldLock = (table, rowId, argv, label) => {
    holders += 1;
    const name = `ho-lock-holder-${holders}`;
    const holder = spawn('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-Atq', databaseUrl, '-c',
      `BEGIN; SELECT 1 FROM public.${table} WHERE id = '${rowId}' FOR UPDATE; SELECT pg_sleep(4); COMMIT;`],
    { env: buildPsqlEnv(name), stdio: 'ignore' });
    holder.unref();
    let held = false;
    for (let attempt = 0; attempt < 100 && !held; attempt += 1) {
      held = sql(`SELECT count(*) FROM pg_stat_activity WHERE application_name = 'masi-history-rls-${name}'
        AND wait_event = 'PgSleep';`, 'lock-holder-ready') === '1';
      if (!held) sleep(100);
    }
    assert.ok(held, `${label}: lock holder did not start`);
    const started = Date.now();
    ok(cli(argv), `${label}-dry-run-under-lock`);
    assert.ok(Date.now() - started < 1500, `${label}: the dry run waited for a row lock`);
    const result = ok(cli(apply(argv)), label);
    const waited = Date.now() - started;
    assert.ok(waited >= 2500, `${label}: apply did not wait for the held ${table} row lock (${waited} ms)`);
    return result;
  };
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
    const migrations = fs.readdirSync(MIGRATIONS_DIR).filter(name => name.endsWith('.sql')).sort();
    for (const filename of migrations) {
      runPsql({ databaseUrl, file: path.join(MIGRATIONS_DIR, filename), label: `migration-${filename}` });
    }
    const summary = {};
    runInvariantCases(databaseUrl, summary);
    runCommandCases(databaseUrl, summary);
    process.stdout.write(`${JSON.stringify({ migrations: migrations.length, latestMigration: migrations.at(-1),
      checks: Object.keys(summary).length, results: summary })}\n`);
  } finally {
    runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-database' });
  }
};

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
}

module.exports = { fixtureSql, cleanInvariantSql, seededInvariantSql, seededHits };
