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
        'is_test_flag', COALESCE(a.raw_app_meta_data->'is_test_account' = 'true'::jsonb, false)),
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

RESET statement_timeout;
RESET lock_timeout;
