#!/usr/bin/env node

// Immutable receipt upgrade/RPC/quota/grants and a local Storage policy model.
// Requires disposable PostgreSQL 17; never targets a hosted database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const {
  MIGRATIONS_DIR,
  assertDisposableAdminTarget,
  bootstrapSql,
  buildPsqlEnv,
  buildDatabaseUrl,
  expectSqlState,
  runPsql,
} = require('./history-authorization-postgres-harness.cjs');
const { READ_ONLY_PROOF, SNAPSHOT_SQL, readOnlyScript } = require('./read-support-incidents.cjs');

const INCIDENT_MIGRATION = '20261017120000_mobile_support_incidents.sql';
const RECEIPTS_MIGRATION = '20261030120000_incident_receipts.sql';
const STORAGE_MIGRATION = '20261030120100_support_bundles_storage.sql';
const EA_A = '13000000-0000-0000-0000-000000000001';
const EA_B = '13000000-0000-0000-0000-000000000002';
const ORGANIZATION = 'a111879f-d066-47c9-95a1-bed2a400319a';
const SCHOOL = '21000000-0000-0000-0000-000000000001';
const quoteIdentifier = (identifier) => `"${identifier.replaceAll('"', '""')}"`;

const fixtureSql = `
INSERT INTO auth.users (id) VALUES ('${EA_A}'), ('${EA_B}');
INSERT INTO public.schools (id, name) VALUES ('${SCHOOL}', 'Support incident harness school');
INSERT INTO public.users (id, first_name, last_name, school_id, organization_id) VALUES
  ('${EA_A}', 'Incident', 'EA A', '${SCHOOL}', '${ORGANIZATION}'),
  ('${EA_B}', 'Incident', 'EA B', '${SCHOOL}', '${ORGANIZATION}');
`;

const installDefaultPrivileges = (databaseUrl) => {
  runPsql({ databaseUrl, label: 'supabase-default-privileges', sql: `
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
CREATE TABLE public.incident_harness_acl_control (id integer);
CREATE FUNCTION public.incident_harness_acl_control() RETURNS boolean
LANGUAGE sql AS 'SELECT true';
-- Remove PostgreSQL's PUBLIC function grant so the control proves the role defaults.
REVOKE ALL ON FUNCTION public.incident_harness_acl_control() FROM PUBLIC;
` });
  assert.equal(runPsql({ databaseUrl, label: 'default-acl-control', sql: `
SELECT bool_and(has_table_privilege(r.name, 'public.incident_harness_acl_control', p.name)),
       bool_and(has_function_privilege(r.name, 'public.incident_harness_acl_control()', 'EXECUTE'))
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(name)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(name);
` }), 't|t', 'default-acl-control: all three roles must inherit table writes and function execution');
  return { 'default-acl-control': 'passed' };
};

// Successful reports must survive the connection so later calls prove deduplication.
const asActor = (actorId, statement, commit = false) => `
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${actorId}';
${statement}
${commit ? 'COMMIT' : 'ROLLBACK'};
`;

const asAnon = (statement) => `
BEGIN;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claim.sub = '';
${statement}
ROLLBACK;
`;

// Match Supabase's BYPASSRLS role within this transaction only; shared bootstrap
// creates service_role as NOLOGIN, and no cluster-wide role change may survive.
const asServiceRole = (statement) => `
BEGIN;
ALTER ROLE service_role BYPASSRLS;
SET LOCAL ROLE service_role;
${statement}
ROLLBACK;
`;

const runCases = (databaseUrl) => {
  const summary = {};
  const checkValue = (label, sql, expected) => {
    assert.equal(runPsql({ databaseUrl, sql, label }), expected, label);
    summary[label] = 'passed';
  };
  const checkSqlState = (label, sql, sqlState) => {
    expectSqlState({ databaseUrl, sql, label, sqlState });
    summary[label] = 'passed';
  };
  const reportSql = `SELECT public.report_mobile_support_incident(
    'left_behind_unsent_work', 'i1:u1:o1',
    '{"strandedUserId":"u1","unsentByTable":{"children":2}}'::jsonb
  );`;
  const checkReport = (label, actorId, expectedResult, expectedCount) => {
    assert.equal(runPsql({ databaseUrl, label, sql: asActor(actorId, reportSql, true) }),
      expectedResult, `${label}: RPC result`);
    assert.equal(runPsql({ databaseUrl, label: `${label}-count`,
      sql: `SELECT count(*) FROM public.mobile_support_incidents WHERE repeat_key = 'i1:u1:o1';`,
    }), expectedCount, `${label}: persisted row count`);
    summary[label] = 'passed';
  };

  checkSqlState('anon-execute-refused', asAnon(
    "SELECT public.report_mobile_support_incident('left_behind_unsent_work', 'k1', '{}');"
  ), '42501');
  checkSqlState('no-subject-refused', asActor('',
    "SELECT public.report_mobile_support_incident('left_behind_unsent_work', 'k1', '{}');"
  ), '28000');
  checkReport('accepted', EA_A, 't', '1');
  checkReport('duplicate-recorded-once', EA_A, 'f', '1');
  checkReport('other-reporter-separate', EA_B, 't', '2');

  checkSqlState('unknown-kind-refused', asActor(EA_A,
    "SELECT public.report_mobile_support_incident('child_names', 'k1', '{}');"
  ), '22023');
  checkSqlState('blank-key-refused', asActor(EA_A,
    "SELECT public.report_mobile_support_incident('left_behind_unsent_work', '', '{}');"
  ), '22023');
  checkSqlState('long-key-refused', asActor(EA_A,
    "SELECT public.report_mobile_support_incident('left_behind_unsent_work', repeat('x', 513), '{}');"
  ), '22023');
  checkSqlState('non-object-refused', asActor(EA_A,
    "SELECT public.report_mobile_support_incident('left_behind_unsent_work', 'k1', '[1,2]');"
  ), '22023');
  checkSqlState('oversize-refused', asActor(EA_A,
    "SELECT public.report_mobile_support_incident('left_behind_unsent_work', 'k1', jsonb_build_object('p', repeat('x', 8200)));"
  ), '22023');

  checkSqlState('authenticated-select-refused', asActor(EA_A,
    'SELECT * FROM public.mobile_support_incidents;'
  ), '42501');
  checkSqlState('anon-select-refused', asAnon(
    'SELECT * FROM public.mobile_support_incidents;'
  ), '42501');
  for (const [label, role, expected] of [
    ['authenticated-no-table-grants', 'authenticated', 'f|f|f|f'],
    ['service-role-select-only', 'service_role', 't|f|f|f'],
  ]) {
    checkValue(label, `SELECT ${['SELECT', 'INSERT', 'UPDATE', 'DELETE'].map((privilege) =>
      `has_table_privilege('${role}', 'public.mobile_support_incidents', '${privilege}')`
    ).join(', ')};`, expected);
  }
  // Only authenticated may execute; the default ACL granted it to all three roles.
  checkValue('rpc-execute-authenticated-only', `SELECT ${['anon', 'authenticated', 'service_role', 'authenticator'].map((role) =>
    `has_function_privilege('${role}', 'public.report_mobile_support_incident(text, text, jsonb)', 'EXECUTE')`
  ).join(', ')};`, 'f|t|f|f');
  checkValue('service-role-reads', asServiceRole(
    `SELECT count(*) FROM public.mobile_support_incidents WHERE repeat_key = 'i1:u1:o1';`
  ), '2');
  checkValue('stored-reporter', asServiceRole(
    "SELECT reporter_id FROM public.mobile_support_incidents WHERE repeat_key = 'i1:u1:o1' ORDER BY reporter_id;"
  ), `${EA_A}\n${EA_B}`);
  return summary;
};

