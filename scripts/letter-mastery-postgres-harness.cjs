#!/usr/bin/env node

// Assessment Results Plan 2 Task 1. Controller-only disposable PG17 proof.
// Local admin URL: postgresql://postgres:postgres@127.0.0.1:65433/postgres
// Never loads dotenv or invokes Supabase CLI. Fixtures also work before this migration.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  MIGRATIONS_DIR, assertDisposableAdminTarget, bootstrapSql, buildDatabaseUrl,
  buildPsqlEnv, expectSqlState, runPsql,
} = require('./history-authorization-postgres-harness.cjs');
const { overlappingCalls } = require('./assessment-results-postgres-harness.cjs');

const MIGRATION = '20261021160000_letter_mastery_current_state.sql';
const EA_A = '14000000-0000-0000-0000-000000000001';
const EA_B = '14000000-0000-0000-0000-000000000002';
const FORMER = '15000000-0000-0000-0000-000000000003';
const CLASS_ONLY = '15000000-0000-0000-0000-000000000004';
const NO_PROGRAMME = '15000000-0000-0000-0000-000000000005';
const UNRELATED = '15000000-0000-0000-0000-000000000006';
const SCHOOL = '25000000-0000-0000-0000-000000000001';
const CLASS = '45000000-0000-0000-0000-000000000001';
const CHILD = '55000000-0000-0000-0000-000000000001';
const OTHER_CHILD = '55000000-0000-0000-0000-000000000002';
const MON = '2026-10-19T08:00:00Z';
const TUE = '2026-10-20T08:00:00Z';
const NS = '09dcf4b2-6c53-4c46-917f-33bc7f2df4d2';
const LITERACY = "(SELECT id FROM public.programmes WHERE code = 'literacy')";
const NUMERACY = "(SELECT id FROM public.programmes WHERE code = 'numeracy')";
const YEAR = '(SELECT id FROM public.academic_years WHERE is_active)';
const quote = (v) => v === null ? 'NULL' : typeof v === 'boolean' ? String(v) : "'" + String(v).replaceAll("'", "''") + "'";
const identifier = (v) => '"' + v.replaceAll('"', '""') + '"';
const sqlAssert = (condition, message) => `
DO $assert$ BEGIN
  IF (${condition}) IS DISTINCT FROM TRUE THEN RAISE EXCEPTION '%', ${quote(message)}; END IF;
END; $assert$;`;
const asActor = (actor, sql, { setup = '', commit = false } = {}) => `
BEGIN;
${setup}
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = ${quote(actor)};
${sql}
${commit ? 'COMMIT' : 'ROLLBACK'};`;
const childSetup = (childId, actors = [EA_A, EA_B]) => `
INSERT INTO public.children (id, first_name, last_name, created_by)
VALUES ('${childId}', 'Independent', 'Mastery harness', '${EA_A}');
INSERT INTO public.child_ea_assignments (child_id, user_id, created_by)
VALUES ${actors.map((actor) => `('${childId}', '${actor}', '${EA_A}')`).join(', ')};`;
const revoke = (child) => `UPDATE public.child_ea_assignments SET unassigned_at = now()
WHERE child_id = '${child}' AND user_id = '${EA_A}' AND unassigned_at IS NULL;`;
const fixtureSql = `
INSERT INTO auth.users (id) VALUES
  ('${EA_A}'), ('${EA_B}'), ('${FORMER}'), ('${CLASS_ONLY}'), ('${NO_PROGRAMME}'), ('${UNRELATED}');
INSERT INTO public.schools (id, name) VALUES ('${SCHOOL}', 'Letter mastery harness');
INSERT INTO public.users (id, first_name, last_name, school_id, organization_id)
SELECT id, 'Mastery harness', id::text, '${SCHOOL}', 'a111879f-d066-47c9-95a1-bed2a400319a' FROM auth.users;
INSERT INTO public.staff_programme_assignments (user_id, programme_id, school_id)
VALUES ('${EA_A}', ${LITERACY}, '${SCHOOL}'), ('${EA_B}', ${NUMERACY}, '${SCHOOL}');
${childSetup(CHILD, [EA_A, EA_B, NO_PROGRAMME])}
${childSetup(OTHER_CHILD, [EA_A])}
INSERT INTO public.child_ea_assignments (child_id, user_id, created_by, unassigned_at)
VALUES ('${CHILD}', '${FORMER}', '${EA_A}', now());
INSERT INTO public.classes (id, school_id, name, grade, academic_year_id, created_by)
VALUES ('${CLASS}', '${SCHOOL}', 'Mastery class', '1', ${YEAR}, '${EA_A}');
INSERT INTO public.class_ea_assignments (class_id, ea_user_id, programme_id, created_by)
VALUES ('${CLASS}', '${CLASS_ONLY}', ${LITERACY}, '${EA_A}');
UPDATE public.children SET class_id = '${CLASS}' WHERE id = '${CHILD}';
INSERT INTO public.child_class_memberships (child_id, class_id, academic_year_id, created_by)
VALUES ('${CHILD}', '${CLASS}', ${YEAR}, '${EA_A}');
`;

