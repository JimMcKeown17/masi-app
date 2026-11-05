#!/usr/bin/env node
const { spawnSync } = require('child_process');
const { loadEnvFiles, validateSqliteEnv } = require('../sqlite-staging.cjs');
const {
  PROJECT_REF,
  connectionFor,
  resolvePsql,
  subprocessEnv,
  queryJson
} = require('../lib/staging-read-only.cjs');
const HELP = `device:server-check --ea <email|uuid> --since <ISO timestamp with timezone> [--json]
Read-only staging evidence for a device walkthrough; --help needs no credentials.
Run from a checkout containing .env.local (normally the main checkout), e.g.:
  cd /Users/jimmckeown/Development/masi-app
  node scripts/device/server-check.cjs --ea test@example.org --since 2026-11-05T12:00:00Z
Only project segygjzpujphwvrubusm is accepted. Uses validated SQLite staging env,
checkout session pooler, psql, and a database-confirmed READ ONLY transaction.
Output includes private EA/child data; keep it local. Walkthroughs must use test EAs.
Health checks: empty active groups across all time; other checks cover --since.
Exit: 0 report; 1 usage/configuration/query error; 2 EA not found.`;

const isoTime = value => {
  const m = value?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/);
  if (!m || !Number.isFinite(Date.parse(value)) || +m[2] > 23 || +m[3] > 59 || +m[4] > 59) {
    return false;
  }
  return new Date(`${m[1]}T00:00:00Z`).toISOString().slice(0, 10) === m[1];
};

const parseArgs = argv => {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].slice(2);
    if (!argv[i].startsWith('--') || !['ea', 'since', 'json', 'help'].includes(key) || Object.hasOwn(options, key)) {
      throw new Error('Invalid options');
    }
    options[key] = ['json', 'help'].includes(key) ? true : argv[++i];
    if (options[key] === undefined) {
      throw new Error('Missing value');
    }
  }
  if (options.help) {
    return options;
  }
  if (
    !options.ea ||
    !(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(options.ea) ||
      /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(options.ea)) ||
    /[\x00-\x1f\x7f]/.test(options.ea) ||
    !isoTime(options.since)
  ) {
    throw new Error('Expected --ea and ISO --since');
  }
  return options;
};

const aggregate = name => `(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]'::jsonb) FROM ${name} r)`;