// A's reviewable A/C/D wire + storage fixture. The orchestrator shares this export;
// only C owns the separate identity fixture. Unknown top-level keys are rejected.
const ENVELOPE_FIXTURE = {
  schema_version: 2,
  kind: 'upload_terminal',
  repeat_key: 'install-fixture:condition-fixture',
  report_id: '53000000-0000-5000-8000-000000000001',
  report_generation: 1,
  occurrence_count: 2,
  first_seen_at: '2026-10-29T09:00:00.000Z',
  last_seen_at: '2026-10-29T10:00:00.000Z',
  payload: { recordId: 'raw-record-id', wirePayload: { id: 'raw-record-id', notes: 'Diagnostic text é 漢字' },
    lastError: 'Server response retained', bundleUploadFailed: false },
  observed: { application: { version: '1.4.0', build: '54' }, update: { id: null }, device: { deviceName: 'EA phone' } },
  first_observed: { application: { version: '1.4.0', build: '53' }, update: { id: 'old-update' } },
  delivery: { installId: 'install-fixture', userId: EA_A, email: 'fixture@example.invalid',
    network: { isConnected: true }, sentAt: '2026-10-29T10:01:00.000Z' },
  bundle_path: `${EA_A}/2026-10-29/fixture.json`,
  screenshot_path: `${EA_A}/2026-10-29/fixture-screenshot.heic`,
};
// R-O15: provenance stays in dedicated nullable JSON columns, payload is payload.
const STORAGE_ROW_FIXTURE = {
  reporter_id: EA_A,
  report_id: ENVELOPE_FIXTURE.report_id,
  kind: ENVELOPE_FIXTURE.kind,
  repeat_key: ENVELOPE_FIXTURE.repeat_key,
  schema_version: 2,
  report_generation: ENVELOPE_FIXTURE.report_generation,
  occurrence_count: ENVELOPE_FIXTURE.occurrence_count,
  first_seen_at: ENVELOPE_FIXTURE.first_seen_at,
  last_seen_at: ENVELOPE_FIXTURE.last_seen_at,
  payload: structuredClone(ENVELOPE_FIXTURE.payload),
  observed: structuredClone(ENVELOPE_FIXTURE.observed),
  first_observed: structuredClone(ENVELOPE_FIXTURE.first_observed),
  delivery: structuredClone(ENVELOPE_FIXTURE.delivery),
  bundle_path: ENVELOPE_FIXTURE.bundle_path,
  screenshot_path: ENVELOPE_FIXTURE.screenshot_path,
  // id and received_at are server-generated and checked separately.
};
const sqlLiteral = (value) => `'${value.replaceAll("'", "''")}'`;
const envelopeSql = (envelope) => envelope === undefined ? 'NULL' : `${sqlLiteral(JSON.stringify(envelope))}::jsonb`;
const v2Call = (envelope) => `SELECT public.report_mobile_support_incident_v2(${envelopeSql(envelope)})->>'status';`;
const freshEnvelope = (patch = {}) => ({ ...structuredClone(ENVELOPE_FIXTURE), report_id: randomUUID(), ...patch });
const checks = (databaseUrl) => {
  const summary = {};
  return {
    summary,
    value(label, sql, expected) {
      assert.equal(runPsql({ databaseUrl, label, sql }), expected, label);
      summary[label] = 'passed';
    },
    state(label, sql, sqlState = '22023') {
      expectSqlState({ databaseUrl, label, sql, sqlState });
      summary[label] = 'passed';
    },
  };
};

const runV1BoundaryCases = (databaseUrl) => {
  const c = checks(databaseUrl);
  for (const kind of ['left_behind_unsent_work', 'foreign_owner_in_file', 'legacy_shared_file_unsent']) {
    c.value(`v1-kind-${kind}`, asActor(EA_A,
      `SELECT public.report_mobile_support_incident('${kind}', 'v1-kind:${kind}', '{}');`), 't');
  }
  for (const kind of ['upload_terminal', 'upload_backlog_stale', 'reconcile_breaker_tripped',
    'pull_failing', 'app_error_caught', 'ea_report', 'diagnostics_sent']) {
    c.state(`v1-refuses-v2-kind-${kind}`, asActor(EA_A,
      `SELECT public.report_mobile_support_incident('${kind}', 'v1-new-kind', '{}');`));
  }
  for (const [label, args] of [
    ['null-kind', "NULL, 'k', '{}'"], ['null-key', "'left_behind_unsent_work', NULL, '{}'"],
    ['null-payload', "'left_behind_unsent_work', 'k', NULL"],
    ['json-null-payload', "'left_behind_unsent_work', 'k', 'null'"],
    ['scalar-payload', "'left_behind_unsent_work', 'k', '1'"],
  ]) c.state(`v1-${label}-refused`, asActor(EA_A, `SELECT public.report_mobile_support_incident(${args});`));
  c.value('v1-key-512-accepted', asActor(EA_A,
    "SELECT public.report_mobile_support_incident('left_behind_unsent_work', repeat('k',512), '{}');"), 't');
  // jsonb_build_object('p', '') has 9 bytes, padding brings it to exactly 8192.
  c.value('v1-payload-8192-accepted', asActor(EA_A,
    "SELECT public.report_mobile_support_incident('left_behind_unsent_work', '8192', jsonb_build_object('p', repeat('x',8183)));"), 't');
  c.state('v1-payload-8193-refused', asActor(EA_A,
    "SELECT public.report_mobile_support_incident('left_behind_unsent_work', '8193', jsonb_build_object('p', repeat('x',8184)));"));
  c.value('v1-new-rows-retain-defaults-and-nulls', `SELECT count(*) = 2 AND bool_and(
    schema_version = 1 AND report_generation = 1 AND occurrence_count = 1
    AND observed IS NULL AND first_observed IS NULL AND delivery IS NULL
    AND first_seen_at IS NULL AND last_seen_at IS NULL
    AND bundle_path IS NULL AND screenshot_path IS NULL
    AND report_id = md5(jsonb_build_array(kind,repeat_key)::text)::uuid)
FROM public.mobile_support_incidents WHERE repeat_key = 'i1:u1:o1';`, 't');
  c.value('v1-original-received-at-default', "SELECT pg_get_expr(d.adbin,d.adrelid) FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum WHERE d.adrelid='public.mobile_support_incidents'::regclass AND a.attname='received_at';", 'now()');
  return c.summary;
};

