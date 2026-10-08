#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.dirname(require.resolve('../package.json'));
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations');
const DISPOSABLE_CONFIRMATION = 'I_UNDERSTAND_THIS_IS_DISPOSABLE';
const DISPOSABLE_DATABASE_PREFIX = 'masi_history_rls_';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const NON_ROUTING_QUERY_KEYS = new Set(['sslmode', 'connect_timeout', 'application_name']);
const LIBPQ_ROUTING_ENV_KEYS = [
  'PGHOST',
  'PGHOSTADDR',
  'PGPORT',
  'PGDATABASE',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGSYSCONFDIR',
  'PGOPTIONS',
  'PGTARGETSESSIONATTRS',
];
const PLAN_FIXTURE_SESSION_COUNT = 120_000;
const DENSE_OWNER_SESSION_COUNT = 5_000;
const FAMILY_MIGRATION = '20260925120000_session_history_family_delta.sql';

const quoteIdentifier = (identifier) => `"${identifier.replaceAll('"', '""')}"`;

const assertDisposableAdminTarget = ({ adminDatabaseUrl, databaseName, confirmation }) => {
  if (!adminDatabaseUrl) {
    throw new Error('HISTORY_RLS_ADMIN_DATABASE_URL is required');
  }

  let parsed;
  try {
    parsed = new URL(adminDatabaseUrl);
  } catch {
    throw new Error('HISTORY_RLS_ADMIN_DATABASE_URL must be a valid URL');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('History RLS harness requires a PostgreSQL URL');
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error('History RLS harness is localhost-only');
  }
  if (parsed.pathname.replace(/^\/+/, '') !== 'postgres') {
    throw new Error('History RLS harness admin database must be postgres');
  }
  for (const key of parsed.searchParams.keys()) {
    if (!NON_ROUTING_QUERY_KEYS.has(key)) {
      throw new Error(`History RLS harness rejects query parameter "${key}"`);
    }
  }
  if (
    typeof databaseName !== 'string'
    || !databaseName.startsWith(DISPOSABLE_DATABASE_PREFIX)
  ) {
    throw new Error(
      `HISTORY_RLS_DATABASE_NAME must start with ${DISPOSABLE_DATABASE_PREFIX}`
    );
  }
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(databaseName)) {
    throw new Error('HISTORY_RLS_DATABASE_NAME is not a safe PostgreSQL identifier');
  }
  if (confirmation !== DISPOSABLE_CONFIRMATION) {
    throw new Error(
      `HISTORY_RLS_DISPOSABLE_CONFIRM must equal ${DISPOSABLE_CONFIRMATION}`
    );
  }

  return parsed;
};

// Use only components checked by assertDisposableAdminTarget. Even allowlisted
// query parameters are deliberately omitted from both psql connection URLs.
const buildDatabaseUrl = (adminUrl, databaseName) => {
  const target = new URL(`${adminUrl.protocol}//${adminUrl.hostname}`);
  target.username = adminUrl.username;
  target.password = adminUrl.password;
  target.port = adminUrl.port;
  target.pathname = `/${databaseName}`;
  return target;
};

const buildPsqlEnv = (label) => {
  const env = { ...process.env, PGAPPNAME: `masi-history-rls-${label}` };
  // A component-only URI cannot override every libpq environment parameter
  // (notably PGHOSTADDR). Keep authentication, but remove alternate routing.
  for (const key of LIBPQ_ROUTING_ENV_KEYS) {
    delete env[key];
  }
  return env;
};

const runPsql = ({ databaseUrl, sql, file, label }) => {
  const args = [
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-Atq',
    databaseUrl,
    ...(file ? ['-f', file] : ['-c', sql]),
  ];
  const result = spawnSync('psql', args, {
    encoding: 'utf8',
    env: buildPsqlEnv(label),
    timeout: 180_000,
  });

  assert.equal(
    result.status,
    0,
    `${label} failed:\n${(result.stderr || result.stdout || '').trim()}`
  );
  return result.stdout.trim();
};

const bootstrapSql = `
DO $bootstrap_roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOLOGIN;
  END IF;
END
$bootstrap_roles$;

CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id UUID PRIMARY KEY,
  raw_user_meta_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);
CREATE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE SQL
STABLE
SET search_path = pg_catalog
AS $auth_uid$
  SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', TRUE), '')::UUID
$auth_uid$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, authenticator;
GRANT SELECT ON auth.users TO anon, authenticated, service_role, authenticator;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role, authenticator;
`;

