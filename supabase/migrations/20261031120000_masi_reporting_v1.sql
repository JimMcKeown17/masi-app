-- Website reporting v1. Unpublished: later plan tasks append functions here.
SET lock_timeout = '10s';
SET statement_timeout = '60s';

DO $reporting_role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'masi_reporting_reader') THEN
    CREATE ROLE masi_reporting_reader LOGIN NOINHERIT;
  END IF;
END
$reporting_role$;
ALTER ROLE masi_reporting_reader SET default_transaction_read_only = on;
ALTER ROLE masi_reporting_reader SET statement_timeout = '15s';
GRANT USAGE ON SCHEMA public TO masi_reporting_reader;

CREATE FUNCTION public.masi_reporting_accounts_v1()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
BEGIN ATOMIC
  WITH account_count AS (
    SELECT pg_catalog.count(*) AS n FROM public.users
  )
  SELECT CASE WHEN ac.n > 5000 THEN
    pg_catalog.jsonb_build_object(
      'function_version', 'masi_reporting_accounts_v1', 'generated_at', pg_catalog.now(),
      'error', 'too_much_data', 'row_count', ac.n)
  ELSE pg_catalog.jsonb_build_object(
    'function_version', 'masi_reporting_accounts_v1', 'generated_at', pg_catalog.now(),
    'academic_year', (SELECT pg_catalog.jsonb_build_object(
      'id', y.id, 'label', y.label, 'starts_on', y.starts_on, 'ends_on', y.ends_on)
      FROM public.academic_years y WHERE y.is_active),
    'programmes', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', p.id, 'code', p.code, 'name', p.name, 'daily_session_target', p.daily_session_target)
      ORDER BY p.sort_order, p.code), '[]'::jsonb) FROM public.programmes p),
    'schools', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', s.id, 'name', s.name, 'school_uid', s.school_uid) ORDER BY s.name), '[]'::jsonb)
      FROM public.schools s),
    'accounts', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'user_id', u.id, 'first_name', u.first_name, 'last_name', u.last_name, 'email', u.email,
      'organization_slug', o.slug, 'job_title_code', j.code, 'is_active', u.is_active,
      'user_school_id', u.school_id,
      'auth', pg_catalog.jsonb_build_object(
        'created_at', a.created_at, 'last_sign_in_at', a.last_sign_in_at,
        'email_confirmed_at', a.email_confirmed_at, 'banned_until', a.banned_until,
        'is_test_flag', COALESCE(pg_catalog.lower(a.raw_app_meta_data->>'is_test_account') = 'true', false)),
      'assignment', (SELECT pg_catalog.jsonb_build_object(
        'programme_id', spa.programme_id, 'programme_code', p.code,
        'school_id', spa.school_id, 'assigned_at', spa.assigned_at)
        FROM public.staff_programme_assignments spa JOIN public.programmes p ON p.id=spa.programme_id
        WHERE spa.user_id=u.id AND spa.ended_at IS NULL),
      'counts', pg_catalog.jsonb_build_object(
        'delivery_children', (SELECT pg_catalog.count(DISTINCT cea.child_id)
          FROM public.child_ea_assignments cea
          JOIN public.children ch ON ch.id=cea.child_id AND ch.archived_at IS NULL
          JOIN public.staff_programme_assignments spa ON spa.user_id=cea.user_id AND spa.ended_at IS NULL
          JOIN public.child_programme_enrollments e ON e.child_id=ch.id AND e.programme_id=spa.programme_id AND e.ended_at IS NULL
          JOIN public.child_class_memberships m ON m.child_id=ch.id AND m.exited_at IS NULL
          JOIN public.classes cl ON cl.id=m.class_id AND cl.archived_at IS NULL
          WHERE cea.user_id=u.id AND cea.unassigned_at IS NULL),
        'class_children', (SELECT pg_catalog.count(DISTINCT m.child_id)
          FROM public.class_ea_assignments ca
          JOIN public.classes cl ON cl.id=ca.class_id AND cl.archived_at IS NULL
          JOIN public.child_class_memberships m ON m.class_id=cl.id AND m.exited_at IS NULL
          WHERE ca.ea_user_id=u.id AND ca.unassigned_at IS NULL),
        'active_classes', (SELECT pg_catalog.count(DISTINCT cl.id)
          FROM public.class_ea_assignments ca JOIN public.classes cl ON cl.id=ca.class_id AND cl.archived_at IS NULL
          WHERE ca.ea_user_id=u.id AND ca.unassigned_at IS NULL),
        'active_groups', (SELECT pg_catalog.count(*) FROM public.group_ea_assignments ga
          JOIN public.groups g ON g.id=ga.group_id AND g.archived_at IS NULL
          WHERE ga.ea_user_id=u.id AND ga.unassigned_at IS NULL)),
      'activity', pg_catalog.jsonb_build_object(
        'ever_session', EXISTS(SELECT 1 FROM public.sessions s WHERE s.user_id=u.id AND s.state='completed'),
        'ever_clock', EXISTS(SELECT 1 FROM public.time_entries t WHERE t.user_id=u.id),
        'ever_assessment', EXISTS(SELECT 1 FROM public.assessments r WHERE r.user_id=u.id),
        'last_session_date', (SELECT pg_catalog.max(s.session_date) FROM public.sessions s WHERE s.user_id=u.id AND s.state='completed'),
        'last_clock_date', (SELECT (pg_catalog.max(t.sign_in_time) AT TIME ZONE 'Africa/Johannesburg')::date FROM public.time_entries t WHERE t.user_id=u.id),
        'last_assessment_date', (SELECT pg_catalog.max(r.assessment_date) FROM public.assessments r WHERE r.user_id=u.id),
        -- These are server-owned receipt clocks; time_entries and current mastery
        -- cannot establish receipt history and are deliberately excluded.
        'last_data_received_at', GREATEST(
          (SELECT pg_catalog.max(s.updated_at) FROM public.sessions s WHERE s.user_id=u.id),
          (SELECT pg_catalog.max(r.updated_at) FROM public.assessments r WHERE r.user_id=u.id),
          (SELECT pg_catalog.max(b.updated_at) FROM public.battery_runs b WHERE b.user_id=u.id),
          (SELECT pg_catalog.max(l.received_at) FROM public.letter_mastery_corrections l WHERE l.changed_by=u.id),
          (SELECT pg_catalog.max(i.received_at) FROM public.mobile_support_incidents i WHERE i.reporter_id=u.id))),
      'last_receipt', (SELECT pg_catalog.jsonb_build_object(
        'received_at', i.received_at, 'kind', i.kind,
        'app_version', i.observed->'application'->>'version',
        'app_build', i.observed->'application'->>'build',
        'update_id', i.observed->'update'->>'id',
        'platform', i.observed->'device'->>'platform',
        'os_version', i.observed->'device'->>'osVersion')
        FROM public.mobile_support_incidents i WHERE i.reporter_id=u.id
        ORDER BY i.received_at DESC, i.id LIMIT 1)
    ) ORDER BY u.last_name, u.first_name, u.id), '[]'::jsonb)
    FROM public.users u
    JOIN auth.users a ON a.id=u.id
    LEFT JOIN public.organizations o ON o.id=u.organization_id
    LEFT JOIN public.job_titles j ON j.id=u.job_title_id)
  ) END
  FROM account_count ac;