const runV2IdentityCases = (databaseUrl) => {
  const c = checks(databaseUrl);
  const e = structuredClone(ENVELOPE_FIXTURE);
  c.value('v2-insert', asActor(EA_A, v2Call(e), true), 'inserted');
  c.value('v2-original-storage-representation', `SELECT
    schema_version = 2 AND report_generation = 1 AND occurrence_count = 2
    AND repeat_key = ${sqlLiteral(e.repeat_key)} AND kind = ${sqlLiteral(e.kind)}
    AND first_seen_at = ${sqlLiteral(e.first_seen_at)}::timestamptz
    AND last_seen_at = ${sqlLiteral(e.last_seen_at)}::timestamptz
    AND payload = ${envelopeSql(e.payload)} AND observed = ${envelopeSql(e.observed)}
    AND first_observed = ${envelopeSql(e.first_observed)} AND delivery = ${envelopeSql(e.delivery)}
    AND bundle_path = ${sqlLiteral(e.bundle_path)} AND screenshot_path = ${sqlLiteral(e.screenshot_path)}
FROM public.mobile_support_incidents WHERE reporter_id = '${EA_A}' AND report_id = '${e.report_id}';`, 't');
  c.value('v2-shared-storage-row-fixture', `SELECT to_jsonb(r) @> ${envelopeSql(Object.fromEntries(Object.entries(STORAGE_ROW_FIXTURE).filter(([key]) => !['first_seen_at', 'last_seen_at'].includes(key))))}
FROM public.mobile_support_incidents r WHERE reporter_id = '${EA_A}' AND report_id = '${e.report_id}';`, 't');
  runPsql({ databaseUrl, label: 'v2-save-original', sql: `CREATE TABLE public.incident_harness_v2_original AS
    SELECT * FROM public.mobile_support_incidents WHERE report_id = '${e.report_id}';` });
  c.value('v2-duplicate-immutable', asActor(EA_A, v2Call({ ...e, payload: { changed: true },
    observed: { changed: true }, delivery: { installId: 'install-fixture', changed: true },
    occurrence_count: 99, bundle_path: null, screenshot_path: null }), true), 'duplicate');
  c.value('v2-duplicate-preserves-entire-row', `SELECT to_jsonb(r) = to_jsonb(o)
FROM public.mobile_support_incidents r JOIN public.incident_harness_v2_original o USING (id);`, 't');
  c.value('v2-second-generation', asActor(EA_A, v2Call({ ...e,
    report_id: '53000000-0000-5000-8000-000000000002', report_generation: 2 }), true), 'inserted');
  c.value('v2-two-generations-stored', `SELECT count(*) FROM public.mobile_support_incidents
WHERE reporter_id = '${EA_A}' AND kind = '${e.kind}' AND repeat_key = '${e.repeat_key}';`, '2');
  // New connection and a JSON roundtrip represent a phone restoring its frozen snapshot.
  c.value('v2-restored-snapshot-replay', asActor(EA_A, v2Call(JSON.parse(JSON.stringify(e))), true), 'duplicate');
  c.value('v2-reporter-is-auth-subject', asActor(EA_B, v2Call({ ...e,
    bundle_path: `${EA_B}/2026-10-29/fixture.json`, screenshot_path: null }), true), 'inserted');
  c.value('v2-report-id-separate-per-reporter', `SELECT count(*) = 2 AND count(DISTINCT reporter_id) = 2
FROM public.mobile_support_incidents WHERE report_id = '${e.report_id}';`, 't');
  return c.summary;
};