const classOnlySessionFixtureSql = `
INSERT INTO auth.users (id) VALUES
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000004'),
  ('10000000-0000-0000-0000-000000000005'),
  ('10000000-0000-0000-0000-000000000006');

INSERT INTO public.schools (id, name)
VALUES ('20000000-0000-0000-0000-000000000001', 'History RLS harness school');

INSERT INTO public.users (id, first_name, last_name, school_id) VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    'Session',
    'Owner',
    '20000000-0000-0000-0000-000000000001'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'Class',
    'Assessor',
    '20000000-0000-0000-0000-000000000001'
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'Former',
    'Delivery EA',
    '20000000-0000-0000-0000-000000000001'
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    'Current',
    'Delivery EA',
    '20000000-0000-0000-0000-000000000001'
  ),
  (
    '10000000-0000-0000-0000-000000000005',
    'Group Only',
    'EA',
    '20000000-0000-0000-0000-000000000001'
  ),
  (
    '10000000-0000-0000-0000-000000000006',
    'Unrelated',
    'EA',
    '20000000-0000-0000-0000-000000000001'
  );

INSERT INTO public.staff_programme_assignments (
  id, user_id, programme_id, school_id
) VALUES
  (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.programmes WHERE code = 'literacy'),
    '20000000-0000-0000-0000-000000000001'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    (SELECT id FROM public.programmes WHERE code = 'literacy'),
    '20000000-0000-0000-0000-000000000001'
  );

INSERT INTO public.classes (
  id, school_id, name, grade, academic_year_id, created_by
) VALUES (
  '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'Grade 1 Harness',
  '1',
  (SELECT id FROM public.academic_years WHERE is_active),
  '10000000-0000-0000-0000-000000000001'
);

INSERT INTO public.children (
  id, first_name, last_name, class_id, created_by
) VALUES
  (
    '50000000-0000-0000-0000-000000000001',
    'Harness',
    'Delivery Child',
    '40000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    'Harness',
    'Coattendee',
    '40000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001'
  );

INSERT INTO public.child_class_memberships (
  id, child_id, class_id, academic_year_id, created_by
) VALUES
  (
    '60000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.academic_years WHERE is_active),
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '60000000-0000-0000-0000-000000000002',
    '50000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.academic_years WHERE is_active),
    '10000000-0000-0000-0000-000000000001'
  );

INSERT INTO public.class_ea_assignments (
  id, class_id, ea_user_id, programme_id, created_by
) VALUES (
  '70000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  (SELECT id FROM public.programmes WHERE code = 'literacy'),
  '10000000-0000-0000-0000-000000000001'
);

INSERT INTO public.child_ea_assignments (
  id, user_id, child_id, assigned_at, unassigned_at, created_by
) VALUES
  (
    '71000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003',
    '50000000-0000-0000-0000-000000000001',
    TIMESTAMPTZ '2026-01-15 08:00:00+02',
    TIMESTAMPTZ '2026-07-01 08:00:00+02',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '71000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000004',
    '50000000-0000-0000-0000-000000000001',
    TIMESTAMPTZ '2026-07-02 08:00:00+02',
    NULL,
    '10000000-0000-0000-0000-000000000001'
  );

INSERT INTO public.groups (
  id, name, programme_id, class_id, created_by
) VALUES (
  '72000000-0000-0000-0000-000000000001',
  'History RLS harness group',
  (SELECT id FROM public.programmes WHERE code = 'literacy'),
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001'
);

INSERT INTO public.child_group_memberships (
  id, child_id, group_id, created_by
) VALUES (
  '73000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001'
);

INSERT INTO public.group_ea_assignments (
  id, group_id, ea_user_id, programme_id, created_by
) VALUES (
  '74000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000005',
  (SELECT id FROM public.programmes WHERE code = 'literacy'),
  '10000000-0000-0000-0000-000000000001'
);

INSERT INTO public.sessions (
  id, user_id, programme_id, class_id, session_date, created_at
) VALUES
  (
    '80000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.programmes WHERE code = 'literacy'),
    '40000000-0000-0000-0000-000000000001',
    DATE '2026-08-27',
    TIMESTAMPTZ '2026-08-27 12:00:00.000001+02'
  ),
  (
    '80000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.programmes WHERE code = 'literacy'),
    '40000000-0000-0000-0000-000000000001',
    DATE '2026-08-28',
    TIMESTAMPTZ '2026-08-28 12:00:00.000001+02'
  ),
  (
    '80000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.programmes WHERE code = 'literacy'),
    '40000000-0000-0000-0000-000000000001',
    DATE '2026-08-30',
    TIMESTAMPTZ '2026-08-30 12:00:00.123456+02'
  ),
  (
    '80000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.programmes WHERE code = 'literacy'),
    '40000000-0000-0000-0000-000000000001',
    DATE '2026-08-30',
    TIMESTAMPTZ '2026-08-30 12:00:00.123455+02'
  );

INSERT INTO public.session_attendees (
  id, session_id, child_id
) VALUES
  (
    '90000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001'
  ),
  (
    '90000000-0000-0000-0000-000000000002',
    '80000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002'
  );

SELECT pg_catalog.json_build_object(
  'former_assignment_count', (
    SELECT pg_catalog.count(*)
    FROM public.child_ea_assignments
    WHERE user_id = '10000000-0000-0000-0000-000000000003'
      AND child_id = '50000000-0000-0000-0000-000000000001'
  ),
  'direct_delivery_staff_programme_assignment_count', (
    SELECT pg_catalog.count(*)
    FROM public.staff_programme_assignments
    WHERE user_id IN (
      '10000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000004'
    )
  )
)::TEXT;
`;

const sessionVisibilityProjectionSql = `
SELECT pg_catalog.json_build_object(
  'actor_id', (SELECT auth.uid()),
  'session_count', (
    SELECT pg_catalog.count(*)
    FROM public.sessions
    WHERE id = '80000000-0000-0000-0000-000000000001'
  ),
  'attendee_count', (
    SELECT pg_catalog.count(*)
    FROM public.session_attendees
    WHERE session_id = '80000000-0000-0000-0000-000000000001'
  ),
  'owner_only_session_count', (
    SELECT pg_catalog.count(*)
    FROM public.sessions
    WHERE id = '80000000-0000-0000-0000-000000000002'
  )
)::TEXT;
`;