END;
ALTER FUNCTION public.masi_reporting_accounts_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.masi_reporting_accounts_v1() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.masi_reporting_accounts_v1() TO masi_reporting_reader;


-- Tasks 2-4: bounded website reporting facts.

CREATE FUNCTION public.masi_reporting_roster_v1(p_user_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
BEGIN ATOMIC
WITH current_class AS (
-- One open membership per child (open memberships are unique per academic year, so a child can
-- hold two): latest enrolled_at, then smallest class_id. Set-based, so it never degrades into a
-- per-child loop.
SELECT DISTINCT ON (m.child_id) m.child_id, c.id, c.school_id, c.grade
FROM public.child_class_memberships m
JOIN public.classes c ON c.id=m.class_id AND c.archived_at IS NULL
WHERE m.exited_at IS NULL
ORDER BY m.child_id, m.enrolled_at DESC, m.class_id ASC),
rows AS (SELECT DISTINCT a.user_id, ch.id AS child_id, p.code AS programme_code, cl.school_id, cl.id AS class_id, cl.grade
FROM public.child_ea_assignments a
JOIN public.children ch ON ch.id=a.child_id AND ch.archived_at IS NULL
JOIN public.staff_programme_assignments spa ON spa.user_id=a.user_id AND spa.ended_at IS NULL
JOIN public.programmes p ON p.id=spa.programme_id
JOIN public.child_programme_enrollments e ON e.child_id=ch.id AND e.programme_id=spa.programme_id AND e.ended_at IS NULL
JOIN current_class cl ON cl.child_id=ch.id
WHERE a.user_id=ANY(p_user_ids) AND a.unassigned_at IS NULL)
SELECT CASE

  WHEN p_user_ids IS NULL THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_roster_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_user_ids')
  ELSE CASE WHEN (SELECT pg_catalog.count(*) FROM rows) > 100000 THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_roster_v1',
      'generated_at', pg_catalog.now(),
      'error', 'too_much_data',
      'row_count', (SELECT pg_catalog.count(*) FROM rows))
  ELSE pg_catalog.jsonb_build_object('function_version', 'masi_reporting_roster_v1',
      'generated_at', pg_catalog.now(),
      'rows', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.user_id, r.child_id), '[]'::jsonb) FROM rows r))
  END