const runV2ValidationCases = (databaseUrl) => {
  const c = checks(databaseUrl);
  const reject = (label, e) => c.state(label, asActor(EA_A, v2Call(e)));
  for (const [label, value] of [['sql-null', undefined], ['json-null', null], ['scalar', 42], ['array', []]]) {
    reject(`v2-envelope-${label}`, value);
  }
  for (const field of Object.keys(ENVELOPE_FIXTURE)) {
    const e = freshEnvelope(); delete e[field];
    reject(`v2-missing-${field}`, e);
  }
  const invalid = {
    schema_version: [null, '2', 1, 2.1, 32768],
    kind: [null, 1, '', 'unknown'],
    repeat_key: [null, 1, '', 'x'.repeat(513), 'no-prefix', ':digest', 'install-fixture:', 'other-install:digest'],
    report_id: [null, 1, 'not-a-uuid'],
    report_generation: [null, '1', 0, -1, 1.5, 2147483648, 1e100],
    occurrence_count: [null, '1', 0, -1, 1.5, 2147483648, 1e100],
    first_seen_at: [null, 1, 'not-a-timestamp', '2026-13-99', 'infinity'],
    last_seen_at: [null, 1, 'not-a-timestamp', '-infinity'],
    payload: [null, 1, []], observed: [null, 1, []],
    first_observed: [null, 1, []], delivery: [null, 1, [], {}, { installId: null }, { installId: '' }, { installId: 1 }],
    bundle_path: [1, {}, `${EA_B}/2026-10-29/stolen.json`, `${EA_A}suffix/file.json`, ''],
    screenshot_path: [1, [], `${EA_B}/2026-10-29/stolen.png`, `${EA_A}suffix/file.png`, ''],
  };
  for (const [field, values] of Object.entries(invalid)) {
    values.forEach((value, i) => reject(`v2-invalid-${field}-${i + 1}`, freshEnvelope({ [field]: value })));
  }
  reject('v2-inverted-interval', freshEnvelope({ first_seen_at: '2026-10-30T00:00:00Z' }));
  reject('v2-unknown-top-level-key-rejected', freshEnvelope({ unexpected: true }));
  c.value('v2-null-paths-equal-interval-max-counters', asActor(EA_A, v2Call(freshEnvelope({
    bundle_path: null, screenshot_path: null, last_seen_at: ENVELOPE_FIXTURE.first_seen_at,
    report_generation: 2147483647, occurrence_count: 2147483647,
  }))), 'inserted');
  c.value('v2-repeat-key-512-accepted', asActor(EA_A, v2Call(freshEnvelope({
    repeat_key: 'install-fixture:' + 'k'.repeat(512 - 'install-fixture:'.length),
  }))), 'inserted');
  for (const kind of ['left_behind_unsent_work', 'foreign_owner_in_file', 'legacy_shared_file_unsent',
    'upload_terminal', 'upload_backlog_stale', 'reconcile_breaker_tripped', 'pull_failing',
    'app_error_caught', 'ea_report', 'diagnostics_sent']) {
    c.value(`v2-kind-${kind}`, asActor(EA_A, v2Call(freshEnvelope({ kind }))), 'inserted');
  }
  c.value('v2-raw-unrestricted-nested-evidence', asActor(EA_A, v2Call(freshEnvelope({
    payload: { childId: 'raw-child-id', nested: { arbitrary: ['name', null, 4, true] },
      lastError: 'Long server message '.repeat(600), stack: 'Raw stack', note: "EA's note" },
    observed: { deviceName: 'EA phone', arbitrary: { release: 'full' } },
  }))), 'inserted');
  // Use the server's actual jsonb::text representation for the exact byte boundary.
  // A multibyte field makes a character-count implementation fail these tests.
  const boundary = `(WITH base AS (SELECT ${envelopeSql(freshEnvelope({ payload: { text: 'é漢😀'.repeat(100) } }))} AS e)
    SELECT jsonb_set(e, '{payload,pad}', to_jsonb(repeat('x',
      65536 - octet_length(jsonb_set(e, '{payload,pad}', '""'::jsonb)::text)))) FROM base)`;
  c.value('v2-envelope-byte-boundary-fixture', `SELECT octet_length((${boundary})::text);`, '65536');
  c.value('v2-envelope-65536-multibyte-accepted', asActor(EA_A,
    `SELECT public.report_mobile_support_incident_v2(${boundary})->>'status';`), 'inserted');
  c.state('v2-envelope-65537-multibyte-refused', asActor(EA_A,
    `SELECT public.report_mobile_support_incident_v2(jsonb_set(${boundary}, '{payload,pad}',
      to_jsonb((${boundary} #>> '{payload,pad}') || 'x')));`));
  // Phone's complete compact representation stays within the 56,000-byte contract.
  const phone = freshEnvelope({ payload: { text: 'é漢😀'.repeat(100) },
    delivery: { ...ENVELOPE_FIXTURE.delivery, network: { details: { carrier: 'fixture carrier' } } } });
  const emptySize = Buffer.byteLength(JSON.stringify({ ...phone, payload: { ...phone.payload, pad: '' } }));
  phone.payload.pad = 'x'.repeat(56000 - emptySize);
  assert.equal(Buffer.byteLength(JSON.stringify(phone)), 56000, 'v2-phone-complete-envelope-56000-fixture');
  c.value('v2-phone-complete-envelope-56000', asActor(EA_A, v2Call(phone)), 'inserted');
  // Inspect within the same transaction as insertion; now() would equal transaction_timestamp().
  c.value('v2-clock-timestamp-after-transaction-start', `BEGIN;
SELECT pg_sleep(0.03);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${EA_A}';
${v2Call(freshEnvelope({ report_id: '53000000-0000-5000-8000-000000000098' }))}
RESET ROLE;
SELECT received_at > transaction_timestamp() FROM public.mobile_support_incidents
WHERE report_id = '53000000-0000-5000-8000-000000000098';
ROLLBACK;`, 'inserted\nt');
  return c.summary;
};

// Separate psql sessions exercise actual lock contention, not sequential approximations.
const startPsql = (databaseUrl, label) => {
  const child = spawn('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-Atq', databaseUrl],
    { env: buildPsqlEnv(label), stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
  const done = new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout: stdout.trim(), stderr }); });
  });
  return { child, done, output: () => stdout };
};
const eventually = async (label, predicate) => {
  const until = Date.now() + 7000;
  while (Date.now() < until) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`${label}: timed out waiting for concurrent sessions`);
};
const raceReports = async (databaseUrl, label, actor, envelopes) => {
  const gate = startPsql(databaseUrl, `${label}-gate`);
  const workers = [];
  try {
    gate.child.stdin.write(`BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('mobile_support_incidents:${actor}', 0));
\\echo LOCK_HELD
`);
    await eventually(`${label}-gate-held`, () => gate.output().includes('LOCK_HELD'));
    for (let i = 0; i < envelopes.length; i += 1) {
      const worker = startPsql(databaseUrl, `${label}-${i}`);
      workers.push(worker);
      worker.child.stdin.end(asActor(actor, v2Call(envelopes[i]), true));
    }
    await eventually(`${label}-both-waiting`, () => runPsql({ databaseUrl, label: `${label}-waiters`, sql: `
SELECT count(*) FROM pg_stat_activity WHERE application_name IN (
'${`masi-history-rls-${label}-0`}', '${`masi-history-rls-${label}-1`}')
AND wait_event = 'advisory';` }) === '2');
    gate.child.stdin.end('COMMIT;\n');
    assert.equal((await gate.done).code, 0, `${label}: gate released`);
    return await Promise.all(workers.map((worker) => worker.done));
  } finally {
    if (gate.child.exitCode === null) gate.child.kill('SIGKILL');
    for (const worker of workers) if (worker.child.exitCode === null) worker.child.kill('SIGKILL');
    await Promise.allSettled([gate.done, ...workers.map((worker) => worker.done)]);
  }
};