const SQL = `WITH
 ea AS (
  SELECT
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    a.raw_app_meta_data->>'is_test_account' AS is_test_account
  FROM public.users u
  JOIN auth.users a ON a.id=u.id
  WHERE lower(u.email)=lower(:'ea') OR u.id::text=:'ea'
),

touched AS (
  SELECT c.*
  FROM public.children c
  WHERE c.updated_at >= :'since'::timestamptz
    AND (
      c.created_by IN (SELECT id FROM ea)
      OR EXISTS (
        SELECT 1
        FROM public.child_ea_assignments ca
        WHERE ca.child_id=c.id
          AND ca.user_id IN (SELECT id FROM ea)
      )
    )
),

time_rows AS (
  SELECT
    left(t.id::text,8) AS id,
    t.sign_in_time,
    t.sign_out_time,
    t.sign_in_location_status,
    t.sign_out_location_status,
    t.auto_clocked_out
  FROM public.time_entries t
  WHERE t.user_id IN (SELECT id FROM ea)
    AND t.updated_at >= :'since'::timestamptz
),

child_rows AS (
  SELECT
    c.id,
    c.first_name,
    c.last_name,
    c.age,
    c.gender,
    c.archived_at,
    (
      SELECT count(*)
      FROM public.child_ea_assignments l
      WHERE l.child_id=c.id AND l.unassigned_at IS NULL
    ) AS active_ea_assignments,
    (
      SELECT count(*)
      FROM public.child_programme_enrollments l
      WHERE l.child_id=c.id AND l.ended_at IS NULL
    ) AS active_programme_enrollments,
    (
      SELECT count(*)
      FROM public.child_class_memberships l
      WHERE l.child_id=c.id AND l.exited_at IS NULL
    ) AS active_class_memberships
  FROM touched c
),

session_rows AS (
  SELECT
    s.id,
    s.session_date,
    s.state,
    s.group_id IS NOT NULL AS has_group,
    (
      SELECT count(*)
      FROM public.session_attendees a
      WHERE a.session_id=s.id
    ) AS attendee_count,
    s.activities->'lesson'->'plan'->>'blend_tier' AS blend_tier
  FROM public.sessions s
  WHERE s.user_id IN (SELECT id FROM ea)
    AND s.created_at >= :'since'::timestamptz
),

letter_rows AS (
  SELECT
    m.id,
    c.first_name,
    m.letter,
    m.language,
    m.confirmed,
    m.changed_at
  FROM public.letter_mastery m
  JOIN public.children c ON c.id=m.child_id
  WHERE m.changed_by IN (SELECT id FROM ea)
    AND m.changed_at >= :'since'::timestamptz
),

skill_rows AS (
  SELECT
    m.id,
    c.first_name,
    m.step_key,
    m.confirmed,
    m.changed_at
  FROM public.skill_mastery m
  JOIN public.children c ON c.id=m.child_id
  WHERE m.changed_by IN (SELECT id FROM ea)
    AND m.changed_at >= :'since'::timestamptz
),

assessment_rows AS (
  SELECT
    a.id,
    c.first_name,
    a.question_code,
    a.language,
    a.score,
    a.total_items,
    a.stopped_reason,
    a.duration_ms,
    a.battery_run_id,
    (
      SELECT count(*)
      FROM public.assessment_items i
      WHERE i.assessment_id=a.id
    ) AS item_count,
    (
      SELECT count(*)
      FROM public.assessment_items i
      WHERE i.assessment_id=a.id AND i.is_correct
    ) AS correct_count
  FROM public.assessments a
  JOIN public.children c ON c.id=a.child_id
  WHERE a.user_id IN (SELECT id FROM ea)
    AND a.created_at >= :'since'::timestamptz
),

battery_rows AS (
  SELECT
    b.id,
    b.battery_code,
    b.status,
    b.started_at,
    b.completed_at
  FROM public.battery_runs b
  WHERE b.user_id IN (SELECT id FROM ea)
    AND b.updated_at >= :'since'::timestamptz
),

incident_rows AS (
  SELECT
    i.id,
    i.kind,
    i.received_at,
    i.bundle_path IS NOT NULL AS has_bundle
  FROM public.mobile_support_incidents i
  WHERE i.reporter_id IN (SELECT id FROM ea)
    AND i.received_at >= :'since'::timestamptz
),

empty_groups AS (
  SELECT DISTINCT g.id
  FROM public.groups g
  JOIN public.group_ea_assignments ga ON ga.group_id=g.id
  WHERE ga.ea_user_id IN (SELECT id FROM ea)
    AND ga.unassigned_at IS NULL
    AND g.archived_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.child_group_memberships m
      JOIN public.children c ON c.id=m.child_id AND c.archived_at IS NULL
      WHERE m.group_id=g.id AND m.removed_at IS NULL
    )
),

health_ids AS (
  SELECT 'empty_active_groups' AS check_name,id
  FROM empty_groups
  UNION ALL
  SELECT 'sessions_without_attendees',id
  FROM session_rows
  WHERE attendee_count=0
  UNION ALL
  SELECT 'assessments_without_items',id
  FROM assessment_rows
  WHERE item_count=0
  UNION ALL
  SELECT 'children_without_ea',id
  FROM child_rows
  WHERE archived_at IS NULL AND active_ea_assignments=0
)

SELECT jsonb_build_object(
  'snapshotAt',statement_timestamp(),
  'ea',(SELECT to_jsonb(ea) FROM ea),
  'time_entries',${aggregate('time_rows')},
  'children',${aggregate('child_rows')},
  'sessions',${aggregate('session_rows')},
  'letter_mastery',${aggregate('letter_rows')},
  'skill_mastery',${aggregate('skill_rows')},
  'assessments',${aggregate('assessment_rows')},
  'battery_runs',${aggregate('battery_rows')},
  'support_incidents',${aggregate('incident_rows')},
  'health_checks',(
    SELECT jsonb_object_agg(
      check_name,
      jsonb_build_object(
        'status',CASE WHEN jsonb_array_length(ids)=0 THEN 'OK' ELSE 'FLAG' END,
        'ids',ids
      )
    )
    FROM (
      SELECT
        checks.check_name,
        coalesce(
          (
            SELECT jsonb_agg(h.id ORDER BY h.id)
            FROM health_ids h
            WHERE h.check_name=checks.check_name
          ),
          '[]'::jsonb
        ) AS ids
      FROM (
        VALUES
          ('empty_active_groups'),
          ('sessions_without_attendees'),
          ('assessments_without_items'),
          ('children_without_ea')
      ) checks(check_name)
    ) results
  )
);`;

