#!/usr/bin/env node

// Numeracy Track B Task 1. Controller-only disposable PG17 proof.
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

const MIGRATION = '20261101120000_skill_mastery_current_state.sql';
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
const NS = '20002406-1d97-4087-b350-a8d41515dd39';
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
INSERT INTO public.schools (id, name) VALUES ('${SCHOOL}', 'Skill mastery harness');
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
  id: randomUUID(), child: CHILD, step_key: 'add.5', confirmed: true, time: MON, ...overrides,
});
const call = (c) => `public.set_skill_mastery(${quote(c.id)}::uuid, ${quote(c.child)}::uuid,
  ${quote(c.step_key)}::text, ${quote(c.confirmed)}::boolean, ${quote(c.time)}::timestamptz)`;
const outcomeCall = (c) => `(select outcome from ${call(c)})`;
const expectWinner = (c, outcome, winner = c, actor = EA_A) => sqlAssert(`(SELECT
  r.outcome = '${outcome}' AND r.confirmed = ${winner.confirmed}
  AND r.changed_at = '${winner.time}'::timestamptz
  AND r.correction_id = '${winner.id}' AND r.changed_by = '${actor}' FROM ${call(c)} r)`,
  `Expected ${outcome} and the complete winning record`);
const record = (c) => `FROM public.skill_mastery lm WHERE lm.child_id = '${c.child}'
  AND lm.step_key = '${c.step_key}'`;