const correction = (overrides = {}) => ({
  id: randomUUID(), child: CHILD, letter: 'k', language: 'xh', confirmed: true, time: MON, ...overrides,
});
const call = (c) => `public.set_letter_mastery(${quote(c.id)}::uuid, ${quote(c.child)}::uuid,
  ${quote(c.letter)}::text, ${quote(c.language)}::text, ${quote(c.confirmed)}::boolean, ${quote(c.time)}::timestamptz)`;
const outcomeCall = (c) => `(select outcome from ${call(c)})`;
const expectWinner = (c, outcome, winner = c, actor = EA_A) => sqlAssert(`(SELECT
  r.outcome = '${outcome}' AND r.confirmed = ${winner.confirmed}
  AND r.changed_at = '${winner.time}'::timestamptz
  AND r.correction_id = '${winner.id}' AND r.changed_by = '${actor}' FROM ${call(c)} r)`,
  `Expected ${outcome} and the complete winning record`);
const record = (c) => `FROM public.letter_mastery lm WHERE lm.child_id = '${c.child}'
  AND lm.letter = '${c.letter}' AND lm.language = '${c.language}'`;
const receipt = (c) => `FROM public.letter_mastery_corrections r WHERE r.correction_id = '${c.id}'`;
const snapshot = (databaseUrl, c) => runPsql({ databaseUrl, label: 'record-snapshot',
  sql: `SELECT to_jsonb(lm) ${record(c)};` });