const runQuotaCases = async (databaseUrl) => {
  const c = checks(databaseUrl);
  const actor = '13000000-0000-0000-0000-000000000003';
  runPsql({ databaseUrl, label: 'quota-auth-fixture', sql: `INSERT INTO auth.users(id) VALUES ('${actor}');` });
  const base = freshEnvelope({ bundle_path: null, screenshot_path: null });
  const seed = (count, human = false) => runPsql({ databaseUrl, label: `quota-seed-${human ? 'human' : 'machine'}-${count}`,
    sql: asActor(actor, `DO $seed$ BEGIN FOR i IN 1..${count} LOOP
PERFORM public.report_mobile_support_incident_v2(${envelopeSql(base)} || jsonb_build_object(
'report_id', gen_random_uuid(), 'kind', ${human ? "CASE WHEN i % 2 = 0 THEN 'ea_report' ELSE 'diagnostics_sent' END" : "'upload_terminal'"}));
END LOOP; END $seed$;`, true) });
  c.value('v1-unlimited-201-before-v2', asActor(actor, `DO $seed$ BEGIN FOR i IN 1..201 LOOP
PERFORM public.report_mobile_support_incident('left_behind_unsent_work', 'quota-v1:' || i, '{}');
END LOOP; END $seed$;
`, true), '');
  c.value('v1-unlimited-201-persisted', `SELECT count(*) FROM public.mobile_support_incidents
WHERE reporter_id = '${actor}' AND schema_version = 1;`, '201');
  seed(149);
  const lastMachine = { ...base, report_id: randomUUID() };
  c.value('v2-machine-slot-150', asActor(actor, v2Call(lastMachine), true), 'inserted');
  c.state('v2-machine-slot-151-refused', asActor(actor, v2Call(freshEnvelope({ bundle_path: null, screenshot_path: null }))), '54000');
  c.value('v2-machine-full-duplicate', asActor(actor, v2Call(lastMachine), true), 'duplicate');
  seed(49, true);
  const lastHuman = { ...base, report_id: randomUUID(), kind: 'ea_report' };
  c.value('v2-human-slot-50-machine-full', asActor(actor, v2Call(lastHuman), true), 'inserted');
  for (const kind of ['ea_report', 'diagnostics_sent']) {
    c.state(`v2-human-slot-51-${kind}-refused`, asActor(actor, v2Call({ ...base, report_id: randomUUID(), kind })), '54000');
  }
  c.value('v2-human-full-duplicate', asActor(actor, v2Call(lastHuman), true), 'duplicate');
  c.value('v1-unlimited-after-v2-full', asActor(actor,
    "SELECT public.report_mobile_support_incident('left_behind_unsent_work', 'quota-v1:after-full', '{}');", true), 't');
  c.value('v2-quota-other-reporter-isolated', asActor(EA_B, v2Call({ ...base, report_id: randomUUID() })), 'inserted');
  runPsql({ databaseUrl, label: 'quota-expired-fixture', sql: `UPDATE public.mobile_support_incidents
SET received_at = clock_timestamp() - interval '24 hours 1 second'
WHERE reporter_id = '${actor}' AND report_id IN ('${lastMachine.report_id}', '${lastHuman.report_id}');` });
  c.value('v2-expired-human-frees-slot', asActor(actor,
    v2Call({ ...base, report_id: randomUUID(), kind: 'diagnostics_sent' }), true), 'inserted');
  c.value('v2-expired-machine-frees-slot-with-human-full', asActor(actor,
    v2Call({ ...base, report_id: randomUUID() }), true), 'inserted');
  for (const human of [false, true]) {
    const label = `v2-concurrent-${human ? 'human' : 'machine'}-last-slot`;
    runPsql({ databaseUrl, label: `${label}-reset-disposable-fixture`,
      sql: `DELETE FROM public.mobile_support_incidents WHERE reporter_id = '${actor}' AND schema_version = 2;` });
    seed(human ? 49 : 149, human);
    const attempts = [0, 1].map(() => ({ ...base, report_id: randomUUID(), kind: human ? 'ea_report' : 'upload_terminal' }));
    const results = await raceReports(databaseUrl, label, actor, attempts);
    assert.equal(results.filter((r) => r.code === 0 && r.stdout === 'inserted').length, 1, `${label}: exactly one inserted`);
    assert.equal(results.filter((r) => r.code !== 0 && /54000/.test(r.stderr)).length, 1, `${label}: exactly one quota rejection`);
    c.value(label, `SELECT count(*) FROM public.mobile_support_incidents
WHERE reporter_id = '${actor}' AND schema_version = 2;`, human ? '50' : '150');
  }
  runPsql({ databaseUrl, label: 'v2-concurrent-duplicate-reset-disposable-fixture',
    sql: `DELETE FROM public.mobile_support_incidents WHERE reporter_id = '${actor}' AND schema_version = 2;` });
  const same = { ...base, report_id: randomUUID() };
  const duplicates = await raceReports(databaseUrl, 'v2-concurrent-duplicate', actor, [same, same]);
  assert.deepEqual(duplicates.map((r) => ({ code: r.code, value: r.stdout })).sort((a,b) => a.value.localeCompare(b.value)),
    [{ code: 0, value: 'duplicate' }, { code: 0, value: 'inserted' }], 'v2-concurrent-duplicate: inserted and duplicate');
  c.value('v2-concurrent-duplicate-one-row', `SELECT count(*) FROM public.mobile_support_incidents
WHERE reporter_id = '${actor}' AND schema_version = 2;`, '1');
  return c.summary;
};