const actorSessionVisibilitySql = (actorId) => `
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${actorId}';
${sessionVisibilityProjectionSql}
ROLLBACK;
`;

const actorSwitchVisibilitySql = (actorIds) => `
BEGIN;
SET LOCAL ROLE authenticated;
${actorIds.map((actorId) => `
SET LOCAL request.jwt.claim.sub = '${actorId}';
${sessionVisibilityProjectionSql}
`).join('\n')}
ROLLBACK;
`;

const PROGRAMME = "(SELECT id FROM public.programmes WHERE code = 'literacy')";
const actorClaims = (actorId) => `SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub', '${actorId}', TRUE);`;

const parentPageIdsSql = ({ actorId, windowStart = '2026-01-01', pageSize = 200, after = null, overlap = 0 }) => `
BEGIN;
${actorClaims(actorId)}
SELECT COALESCE(pg_catalog.json_agg(p.id ORDER BY p.updated_at, p.id), '[]'::JSON)::TEXT
FROM public.get_delivery_history_page(
  ${PROGRAMME}, DATE '${windowStart}', ${pageSize},
  ${after ? `TIMESTAMPTZ '${after.updatedAt}'` : 'NULL'},
  ${after ? `'${after.id}'::UUID` : 'NULL'},
  ${overlap}
) p;
ROLLBACK;`;

const attendeePageSql = ({ actorId, sessionIds, pageSize = 200, after = null }) => `
BEGIN;
${actorClaims(actorId)}
SELECT COALESCE(pg_catalog.json_agg(pg_catalog.json_build_object(
  'id', a.id, 'session_id', a.session_id, 'child_first_name', a.child_first_name
) ORDER BY a.session_id, a.id), '[]'::JSON)::TEXT
FROM public.get_delivery_history_attendee_page(
  ARRAY[${sessionIds.map((id) => `'${id}'::UUID`).join(', ')}], ${pageSize},
  ${after ? `'${after.session_id}'::UUID` : 'NULL'},
  ${after ? `'${after.id}'::UUID` : 'NULL'}
) a;
ROLLBACK;`;

// VERBOSITY=verbose makes psql print "ERROR:  <SQLSTATE>: <message>", so the code is assertable.
const expectSqlState = ({ databaseUrl, sql, label, sqlState }) => {
  const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-Atq', databaseUrl, '-c', sql], {
    encoding: 'utf8', env: buildPsqlEnv(label), timeout: 180_000,
  });
  assert.notEqual(result.status, 0, `${label} unexpectedly succeeded`);
  assert.match(result.stderr, new RegExp(`ERROR:\\s+${sqlState}:`), `${label}: expected SQLSTATE ${sqlState}\n${result.stderr}`);
  return result.stderr;
};

const collectPlanMetrics = (planJson) => {
  const statement = planJson[0];
  const root = statement.Plan;
  const nodeTypes = new Set();
  const indexNames = new Set();
  let visibleRowsRemovedByFilter = 0;

  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node['Node Type']) nodeTypes.add(node['Node Type']);
    if (node['Index Name']) indexNames.add(node['Index Name']);
    visibleRowsRemovedByFilter += Number(node['Rows Removed by Filter'] || 0);
    (node.Plans || []).forEach(visit);
  };
  visit(root);

  return {
    execution_time_ms: statement['Execution Time'],
    planning_time_ms: statement['Planning Time'],
    actual_rows: root['Actual Rows'],
    visible_rows_removed_by_filter: visibleRowsRemovedByFilter,
    root_shared_blocks:
      Number(root['Shared Hit Blocks'] || 0) + Number(root['Shared Read Blocks'] || 0),
    node_types: [...nodeTypes].sort(),
    index_names: [...indexNames].sort(),
  };
};

const parseJsonObjects = (output) => {
  const lines = output.split('\n').map((line) => line.trim()).filter(Boolean);
  const jsonLines = lines.filter((line) => line.startsWith('{'));
  assert.ok(jsonLines.length > 0, `history RLS fixture emitted no JSON object:\n${output}`);
  return jsonLines.map((line) => JSON.parse(line));
};

// psql also prints set_config's scalar result. Only the JSON array is the page.
const parsePage = (output) => {
  const line = output.split('\n').find((value) => value.trim().startsWith('['));
  assert.ok(line, `history page emitted no JSON array:\n${output}`);
  return JSON.parse(line);
};