END;
END;
ALTER FUNCTION public.masi_reporting_roster_v1(uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.masi_reporting_roster_v1(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.masi_reporting_roster_v1(uuid[]) TO masi_reporting_reader;

CREATE FUNCTION public.masi_reporting_assessed_children_v1(p_author_ids uuid[], p_from date, p_to date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
BEGIN ATOMIC
WITH rows AS (SELECT a.child_id, pg_catalog.max(a.assessment_date) AS last_assessment_date FROM public.assessments a WHERE a.user_id=ANY(p_author_ids) AND a.assessment_date BETWEEN p_from AND p_to AND (a.stopped_reason IS NULL OR a.stopped_reason NOT LIKE 'skipped\_%') GROUP BY a.child_id)
SELECT CASE

  WHEN p_author_ids IS NULL THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_assessed_children_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_author_ids')
  WHEN p_from IS NULL OR p_from > p_to THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_assessed_children_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_from')
  WHEN p_to IS NULL THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_assessed_children_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_to')
  WHEN p_to - p_from >= 366 THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_assessed_children_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_to')
  ELSE CASE WHEN (SELECT pg_catalog.count(*) FROM rows) > 100000 THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_assessed_children_v1',
      'generated_at', pg_catalog.now(),
      'error', 'too_much_data',
      'row_count', (SELECT pg_catalog.count(*) FROM rows))
  ELSE pg_catalog.jsonb_build_object('function_version', 'masi_reporting_assessed_children_v1',
      'generated_at', pg_catalog.now(),
      'from',p_from,
      'to',p_to,
      'rows',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.child_id), '[]'::jsonb) FROM rows r))
  END