const receipt = (c) => `FROM public.skill_mastery_corrections r WHERE r.correction_id = '${c.id}'`;
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
    ${sqlAssert(`(SELECT lm.id = private.skill_mastery_id('${CHILD}', 'add.5') ${record(a)})`, 'Deterministic identity')}
  `);
  const b = correction({ time: TUE, confirmed: false });
  commit(EA_B, expectWinner(b, 'applied', b, EA_B));
  check('newer-applies', sqlAssert(`(SELECT lm.programme_id = ${NUMERACY} AND lm.changed_by = '${EA_B}'
    ${record(b)})`, 'C23 same record across programmes'));
  assert.equal(runPsql({ databaseUrl, label: 'named-conflict-targets', sql: `
    select conname, contype from pg_catalog.pg_constraint where conname in
    ('skill_mastery_child_step_key_key', 'skill_mastery_corrections_pkey') order by conname;` }),
  'skill_mastery_child_step_key_key|u\nskill_mastery_corrections_pkey|p');
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

  const future = correction({ child: seed(), time: new Date(Date.now() + 86400000).toISOString() });
  check('future-clamped', asActor(EA_A, `
    ${sqlAssert(`${outcomeCall(future)} = 'applied'`, 'Future correction applied')}
    RESET ROLE;
    ${sqlAssert(`(SELECT r.effective_at = now() AND r.requested_at = '${future.time}'::timestamptz ${receipt(future)})`, 'Receipt clamps once')}
    ${sqlAssert(`(SELECT lm.changed_at = now() ${record(future)})`, 'Record uses clamp')}
  `));

  const fast = correction({ child: seed(), step_key: 'add.10', time: new Date(Date.now() + 3600000).toISOString() });
  commit(EA_A, sqlAssert(`${outcomeCall(fast)} = 'applied'`, 'First fast-clock correction applied'));
  const fixedTime = runPsql({ databaseUrl, label: 'first-clamp', sql: `SELECT r.effective_at ${receipt(fast)};` });
  const nowConfirm = correction({ child: fast.child, step_key: 'add.10' });
  const nowUnconfirm = correction({ child: fast.child, step_key: 'add.10', confirmed: false });
  for (const c of [nowConfirm, nowUnconfirm]) {
    // Server call time, independent committed transactions; no wall-clock sleep needed.
    commit(EA_B, `SELECT outcome FROM public.set_skill_mastery('${c.id}', '${c.child}', 'add.10', ${c.confirmed}, now());`);
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
    { child: OTHER_CHILD }, { step_key: 'add.10' },
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

  for (const step_key of [null, 'Add.5', 'add', 'add.', '.5', 'a1.5', 'add.5.1', 'add.5_', 'add-5', 'add.5 '])
    denied('shape', EA_A, `SELECT * FROM ${call(correction({ step_key }))};`, '22023');
  denied('no-auth', '', `SELECT * FROM ${call(correction())};`, '28000');
  cases.shape = 'passed';
  cases['no-auth'] = 'passed';

  for (const sql of [
    `INSERT INTO public.skill_mastery (child_id, step_key, confirmed, changed_at, correction_id, changed_by)
      VALUES ('${CHILD}', 'add.20', true, now(), '${randomUUID()}', '${EA_A}');`,
    `UPDATE public.skill_mastery SET confirmed = true WHERE child_id = '${CHILD}';`,
    `DELETE FROM public.skill_mastery WHERE child_id = '${CHILD}';`,
    'SELECT * FROM public.skill_mastery_corrections;',
    `INSERT INTO public.skill_mastery_corrections (correction_id, child_id, step_key,
      confirmed, requested_at, effective_at, changed_by)
      VALUES ('${randomUUID()}', '${CHILD}', 'add.20', true, now(), now(), '${EA_A}');`,
  ]) denied('direct-writes-denied', EA_A, sql, '42501');
  cases['direct-writes-denied'] = 'passed';

  const visible = correction({ child: seed() });
  commit(EA_A, expectWinner(visible, 'applied'));
  check('select-scope', asActor(EA_B, sqlAssert(`(SELECT count(*) = 1 ${record(visible)})`, 'Current deliverer reads')));
  // CHILD is an actual class-only membership, so test that arm with the shared row.
  for (const actor of [CLASS_ONLY, FORMER, UNRELATED]) {
    check('select-scope', asActor(actor, sqlAssert(`(SELECT count(*) = 0 FROM public.skill_mastery)`, 'Non-deliverer cannot read')));
  }
  runPsql({ databaseUrl, label: 'select-unassign', sql: revoke(visible.child) });
  check('select-scope', asActor(EA_A, sqlAssert(`(SELECT count(*) = 1 ${record(visible)})`, 'Last writer reads after revocation')));
  commit(EA_B, expectWinner(correction({ child: visible.child, time: TUE }), 'applied', undefined, EA_B));
  check('select-scope', asActor(EA_A, sqlAssert(`(SELECT count(*) = 0 ${record(visible)})`, 'Former writer cannot read successor')));

  const signature = 'public.set_skill_mastery(uuid,uuid,text,boolean,timestamptz)';
  check('grants', `
    ${sqlAssert(`has_function_privilege('authenticated', '${signature}', 'EXECUTE')`, 'Authenticated executes')}
    ${['public', 'anon', 'authenticator', 'service_role'].map((role) => sqlAssert(
      `NOT has_function_privilege('${role}', '${signature}', 'EXECUTE')`, role + ' cannot execute')).join('\n')}
    ${sqlAssert("NOT has_function_privilege('authenticated', 'private.skill_mastery_id(uuid,text)', 'EXECUTE')", 'Id helper private')}
    ${sqlAssert("(SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.skill_mastery_corrections'::regclass)", 'Receipt RLS enabled')}
    ${sqlAssert("(SELECT count(*) = 0 FROM pg_catalog.pg_policy WHERE polrelid = 'public.skill_mastery_corrections'::regclass)", 'Receipts have no policies')}
    ${['SELECT', 'INSERT', 'UPDATE', 'DELETE'].map((privilege) => sqlAssert(
      `has_table_privilege('service_role', 'public.skill_mastery_corrections', '${privilege}')`,
      'Service role has receipt ' + privilege)).join('\n')}
  `);
  const stamped = correction({ child: seed() });
  for (const [index, c] of [stamped, correction({ child: stamped.child, time: TUE, confirmed: false })].entries()) {
    check('server-stamp', asActor(EA_A, `
      ${expectWinner(c, 'applied')}
      RESET ROLE;
      ${sqlAssert(`(SELECT lm.updated_at = now() AND ${index === 0 ? 'lm.created_at = now()' : 'lm.created_at <= lm.updated_at'} ${record(c)})`, 'INSERT and applying UPDATE stamped by server')}
    `, { commit: true }));
  }
  const stampedBefore = snapshot(databaseUrl, stamped);
  commit(EA_A, expectWinner(stamped, 'superseded', { ...stamped, time: TUE, confirmed: false, id: runPsql({ databaseUrl, label: 'stamped-winner-id', sql: `SELECT lm.correction_id ${record(stamped)};` }) }));
  assert.equal(snapshot(databaseUrl, stamped), stampedBefore, 'server-stamp: losing replay preserves updated_at');
  assert.equal(runPsql({ databaseUrl, label: 'id-parity',
    sql: `SELECT private.skill_mastery_id('${CHILD}', 'add.5');` }),
  v5(['skill_mastery', CHILD, 'add.5'].join('\u001f'), NS));
  cases['id-parity'] = 'passed';

  for (const step_key of ['unknown_skill.99', 'skip_count.2s']) {
    const c = correction({ child: seed(), step_key });
    check('server-accepts-any-well-formed-key', asActor(EA_A, expectWinner(c, 'applied')));
  }
  const page = 'public.get_skill_mastery_page';
  const pageSignature = `${page}(timestamptz,uuid,integer,integer)`;
  check('grants', `
    ${sqlAssert(`has_function_privilege('authenticated', '${pageSignature}', 'EXECUTE')`, 'Authenticated pages')}
    ${['public','anon'].map(role => sqlAssert(`NOT has_function_privilege('${role}', '${pageSignature}', 'EXECUTE')`, 'Pager private to authenticated')).join('\n')}
    ${['public','anon','authenticated','authenticator','service_role'].map(role => sqlAssert(`NOT has_function_privilege('${role}', 'private.skill_mastery_id(uuid,text)', 'EXECUTE')`, 'Identity helper private')).join('\n')}
  `);
  const disabled = "UPDATE private.history_pull_rollout SET enabled = false WHERE feature = 'skill_mastery' AND user_id IS NULL;";
  assert.match(expectSqlState({ databaseUrl, label: 'page-rollout-disabled', sql: asActor(EA_A, `SELECT * FROM ${page}();`, { setup: disabled }), sqlState: 'MR001' }), /rollout_disabled/);
  cases['page-rollout-disabled'] = 'passed';
  for (const args of ['null,null,0,0','null,null,201,0','null,null,200,-1','null,null,200,601',"now(),null,200,0",`null,'${CHILD}',200,0`])
    denied('page-arguments', EA_A, `SELECT * FROM ${page}(${args});`, '22023');
  expectSqlState({ databaseUrl, label: 'page-auth-first', sql: asActor('', `SELECT * FROM ${page}(null,null,0,0);`, { setup: disabled }), sqlState: '28000' });
  expectSqlState({ databaseUrl, label: 'page-switch-before-args', sql: asActor(EA_A, `SELECT * FROM ${page}(null,null,0,0);`, { setup: disabled }), sqlState: 'MR001' });
  cases['page-arguments'] = 'passed';
  const paged = correction({ child: seed(), confirmed: false });
  commit(EA_A, expectWinner(paged, 'applied'));
  for (const actor of [EA_A, EA_B]) check('page-arms', asActor(actor, sqlAssert(`(SELECT count(*) = 1 AND bool_and(NOT confirmed) FROM ${page}() WHERE child_id = '${paged.child}')`, 'Writer and delivery arms include unconfirmed rows')));
  for (const actor of [CLASS_ONLY,UNRELATED]) check('page-arms', asActor(actor, sqlAssert(`(SELECT count(*) = 0 FROM ${page}())`, 'No class-only or unrelated history')));
  runPsql({ databaseUrl, label: 'page-revoke', sql: revoke(paged.child) });
  check('page-arms', asActor(EA_A, sqlAssert(`(SELECT count(*) = 1 FROM ${page}() WHERE child_id = '${paged.child}')`, 'Owner keeps history after revocation')));
  commit(EA_B, expectWinner(correction({ child: paged.child, time: TUE }), 'applied', undefined, EA_B));
  check('page-arms', asActor(EA_A, sqlAssert(`(SELECT count(*) = 0 FROM ${page}() WHERE child_id = '${paged.child}')`, 'Superseded former writer loses history')));
  check('rollout-seed', sqlAssert("(SELECT count(*) = 1 AND bool_and(enabled) FROM private.history_pull_rollout WHERE feature = 'skill_mastery' AND user_id IS NULL)", 'One enabled everyone switch'));
  const stable = correction({ child: seed() });
  commit(EA_A, expectWinner(stable, 'applied'));
  const stableBefore = snapshot(databaseUrl, stable);
  runPsql({ databaseUrl, label: 'disable-before-reapply', sql: disabled + "UPDATE private.history_pull_rollout SET note = 'controller disabled' WHERE feature = 'skill_mastery';" });
  // Hosted default privileges (modelled at bootstrap) grant ALL on new public
  // tables to anon and authenticated; TRUNCATE, REFERENCES and TRIGGER are not
  // filtered by RLS. Re-grant ALL here so table-privileges proves a re-apply
  // trims drift as well as the first apply.
  runPsql({ databaseUrl, label: 'hosted-default-acl', sql: 'GRANT ALL ON public.skill_mastery TO anon, authenticated;' });
  runPsql({ databaseUrl, label: 'migration-reapply', file: path.join(MIGRATIONS_DIR, MIGRATION) });
  assert.equal(snapshot(databaseUrl, stable), stableBefore);
  check('migration-reapply', sqlAssert("(SELECT count(*) = 1 AND bool_and(NOT enabled AND note = 'controller disabled') FROM private.history_pull_rollout WHERE feature = 'skill_mastery' AND user_id IS NULL)", 'Switch and note preserved'));
  runPsql({ databaseUrl, label: 'restore-switch', sql: "UPDATE private.history_pull_rollout SET enabled = true WHERE feature = 'skill_mastery';" });
  check('letter-mastery-unchanged', asActor(EA_A, sqlAssert(`(SELECT outcome = 'applied' FROM public.set_letter_mastery('${randomUUID()}', '${seed()}', 'k', 'xh', true, '${MON}'))`, 'Letter correction still applies')));
  check('table-privileges', `
    ${sqlAssert("has_table_privilege('authenticated','public.skill_mastery','SELECT')", 'Explicit select grant')}
    ${['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'].map(priv => sqlAssert(`NOT has_table_privilege('authenticated','public.skill_mastery','${priv}')`, 'No direct ' + priv)).join('\n')}
    ${['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'].map(priv => sqlAssert(`NOT has_table_privilege('anon','public.skill_mastery','${priv}')`, 'No anon ' + priv)).join('\n')}
  `);
  for (const [actor, count] of [[EA_A,1],[EA_B,1],[UNRELATED,0]]) check('table-privileges', asActor(actor, sqlAssert(`(SELECT count(*) = ${count} ${record(stable)})`, 'Direct select is filtered')));
  const guarded = correction({ child: seed() });
  commit(EA_A, expectWinner(guarded, 'applied'));
  const survives = c => `
    ${sqlAssert(`(SELECT count(*) = 1 FROM public.children WHERE id = '${c.child}')`, 'Child survives')}
    ${sqlAssert(`(SELECT count(*) = 1 ${record(c)})`, 'Tick survives')}
    ${sqlAssert(`(SELECT count(*) = 1 ${receipt(c)})`, 'Receipt survives')}`;
  check('delete-guard-skill-history', asActor(EA_A, sqlAssert(`NOT public.delete_child_if_no_history('${guarded.child}')`, 'Skill-only history blocks delete'), { commit: true }));
  check('delete-guard-skill-history', survives(guarded));
  const empty = seed();
  check('delete-guard-unchanged', asActor(EA_A, sqlAssert(`public.delete_child_if_no_history('${empty}')`, 'History-free child deleted'), { commit: true }));
  check('delete-guard-unchanged', sqlAssert(`NOT EXISTS (SELECT 1 FROM public.children WHERE id = '${empty}')`, 'Empty child gone'));
  const letterOnly = seed();
  check('delete-guard-unchanged', asActor(EA_A, `SELECT * FROM public.set_letter_mastery('${randomUUID()}','${letterOnly}','k','xh',true,'${MON}'); ${sqlAssert(`NOT public.delete_child_if_no_history('${letterOnly}')`, 'Letter-only history still blocks delete')}`));
  // Bootstrap creates a plain service_role. Model hosted BYPASSRLS inside this
  // transaction only; the expected FK error rolls back the role alteration too.
  expectSqlState({ databaseUrl, label: 'delete-restrict', sql: `BEGIN; ALTER ROLE service_role BYPASSRLS; SET LOCAL ROLE service_role; DELETE FROM public.children WHERE id = '${guarded.child}'; COMMIT;`, sqlState: '23503' });
  check('delete-restrict', survives(guarded));

  return cases;
};

const main = async () => {
  const base = process.env.HISTORY_RLS_DATABASE_NAME;
  const names = base ? [base + '_skill_mastery'] : [base];
  const urls = names.map((databaseName) => assertDisposableAdminTarget({
    adminDatabaseUrl: process.env.HISTORY_RLS_ADMIN_DATABASE_URL, databaseName,
    confirmation: process.env.HISTORY_RLS_DISPOSABLE_CONFIRM,
  }));
  // Validate the disposable name before creating the database.
  const adminDatabaseUrl = buildDatabaseUrl(urls[0], 'postgres').href;
  const databases = names.map((name, i) => ({ name, url: buildDatabaseUrl(urls[i], name).href }));
  const migrations = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
  const { v5 } = await import('uuid');
  // Shared psql wrappers strip libpq routing overrides, including overlapping calls.
  assert.equal(buildPsqlEnv('skill-mastery').PGHOSTADDR, undefined);
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
    runPsql({ databaseUrl: databases[0].url, sql: fixtureSql, label: 'skill-mastery-fixture' });
    const cases = { ...await runCases(databases[0].url, v5) };
    process.stdout.write(JSON.stringify({ passed: Object.keys(cases).length, cases }) + '\n');
  } finally {
    // Always clean up the disposable database, including on failure.
    const cleanup = await Promise.allSettled(databases.map(async (db) => runPsql({
      databaseUrl: adminDatabaseUrl, label: 'drop-database',
      sql: `DROP DATABASE IF EXISTS ${identifier(db.name)} WITH (FORCE);`,
    })));
    const failed = cleanup.filter((r) => r.status === 'rejected');
    if (failed.length) throw new Error(failed.map((r) => r.reason.message).join('\n'));
  }
};

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { fixtureSql, runCases };