function validateReportSections(report) {
  const sections = [
    'time_entries',
    'children',
    'sessions',
    'letter_mastery',
    'skill_mastery',
    'assessments',
    'battery_runs',
    'support_incidents'
  ];
  for (const key of sections) {
    if (!Array.isArray(report[key])) {
      throw new Error('Invalid snapshot');
    }
  }
  const checks = [
    'empty_active_groups',
    'sessions_without_attendees',
    'assessments_without_items',
    'children_without_ea'
  ];
  if (!report.health_checks || checks.some(key => (
    !['OK', 'FLAG'].includes(report.health_checks[key]?.status) ||
    !Array.isArray(report.health_checks[key]?.ids)
  ))) {
    throw new Error('Invalid health checks');
  }
}

function formatReport(report) {
  return Object.entries(report).map(([key, value]) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return `${key}:\n${text}`;
  }).join('\n');
}

const runCli = async (argv, {
  cwd = process.cwd(),
  env = process.env,
  spawnSync: runner = spawnSync,
  psql,
  log = console.log,
  error = console.error
} = {}) => {
  let options;
  try {
    options = parseArgs(argv);
  } catch {
    error('USAGE Expected --ea <email|uuid> --since <ISO>; use --help');
    return 1;
  }
  if (options.help) {
    log(HELP);
    return 0;
  }
  try {
    const config = validateSqliteEnv(loadEnvFiles(cwd));
    if (config.SUPABASE_PROJECT_ID_SQLITE !== PROJECT_REF) {
      throw new Error('Wrong project');
    }
    const connection = connectionFor(cwd);
    const childEnv = subprocessEnv(env, config.SUPABASE_DB_PASSWORD_SQLITE);
    error(`project_ref=${PROJECT_REF} access=psql-read-only`);
    const report = queryJson(runner, psql || resolvePsql(env), connection, childEnv, SQL, {
      ea: options.ea,
      since: options.since
    });
    if (!report || !isoTime(report.snapshotAt) || !Object.hasOwn(report, 'ea')) {
      throw new Error('Invalid snapshot');
    }
    if (!report.ea) {
      error('NOT_FOUND EA');
      return 2;
    }
    validateReportSections(report);
    report.warning = report.ea.is_test_account === 'true' ? null : 'WARNING not a test account';
    report.support_hint = `For the handle and bundle use: node scripts/read-support-incidents.cjs --actor ${report.ea.email} --since ${options.since}`;
    log(options.json ? JSON.stringify(report) : formatReport(report));
    return 0;
  } catch {
    error('READ_FAILED Staging configuration or read-only query failed; no evidence claim');
    return 1;
  }
};
if (require.main === module) {
  runCli(process.argv.slice(2)).then(code => {
    process.exitCode = code;
  });
}

module.exports = {
  parseArgs,
  SQL,
  runCli
};