END;
END;
ALTER FUNCTION public.masi_reporting_assessed_children_v1(uuid[], date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.masi_reporting_assessed_children_v1(uuid[], date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.masi_reporting_assessed_children_v1(uuid[], date, date) TO masi_reporting_reader;

CREATE FUNCTION public.masi_reporting_daily_v1(p_user_ids uuid[], p_from date, p_to date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
BEGIN ATOMIC
WITH sessions AS (
SELECT s.user_id,s.session_date AS day,p.code AS programme_code,pg_catalog.count(*) AS sessions,
pg_catalog.sum((SELECT pg_catalog.count(*) FROM public.session_attendees sa WHERE sa.session_id=s.id AND sa.attendance_status IN ('present','late'))) AS present_attendances,
pg_catalog.count(*) FILTER (WHERE s.group_id IS NULL) AS ungrouped_sessions
FROM public.sessions s JOIN public.programmes p ON p.id=s.programme_id
WHERE s.user_id=ANY(p_user_ids) AND s.session_date BETWEEN p_from AND p_to AND s.state='completed'
GROUP BY s.user_id,s.session_date,p.code),
clock AS (SELECT t.user_id,(t.sign_in_time AT TIME ZONE 'Africa/Johannesburg')::date AS day,
pg_catalog.count(*) AS entries,COALESCE(pg_catalog.sum(pg_catalog.floor(EXTRACT(epoch FROM(t.sign_out_time-t.sign_in_time))/60)),0) AS completed_minutes,
pg_catalog.count(*) FILTER(WHERE t.auto_clocked_out) AS auto_clock_outs
FROM public.time_entries t WHERE t.user_id=ANY(p_user_ids) AND (t.sign_in_time AT TIME ZONE 'Africa/Johannesburg')::date BETWEEN p_from AND p_to
GROUP BY t.user_id,(t.sign_in_time AT TIME ZONE 'Africa/Johannesburg')::date),
questions AS (SELECT a.user_id,a.assessment_date AS day,p.code AS programme_code,
pg_catalog.count(*) FILTER(WHERE (a.stopped_reason IS NULL OR a.stopped_reason NOT LIKE 'skipped\_%')) AS question_results,
pg_catalog.count(*) FILTER(WHERE a.stopped_reason LIKE 'skipped\_%') AS skipped_results,
pg_catalog.count(DISTINCT a.child_id) FILTER(WHERE (a.stopped_reason IS NULL OR a.stopped_reason NOT LIKE 'skipped\_%')) AS children_assessed
FROM public.assessments a JOIN public.programmes p ON p.id=a.programme_id
WHERE a.user_id=ANY(p_user_ids) AND a.assessment_date BETWEEN p_from AND p_to GROUP BY a.user_id,a.assessment_date,p.code),
completed AS (SELECT b.user_id,(b.completed_at AT TIME ZONE 'Africa/Johannesburg')::date AS day,p.code AS programme_code,pg_catalog.count(*) AS n
FROM public.battery_runs b JOIN public.programmes p ON p.id=b.programme_id
WHERE b.user_id=ANY(p_user_ids) AND b.status='completed' AND (b.completed_at AT TIME ZONE 'Africa/Johannesburg')::date BETWEEN p_from AND p_to
GROUP BY b.user_id,(b.completed_at AT TIME ZONE 'Africa/Johannesburg')::date,p.code),
assessments AS (SELECT COALESCE(q.user_id,b.user_id) AS user_id,COALESCE(q.day,b.day) AS day,COALESCE(q.programme_code,b.programme_code) AS programme_code,
COALESCE(q.question_results,0) AS question_results,COALESCE(q.skipped_results,0) AS skipped_results,COALESCE(b.n,0) AS battery_runs_completed,COALESCE(q.children_assessed,0) AS children_assessed
FROM questions q FULL JOIN completed b USING(user_id,day,programme_code))
SELECT CASE

  WHEN p_user_ids IS NULL THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_daily_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_user_ids')
  WHEN p_from IS NULL OR p_from > p_to THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_daily_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_from')
  WHEN p_to IS NULL THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_daily_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_to')
  WHEN p_to - p_from >= 120 THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_daily_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_to')
  ELSE CASE WHEN (SELECT (SELECT pg_catalog.count(*) FROM sessions)+(SELECT pg_catalog.count(*) FROM clock)+(SELECT pg_catalog.count(*) FROM assessments)) > 200000 THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_daily_v1',
      'generated_at', pg_catalog.now(),
      'error', 'too_much_data',
      'row_count', (SELECT (SELECT pg_catalog.count(*) FROM sessions)+(SELECT pg_catalog.count(*) FROM clock)+(SELECT pg_catalog.count(*) FROM assessments)))
  ELSE pg_catalog.jsonb_build_object('function_version', 'masi_reporting_daily_v1',
      'generated_at', pg_catalog.now(),
      'from',p_from,
      'to',p_to,
      'sessions',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.user_id,r.day,r.programme_code), '[]'::jsonb) FROM sessions r),
      'clock',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.user_id,r.day), '[]'::jsonb) FROM clock r),
      'assessments',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.user_id,r.day,r.programme_code), '[]'::jsonb) FROM assessments r))
  END