const runV2GrantCases = (databaseUrl) => {
  const c = checks(databaseUrl);
  c.state('v2-anon-execute-refused', asAnon(v2Call(ENVELOPE_FIXTURE)), '42501');
  c.state('v2-no-subject-refused', asActor('', v2Call(ENVELOPE_FIXTURE)), '28000');
  c.state('v2-service-execute-refused', asServiceRole(v2Call(ENVELOPE_FIXTURE)), '42501');
  c.value('v2-execute-authenticated-only', `SELECT ${['anon', 'authenticated', 'service_role', 'authenticator'].map((role) =>
    `has_function_privilege('${role}', 'public.report_mobile_support_incident_v2(jsonb)', 'EXECUTE')`).join(',')};`, 'f|t|f|f');
  c.value('v1-v2-no-public-execute-acl', `SELECT NOT EXISTS (
SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f',p.proowner))) a
WHERE p.oid IN ('public.report_mobile_support_incident(text,text,jsonb)'::regprocedure,
'public.report_mobile_support_incident_v2(jsonb)'::regprocedure)
AND a.grantee = 0 AND a.privilege_type = 'EXECUTE');`, 't');
  c.value('v1-v2-definer-empty-search-path', `SELECT count(*) = 2 AND bool_and(prosecdef AND provolatile = 'v'
AND proconfig = ARRAY['search_path=""']) FROM pg_proc WHERE oid IN (
'public.report_mobile_support_incident(text,text,jsonb)'::regprocedure,
'public.report_mobile_support_incident_v2(jsonb)'::regprocedure);`, 't');
  for (const role of ['anon', 'authenticated']) {
    const wrap = role === 'anon' ? asAnon : (sql) => asActor(EA_A, sql);
    for (const [operation, sql] of Object.entries({
      select: 'SELECT * FROM public.mobile_support_incidents;',
      insert: `INSERT INTO public.mobile_support_incidents (reporter_id, kind, repeat_key, payload, report_id)
VALUES ('${EA_A}', 'ea_report', 'direct', '{}', gen_random_uuid());`,
      update: "UPDATE public.mobile_support_incidents SET payload = '{}';",
      delete: 'DELETE FROM public.mobile_support_incidents;',
    })) c.state(`receipts-${role}-${operation}-refused`, wrap(sql), '42501');
  }
  c.value('receipts-service-all-grants-select-only', `SELECT ${['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'].map((p) =>
    `has_table_privilege('service_role','public.mobile_support_incidents','${p}')`).join(',')};`, 't|f|f|f|f|f|f');
  c.value('receipts-rls-enabled', "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.mobile_support_incidents'::regclass;", 't');
  return c.summary;
};

// Storage infrastructure comes from bootstrapSql, shared by all migration replays.
// Keep this adversarial policy and unrelated-bucket fixture local. SQL cases do
// not prove MIME/file-size enforcement, Storage HTTP or hosted policy/ownership
// state; G2/G3/G4 retain those gates.
const storagePolicyFixtureSql = `
-- Worst-case existing policy. New restrictive policies must intersect this grant.
CREATE POLICY incident_harness_existing_broad ON storage.objects FOR ALL TO public
USING (true) WITH CHECK (true);
INSERT INTO storage.buckets(id,name,public) VALUES ('unrelated-harness', 'unrelated-harness', true);
INSERT INTO storage.objects(bucket_id,name) VALUES ('unrelated-harness','shared.txt');
`;

const runStorageCases = (databaseUrl) => {
  const c = checks(databaseUrl);
  // Prove denials below are enforced by RLS despite the real Supabase grants.
  c.value('storage-api-table-grants-present', `SELECT bool_and(has_table_privilege(r.name, t.name, p.name))
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(name)
CROSS JOIN (VALUES ('storage.buckets'), ('storage.objects')) AS t(name)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(name);`, 't');
  c.value('storage-bucket-and-object-rls-enabled', `SELECT count(*) = 2 AND bool_and(relrowsecurity)
FROM pg_class WHERE oid IN ('storage.buckets'::regclass, 'storage.objects'::regclass);`, 't');
  const jsonPath = `${EA_A}/2026-10-29/fixture.json`;
  const imagePath = `${EA_A}/2026-10-29/fixture-screenshot.heic`;
  c.value('storage-private-bucket-settings', `SELECT id = 'support-bundles' AND name = 'support-bundles'
AND NOT public AND file_size_limit = 15728640 AND
(SELECT array_agg(m ORDER BY m) FROM unnest(allowed_mime_types) m) =
ARRAY['application/json','image/heic','image/heif','image/jpeg','image/png']::text[]
FROM storage.buckets WHERE id = 'support-bundles';`, 't');
  c.value('storage-ea-own-bundle-insert', asActor(EA_A, `INSERT INTO storage.objects(bucket_id,name)
VALUES ('support-bundles','${jsonPath}');`, true), '');
  c.value('storage-ea-own-screenshot-insert', asActor(EA_A, `INSERT INTO storage.objects(bucket_id,name)
VALUES ('support-bundles','${imagePath}');`, true), '');
  c.value('storage-ea-b-own-insert', asActor(EA_B, `INSERT INTO storage.objects(bucket_id,name)
VALUES ('support-bundles','${EA_B}/2026-10-29/own.png');`, true), '');
  c.state('storage-cross-folder-insert-refused', asActor(EA_A, `INSERT INTO storage.objects(bucket_id,name)
VALUES ('support-bundles','${EA_B}/2026-10-29/stolen.json');`), '42501');
  c.state('storage-folder-prefix-lookalike-refused', asActor(EA_A, `INSERT INTO storage.objects(bucket_id,name)
VALUES ('support-bundles','${EA_A}suffix/file.json');`), '42501');
  c.state('storage-root-file-insert-refused', asActor(EA_A, `INSERT INTO storage.objects(bucket_id,name)
VALUES ('support-bundles','root.json');`), '42501');
  c.state('storage-anon-insert-refused', asAnon(`INSERT INTO storage.objects(bucket_id,name)
VALUES ('support-bundles','${EA_A}/anon.json');`), '42501');
  for (const [label, wrap] of [['ea-a', (sql) => asActor(EA_A, sql)], ['ea-b', (sql) => asActor(EA_B, sql)], ['anon', asAnon]]) {
    c.value(`storage-${label}-read-refused`, wrap(`SELECT count(*) FROM storage.objects
WHERE bucket_id = 'support-bundles' AND name = '${jsonPath}';`), '0');
    c.value(`storage-${label}-list-refused`, wrap("SELECT count(*) FROM storage.objects WHERE bucket_id = 'support-bundles';"), '0');
    c.value(`storage-${label}-update-refused`, wrap(`WITH changed AS (UPDATE storage.objects SET name = name || '.changed'
WHERE bucket_id = 'support-bundles' RETURNING 1) SELECT count(*) FROM changed;`), '0');
    c.value(`storage-${label}-delete-refused`, wrap(`WITH removed AS (DELETE FROM storage.objects
WHERE bucket_id = 'support-bundles' RETURNING 1) SELECT count(*) FROM removed;`), '0');
  }
  c.state('storage-move-unrelated-into-support-refused', asActor(EA_A, `UPDATE storage.objects
SET bucket_id = 'support-bundles', name = '${EA_A}/moved.json' WHERE bucket_id = 'unrelated-harness';`), '42501');
  c.state('storage-overwrite-via-conflict-refused', asActor(EA_A, `INSERT INTO storage.objects(bucket_id,name)
VALUES ('support-bundles','${jsonPath}') ON CONFLICT (bucket_id,name) DO UPDATE SET name = excluded.name;`), '42501');
  c.state('storage-duplicate-insert-does-not-overwrite', asActor(EA_A, `INSERT INTO storage.objects(bucket_id,name)
VALUES ('support-bundles','${jsonPath}');`), '23505');
  c.value('storage-service-reads-pair', asServiceRole(`SELECT name FROM storage.objects
WHERE bucket_id = 'support-bundles' AND name LIKE '${EA_A}/%' ORDER BY name COLLATE "C";`), `${imagePath}\n${jsonPath}`);
  c.value('storage-service-reads-all', asServiceRole("SELECT count(*) FROM storage.objects WHERE bucket_id = 'support-bundles';"), '3');
  c.value('storage-unrelated-read-unaffected', asActor(EA_A,
    "SELECT count(*) FROM storage.objects WHERE bucket_id = 'unrelated-harness';"), '1');
  c.value('storage-unrelated-writes-unaffected', asActor(EA_A, `
INSERT INTO storage.objects(bucket_id,name) VALUES ('unrelated-harness','new.txt');
WITH changed AS (UPDATE storage.objects SET name = 'changed.txt'
WHERE bucket_id = 'unrelated-harness' AND name = 'new.txt' RETURNING 1) SELECT count(*) FROM changed;
WITH removed AS (DELETE FROM storage.objects WHERE bucket_id = 'unrelated-harness'
AND name = 'changed.txt' RETURNING 1) SELECT count(*) FROM removed;`), '1\n1');
  c.value('storage-existing-broad-policy-retained', `SELECT count(*) FROM pg_policy
WHERE polrelid = 'storage.objects'::regclass AND polname = 'incident_harness_existing_broad';`, '1');
  return c.summary;
};