const runCases = async (databaseUrl, v5) => {
  const cases = {};
  const check = (label, sql) => {
    runPsql({ databaseUrl, label, sql });
    cases[label] = 'passed';
  };
  const denied = (label, actor, sql, state) =>
    expectSqlState({ databaseUrl, label, sql: asActor(actor, sql), sqlState: state });
  const commit = (actor, sql, setup = '') => runPsql({ databaseUrl, label: 'committed-correction',
    sql: asActor(actor, sql, { setup, commit: true }) });
  const seed = (actors = [EA_A, EA_B]) => {
    const child = randomUUID();
    runPsql({ databaseUrl, label: 'fresh-child', sql: childSetup(child, actors) });
    return child;
  };

  // Load plpgsql before checking its default; never override variable_conflict.
  assert.equal(runPsql({ databaseUrl, label: 'variable-conflict-default',
    sql: "do $$ begin null; end $$; select pg_catalog.current_setting('plpgsql.variable_conflict');" }), 'error');
  cases['variable-conflict-default'] = 'passed';

  // Before the migration, RED must reach this missing RPC, not a new-schema fixture.
  const a = correction();
  check('newer-applies', asActor(EA_A, expectWinner(a, 'applied'), { commit: true }));
  check('newer-applies', `
    ${sqlAssert(`(SELECT count(*) = 1 ${record(a)})`, 'One record per key')}
    ${sqlAssert(`(SELECT lm.id = private.letter_mastery_id('${CHILD}', 'k', 'xh') ${record(a)})`, 'Deterministic identity')}
  `);
  const b = correction({ time: TUE, confirmed: false });
  commit(EA_B, expectWinner(b, 'applied', b, EA_B));
  check('newer-applies', sqlAssert(`(SELECT lm.programme_id = ${NUMERACY} AND lm.changed_by = '${EA_B}'
    ${record(b)})`, 'C23 same record across programmes'));
  assert.equal(runPsql({ databaseUrl, label: 'named-conflict-targets', sql: `
    select conname, contype from pg_catalog.pg_constraint where conname in
    ('letter_mastery_child_letter_language_key', 'letter_mastery_corrections_pkey') order by conname;` }),
  'letter_mastery_child_letter_language_key|u\nletter_mastery_corrections_pkey|p');
  cases['named-conflict-targets'] = 'passed';

  const tieChild = seed();
  const tieLow = correction({ child: tieChild, id: '16000000-0000-0000-0000-000000000001' });
  const tieHigh = correction({ child: tieChild, id: '16000000-0000-0000-0000-000000000002', confirmed: false });
  commit(EA_A, expectWinner(tieLow, 'applied'));
  commit(EA_B, expectWinner(tieHigh, 'applied', tieHigh, EA_B));
  commit(EA_A, expectWinner(tieLow, 'superseded', tieHigh, EA_B));

  const older = correction();
  const before = snapshot(databaseUrl, b);
  commit(EA_A, expectWinner(older, 'superseded', b, EA_B));
  assert.equal(snapshot(databaseUrl, b), before, 'Superseded correction must not fire updated_at trigger');
  cases['older-superseded-returns-winner'] = 'passed';

  const future = correction({ child: seed(), time: '2099-01-01' });
  check('future-clamped', asActor(EA_A, `
    ${sqlAssert(`${outcomeCall(future)} = 'applied'`, 'Future correction applied')}
    RESET ROLE;
    ${sqlAssert(`(SELECT r.effective_at = now() AND r.requested_at = '2099-01-01'::timestamptz ${receipt(future)})`, 'Receipt clamps once')}
    ${sqlAssert(`(SELECT lm.changed_at = now() ${record(future)})`, 'Record uses clamp')}
  `));

  const fast = correction({ child: seed(), letter: 'm', time: new Date(Date.now() + 3600000).toISOString() });
  commit(EA_A, sqlAssert(`${outcomeCall(fast)} = 'applied'`, 'First fast-clock correction applied'));
  const fixedTime = runPsql({ databaseUrl, label: 'first-clamp', sql: `SELECT r.effective_at ${receipt(fast)};` });
  const nowConfirm = correction({ child: fast.child, letter: 'm' });
  const nowUnconfirm = correction({ child: fast.child, letter: 'm', confirmed: false });
  for (const c of [nowConfirm, nowUnconfirm]) {
    // Server call time, independent committed transactions; no wall-clock sleep needed.
    commit(EA_B, `SELECT outcome FROM public.set_letter_mastery('${c.id}', '${c.child}', 'm', 'xh', ${c.confirmed}, now());`);
  }
  commit(EA_A, sqlAssert(`(SELECT r.outcome = 'superseded' AND NOT r.confirmed
    AND r.correction_id = '${nowUnconfirm.id}' AND r.changed_by = '${EA_B}' FROM ${call(fast)} r)`, 'Fast-clock replay returns later un-confirm'));
  check('fast-clock-lost-reply', `
    ${sqlAssert(`(SELECT count(*) = 1 AND min(r.effective_at) = '${fixedTime}'::timestamptz ${receipt(fast)})`, 'First effective time retained')}
  `);

  const concurrent = correction({ child: seed() });
  await overlappingCalls(databaseUrl, 'same-id-concurrent', outcomeCall(concurrent), ['applied', 'applied']);
  check('same-id-concurrent', sqlAssert(`(SELECT count(*) = 1 AND count(distinct r.effective_at) = 1 ${receipt(concurrent)})`, 'One receipt and effective time'));
  const concurrentA = correction({ child: seed() });
  const concurrentB = correction({ child: concurrentA.child, time: TUE, confirmed: false });
  await overlappingCalls(databaseUrl, 'same-key-concurrent', outcomeCall(concurrentA), ['applied', 'applied'],
    { secondCall: outcomeCall(concurrentB), secondActor: EA_B });
  check('same-key-concurrent', sqlAssert(`(SELECT count(*) = 1 AND bool_and(lm.correction_id = '${concurrentB.id}') ${record(concurrentB)})`, 'B wins the natural-key race'));

  for (const actor of [FORMER, CLASS_ONLY, UNRELATED]) {
    const c = correction();
    denied('non-deliverer', actor, `SELECT * FROM ${call(c)};`, '42501');
    check('non-deliverers-denied', sqlAssert(`(SELECT count(*) = 0 ${receipt(c)})`, 'Denied correction leaves no receipt'));
  }
  const noProgramme = correction({ child: seed([NO_PROGRAMME]) });
  check('no-programme-deliverer', asActor(NO_PROGRAMME, `
    ${expectWinner(noProgramme, 'applied', noProgramme, NO_PROGRAMME)}
    RESET ROLE;
    ${sqlAssert(`(SELECT lm.programme_id IS NULL ${record(noProgramme)})`, 'Record programme optional')}
    ${sqlAssert(`(SELECT r.programme_id IS NULL ${receipt(noProgramme)})`, 'Receipt programme optional')}
  `));

  const revoked = correction({ child: seed() });
  commit(EA_A, expectWinner(revoked, 'applied'));
  runPsql({ databaseUrl, label: 'revoke-assignment', sql: revoke(revoked.child) });
  const revokedBefore = snapshot(databaseUrl, revoked);
  commit(EA_A, expectWinner(revoked, 'applied'));
  assert.equal(snapshot(databaseUrl, revoked), revokedBefore);
  cases['replay-after-revocation'] = 'passed';
  for (const patch of [
    { child: OTHER_CHILD }, { letter: 'z' }, { language: 'en' },
    { confirmed: false }, { time: TUE },
  ]) denied('replay-mismatch', EA_A, `SELECT * FROM ${call({ ...revoked, ...patch })};`, 'MA001');
  denied('replay-mismatch-caller', EA_B, `SELECT * FROM ${call(revoked)};`, 'MA001');
  cases['replay-mismatch'] = 'passed';

  const handedOver = correction({ child: seed() });
  commit(EA_A, expectWinner(handedOver, 'applied'));
  runPsql({ databaseUrl, label: 'handover', sql: revoke(handedOver.child) });
  const successor = correction({ child: handedOver.child, time: TUE, confirmed: false });
  commit(EA_B, expectWinner(successor, 'applied', successor, EA_B));
  check('replay-after-handover-and-newer-writer', asActor(EA_A, sqlAssert(`(SELECT
    r.outcome = 'acknowledged' AND r.confirmed IS NULL AND r.changed_at IS NULL
    AND r.correction_id IS NULL AND r.changed_by IS NULL FROM ${call(handedOver)} r)`, 'Acknowledgement contains no record')));

  for (const patch of [
    { id: null }, { child: null }, { letter: null }, { letter: 'ab' }, { letter: 'A' },
    { letter: '1' }, { language: null }, { language: 'eng' }, { language: 'EN' },
    { confirmed: null }, { time: null },
  ]) denied('shape', EA_A, `SELECT * FROM ${call(correction(patch))};`, '22023');
  denied('no-auth', '', `SELECT * FROM ${call(correction())};`, '28000');
  cases.shape = 'passed';

  for (const sql of [
    `INSERT INTO public.letter_mastery (child_id, letter, language, confirmed, changed_at, correction_id, changed_by)
      VALUES ('${CHILD}', 'z', 'xh', true, now(), '${randomUUID()}', '${EA_A}');`,
    `UPDATE public.letter_mastery SET confirmed = true WHERE child_id = '${CHILD}';`,
    `DELETE FROM public.letter_mastery WHERE child_id = '${CHILD}';`,
    'SELECT * FROM public.letter_mastery_corrections;',
    `INSERT INTO public.letter_mastery_corrections (correction_id, child_id, letter, language,
      confirmed, requested_at, effective_at, changed_by)
      VALUES ('${randomUUID()}', '${CHILD}', 'z', 'xh', true, now(), now(), '${EA_A}');`,
  ]) denied('direct-writes-denied', EA_A, sql, '42501');
  cases['direct-writes-denied'] = 'passed';

  const visible = correction({ child: seed() });
  commit(EA_A, expectWinner(visible, 'applied'));
  check('select-scope', asActor(EA_B, sqlAssert(`(SELECT count(*) = 1 ${record(visible)})`, 'Current deliverer reads')));
  // CHILD is an actual class-only membership, so test that arm with the shared row.
  for (const actor of [CLASS_ONLY, FORMER, UNRELATED]) {
    check('select-scope', asActor(actor, sqlAssert(`(SELECT count(*) = 0 FROM public.letter_mastery)`, 'Non-deliverer cannot read')));
  }
  runPsql({ databaseUrl, label: 'select-unassign', sql: revoke(visible.child) });
  check('select-scope', asActor(EA_A, sqlAssert(`(SELECT count(*) = 1 ${record(visible)})`, 'Last writer reads after revocation')));
  commit(EA_B, expectWinner(correction({ child: visible.child, time: TUE }), 'applied', undefined, EA_B));
  check('select-scope', asActor(EA_A, sqlAssert(`(SELECT count(*) = 0 ${record(visible)})`, 'Former writer cannot read successor')));

  const signature = 'public.set_letter_mastery(uuid,uuid,text,text,boolean,timestamptz)';
  check('grants', `
    ${sqlAssert(`has_function_privilege('authenticated', '${signature}', 'EXECUTE')`, 'Authenticated executes')}
    ${['public', 'anon', 'authenticator', 'service_role'].map((role) => sqlAssert(
      `NOT has_function_privilege('${role}', '${signature}', 'EXECUTE')`, role + ' cannot execute')).join('\n')}
    ${sqlAssert("NOT has_function_privilege('authenticated', 'private.letter_mastery_id(uuid,text,text)', 'EXECUTE')", 'Id helper private')}
    ${sqlAssert("(SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.letter_mastery_corrections'::regclass)", 'Receipt RLS enabled')}
    ${sqlAssert("(SELECT count(*) = 0 FROM pg_catalog.pg_policy WHERE polrelid = 'public.letter_mastery_corrections'::regclass)", 'Receipts have no policies')}
    ${['SELECT', 'INSERT', 'UPDATE', 'DELETE'].map((privilege) => sqlAssert(
      `has_table_privilege('service_role', 'public.letter_mastery_corrections', '${privilege}')`,
      'Service role has receipt ' + privilege)).join('\n')}
  `);
  const stamped = correction({ child: seed() });
  for (const c of [stamped, correction({ child: stamped.child, time: TUE, confirmed: false })]) {
    check('server-stamp', asActor(EA_A, `
      ${expectWinner(c, 'applied')}
      RESET ROLE;
      ${sqlAssert(`(SELECT lm.updated_at = now() ${record(c)})`, 'INSERT and applying UPDATE stamped by server')}
    `, { commit: true }));
  }
  assert.equal(runPsql({ databaseUrl, label: 'id-parity',
    sql: `SELECT private.letter_mastery_id('${CHILD}', 'k', 'xh');` }),
  v5(['letter_mastery', CHILD, 'k', 'xh'].join('\u001f'), NS));
  cases['id-parity'] = 'passed';
  return cases;
};