END;
END;
ALTER FUNCTION public.masi_reporting_daily_v1(uuid[], date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.masi_reporting_daily_v1(uuid[], date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.masi_reporting_daily_v1(uuid[], date, date) TO masi_reporting_reader;

CREATE FUNCTION public.masi_reporting_ea_detail_v1(p_user_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
BEGIN ATOMIC
WITH session_source AS (SELECT s.id, s.session_date, s.updated_at, s.user_id, p.code AS programme_code,
cl.school_id, cl.name AS class_name, cl.grade, g.name AS group_name,
(SELECT pg_catalog.count(*) FROM public.session_attendees sa WHERE sa.session_id=s.id AND sa.attendance_status IN ('present','late')) AS present_count,
CASE WHEN pg_catalog.jsonb_typeof(s.activities->'letters_focused')='array' THEN
 CASE WHEN NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(s.activities->'letters_focused') el WHERE pg_catalog.jsonb_typeof(el)<>'string')
 THEN ARRAY(SELECT pg_catalog.jsonb_array_elements_text(s.activities->'letters_focused')) END END AS letters_focused,
s.activities->>'session_reading_level' AS session_reading_level, s.notes
FROM public.sessions s JOIN public.programmes p ON p.id=s.programme_id
LEFT JOIN public.groups g ON g.id=s.group_id LEFT JOIN public.classes cl ON cl.id=COALESCE(s.class_id,g.class_id)
WHERE s.user_id=p_user_id AND s.session_date BETWEEN p_from AND p_to AND s.state='completed'),
sessions AS (SELECT id,session_date,updated_at,programme_code,group_name,class_name,grade,present_count,letters_focused,session_reading_level,notes FROM session_source),
clock_source AS (SELECT t.id, t.user_id, (t.sign_in_time AT TIME ZONE 'Africa/Johannesburg')::date AS local_date,
t.sign_in_time, t.sign_out_time,
pg_catalog.floor(EXTRACT(epoch FROM (t.sign_out_time-t.sign_in_time))/60) AS duration_minutes,
t.auto_clocked_out, t.sign_in_location_status, t.sign_out_location_status
FROM public.time_entries t WHERE t.user_id=p_user_id
AND (t.sign_in_time AT TIME ZONE 'Africa/Johannesburg')::date BETWEEN p_from AND p_to),
time_entries AS (SELECT id,local_date,sign_in_time,sign_out_time,duration_minutes,auto_clocked_out,sign_in_location_status,sign_out_location_status FROM clock_source),
assessment_source AS (SELECT a.id, a.assessment_date, a.updated_at, a.user_id, a.child_id,
ch.first_name AS child_first_name, ch.last_name AS child_last_name, a.battery_run_id,
p.code AS programme_code,
b.battery_code, b.battery_version, b.status AS battery_status, a.question_code, a.language,
a.score AS raw_score, a.total_items AS item_count,
CASE WHEN pg_catalog.jsonb_typeof(a.derived->'max')='number' THEN (a.derived->>'max')::numeric END AS score_max,
a.stopped_reason, a.assessment_purpose, w.label AS window_label
FROM public.assessments a JOIN public.children ch ON ch.id=a.child_id
JOIN public.programmes p ON p.id=a.programme_id
LEFT JOIN public.battery_runs b ON b.id=a.battery_run_id
LEFT JOIN public.assessment_windows w ON w.id=a.assessment_window_id
WHERE a.user_id=p_user_id AND a.assessment_date BETWEEN p_from AND p_to),
assessments AS (SELECT a.id,a.assessment_date,a.updated_at,a.battery_code,a.battery_version,a.battery_status,a.question_code,a.language,a.raw_score,a.item_count,a.score_max,a.stopped_reason,a.child_id,
COALESCE(NULLIF(ch.preferred_name,''),ch.first_name)||' '||ch.last_name AS child_name FROM assessment_source a JOIN public.children ch ON ch.id=a.child_id),
groups AS (SELECT g.id AS group_id,g.name,p.code AS programme_code,cl.name AS class_name,cl.grade,
(SELECT pg_catalog.count(*) FROM public.child_group_memberships m WHERE m.group_id=g.id AND m.removed_at IS NULL) AS members,
(SELECT pg_catalog.max(s.session_date) FROM public.sessions s WHERE s.group_id=g.id AND s.state='completed') AS last_session_date
FROM public.groups g JOIN public.group_ea_assignments ga ON ga.group_id=g.id AND ga.ea_user_id=p_user_id AND ga.unassigned_at IS NULL
JOIN public.programmes p ON p.id=g.programme_id LEFT JOIN public.classes cl ON cl.id=g.class_id WHERE g.archived_at IS NULL),
weeks AS (SELECT (pg_catalog.date_trunc('week',p_to::timestamp)::date - n*7) AS week_start FROM pg_catalog.generate_series(0,11) n),
weekly AS (SELECT w.week_start,
(SELECT pg_catalog.count(*) FROM public.sessions s WHERE s.user_id=p_user_id AND s.state='completed' AND s.session_date>=w.week_start AND s.session_date<w.week_start+7) AS sessions,
(SELECT pg_catalog.count(DISTINCT (t.sign_in_time AT TIME ZONE 'Africa/Johannesburg')::date) FROM public.time_entries t WHERE t.user_id=p_user_id AND (t.sign_in_time AT TIME ZONE 'Africa/Johannesburg')::date>=w.week_start AND (t.sign_in_time AT TIME ZONE 'Africa/Johannesburg')::date<w.week_start+7) AS clock_days,
(SELECT pg_catalog.round(COALESCE(pg_catalog.sum(pg_catalog.floor(EXTRACT(epoch FROM(t.sign_out_time-t.sign_in_time))/60)),0)/60.0,1) FROM public.time_entries t WHERE t.user_id=p_user_id AND (t.sign_in_time AT TIME ZONE 'Africa/Johannesburg')::date>=w.week_start AND (t.sign_in_time AT TIME ZONE 'Africa/Johannesburg')::date<w.week_start+7) AS completed_hours,
(SELECT pg_catalog.count(*) FROM public.assessments a WHERE a.user_id=p_user_id AND a.assessment_date>=w.week_start AND a.assessment_date<w.week_start+7 AND (a.stopped_reason IS NULL OR a.stopped_reason NOT LIKE 'skipped\_%')) AS question_results FROM weeks w)
SELECT CASE

  WHEN p_user_id IS NULL THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_ea_detail_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_user_id')
  WHEN p_from IS NULL OR p_from > p_to THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_ea_detail_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_from')
  WHEN p_to IS NULL THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_ea_detail_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_to')
  WHEN p_to - p_from >= 120 THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_ea_detail_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_to')
  ELSE CASE WHEN (SELECT pg_catalog.count(*) FROM groups) > 100 THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_ea_detail_v1',
      'generated_at', pg_catalog.now(),
      'error', 'too_much_data',
      'row_count', (SELECT pg_catalog.count(*) FROM groups))
  ELSE pg_catalog.jsonb_build_object('function_version', 'masi_reporting_ea_detail_v1',
      'generated_at', pg_catalog.now(),
      'from',p_from,
      'to',p_to,
      'sessions',pg_catalog.jsonb_build_object('total',(SELECT pg_catalog.count(*) FROM sessions),
      'rows',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.session_date DESC,r.updated_at DESC,r.id), '[]'::jsonb) FROM (SELECT * FROM sessions r ORDER BY r.session_date DESC,r.updated_at DESC,r.id LIMIT 300) r)),
      'time_entries',pg_catalog.jsonb_build_object('total',(SELECT pg_catalog.count(*) FROM time_entries),
      'rows',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.sign_in_time DESC,r.id), '[]'::jsonb) FROM (SELECT * FROM time_entries r ORDER BY r.sign_in_time DESC,r.id LIMIT 200) r)),
      'assessments',pg_catalog.jsonb_build_object('total',(SELECT pg_catalog.count(*) FROM assessments),
      'rows',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.assessment_date DESC,r.updated_at DESC,r.id), '[]'::jsonb) FROM (SELECT * FROM assessments r ORDER BY r.assessment_date DESC,r.updated_at DESC,r.id LIMIT 200) r)),
      'groups',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.name,r.group_id), '[]'::jsonb) FROM groups r),
      'weekly',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.week_start), '[]'::jsonb) FROM weekly r))
  END