const actor = (n) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const session = (n) => `80000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const keysetSession = (n) => `81000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const denseActor = (n) => `1f000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const CHILD = '50000000-0000-0000-0000-000000000001';
const TEMP_ATTENDEE = '91000000-0000-0000-0000-000000000001';

const runFamilyDeltaChecks = (databaseUrl) => {
  const run = (label, sql) => runPsql({ databaseUrl, label, sql });
  const object = (label, sql) => parseJsonObjects(run(label, sql))[0];
  const parentIds = (label, options) => parsePage(run(label, parentPageIdsSql(options)));
  const attendees = (label, options) => parsePage(run(label, attendeePageSql(options)));
  const report = (values) => process.stdout.write(`${JSON.stringify(values)}\n`);

  const [parentStamp, attendeeStamp] = parseJsonObjects(run('family-insert-stamping', `
    BEGIN;
    INSERT INTO public.sessions (id, user_id, programme_id, session_date, updated_at)
    VALUES ('${session(5)}', '${actor(1)}', ${PROGRAMME}, '2026-08-01', '2001-01-01 00:00:00+00');
    -- Read before inserting the attendee: the family touch must not mask a broken parent INSERT stamp.
    SELECT json_build_object('session_year', extract(year FROM updated_at))::TEXT
      FROM public.sessions WHERE id = '${session(5)}';
    INSERT INTO public.session_attendees (id, session_id, child_id, updated_at)
    VALUES ('${TEMP_ATTENDEE}', '${session(5)}', '${CHILD}', '2001-01-01 00:00:00+00');
    SELECT json_build_object('attendee_year', extract(year FROM updated_at))::TEXT
      FROM public.session_attendees WHERE id = '${TEMP_ATTENDEE}';
    ROLLBACK;`));
  assert.notEqual(parentStamp.session_year, 2001);
  assert.notEqual(attendeeStamp.attendee_year, 2001);
  report({ insert_stamping: 'passed', ...parentStamp, ...attendeeStamp });

  const parentTimestamp = (id, label) => run(label,
    `SELECT updated_at::TEXT FROM public.sessions WHERE id = '${id}';`);
  const assertBumped = (id, before, label) => {
    assert.equal(run(label, `SELECT updated_at > TIMESTAMPTZ '${before}'
      FROM public.sessions WHERE id = '${id}';`), 't', label);
  };
  let before = parentTimestamp(session(2), 'before-attendee-insert');
  run('family-touch-insert', `INSERT INTO public.session_attendees (id, session_id, child_id)
    VALUES ('${TEMP_ATTENDEE}', '${session(2)}', '${CHILD}');`);
  assertBumped(session(2), before, 'after-attendee-insert');
  assert.ok(parentIds('late-attendee-resurfaces-parent', {
    actorId: actor(1), after: { updatedAt: before, id: session(2) },
  }).includes(session(2)), 'A late attendee must resurface its parent after the old cursor');
  before = parentTimestamp(session(2), 'before-attendee-update');
  run('family-touch-update', `UPDATE public.session_attendees SET notes = 'x' WHERE id = '${TEMP_ATTENDEE}';`);
  assertBumped(session(2), before, 'after-attendee-update');
  before = parentTimestamp(session(2), 'before-attendee-delete');
  run('family-touch-delete', `DELETE FROM public.session_attendees WHERE id = '${TEMP_ATTENDEE}';`);
  assertBumped(session(2), before, 'after-attendee-delete');
  run('family-move-fixture', `INSERT INTO public.session_attendees (id, session_id, child_id)
    VALUES ('${TEMP_ATTENDEE}', '${session(2)}', '${CHILD}');`);
  const oldBefore = parentTimestamp(session(2), 'before-move-old-parent');
  const newBefore = parentTimestamp(session(3), 'before-move-new-parent');
  run('family-touch-move', `UPDATE public.session_attendees SET session_id = '${session(3)}'
    WHERE id = '${TEMP_ATTENDEE}';`);
  assertBumped(session(2), oldBefore, 'after-move-old-parent');
  assertBumped(session(3), newBefore, 'after-move-new-parent');
  run('family-move-cleanup', `DELETE FROM public.session_attendees WHERE id = '${TEMP_ATTENDEE}';`);
  report({ family_touch_insert: 'passed', family_touch_update: 'passed',
    family_touch_delete: 'passed', family_touch_move_both_parents: 'passed', late_attendee_delta: 'passed' });

  run('owner-active-delivery-assignment', `INSERT INTO public.child_ea_assignments
    (id, user_id, child_id, created_by) VALUES
    ('71000000-0000-0000-0000-000000000003', '${actor(1)}', '${CHILD}', '${actor(1)}');`);
  before = parentTimestamp(session(2), 'before-authenticated-attendee-insert');
  run('authenticated-attendee-insert', `BEGIN; ${actorClaims(actor(1))}
    INSERT INTO public.session_attendees (id, session_id, child_id)
    VALUES ('${TEMP_ATTENDEE}', '${session(2)}', '${CHILD}'); COMMIT;`);
  assertBumped(session(2), before, 'after-authenticated-attendee-insert');
  run('authenticated-attendee-cleanup', `DELETE FROM public.session_attendees WHERE id = '${TEMP_ATTENDEE}';`);
  report({ authenticated_attendee_insert: 'passed' });

  const matrix = [
    { n: 1, label: 'owner', ids: [1, 2, 3, 4].map(session), family: true },
    { n: 4, label: 'current-delivery', ids: [session(1)], family: true },
    { n: 3, label: 'former-delivery', ids: [session(1)], family: true },
    { n: 2, label: 'class-only', ids: [], family: false },
    { n: 5, label: 'group-only', ids: [], family: false },
    { n: 6, label: 'unrelated', ids: [], family: false },
  ];
  const expectedAttendees = [1, 2].map((n) => ({
    id: `90000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    session_id: session(1), child_first_name: 'Harness',
  }));
  for (const entry of matrix) {
    const ids = parentIds(`${entry.label}-parent-page`, { actorId: actor(entry.n) });
    assert.deepEqual([...ids].sort(), entry.ids, `${entry.label} parent authority`);
    const rows = attendees(`${entry.label}-attendee-page`, {
      actorId: actor(entry.n), sessionIds: [session(1), session(2)],
    });
    assert.deepEqual(rows, entry.family ? expectedAttendees : [], `${entry.label} attendee authority and names`);
    if (entry.n === 1) {
      assert.equal(ids.filter((id) => id === session(1)).length, 1, 'Both grant arms must deduplicate');
    }
  }
  // Exercise the attendee cursor itself, including exhaustion, rather than only its first page.
  const firstAttendee = attendees('attendee-keyset-first', {
    actorId: actor(4), sessionIds: [session(1), session(2)], pageSize: 1,
  });
  const secondAttendee = attendees('attendee-keyset-second', {
    actorId: actor(4), sessionIds: [session(1), session(2)], pageSize: 1, after: firstAttendee[0],
  });
  assert.deepEqual([...firstAttendee, ...secondAttendee], expectedAttendees);
  assert.deepEqual(attendees('attendee-keyset-exhaustion', {
    actorId: actor(4), sessionIds: [session(1), session(2)], pageSize: 1, after: secondAttendee[0],
  }), []);
  report({ parent_six_actor_matrix: 'passed', attendee_six_actor_matrix: 'passed',
    coattendee_display_name: 'passed', grant_arm_deduplication: 'passed', attendee_keyset: 'passed' });

  const parentCall = (args) => `SELECT * FROM public.get_delivery_history_page(${args});`;
  const attendeeCall = (args) => `SELECT * FROM public.get_delivery_history_attendee_page(${args});`;
  const idsSql = `ARRAY['${session(1)}'::UUID]`;
  for (const [label, sql] of [
    ['parent', parentCall(`${PROGRAMME}, DATE '2026-01-01'`)],
    ['attendee', attendeeCall(idsSql)],
  ]) {
    expectSqlState({ databaseUrl, label: `anonymous-${label}`, sqlState: '42501',
      sql: `BEGIN; SET LOCAL ROLE anon; ${sql} ROLLBACK;` });
    expectSqlState({ databaseUrl, label: `missing-actor-${label}`, sqlState: '28000',
      sql: `BEGIN; ${actorClaims('')} ${sql} ROLLBACK;` });
  }
  const invalidCalls = [
    ['null-programme', parentCall("NULL, DATE '2026-01-01'")],
    ['null-window', parentCall(`${PROGRAMME}, NULL`)],
    ...['NULL', '0', '201'].map((size) => [
      `parent-page-size-${size}`, parentCall(`${PROGRAMME}, DATE '2026-01-01', ${size}`),
    ]),
    ['parent-half-timestamp', parentCall(`${PROGRAMME}, DATE '2026-01-01', 200, now(), NULL`)],
    ['parent-half-id', parentCall(`${PROGRAMME}, DATE '2026-01-01', 200, NULL, '${session(1)}'`)],
    ...['NULL', '-1', '601'].map((overlap) => [
      `overlap-${overlap}`, parentCall(`${PROGRAMME}, DATE '2026-01-01', 200, NULL, NULL, ${overlap}`),
    ]),
    ['201-session-ids', attendeeCall(`array_fill('${session(1)}'::UUID, ARRAY[201])`)],
    ['null-session-ids', attendeeCall('NULL')],
    ['empty-session-ids', attendeeCall('ARRAY[]::UUID[]')],
    ...['NULL', '0', '201'].map((size) => [
      `attendee-page-size-${size}`, attendeeCall(`${idsSql}, ${size}`),
    ]),
    ['attendee-half-session', attendeeCall(`${idsSql}, 200, '${session(1)}', NULL`)],
    ['attendee-half-id', attendeeCall(`${idsSql}, 200, NULL, '${expectedAttendees[0].id}'`)],
  ];
  for (const [label, sql] of invalidCalls) {
    expectSqlState({ databaseUrl, label, sqlState: '22023',
      sql: `BEGIN; ${actorClaims(actor(1))} ${sql} ROLLBACK;` });
  }
  report({ anonymous_denial: 'passed', missing_actor_denial: 'passed',
    invalid_argument_checks: invalidCalls.length, invalid_arguments: 'passed' });

  run('equal-timestamp-keyset-fixture', `BEGIN; SET LOCAL session_replication_role = replica;
    INSERT INTO public.sessions (id, user_id, programme_id, session_date, updated_at)
    SELECT ('81000000-0000-0000-0000-' || lpad(n::TEXT, 12, '0'))::UUID,
      '${actor(1)}', ${PROGRAMME}, DATE '2026-09-01', TIMESTAMPTZ '2026-09-01 10:00:00.000001+00'
    FROM generate_series(1, 5) AS series(n);
    COMMIT;`);
  let after = null;
  const pages = [];
  for (let page = 0; page < 4; page += 1) {
    const rows = parsePage(run(`equal-timestamp-keyset-page-${page + 1}`, `
      BEGIN; ${actorClaims(actor(1))}
      SELECT COALESCE(json_agg(json_build_object('id', p.id, 'updatedAt', p.updated_at::TEXT)
        ORDER BY p.updated_at, p.id), '[]'::JSON)::TEXT
      FROM public.get_delivery_history_page(${PROGRAMME}, DATE '2026-09-01', 2,
        ${after ? `TIMESTAMPTZ '${after.updatedAt}'` : 'NULL'},
        ${after ? `'${after.id}'::UUID` : 'NULL'}, 0) p;
      ROLLBACK;`));
    pages.push(rows.map(({ id }) => id));
    if (rows.length) {
      after = rows[rows.length - 1];
      assert.match(after.updatedAt, /\.000001(?:\+00(?::00)?|Z)$/, 'Preserve microseconds in cursor');
    }
  }
  assert.deepEqual(pages, [[1, 2].map(keysetSession), [3, 4].map(keysetSession), [keysetSession(5)], []]);
  assert.equal(new Set(pages.flat()).size, 5);
  const overlapCursor = { updatedAt: '2026-09-01 10:00:00.000001+00', id: keysetSession(3) };
  assert.deepEqual(parentIds('zero-overlap', {
    actorId: actor(1), windowStart: '2026-09-01', after: overlapCursor,
  }), [4, 5].map(keysetSession));
  assert.deepEqual(parentIds('two-minute-overlap', {
    actorId: actor(1), windowStart: '2026-09-01', after: overlapCursor, overlap: 120,
  }), [1, 2, 3, 4, 5].map(keysetSession));
  run('retention-window-fixture', `INSERT INTO public.sessions (id, user_id, programme_id, session_date)
    VALUES ('${session(6)}', '${actor(1)}', ${PROGRAMME}, DATE '2025-12-31');`);
  assert.ok(!parentIds('current-year-window', { actorId: actor(1) }).includes(session(6)));
  assert.ok(parentIds('previous-year-window', {
    actorId: actor(1), windowStart: '2025-01-01',
  }).includes(session(6)));
  report({ equal_timestamp_keyset: 'passed', microsecond_cursor: 'passed',
    keyset_pages: pages, overlap: 'passed', retention_window: 'passed' });

  run('future-timestamp-fixture', `BEGIN; SET LOCAL session_replication_role = replica;
    UPDATE public.sessions SET updated_at = TIMESTAMPTZ '2099-01-01 00:00:00+00' WHERE id = '${session(3)}';
    UPDATE public.session_attendees SET updated_at = TIMESTAMPTZ '2099-01-01 00:00:00+00'
      WHERE id = '${expectedAttendees[0].id}'; COMMIT;`);
  runPsql({ databaseUrl, file: path.join(MIGRATIONS_DIR, FAMILY_MIGRATION), label: 'idempotent-family-migration' });
  const normalized = object('future-timestamps-normalized', `SELECT json_build_object(
    'session', (SELECT updated_at <= now() FROM public.sessions WHERE id = '${session(3)}'),
    'attendee', (SELECT updated_at <= now() FROM public.session_attendees WHERE id = '${expectedAttendees[0].id}')
    )::TEXT;`);
  assert.deepEqual(normalized, { session: true, attendee: true });
  const absent = object('old-history-objects-absent', `SELECT json_build_object(
    'rpc', to_regprocedure('public.get_delivery_history_session_page(uuid,integer,date,timestamptz,uuid)') IS NULL,
    'index', to_regclass('public.idx_sessions_owner_programme_history_cursor') IS NULL)::TEXT;`);
  assert.deepEqual(absent, { rpc: true, index: true });
  report({ future_timestamps_normalized: 'passed', migration_reapplication: 'passed', old_objects_absent: 'passed' });

  runDensePlanChecks(databaseUrl);
};