const runRekey = (databaseUrl, migrations, v5) => {
  for (const filename of migrations.filter((name) => name < MIGRATION)) {
    runPsql({ databaseUrl, file: path.join(MIGRATIONS_DIR, filename), label: 'rekey-before-' + filename });
  }
  runPsql({ databaseUrl, sql: fixtureSql, label: 'rekey-fixture' });
  const inputs = [
    [CHILD, 'a', 'English', EA_A, false, '2026-10-01'],
    [CHILD, 'a', 'en', EA_B, true, '2026-10-05'],
    [CHILD, 'K', 'isiXhosa', EA_A, false, '2026-10-02'],
    [CHILD, 'e', 'Afrikaans', EA_A, false, '2026-10-03'],
    [CHILD, 'z', 'Klingon', EA_A, false, '2026-10-03'],
    [OTHER_CHILD, 'b', ' ISIXHOSA ', EA_A, false, '2026-10-03'],
    [OTHER_CHILD, 'ab', 'en', EA_A, false, '2026-10-03'],
  ].map(([child, letter, language, actor, deleted, time]) => ({
    child, letter, language, actor, deleted, time, id: randomUUID(),
  }));
  runPsql({ databaseUrl, label: 'seed-old-shape', sql: `
    BEGIN;
    SET LOCAL session_replication_role = replica;
    INSERT INTO public.letter_mastery
      (id, user_id, child_id, programme_id, letter, language, source, deleted_at, updated_at)
    VALUES ${inputs.map((r) => `('${r.id}', '${r.actor}', '${r.child}',
      ${r.actor === EA_B ? NUMERACY : LITERACY}, '${r.letter}', '${r.language}', 'taught',
      ${r.deleted ? "'2026-10-05'::timestamptz" : 'NULL'}, '${r.time}')`).join(', ')};
    COMMIT;` });
  for (const filename of migrations.filter((name) => name >= MIGRATION)) {
    runPsql({ databaseUrl, file: path.join(MIGRATIONS_DIR, filename), label: 'rekey-after-' + filename });
  }
  const read = () => runPsql({ databaseUrl, label: 'rekey-snapshot', sql: `
    SELECT jsonb_agg(to_jsonb(lm) ORDER BY lm.child_id, lm.letter, lm.language) FROM public.letter_mastery lm;` });
  const before = read();
  const rows = JSON.parse(before);
  const expected = [[inputs[1], 'a', 'en'], [inputs[2], 'k', 'xh'],
    [inputs[3], 'e', 'af'], [inputs[5], 'b', 'xh']];
  assert.equal(rows.length, expected.length);
  for (const [old, letter, language] of expected) {
    const row = rows.find((r) => r.child_id === old.child && r.letter === letter && r.language === language);
    assert.ok(row, 'Mapped row exists');
    assert.equal(row.id, v5(['letter_mastery', old.child, letter, language].join('\u001f'), NS));
    assert.equal(row.confirmed, !old.deleted);
    assert.equal(row.correction_id, old.id);
    assert.equal(row.changed_by, old.actor);
    assert.equal(Date.parse(row.changed_at), Date.parse(old.time + 'T00:00:00Z'));
    const programme = runPsql({ databaseUrl, label: 'rekey-programme', sql: `SELECT ${old.actor === EA_B ? NUMERACY : LITERACY};` });
    assert.equal(row.programme_id, programme);
  }
  assert.equal(runPsql({ databaseUrl, label: 'old-columns-gone', sql: `
    SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name = 'letter_mastery' AND column_name IN ('user_id','source','mastered_at','deleted_at');` }), '0');
  runPsql({ databaseUrl, file: path.join(MIGRATIONS_DIR, MIGRATION), label: 'migration-reapply' });
  assert.equal(read(), before, 'Reapplying migration changes nothing');
  return { rekey: 'passed' };
};

