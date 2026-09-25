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
const PLAN_FIXTURE_SESSION_COUNT = 2_000;

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
  id, user_id, programme_id, class_id, session_date, created_at, updated_at
) VALUES
  (
    '80000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.programmes WHERE code = 'literacy'),
    '40000000-0000-0000-0000-000000000001',
    DATE '2026-08-27',
    TIMESTAMPTZ '2026-08-27 12:00:00.000001+02',
    TIMESTAMPTZ '2026-08-27 12:00:00.000001+02'
  ),
  (
    '80000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.programmes WHERE code = 'literacy'),
    '40000000-0000-0000-0000-000000000001',
    DATE '2026-08-28',
    TIMESTAMPTZ '2026-08-28 12:00:00.000001+02',
    TIMESTAMPTZ '2026-08-28 12:00:00.000001+02'
  ),
  (
    '80000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.programmes WHERE code = 'literacy'),
    '40000000-0000-0000-0000-000000000001',
    DATE '2026-08-30',
    TIMESTAMPTZ '2026-08-30 12:00:00.123456+02',
    TIMESTAMPTZ '2026-08-30 12:00:00.123456+02'
  ),
  (
    '80000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.programmes WHERE code = 'literacy'),
    '40000000-0000-0000-0000-000000000001',
    DATE '2026-08-30',
    TIMESTAMPTZ '2026-08-30 12:00:00.123455+02',
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

const sessionPlanFixtureSql = `
INSERT INTO public.sessions (
  id, user_id, programme_id, class_id, session_date, created_at, updated_at
)
SELECT
  pg_catalog.md5('history-plan-session-' || series.value::TEXT)::UUID,
  '10000000-0000-0000-0000-000000000001',
  (SELECT id FROM public.programmes WHERE code = 'literacy'),
  '40000000-0000-0000-0000-000000000001',
  DATE '2026-08-29',
  TIMESTAMPTZ '2026-08-29 12:00:00.654321+02',
  TIMESTAMPTZ '2026-08-29 12:00:00.654321+02'
FROM pg_catalog.generate_series(1, ${PLAN_FIXTURE_SESSION_COUNT}) AS series(value);

INSERT INTO public.session_attendees (id, session_id, child_id)
SELECT
  pg_catalog.md5('history-plan-attendee-' || series.value::TEXT)::UUID,
  pg_catalog.md5('history-plan-session-' || series.value::TEXT)::UUID,
  '50000000-0000-0000-0000-000000000002'
FROM pg_catalog.generate_series(1, ${PLAN_FIXTURE_SESSION_COUNT}) AS series(value);

ANALYZE public.sessions;
ANALYZE public.session_attendees;
ANALYZE public.child_ea_assignments;
`;

const actorSessionPlanSql = (actorId) => `
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${actorId}';
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, session_date, created_at
FROM public.sessions
WHERE programme_id = (SELECT id FROM public.programmes WHERE code = 'literacy')
ORDER BY session_date DESC, created_at DESC, id DESC
LIMIT 50;
ROLLBACK;
`;

const actorSessionRpcPlanSql = (actorId) => `
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${actorId}';
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, session_date, created_at
FROM public.get_delivery_history_session_page(
  (SELECT id FROM public.programmes WHERE code = 'literacy'),
  50,
  NULL,
  NULL,
  NULL
);
ROLLBACK;
`;

const sqlLiteral = (value) => {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
};

const actorSessionPageSql = ({ actorId, pageSize, cursor = {} }) => `
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${actorId}';
SELECT pg_catalog.json_build_object(
  'rows', COALESCE(
    pg_catalog.json_agg(
      pg_catalog.json_build_object(
        'id', page.id,
        'session_date', page.session_date,
        'created_at', page.created_at
      )
      ORDER BY page.session_date DESC, page.created_at DESC, page.id DESC
    ),
    '[]'::JSON
  )
)::TEXT
FROM public.get_delivery_history_session_page(
  (SELECT id FROM public.programmes WHERE code = 'literacy'),
  ${pageSize},
  ${sqlLiteral(cursor.session_date)}::DATE,
  ${sqlLiteral(cursor.created_at)}::TIMESTAMPTZ,
  ${sqlLiteral(cursor.id)}::UUID
) AS page;
ROLLBACK;
`;

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

const pageSessionHistoryToExhaustion = ({
  databaseUrl,
  actorId,
  pageSize,
}) => {
  const rows = [];
  let cursor = {};
  let pageNumber = 1;

  while (true) {
    const [page] = parseJsonObjects(runPsql({
      databaseUrl,
      sql: actorSessionPageSql({ actorId, pageSize, cursor }),
      label: `delivery-history-exhaustion-page-${pageNumber}`,
    }));
    if (page.rows.length === 0) break;
    rows.push(...page.rows);
    cursor = page.rows[page.rows.length - 1];
    pageNumber += 1;
    assert.ok(
      rows.length <= PLAN_FIXTURE_SESSION_COUNT + 4,
      'Keyset traversal did not terminate at the expected fixture boundary'
    );
  }

  return rows;
};

const parseJsonObjects = (output) => {
  const lines = output.split('\n').map((line) => line.trim()).filter(Boolean);
  const jsonLines = lines.filter((line) => line.startsWith('{'));
  assert.ok(jsonLines.length > 0, `history RLS fixture emitted no JSON object:\n${output}`);
  return jsonLines.map((line) => JSON.parse(line));
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
    const [ownerFirstPage] = parseJsonObjects(runPsql({
      databaseUrl: databaseUrl.href,
      sql: actorSessionPageSql({
        actorId: '10000000-0000-0000-0000-000000000001',
        pageSize: 1,
      }),
      label: 'owner-delivery-history-first-page',
    }));
    assert.deepEqual(
      ownerFirstPage.rows.map(({ id }) => id),
      ['80000000-0000-0000-0000-000000000003'],
      'The owner page must follow the session_date/created_at/id descending keyset order'
    );
    assert.match(
      ownerFirstPage.rows[0].created_at,
      /\.123456(?:Z|[+-]\d{2}:\d{2})$/,
      'The cursor must preserve the server timestamp string at microsecond precision'
    );
    const [ownerSecondPage] = parseJsonObjects(runPsql({
      databaseUrl: databaseUrl.href,
      sql: actorSessionPageSql({
        actorId: '10000000-0000-0000-0000-000000000001',
        pageSize: 1,
        cursor: ownerFirstPage.rows[0],
      }),
      label: 'owner-delivery-history-second-page',
    }));
    assert.deepEqual(
      ownerSecondPage.rows.map(({ id }) => id),
      ['80000000-0000-0000-0000-000000000004'],
      'The second keyset page must continue after the exact microsecond cursor tuple'
    );
    assert.match(
      ownerSecondPage.rows[0].created_at,
      /\.123455(?:Z|[+-]\d{2}:\d{2})$/,
      'The second cursor must retain distinct sub-millisecond precision'
    );
    const [ownerThirdPage] = parseJsonObjects(runPsql({
      databaseUrl: databaseUrl.href,
      sql: actorSessionPageSql({
        actorId: '10000000-0000-0000-0000-000000000001',
        pageSize: 1,
        cursor: ownerSecondPage.rows[0],
      }),
      label: 'owner-delivery-history-third-page',
    }));
    assert.deepEqual(
      ownerThirdPage.rows.map(({ id }) => id),
      ['80000000-0000-0000-0000-000000000002'],
      'The third keyset page must continue beyond the microsecond fixtures'
    );
    const [classOnlyPage] = parseJsonObjects(runPsql({
      databaseUrl: databaseUrl.href,
      sql: actorSessionPageSql({
        actorId: '10000000-0000-0000-0000-000000000002',
        pageSize: 50,
      }),
      label: 'class-only-delivery-history-page',
    }));
    assert.deepEqual(
      classOnlyPage.rows,
      [],
      'The delivery-history RPC must not widen authority to a class-only assessor'
    );
    for (const actorCase of [
      {
        actorId: '10000000-0000-0000-0000-000000000003',
        label: 'former-delivery-history-page',
        expectedIds: ['80000000-0000-0000-0000-000000000001'],
      },
      {
        actorId: '10000000-0000-0000-0000-000000000004',
        label: 'current-delivery-history-page',
        expectedIds: ['80000000-0000-0000-0000-000000000001'],
      },
      {
        actorId: '10000000-0000-0000-0000-000000000005',
        label: 'group-only-delivery-history-page',
        expectedIds: [],
      },
      {
        actorId: '10000000-0000-0000-0000-000000000006',
        label: 'unrelated-delivery-history-page',
        expectedIds: [],
      },
    ]) {
      const [actorPage] = parseJsonObjects(runPsql({
        databaseUrl: databaseUrl.href,
        sql: actorSessionPageSql({
          actorId: actorCase.actorId,
          pageSize: 50,
        }),
        label: actorCase.label,
      }));
      assert.deepEqual(
        actorPage.rows.map(({ id }) => id),
        actorCase.expectedIds,
        `Unexpected delivery-history RPC scope for ${actorCase.label}`
      );
    }
    runPsql({
      databaseUrl: databaseUrl.href,
      sql: sessionPlanFixtureSql,
      label: 'session-plan-fixture',
    });
    const exhaustedOwnerRows = pageSessionHistoryToExhaustion({
      databaseUrl: databaseUrl.href,
      actorId: '10000000-0000-0000-0000-000000000001',
      pageSize: 200,
    });
    assert.equal(
      exhaustedOwnerRows.length,
      PLAN_FIXTURE_SESSION_COUNT + 4,
      'The owner keyset traversal must return every same-timestamp fixture row without gaps'
    );
    assert.equal(
      new Set(exhaustedOwnerRows.map(({ id }) => id)).size,
      PLAN_FIXTURE_SESSION_COUNT + 4,
      'The owner keyset traversal must not duplicate a row across page boundaries'
    );
    const planMetrics = collectPlanMetrics(JSON.parse(runPsql({
      databaseUrl: databaseUrl.href,
      sql: actorSessionPlanSql('10000000-0000-0000-0000-000000000004'),
      label: 'delivery-history-session-plan',
    })));
    assert.equal(
      planMetrics.actual_rows,
      1,
      `The scaled plan fixture should expose only the directly assigned session: ${JSON.stringify(planMetrics)}`
    );
    const rpcPlanMetrics = collectPlanMetrics(JSON.parse(runPsql({
      databaseUrl: databaseUrl.href,
      sql: actorSessionRpcPlanSql('10000000-0000-0000-0000-000000000004'),
      label: 'delivery-history-session-rpc-plan',
    })));
    assert.equal(
      rpcPlanMetrics.actual_rows,
      1,
      `The scaled RPC plan should expose only the directly assigned session: ${JSON.stringify(rpcPlanMetrics)}`
    );
    assert.ok(
      planMetrics.visible_rows_removed_by_filter >= PLAN_FIXTURE_SESSION_COUNT,
      `The raw RLS plan should visibly filter the scaled unrelated fixture: ${JSON.stringify(planMetrics)}`
    );
    assert.ok(
      rpcPlanMetrics.root_shared_blocks < planMetrics.root_shared_blocks / 2,
      `The bounded actor-derived RPC root must use less than half the raw RLS root buffer work in the deterministic regression fixture: raw=${JSON.stringify(planMetrics)} rpc=${JSON.stringify(rpcPlanMetrics)}`
    );
    process.stdout.write(`${JSON.stringify({
      class_only_session_visibility: 'passed',
      former_delivery_history_visibility: 'passed',
      current_delivery_history_visibility: 'passed',
      group_only_session_visibility: 'passed',
      unrelated_session_visibility: 'passed',
      owner_session_visibility: 'passed',
      complete_session_family_visibility: 'passed',
      same_connection_actor_switching: 'passed',
      owner_keyset_pagination: 'passed',
      owner_keyset_microsecond_cursor: 'passed',
      same_tuple_pagination_exhaustion: 'passed',
      rpc_actor_scope_matrix: 'passed',
      scaled_plan_fixture_sessions: PLAN_FIXTURE_SESSION_COUNT,
      scaled_raw_rls_plan: planMetrics,
      scaled_rpc_plan: rpcPlanMetrics,
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