const runDensePlanChecks = (databaseUrl) => {
  runPsql({ databaseUrl, label: 'dense-session-plan-fixture', sql: `
    INSERT INTO auth.users (id) VALUES ('${denseActor(1)}'), ('${denseActor(2)}'), ('${denseActor(3)}');
    INSERT INTO public.users (id, first_name, last_name)
    VALUES ('${denseActor(1)}', 'Noise', 'Owner'), ('${denseActor(2)}', 'Dense', 'Owner'),
      ('${denseActor(3)}', 'Sparse', 'Delivery');
    INSERT INTO public.children (id, first_name, last_name)
    VALUES ('5f000000-0000-0000-0000-000000000001', 'Sparse', 'Child');
    INSERT INTO public.child_ea_assignments (id, user_id, child_id, created_by)
    VALUES ('7f000000-0000-0000-0000-000000000001', '${denseActor(3)}',
      '5f000000-0000-0000-0000-000000000001', '${denseActor(1)}');
    BEGIN; SET LOCAL session_replication_role = replica;
    INSERT INTO public.sessions (id, user_id, programme_id, session_date, updated_at)
    SELECT md5('history-noise-' || n::TEXT)::UUID, '${denseActor(1)}', ${PROGRAMME},
      DATE '2026-01-01' + (n % 365), TIMESTAMPTZ '2026-01-01 00:00:00+00' + n * INTERVAL '1 second'
    FROM generate_series(1, ${PLAN_FIXTURE_SESSION_COUNT}) series(n);
    INSERT INTO public.sessions (id, user_id, programme_id, session_date, updated_at)
    SELECT md5('history-dense-' || n::TEXT)::UUID, '${denseActor(2)}', ${PROGRAMME},
      DATE '2026-01-01' + (n % 365), TIMESTAMPTZ '2026-01-01 00:00:00+00' + n * INTERVAL '1 second'
    FROM generate_series(1, ${DENSE_OWNER_SESSION_COUNT}) series(n);
    INSERT INTO public.session_attendees (id, session_id, child_id)
    SELECT md5('history-sparse-attendee-' || n::TEXT)::UUID, md5('history-noise-' || n::TEXT)::UUID,
      '5f000000-0000-0000-0000-000000000001'
    FROM generate_series(1, 3) series(n);
    COMMIT;
    ANALYZE public.sessions;
    ANALYZE public.session_attendees;
    ANALYZE public.child_ea_assignments;` });

  const measure = (label, sql, actorId = null) => {
    const output = runPsql({ databaseUrl, label, sql: `BEGIN;
      ${actorId ? actorClaims(actorId) : ''}
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}; ROLLBACK;` });
    // EXPLAIN is multiline JSON, unlike the single-line page projection.
    const start = output.indexOf('[');
    assert.ok(start >= 0, `${label} emitted no plan JSON`);
    return collectPlanMetrics(JSON.parse(output.slice(start)));
  };
  // Keep the existing harness's raw-RLS comparison: use the sparse delivery actor,
  // so the baseline and RPC measure the same authority rather than a superuser bypass.
  const raw = measure('dense-raw-baseline', 'SELECT pg_catalog.count(*) FROM public.sessions', denseActor(3));
  const sparse = measure('sparse-delivery-first-page', `SELECT * FROM public.get_delivery_history_page(
    ${PROGRAMME}, DATE '2026-01-01', 200, NULL, NULL, 0)`, denseActor(3));
  const dense = measure('dense-owner-deep-page', `SELECT * FROM public.get_delivery_history_page(
    ${PROGRAMME}, DATE '2026-01-01', 200,
    TIMESTAMPTZ '2026-01-01 00:00:00+00' + 4900 * INTERVAL '1 second',
    md5('history-dense-4900')::UUID, 0)`, denseActor(2));
  // Print measurements even if a performance assertion fails, so the failure is reviewable.
  process.stdout.write(`${JSON.stringify({ noise_fixture_sessions: PLAN_FIXTURE_SESSION_COUNT,
    dense_owner_fixture_sessions: DENSE_OWNER_SESSION_COUNT, dense_raw_baseline: raw,
    sparse_delivery_first_page: sparse, dense_owner_deep_page: dense })}\n`);
  assert.equal(sparse.actual_rows, 3);
  assert.equal(dense.actual_rows, DENSE_OWNER_SESSION_COUNT - 4900);
  assert.ok(raw.root_shared_blocks > 0, 'Raw baseline must measure real shared buffer work');
  for (const [label, metrics] of [['sparse delivery', sparse], ['dense owner', dense]]) {
    assert.ok(metrics.root_shared_blocks < raw.root_shared_blocks / 10,
      `${label} must use less than one tenth of raw shared blocks: raw=${JSON.stringify(raw)} rpc=${JSON.stringify(metrics)}`);
  }
  process.stdout.write(`${JSON.stringify({ dense_plan_buffer_gate: 'passed' })}\n`);
};