const main = async () => {
  const base = process.env.HISTORY_RLS_DATABASE_NAME;
  const names = base ? [base + '_letter_mastery', base + '_letter_mastery_rekey'] : [base, base];
  const urls = names.map((databaseName) => assertDisposableAdminTarget({
    adminDatabaseUrl: process.env.HISTORY_RLS_ADMIN_DATABASE_URL, databaseName,
    confirmation: process.env.HISTORY_RLS_DISPOSABLE_CONFIRM,
  }));
  // Validate both names before creating either database.
  const adminDatabaseUrl = buildDatabaseUrl(urls[0], 'postgres').href;
  const databases = names.map((name, i) => ({ name, url: buildDatabaseUrl(urls[i], name).href }));
  const migrations = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
  const { v5 } = await import('uuid');
  // Shared psql wrappers strip libpq routing overrides, including overlapping calls.
  assert.equal(buildPsqlEnv('letter-mastery').PGHOSTADDR, undefined);
  try {
    for (const db of databases) {
      runPsql({ databaseUrl: adminDatabaseUrl, label: 'drop-stale-database',
        sql: `DROP DATABASE IF EXISTS ${identifier(db.name)} WITH (FORCE);` });
      runPsql({ databaseUrl: adminDatabaseUrl, label: 'create-database', sql: `CREATE DATABASE ${identifier(db.name)};` });
      runPsql({ databaseUrl: db.url, label: 'bootstrap', sql: bootstrapSql });
      runPsql({ databaseUrl: db.url, label: 'supabase-default-privileges', sql: `
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;` });
    }
    for (const filename of migrations) {
      runPsql({ databaseUrl: databases[0].url, file: path.join(MIGRATIONS_DIR, filename), label: 'migration-' + filename });
    }
    runPsql({ databaseUrl: databases[0].url, sql: fixtureSql, label: 'letter-mastery-fixture' });
    const cases = { ...await runCases(databases[0].url, v5), ...runRekey(databases[1].url, migrations, v5) };
    process.stdout.write(JSON.stringify({ passed: Object.keys(cases).length, cases }) + '\n');
  } finally {
    // Attempt both cleanups even if creation, a case, or the other cleanup failed.
    const cleanup = await Promise.allSettled(databases.map(async (db) => runPsql({
      databaseUrl: adminDatabaseUrl, label: 'drop-database',
      sql: `DROP DATABASE IF EXISTS ${identifier(db.name)} WITH (FORCE);`,
    })));
    const failed = cleanup.filter((r) => r.status === 'rejected');
    if (failed.length) throw new Error(failed.map((r) => r.reason.message).join('\n'));
  }
};

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { fixtureSql, runCases, runRekey };