END;
END;
ALTER FUNCTION public.masi_reporting_ea_detail_v1(uuid, date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.masi_reporting_ea_detail_v1(uuid, date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.masi_reporting_ea_detail_v1(uuid, date, date) TO masi_reporting_reader;

CREATE FUNCTION public.masi_reporting_sessions_v1(p_user_ids uuid[], p_from date, p_to date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
BEGIN ATOMIC
WITH rows AS (SELECT s.id, s.session_date, s.updated_at, s.user_id, p.code AS programme_code,
cl.school_id, cl.name AS class_name, cl.grade, g.name AS group_name,
(SELECT pg_catalog.count(*) FROM public.session_attendees sa WHERE sa.session_id=s.id AND sa.attendance_status IN ('present','late')) AS present_count,
CASE WHEN pg_catalog.jsonb_typeof(s.activities->'letters_focused')='array' THEN
 CASE WHEN NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(s.activities->'letters_focused') el WHERE pg_catalog.jsonb_typeof(el)<>'string')
 THEN ARRAY(SELECT pg_catalog.jsonb_array_elements_text(s.activities->'letters_focused')) END END AS letters_focused,
s.activities->>'session_reading_level' AS session_reading_level, s.notes
FROM public.sessions s JOIN public.programmes p ON p.id=s.programme_id
LEFT JOIN public.groups g ON g.id=s.group_id LEFT JOIN public.classes cl ON cl.id=COALESCE(s.class_id,g.class_id)
WHERE s.user_id=ANY(p_user_ids) AND s.session_date BETWEEN p_from AND p_to AND s.state='completed')
SELECT CASE

  WHEN p_user_ids IS NULL THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_sessions_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_user_ids')
  WHEN p_from IS NULL OR p_from > p_to THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_sessions_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_from')
  WHEN p_to IS NULL THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_sessions_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_to')
  WHEN p_to - p_from >= 92 THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_sessions_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_to')
  ELSE CASE WHEN (SELECT pg_catalog.count(*) FROM rows) > 20000 THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_sessions_v1',
      'generated_at', pg_catalog.now(),
      'error', 'too_much_data',
      'row_count', (SELECT pg_catalog.count(*) FROM rows))
  ELSE pg_catalog.jsonb_build_object('function_version', 'masi_reporting_sessions_v1',
      'generated_at', pg_catalog.now(),
      'from',p_from,
      'to',p_to,
      'rows',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.session_date,r.user_id,r.id), '[]'::jsonb) FROM rows r))
  END