const main = () => {
  const databaseName = process.env.HISTORY_RLS_DATABASE_NAME;
  const confirmation = process.env.HISTORY_RLS_DISPOSABLE_CONFIRM;
  const adminUrl = assertDisposableAdminTarget({
    adminDatabaseUrl: process.env.HISTORY_RLS_ADMIN_DATABASE_URL,
    databaseName,
    confirmation,
  });
  const adminDatabaseUrl = buildDatabaseUrl(adminUrl, 'postgres').href;
  const databaseUrl = buildDatabaseUrl(adminUrl, databaseName);
  const quotedDatabase = quoteIdentifier(databaseName);

  runPsql({
    databaseUrl: adminDatabaseUrl,
    sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`,
    label: 'drop-stale-database',
  });
  runPsql({
    databaseUrl: adminDatabaseUrl,
    sql: `CREATE DATABASE ${quotedDatabase};`,
    label: 'create-database',
  });

  try {
    runPsql({ databaseUrl: databaseUrl.href, sql: bootstrapSql, label: 'bootstrap' });
    const migrations = fs.readdirSync(MIGRATIONS_DIR)
      .filter((filename) => filename.endsWith('.sql'))
      .sort();
    for (const filename of migrations) {
      runPsql({
        databaseUrl: databaseUrl.href,
        file: path.join(MIGRATIONS_DIR, filename),
        label: `migration-${filename}`,
      });
    }

    const [fixtureResult] = parseJsonObjects(runPsql({
      databaseUrl: databaseUrl.href,
      sql: classOnlySessionFixtureSql,
      label: 'session-authority-fixture',
    }));
    assert.deepEqual(
      {
        former_assignment_count: fixtureResult.former_assignment_count,
        direct_delivery_staff_programme_assignment_count:
          fixtureResult.direct_delivery_staff_programme_assignment_count,
      },
      {
        former_assignment_count: 1,
        direct_delivery_staff_programme_assignment_count: 0,
      },
      'The delivery actors must prove the trusted cross-Programme read contract without a staff Programme grant'
    );
    const [classOnlyResult] = parseJsonObjects(runPsql({
      databaseUrl: databaseUrl.href,
      sql: actorSessionVisibilitySql('10000000-0000-0000-0000-000000000002'),
      label: 'class-only-session-visibility',
    }));
    assert.deepEqual(
      {
        session_count: classOnlyResult.session_count,
        attendee_count: classOnlyResult.attendee_count,
        owner_only_session_count: classOnlyResult.owner_only_session_count,
      },
      { session_count: 0, attendee_count: 0, owner_only_session_count: 0 },
      'A class-only assessor must not receive another EA session or its attendee row'
    );
    const [formerDeliveryResult] = parseJsonObjects(runPsql({
      databaseUrl: databaseUrl.href,
      sql: actorSessionVisibilitySql('10000000-0000-0000-0000-000000000003'),
      label: 'former-delivery-session-visibility',
    }));
    assert.deepEqual(
      {
        session_count: formerDeliveryResult.session_count,
        attendee_count: formerDeliveryResult.attendee_count,
        owner_only_session_count: formerDeliveryResult.owner_only_session_count,
      },
      { session_count: 1, attendee_count: 2, owner_only_session_count: 0 },
      `A former direct delivery EA must retain historical session and attendee visibility: ${JSON.stringify(formerDeliveryResult)}`
    );
    const [currentDeliveryResult] = parseJsonObjects(runPsql({
      databaseUrl: databaseUrl.href,
      sql: actorSessionVisibilitySql('10000000-0000-0000-0000-000000000004'),
      label: 'current-delivery-session-visibility',
    }));
    assert.deepEqual(
      {
        session_count: currentDeliveryResult.session_count,
        attendee_count: currentDeliveryResult.attendee_count,
        owner_only_session_count: currentDeliveryResult.owner_only_session_count,
      },
      { session_count: 1, attendee_count: 2, owner_only_session_count: 0 },
      'A current direct delivery EA receives the complete session aggregate but not unrelated owner-only sessions'
    );
    const [groupOnlyResult] = parseJsonObjects(runPsql({
      databaseUrl: databaseUrl.href,
      sql: actorSessionVisibilitySql('10000000-0000-0000-0000-000000000005'),
      label: 'group-only-session-visibility',
    }));
    assert.deepEqual(
      {
        session_count: groupOnlyResult.session_count,
        attendee_count: groupOnlyResult.attendee_count,
        owner_only_session_count: groupOnlyResult.owner_only_session_count,
      },
      { session_count: 0, attendee_count: 0, owner_only_session_count: 0 },
      'A group-only EA must not receive another EA delivery history'
    );
    const [unrelatedResult] = parseJsonObjects(runPsql({
      databaseUrl: databaseUrl.href,
      sql: actorSessionVisibilitySql('10000000-0000-0000-0000-000000000006'),
      label: 'unrelated-session-visibility',
    }));
    assert.deepEqual(
      {
        session_count: unrelatedResult.session_count,
        attendee_count: unrelatedResult.attendee_count,
        owner_only_session_count: unrelatedResult.owner_only_session_count,
      },
      { session_count: 0, attendee_count: 0, owner_only_session_count: 0 },
      'An unrelated EA must not receive the session family'
    );
    const [ownerResult] = parseJsonObjects(runPsql({
      databaseUrl: databaseUrl.href,
      sql: actorSessionVisibilitySql('10000000-0000-0000-0000-000000000001'),
      label: 'owner-session-visibility',
    }));
    assert.deepEqual(
      {
        session_count: ownerResult.session_count,
        attendee_count: ownerResult.attendee_count,
        owner_only_session_count: ownerResult.owner_only_session_count,
      },
      { session_count: 1, attendee_count: 2, owner_only_session_count: 1 },
      'A session owner must retain parent and attendee visibility for upsert and history reads'
    );
    const switchedActorResults = parseJsonObjects(runPsql({
      databaseUrl: databaseUrl.href,
      sql: actorSwitchVisibilitySql([
        '10000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000003',
        '10000000-0000-0000-0000-000000000004',
        '10000000-0000-0000-0000-000000000001',
      ]),
      label: 'same-connection-actor-switch-visibility',
    }));
    assert.deepEqual(
      switchedActorResults.map((result) => ({
        actor_id: result.actor_id,
        session_count: result.session_count,
        attendee_count: result.attendee_count,
        owner_only_session_count: result.owner_only_session_count,
      })),
      [
        {
          actor_id: '10000000-0000-0000-0000-000000000002',
          session_count: 0,
          attendee_count: 0,
          owner_only_session_count: 0,
        },
        {
          actor_id: '10000000-0000-0000-0000-000000000003',
          session_count: 1,
          attendee_count: 2,
          owner_only_session_count: 0,
        },
        {
          actor_id: '10000000-0000-0000-0000-000000000004',
          session_count: 1,
          attendee_count: 2,
          owner_only_session_count: 0,
        },
        {
          actor_id: '10000000-0000-0000-0000-000000000001',
          session_count: 1,
          attendee_count: 2,
          owner_only_session_count: 1,
        },
      ],
      'RLS authority must follow each actor when a pooled PostgreSQL connection is reused'
    );
    runFamilyDeltaChecks(databaseUrl.href);
    process.stdout.write(`${JSON.stringify({
      class_only_session_visibility: 'passed',
      former_delivery_history_visibility: 'passed',
      current_delivery_history_visibility: 'passed',
      group_only_session_visibility: 'passed',
      unrelated_session_visibility: 'passed',
      owner_session_visibility: 'passed',
      complete_session_family_visibility: 'passed',
      same_connection_actor_switching: 'passed',
    })}\n`);
  } finally {
    runPsql({
      databaseUrl: adminDatabaseUrl,
      sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`,
      label: 'drop-database',
    });
  }
};

if (require.main === module) {
  main();
}

module.exports = {
  DISPOSABLE_CONFIRMATION,
  DISPOSABLE_DATABASE_PREFIX,
  PLAN_FIXTURE_SESSION_COUNT,
  assertDisposableAdminTarget,
  buildDatabaseUrl,
  buildPsqlEnv,
  bootstrapSql,
  collectPlanMetrics,
};
