-- Numeracy Track B: parallel receipt-backed current skill mastery.
SET lock_timeout = '10s';
SET statement_timeout = '60s';

create or replace function private.skill_mastery_id(p_child_id uuid, p_step_key text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select extensions.uuid_generate_v5(
    '20002406-1d97-4087-b350-a8d41515dd39'::uuid,
    pg_catalog.concat_ws(pg_catalog.chr(31), 'skill_mastery', p_child_id::text, p_step_key)
  );
$$;
revoke execute on function private.skill_mastery_id(uuid,text)
  from public, anon, authenticated, authenticator, service_role;

-- Top-level table declaration is consumed by the server-column contract parser.
-- A rerun preserves rows; both child foreign keys prevent a concurrent delete
-- from erasing an acknowledged correction after the history guard has run.
create table if not exists public.skill_mastery (
  id uuid primary key,
  child_id uuid not null references public.children(id) on delete restrict,
  step_key text not null,
  confirmed boolean not null,
  changed_at timestamptz not null,
  correction_id uuid not null,
  changed_by uuid not null references auth.users(id) on delete restrict,
  programme_id uuid references public.programmes(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint skill_mastery_child_step_key_key unique (child_id, step_key),
  constraint skill_mastery_step_key_chk check (step_key ~ '^[a-z_]+\.[0-9a-z]+$')
);
create index if not exists skill_mastery_changed_by_idx on public.skill_mastery(changed_by);
create index if not exists idx_skill_mastery_changed_by_updated on public.skill_mastery(changed_by, updated_at, id);
create index if not exists idx_skill_mastery_child_updated on public.skill_mastery(child_id, updated_at, id);
drop trigger if exists skill_mastery_set_updated_at on public.skill_mastery;
create trigger skill_mastery_set_updated_at before insert or update on public.skill_mastery
  for each row execute function private.set_updated_at();
alter table public.skill_mastery enable row level security;
-- Hosted default privileges grant ALL on new public tables to anon and authenticated,
-- including TRUNCATE, REFERENCES and TRIGGER, which RLS does not filter. Start from
-- nothing, then grant only SELECT (the policy filters rows; it grants no privilege).
revoke all privileges on public.skill_mastery from public, anon, authenticated;
grant select on public.skill_mastery to authenticated;
grant select, insert, update, delete on public.skill_mastery to service_role;

create table if not exists public.skill_mastery_corrections (
  correction_id uuid not null,
  child_id uuid not null references public.children(id) on delete restrict,
  step_key text not null,
  confirmed boolean not null,
  requested_at timestamptz not null,
  effective_at timestamptz not null,
  changed_by uuid not null references auth.users(id) on delete restrict,
  programme_id uuid references public.programmes(id) on delete restrict,
  received_at timestamptz not null default pg_catalog.now(),
  constraint skill_mastery_corrections_pkey primary key (correction_id)
);
create index if not exists skill_mastery_corrections_child_step_key_idx
  on public.skill_mastery_corrections(child_id, step_key);
alter table public.skill_mastery_corrections enable row level security;
revoke all privileges on public.skill_mastery_corrections from public, anon, authenticated;
grant select, insert, update, delete on public.skill_mastery_corrections to service_role;

drop policy if exists skill_mastery_select_writer_or_deliverer on public.skill_mastery;
create policy skill_mastery_select_writer_or_deliverer on public.skill_mastery
  for select to authenticated
  using (changed_by = (select auth.uid()) or (select private.current_user_delivers_to_child(child_id)));

create or replace function public.set_skill_mastery(
  p_correction_id uuid, p_child_id uuid, p_step_key text,
  p_confirmed boolean, p_changed_at timestamptz
)
returns table (
  outcome text, confirmed boolean, changed_at timestamptz, correction_id uuid, changed_by uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_actor uuid := (select auth.uid());
  v_receipt public.skill_mastery_corrections%rowtype;
  v_record public.skill_mastery%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_correction_id is null or p_child_id is null or p_step_key is null or p_confirmed is null or p_changed_at is null
    or p_step_key !~ '^[a-z_]+\.[0-9a-z]+$'
  then
    raise exception using errcode = '22023', message = 'Malformed skill mastery correction';
  end if;

  if not exists (
    select 1 from public.skill_mastery_corrections r where r.correction_id = p_correction_id
  ) then
    if private.current_user_delivers_to_child(p_child_id) is not true then
      raise exception using errcode = '42501', message = 'Active child delivery assignment required';
    end if;
    insert into public.skill_mastery_corrections (
      correction_id, child_id, step_key, confirmed, requested_at,
      effective_at, changed_by, programme_id, received_at
    ) values (
      p_correction_id, p_child_id, p_step_key, p_confirmed, p_changed_at,
      least(p_changed_at, pg_catalog.now()), v_actor,
      (select spa.programme_id from public.staff_programme_assignments spa
       where spa.user_id = v_actor and spa.ended_at is null),
      pg_catalog.now()
    )
    on conflict on constraint skill_mastery_corrections_pkey do nothing;
  end if;

  select r.* into v_receipt from public.skill_mastery_corrections r
  where r.correction_id = p_correction_id;
  if v_receipt.changed_by is distinct from v_actor
    or v_receipt.child_id is distinct from p_child_id
    or v_receipt.step_key is distinct from p_step_key
    or v_receipt.confirmed is distinct from p_confirmed
    or v_receipt.requested_at is distinct from p_changed_at
  then
    raise exception using errcode = 'MA001', message = 'Correction id payload mismatch';
  end if;

  insert into public.skill_mastery as sm (
    id, child_id, step_key, confirmed, changed_at, correction_id, changed_by, programme_id
  ) values (
    private.skill_mastery_id(v_receipt.child_id, v_receipt.step_key),
    v_receipt.child_id, v_receipt.step_key, v_receipt.confirmed,
    v_receipt.effective_at, v_receipt.correction_id, v_receipt.changed_by, v_receipt.programme_id
  )
  on conflict on constraint skill_mastery_child_step_key_key do update
    set confirmed = excluded.confirmed, changed_at = excluded.changed_at,
        correction_id = excluded.correction_id, changed_by = excluded.changed_by,
        programme_id = excluded.programme_id
    where (excluded.changed_at, excluded.correction_id) > (sm.changed_at, sm.correction_id);

  select sm.* into v_record from public.skill_mastery sm
  where sm.child_id = v_receipt.child_id and sm.step_key = v_receipt.step_key;
  if v_record.changed_by = v_actor or private.current_user_delivers_to_child(v_record.child_id) then
    return query select
      case when v_record.correction_id = p_correction_id then 'applied'::text else 'superseded'::text end,
      v_record.confirmed, v_record.changed_at, v_record.correction_id, v_record.changed_by;
  else
    return query select 'acknowledged'::text, null::boolean, null::timestamptz, null::uuid, null::uuid;
  end if;
end;
$$;
revoke execute on function public.set_skill_mastery(uuid,uuid,text,boolean,timestamptz)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.set_skill_mastery(uuid,uuid,text,boolean,timestamptz)
  to authenticated;

alter table private.history_pull_rollout
  drop constraint if exists history_pull_rollout_feature_check,
  add constraint history_pull_rollout_feature_check
    check (feature in ('assessments','battery_runs','letter_mastery','skill_mastery'));
insert into private.history_pull_rollout(feature, enabled)
select 'skill_mastery', true
where not exists (
  select 1 from private.history_pull_rollout where feature = 'skill_mastery' and user_id is null
);

create or replace function public.get_skill_mastery_page(
  p_after_updated_at timestamptz default null,
  p_after_id uuid default null,
  p_page_size integer default 200,
  p_overlap_seconds integer default 0
)
returns table (
  id uuid,
  child_id uuid,
  step_key text,
  confirmed boolean,
  changed_at timestamptz,
  correction_id uuid,
  changed_by uuid,
  programme_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  child_first_name text,
  child_last_name text,
  child_preferred_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_after_updated_at timestamptz;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if not private.history_pull_enabled('skill_mastery', v_actor_id) then
    raise exception using errcode = 'MR001', message = 'rollout_disabled';
  end if;
  if p_page_size is null or p_page_size < 1 or p_page_size > 200 then
    raise exception using errcode = '22023', message = 'p_page_size must be between 1 and 200';
  end if;
  if p_overlap_seconds is null or p_overlap_seconds < 0 or p_overlap_seconds > 600 then
    raise exception using errcode = '22023', message = 'p_overlap_seconds must be between 0 and 600';
  end if;
  if (p_after_updated_at is null) <> (p_after_id is null) then
    raise exception using errcode = '22023', message = 'The history cursor must be wholly null or wholly populated';
  end if;

  v_after_updated_at := p_after_updated_at - pg_catalog.make_interval(secs => p_overlap_seconds);

  return query
  with owner_arm as (
    select sm.id from public.skill_mastery sm
    where sm.changed_by = v_actor_id
      and (p_after_updated_at is null
        or (sm.updated_at, sm.id) > (v_after_updated_at, p_after_id))
    order by sm.updated_at, sm.id
    limit p_page_size
  ),
  delivery_arm as (
    select sm.id from public.skill_mastery sm
    where sm.child_id in (
        select distinct cea.child_id
        from public.child_ea_assignments cea
        where cea.user_id = v_actor_id and cea.unassigned_at is null
      )
      and (p_after_updated_at is null
        or (sm.updated_at, sm.id) > (v_after_updated_at, p_after_id))
    order by sm.updated_at, sm.id
    limit p_page_size
  ),
  merged as (
    select o.id from owner_arm o
    union
    select g.id from delivery_arm g
  )
  select sm.id, sm.child_id, sm.step_key,
    sm.confirmed, sm.changed_at, sm.correction_id, sm.changed_by,
    sm.programme_id, sm.created_at, sm.updated_at,
    c.first_name, c.last_name, c.preferred_name
  from merged m
  join public.skill_mastery sm on sm.id = m.id
  join public.children c on c.id = sm.child_id
  order by sm.updated_at, sm.id
  limit p_page_size;
end;
$$;
revoke execute on function public.get_skill_mastery_page(timestamptz, uuid, integer, integer)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.get_skill_mastery_page(timestamptz, uuid, integer, integer) to authenticated;

create or replace function private.child_has_delete_blocking_history(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.session_attendees
    where child_id = p_child_id
  )
  or exists (
    select 1
    from public.assessments
    where child_id = p_child_id
  )
  or exists (
    select 1
    from public.letter_mastery
    where child_id = p_child_id
  )
  or exists (
    select 1
    from public.child_group_memberships
    where child_id = p_child_id
  )
  or exists (
    select 1
    from public.child_ea_assignments
    where child_id = p_child_id
      and unassigned_at is not null
  )
  or exists (
    select 1
    from public.child_programme_enrollments
    where child_id = p_child_id
      and ended_at is not null
  )
  or exists (
    select 1
    from public.child_class_memberships
    where child_id = p_child_id
      and exited_at is not null
  )
  or exists (
    select 1
    from public.battery_runs
    where child_id = p_child_id
  )
  or exists (
    select 1 from public.skill_mastery where child_id = p_child_id
  );
$$;
-- Preserve the existing authenticated grant on this pre-existing helper.
revoke execute on function private.child_has_delete_blocking_history(uuid) from public, anon;

CREATE OR REPLACE FUNCTION public.masi_reporting_accounts_v1()
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
          (SELECT pg_catalog.max(sm.received_at) FROM public.skill_mastery_corrections sm WHERE sm.changed_by=u.id),
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

notify pgrst, 'reload schema';
RESET statement_timeout;
RESET lock_timeout;