END;
END;
ALTER FUNCTION public.masi_reporting_sessions_v1(uuid[], date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.masi_reporting_sessions_v1(uuid[], date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.masi_reporting_sessions_v1(uuid[], date, date) TO masi_reporting_reader;

CREATE FUNCTION public.masi_reporting_assessments_v1(p_user_ids uuid[], p_from date, p_to date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
BEGIN ATOMIC
WITH rows AS (SELECT a.id, a.assessment_date, a.updated_at, a.user_id, a.child_id,
ch.first_name AS child_first_name, ch.last_name AS child_last_name, a.battery_run_id,
cl.name AS class_name, cl.grade, cl.school_id, p.code AS programme_code,
b.battery_code, b.battery_version, b.status AS battery_status, a.question_code, a.language,
a.score AS raw_score, a.total_items AS item_count,
CASE WHEN pg_catalog.jsonb_typeof(a.derived->'max')='number' THEN (a.derived->>'max')::numeric END AS score_max,
a.stopped_reason, a.assessment_purpose, w.label AS window_label
FROM public.assessments a JOIN public.children ch ON ch.id=a.child_id
JOIN public.programmes p ON p.id=a.programme_id
LEFT JOIN public.battery_runs b ON b.id=a.battery_run_id
LEFT JOIN LATERAL (
  SELECT m.class_id
  FROM public.child_class_memberships m
  JOIN public.classes c ON c.id=m.class_id AND c.archived_at IS NULL
  WHERE m.child_id=a.child_id AND m.exited_at IS NULL AND b.class_id IS NULL
  ORDER BY m.enrolled_at DESC, m.class_id ASC LIMIT 1
) m ON true
LEFT JOIN public.classes cl ON cl.id=COALESCE(b.class_id,m.class_id)
LEFT JOIN public.assessment_windows w ON w.id=a.assessment_window_id
WHERE a.user_id=ANY(p_user_ids) AND a.assessment_date BETWEEN p_from AND p_to),completed_battery_runs AS (SELECT b.id, b.user_id, b.child_id, p.code AS programme_code, b.battery_code, b.battery_version,
(b.completed_at AT TIME ZONE 'Africa/Johannesburg')::date AS completed_day
FROM public.battery_runs b JOIN public.programmes p ON p.id=b.programme_id
WHERE b.user_id=ANY(p_user_ids) AND b.status='completed'
AND (b.completed_at AT TIME ZONE 'Africa/Johannesburg')::date BETWEEN p_from AND p_to)
SELECT CASE

  WHEN p_user_ids IS NULL THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_assessments_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_user_ids')
  WHEN p_from IS NULL OR p_from > p_to THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_assessments_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_from')
  WHEN p_to IS NULL THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_assessments_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_to')
  WHEN p_to - p_from >= 366 THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_assessments_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_to')
  ELSE CASE WHEN (SELECT (SELECT pg_catalog.count(*) FROM rows)+(SELECT pg_catalog.count(*) FROM completed_battery_runs)) > 50000 THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_assessments_v1',
      'generated_at', pg_catalog.now(),
      'error', 'too_much_data',
      'row_count', (SELECT (SELECT pg_catalog.count(*) FROM rows)+(SELECT pg_catalog.count(*) FROM completed_battery_runs)))
  ELSE pg_catalog.jsonb_build_object('function_version', 'masi_reporting_assessments_v1',
      'generated_at', pg_catalog.now(),
      'from',p_from,
      'to',p_to,
      'rows',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.assessment_date,r.user_id,r.id), '[]'::jsonb) FROM rows r),
      'completed_battery_runs',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.completed_day,r.id), '[]'::jsonb) FROM completed_battery_runs r))
  END
