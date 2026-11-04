-- Website reporting v2: additive real-data diagnostic and group-class detail.
-- Standalone atomic bodies preserve v1 for callers during the expand/contract rollout.
-- The CLI applies this file in one transaction; use session SET, never top-level SET LOCAL.
SET lock_timeout = '10s';
SET statement_timeout = '60s';

CREATE FUNCTION public.masi_reporting_incidents_v2(p_user_ids uuid[], p_from timestamptz, p_to timestamptz, p_kinds text[])
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
pg_catalog.left(COALESCE(i.payload->>'message',i.payload->>'errorCode',i.payload->>'error_code',i.payload->>'reason'),2048) AS summary,
-- Phone payload keys are camelCase (incidentPayloads.js); absent values stay JSON null.
-- Preserve the numeric hours value without coercing arbitrary legacy payload strings.
pg_catalog.jsonb_build_object(
  'scope_family',i.payload->>'scopeFamily',
  'failure_kind',i.payload->>'failureKind',
  'error_class',i.payload->>'errorClass',
  'error_code',i.payload->>'errorCode',
  'table_name',i.payload->>'table',
  'operation',i.payload->>'operation',
  'record_id',i.payload->>'recordId',
  'error_name',i.payload->>'errorName',
  'failing_for_hours',CASE WHEN pg_catalog.jsonb_typeof(i.payload->'failingForHours')='number'
    THEN i.payload->'failingForHours' END,
  'last_failure_message',pg_catalog.left(i.payload->>'lastFailureMessage',500)) AS detail
FROM public.mobile_support_incidents i WHERE i.reporter_id=ANY(p_user_ids) AND i.received_at>=p_from AND i.received_at<p_to AND (p_kinds IS NULL OR i.kind=ANY(p_kinds)))
SELECT CASE

  WHEN p_user_ids IS NULL THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_incidents_v2',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_user_ids')
  WHEN p_from IS NULL OR p_from > p_to THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_incidents_v2',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_from')
  WHEN p_to IS NULL THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_incidents_v2',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_to')
  WHEN p_to - p_from > INTERVAL '90 days' THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_incidents_v2',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_to')
  ELSE CASE WHEN (SELECT pg_catalog.count(*) FROM rows) > 5000 THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_incidents_v2',
      'generated_at', pg_catalog.now(),
      'error', 'too_much_data',
      'row_count', (SELECT pg_catalog.count(*) FROM rows))
  ELSE pg_catalog.jsonb_build_object('function_version', 'masi_reporting_incidents_v2',
      'generated_at', pg_catalog.now(),
      'from',p_from,
      'to',p_to,
      'rows',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.received_at DESC,r.id), '[]'::jsonb) FROM rows r))
  END
END;
END;
ALTER FUNCTION public.masi_reporting_incidents_v2(uuid[], timestamptz, timestamptz, text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.masi_reporting_incidents_v2(uuid[], timestamptz, timestamptz, text[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.masi_reporting_incidents_v2(uuid[], timestamptz, timestamptz, text[]) TO masi_reporting_reader;

CREATE FUNCTION public.masi_reporting_ea_detail_v2(p_user_id uuid, p_from date, p_to date)
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
SELECT DISTINCT ON (m.child_id) m.child_id, c.id, c.school_id, c.grade, c.name
FROM public.child_class_memberships m
JOIN public.classes c ON c.id=m.class_id AND c.archived_at IS NULL
WHERE m.exited_at IS NULL
ORDER BY m.child_id, m.enrolled_at DESC, m.class_id ASC),
session_source AS (SELECT s.id, s.session_date, s.updated_at, s.user_id, p.code AS programme_code,
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
g.created_at,
-- Keep the explicit class and add each active member's roster-resolved current class.
-- UNION deduplicates explicit/member overlap and members sharing a class.
(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(gc) ORDER BY gc.class_name,gc.class_id), '[]'::jsonb)
 FROM (
   SELECT c.id AS class_id,c.name AS class_name,c.grade
   FROM public.classes c WHERE c.id=g.class_id AND c.archived_at IS NULL
   UNION
   SELECT cc.id AS class_id,cc.name AS class_name,cc.grade
   FROM public.child_group_memberships gm
   JOIN public.children ch ON ch.id=gm.child_id AND ch.archived_at IS NULL
   JOIN current_class cc ON cc.child_id=ch.id
   WHERE gm.group_id=g.id AND gm.removed_at IS NULL
 ) gc) AS classes,
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
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_ea_detail_v2',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_user_id')
  WHEN p_from IS NULL OR p_from > p_to THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_ea_detail_v2',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_from')
  WHEN p_to IS NULL THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_ea_detail_v2',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_to')
  WHEN p_to - p_from >= 120 THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_ea_detail_v2',
      'generated_at', pg_catalog.now(),
      'error', 'invalid_argument',
      'argument', 'p_to')
  ELSE CASE WHEN (SELECT pg_catalog.count(*) FROM groups) > 100 THEN
    pg_catalog.jsonb_build_object('function_version', 'masi_reporting_ea_detail_v2',
      'generated_at', pg_catalog.now(),
      'error', 'too_much_data',
      'row_count', (SELECT pg_catalog.count(*) FROM groups))
  ELSE pg_catalog.jsonb_build_object('function_version', 'masi_reporting_ea_detail_v2',
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
ALTER FUNCTION public.masi_reporting_ea_detail_v2(uuid, date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.masi_reporting_ea_detail_v2(uuid, date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.masi_reporting_ea_detail_v2(uuid, date, date) TO masi_reporting_reader;

RESET statement_timeout;
RESET lock_timeout;