const preparePopulatedUpgrade = (databaseUrl) => {
  assert.equal(runPsql({ databaseUrl, label: 'upgrade-seed-v1-before-migration', sql: asActor(EA_A,
    "SELECT public.report_mobile_support_incident('foreign_owner_in_file', 'upgrade:original', '{\"foreignTotal\":2,\"foreignByTable\":{\"children\":2}}');", true),
  }), 't', 'upgrade-seed-v1-before-migration');
  runPsql({ databaseUrl, label: 'upgrade-save-original', sql: `
CREATE TABLE public.incident_harness_original AS
SELECT id, reporter_id, kind, repeat_key, payload, received_at
FROM public.mobile_support_incidents WHERE repeat_key = 'upgrade:original';` });
};

const runUpgradeCases = (databaseUrl) => {
  const summary = {};
  const check = (label, sql, expected) => {
    assert.equal(runPsql({ databaseUrl, label, sql }), expected, label);
    summary[label] = 'passed';
  };
  check('upgrade-populated-row-preserved', `SELECT count(*) = 1 AND bool_and(
    ROW(r.id,r.reporter_id,r.kind,r.repeat_key,r.payload,r.received_at) IS NOT DISTINCT FROM
    ROW(o.id,o.reporter_id,o.kind,o.repeat_key,o.payload,o.received_at))
FROM public.mobile_support_incidents r JOIN public.incident_harness_original o USING (id);`, 't');
  check('upgrade-derived-id-and-v1-nulls', `SELECT report_id = md5(jsonb_build_array(kind, repeat_key)::text)::uuid
    AND schema_version = 1 AND report_generation = 1 AND occurrence_count = 1
    AND first_seen_at IS NULL AND last_seen_at IS NULL AND observed IS NULL
    AND first_observed IS NULL AND delivery IS NULL AND bundle_path IS NULL AND screenshot_path IS NULL
FROM public.mobile_support_incidents WHERE repeat_key = 'upgrade:original';`, 't');
  check('upgrade-original-replay-false', asActor(EA_A,
    "SELECT public.report_mobile_support_incident('foreign_owner_in_file', 'upgrade:original', '{\"changed\":true}');", true), 'f');
  check('upgrade-replay-cannot-mutate', `SELECT r.payload = o.payload AND r.received_at = o.received_at
FROM public.mobile_support_incidents r JOIN public.incident_harness_original o USING (id);`, 't');
  check('upgrade-constraint-swap', `SELECT
    NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid = 'public.mobile_support_incidents'::regclass
      AND conname = 'mobile_support_incidents_once')
    AND EXISTS (SELECT FROM pg_constraint WHERE conrelid = 'public.mobile_support_incidents'::regclass
      AND contype = 'u' AND pg_get_constraintdef(oid) = 'UNIQUE (reporter_id, report_id)');`, 't');
  check('upgrade-required-indexes', `SELECT count(*) FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'mobile_support_incidents'
AND (indexdef LIKE '%(reporter_id, kind, repeat_key)' OR indexdef LIKE '%(received_at, id)');`, '2');
  check('v1-cross-reporter-derived-id', asActor(EA_B,
    "SELECT public.report_mobile_support_incident('foreign_owner_in_file', 'upgrade:original', '{}');", true), 't');
  check('v1-cross-reporter-isolation', `SELECT count(*) = 2 AND count(DISTINCT report_id) = 1
FROM public.mobile_support_incidents WHERE repeat_key = 'upgrade:original';`, 't');
  summary['v1-definition-md5'] = runPsql({ databaseUrl, label: 'v1-definition-md5',
    sql: "SELECT md5(pg_get_functiondef('public.report_mobile_support_incident(text,text,jsonb)'::regprocedure));" });
  return summary;
};