END;
END;
ALTER FUNCTION public.masi_reporting_assessments_v1(uuid[], date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.masi_reporting_assessments_v1(uuid[], date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.masi_reporting_assessments_v1(uuid[], date, date) TO masi_reporting_reader;

CREATE FUNCTION public.masi_reporting_time_entries_v1(p_user_ids uuid[], p_from date, p_to date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
BEGIN ATOMIC
WITH rows AS (SELECT t.id, t.user_id, (t.sign_in_time AT TIME ZONE 'Africa/Johannesburg')::date AS local_date,
t.sign_in_time, t.sign_out_time,
pg_catalog.floor(EXTRACT(epoch FROM (t.sign_out_time-t.sign_in_time))/60) AS duration_minutes,
t.auto_clocked_out, t.sign_in_location_status, t.sign_out_location_status
FROM public.time_entries t WHERE t.user_id=ANY(p_user_ids)
AND (t.sign_in_time AT TIME ZONE 'Africa/Johannesburg')::date BETWEEN p_from AND p_to)
SELECT CASE

  WHEN p_user_ids IS NULL THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_time_entries_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_user_ids')
  WHEN p_from IS NULL OR p_from > p_to THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_time_entries_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_from')
  WHEN p_to IS NULL THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_time_entries_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_to')
  WHEN p_to - p_from >= 92 THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_time_entries_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_to')
  ELSE CASE WHEN (SELECT pg_catalog.count(*) FROM rows) > 20000 THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_time_entries_v1',
      'generated_at', pg_catalog.now(),
      'error', 'too_much_data',
      'row_count', (SELECT pg_catalog.count(*) FROM rows))
  ELSE pg_catalog.jsonb_build_object('function_version', 'masi_reporting_time_entries_v1',
      'generated_at', pg_catalog.now(),
      'from',p_from,
      'to',p_to,
      'rows',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.sign_in_time,r.id), '[]'::jsonb) FROM rows r))
  END
END;
END;
ALTER FUNCTION public.masi_reporting_time_entries_v1(uuid[], date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.masi_reporting_time_entries_v1(uuid[], date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.masi_reporting_time_entries_v1(uuid[], date, date) TO masi_reporting_reader;

CREATE FUNCTION public.masi_reporting_incidents_v1(p_user_ids uuid[], p_from timestamptz, p_to timestamptz, p_kinds text[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
BEGIN ATOMIC
WITH rows AS (SELECT i.id,i.reporter_id,i.kind,i.repeat_key,i.report_id,i.occurrence_count,i.first_seen_at,i.last_seen_at,i.received_at,i.report_generation,
i.bundle_path IS NOT NULL AS has_bundle,i.screenshot_path IS NOT NULL AS has_screenshot,
i.observed->'application'->>'version' AS app_version,i.observed->'application'->>'build' AS app_build,
i.observed->'update'->>'id' AS update_id,i.observed->'device'->>'platform' AS platform,i.observed->'device'->>'osVersion' AS os_version,
pg_catalog.left(COALESCE(i.payload->>'message',i.payload->>'errorCode',i.payload->>'error_code',i.payload->>'reason'),2048) AS summary
FROM public.mobile_support_incidents i WHERE i.reporter_id=ANY(p_user_ids) AND i.received_at>=p_from AND i.received_at<p_to AND (p_kinds IS NULL OR i.kind=ANY(p_kinds)))
SELECT CASE

  WHEN p_user_ids IS NULL THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_incidents_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_user_ids')
  WHEN p_from IS NULL OR p_from > p_to THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_incidents_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_from')
  WHEN p_to IS NULL THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_incidents_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_to')
  WHEN p_to - p_from > INTERVAL '90 days' THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_incidents_v1',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_to')
  ELSE CASE WHEN (SELECT pg_catalog.count(*) FROM rows) > 5000 THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_incidents_v1',
      'generated_at', pg_catalog.now(),
      'error', 'too_much_data',
      'row_count', (SELECT pg_catalog.count(*) FROM rows))
  ELSE pg_catalog.jsonb_build_object('function_version', 'masi_reporting_incidents_v1',
      'generated_at', pg_catalog.now(),
      'from',p_from,
      'to',p_to,
      'rows',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.received_at DESC,r.id), '[]'::jsonb) FROM rows r))
  END
END;
END;
ALTER FUNCTION public.masi_reporting_incidents_v1(uuid[], timestamptz, timestamptz, text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.masi_reporting_incidents_v1(uuid[], timestamptz, timestamptz, text[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.masi_reporting_incidents_v1(uuid[], timestamptz, timestamptz, text[]) TO masi_reporting_reader;

RESET statement_timeout;
RESET lock_timeout;