// The incident reader's own script, fed to psql -f as the reader does, against a
// server whose sessions are writable by default. That is what the Supabase session
// pooler gives the reader: it drops startup options such as default_transaction_read_only.
const runReaderReadOnlyCases = (databaseUrl) => {
  const summary = {};
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-reader-read-only-'));
  const runScript = (label, sql) => {
    const file = path.join(directory, `${label}.sql`);
    fs.writeFileSync(file, sql);
    return spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-Atq', databaseUrl, '-f', file], {
      encoding: 'utf8', env: buildPsqlEnv(label), timeout: 180_000,
    });
  };
  const count = () => runPsql({ databaseUrl, label: 'reader-receipt-count', sql: 'SELECT count(*) FROM public.mobile_support_incidents;' });
  try {
    assert.equal(runPsql({ databaseUrl, label: 'reader-session-writable',
      sql: "SELECT current_setting('default_transaction_read_only');" }), 'off');
    summary['reader-session-writable-by-default'] = 'passed';

    const read = runScript('reader-snapshot', readOnlyScript(SNAPSHOT_SQL));
    assert.equal(read.status, 0, read.stderr);
    const [proof, ...rest] = read.stdout.trim().split('\n');
    assert.equal(proof, READ_ONLY_PROOF);
    const snapshot = JSON.parse(rest.join('\n'));
    assert.ok(Array.isArray(snapshot.receipts) && snapshot.receipts.length > 0, 'snapshot lists receipts');
    summary['reader-snapshot-confirmed-read-only'] = 'passed';

    const before = count();
    const write = runScript('reader-write', readOnlyScript('DELETE FROM public.mobile_support_incidents;'));
    assert.notEqual(write.status, 0, 'a write inside the reader transaction succeeded');
    assert.match(write.stderr, /ERROR:\s+25006:/, write.stderr);
    assert.equal(count(), before);
    summary['reader-write-refused-25006'] = 'passed';

    // If someone weakens the opening line, the guard stops the script before the read.
    const weakened = readOnlyScript(SNAPSHOT_SQL).replace(/^BEGIN[^\n]*/, 'BEGIN;');
    assert.notEqual(weakened, readOnlyScript(SNAPSHOT_SQL));
    const guarded = runScript('reader-guard', weakened);
    assert.notEqual(guarded.status, 0, 'the guard let a writable transaction read');
    assert.match(guarded.stderr, /ERROR:\s+P0001: incident reader transaction is not read-only/, guarded.stderr);
    assert.equal(guarded.stdout.trim(), '');
    summary['reader-guard-stops-writable-transaction'] = 'passed';
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  return summary;
};

const main = async () => {
  const baseName = process.env.HISTORY_RLS_DATABASE_NAME;
  const databaseName = baseName ? `${baseName}_incident` : baseName;
  const adminUrl = assertDisposableAdminTarget({
    adminDatabaseUrl: process.env.HISTORY_RLS_ADMIN_DATABASE_URL,
    databaseName,
    confirmation: process.env.HISTORY_RLS_DISPOSABLE_CONFIRM,
  });
  const adminDatabaseUrl = buildDatabaseUrl(adminUrl, 'postgres').href;
  const databaseUrl = buildDatabaseUrl(adminUrl, databaseName).href;
  const quotedDatabase = quoteIdentifier(databaseName);

  runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-stale-database' });
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `CREATE DATABASE ${quotedDatabase};`, label: 'create-database' });
  try {
    runPsql({ databaseUrl, sql: bootstrapSql, label: 'bootstrap' });
    const aclSummary = installDefaultPrivileges(databaseUrl);
    const priorMigrations = fs.readdirSync(MIGRATIONS_DIR)
      .filter((filename) => filename.endsWith('.sql') && filename < RECEIPTS_MIGRATION)
      .sort();
    for (const filename of priorMigrations) {
      runPsql({ databaseUrl, file: path.join(MIGRATIONS_DIR, filename), label: `migration-${filename}` });
    }
    runPsql({ databaseUrl, sql: fixtureSql, label: 'support-incident-fixture' });
    preparePopulatedUpgrade(databaseUrl);
    // Explicit read preserves the required missing-migration RED failure.
    const migrationSql = fs.readFileSync(path.join(MIGRATIONS_DIR, RECEIPTS_MIGRATION), 'utf8');
    // The brief requires this atomic harness wrapper. CLI application itself is
    // outside an explicit transaction, so the migration uses session SET/RESET.
    runPsql({ databaseUrl, sql: `BEGIN;\n${migrationSql}\nCOMMIT;\n`, label: `migration-${RECEIPTS_MIGRATION}` });
    const receiptSummary = { ...aclSummary, ...runUpgradeCases(databaseUrl), ...runCases(databaseUrl), ...runV1BoundaryCases(databaseUrl),
      ...runV2IdentityCases(databaseUrl), ...runV2ValidationCases(databaseUrl),
      ...await runQuotaCases(databaseUrl), ...runV2GrantCases(databaseUrl) };
    runPsql({ databaseUrl, label: 'storage-policy-composition-fixture', sql: storagePolicyFixtureSql });
    const storageSql = fs.readFileSync(path.join(MIGRATIONS_DIR, STORAGE_MIGRATION), 'utf8');
    // Hosted storage.* tables belong to supabase_storage_admin. postgres may only CREATE POLICY
    // on them (supautils.policy_grants); ALTER/GRANT/REVOKE fail with 42501 on hosted, which this
    // local stand-in (owned by postgres) cannot reproduce. Guard the migration text instead.
    const ownerOnly = storageSql.replace(/--.*$/gm, '')
      .match(/\b(ALTER\s+TABLE|GRANT|REVOKE)\b[^;]*\bstorage\.\w+/gi);
    assert.equal(ownerOnly, null, `storage migration uses owner-only statements: ${ownerOnly}`);
    runPsql({ databaseUrl, label: `migration-${STORAGE_MIGRATION}`, sql: `BEGIN;\n${storageSql}\nCOMMIT;` });
    const summary = { ...receiptSummary, ...runStorageCases(databaseUrl), ...runReaderReadOnlyCases(databaseUrl) };
    process.stdout.write(`${JSON.stringify({ casesPassed: Object.values(summary).filter((v) => v === 'passed').length,
      ...summary, storageEvidence: 'local PostgreSQL policy model only; hosted/API gates remain open' })}\n`);
  } finally {
    runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-database' });
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { INCIDENT_MIGRATION, RECEIPTS_MIGRATION, STORAGE_MIGRATION,
  ENVELOPE_FIXTURE, STORAGE_ROW_FIXTURE, fixtureSql, storagePolicyFixtureSql, installDefaultPrivileges, runCases,
  runUpgradeCases, runV1BoundaryCases, runV2IdentityCases, runV2ValidationCases, runQuotaCases, runV2GrantCases, runStorageCases, runReaderReadOnlyCases };
