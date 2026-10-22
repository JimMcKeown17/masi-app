-- Assessment Results Plan 3: current-year class history and gated downloads.
-- 1. Session-level bounds also protect CLI execution outside a transaction.
SET lock_timeout = '10s';
SET statement_timeout = '60s';

-- 2. Ownership has no year bound. Class scope includes exited memberships in
-- the active year, across programmes, but never delivery/group/creator scope.
create or replace function private.can_read_assessment(
  p_user_id uuid, p_child_id uuid, p_assessment_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
    or exists (
      select 1
      from public.class_ea_assignments cea
      join public.child_class_memberships ccm on ccm.class_id = cea.class_id
      join public.academic_years ay on ay.id = ccm.academic_year_id
      where cea.ea_user_id = (select auth.uid())
        and cea.unassigned_at is null
        and ccm.child_id = p_child_id
        and ay.is_active
        and p_assessment_date between ay.starts_on and ay.ends_on
    );
$$;
revoke execute on function private.can_read_assessment(uuid,uuid,date) from public, anon;
grant execute on function private.can_read_assessment(uuid,uuid,date) to authenticated;

drop policy if exists assessments_select_assigned_child_history on public.assessments;
drop policy if exists assessments_select_owner_or_class_year on public.assessments;
create policy assessments_select_owner_or_class_year on public.assessments
  for select to authenticated
  using (private.can_read_assessment(user_id, child_id, assessment_date));

drop policy if exists assessment_items_select_visible_assessment on public.assessment_items;
drop policy if exists assessment_items_select_readable_assessment on public.assessment_items;
create policy assessment_items_select_readable_assessment on public.assessment_items
  for select to authenticated
  using (exists (
    select 1 from public.assessments a
    where a.id = assessment_items.assessment_id
      and private.can_read_assessment(a.user_id, a.child_id, a.assessment_date)
  ));

drop policy if exists battery_runs_select_assigned_child_history on public.battery_runs;
drop policy if exists battery_runs_select_owner_or_class_year on public.battery_runs;
create policy battery_runs_select_owner_or_class_year on public.battery_runs
  for select to authenticated
  using (private.can_read_assessment(
    user_id, child_id, (started_at at time zone 'Africa/Johannesburg')::date
  ));

-- Plan 2's letter_mastery_select_writer_or_deliverer stays unchanged.

-- 3. Only definer RPCs may consult this switch. A present user row, including
-- false, wins over everyone; missing both means off.
create table if not exists private.history_pull_rollout (
  feature text not null check (feature in ('assessments','battery_runs','letter_mastery')),
  user_id uuid references auth.users(id) on delete cascade,
  enabled boolean not null,
  note text,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_history_pull_rollout_feature_user
  on private.history_pull_rollout (
    feature, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
alter table private.history_pull_rollout enable row level security;
revoke all privileges on private.history_pull_rollout from public, anon, authenticated;

insert into private.history_pull_rollout (feature, enabled)
select seed.feature, true
from (values ('assessments'), ('battery_runs'), ('letter_mastery')) as seed(feature)
where not exists (
  select 1 from private.history_pull_rollout existing
  where existing.feature = seed.feature and existing.user_id is null
);

create or replace function private.history_pull_enabled(p_feature text, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select r.enabled from private.history_pull_rollout r
      where r.feature = p_feature and r.user_id = p_user_id),
    (select r.enabled from private.history_pull_rollout r
      where r.feature = p_feature and r.user_id is null),
    false
  );
$$;
revoke execute on function private.history_pull_enabled(text,uuid) from public, anon, authenticated;

-- 4. Positive-grant keysets and class/year membership lookups for the pagers.
create index if not exists idx_assessments_owner_programme_updated
  on public.assessments (user_id, programme_id, updated_at, id);
create index if not exists idx_assessments_child_programme_updated
  on public.assessments (child_id, programme_id, updated_at, id);
create index if not exists idx_battery_runs_owner_programme_updated
  on public.battery_runs (user_id, programme_id, updated_at, id);
create index if not exists idx_battery_runs_child_programme_updated
  on public.battery_runs (child_id, programme_id, updated_at, id);
create index if not exists idx_child_class_memberships_class_year_child
  on public.child_class_memberships (class_id, academic_year_id, child_id);
create index if not exists idx_letter_mastery_changed_by_updated
  on public.letter_mastery (changed_by, updated_at, id);
create index if not exists idx_letter_mastery_child_updated
  on public.letter_mastery (child_id, updated_at, id);

-- 5. Complete immutable assessment families; Programme partitions, never grants.
create or replace function public.get_assessment_history_page(
  p_programme_id uuid,
  p_academic_year_id uuid,
  p_page_size integer default 50,
  p_after_updated_at timestamptz default null,
  p_after_id uuid default null,
  p_overlap_seconds integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  child_id uuid,
  programme_id uuid,
  assessment_tool_id uuid,
  assessment_window_id uuid,
  assessment_purpose text,
  grade_snapshot text,
  teacher_name_snapshot text,
  assessment_type text,
  capture_mode text,
  assessment_date date,
  score integer,
  total_items integer,
  notes text,
  question_code text,
  question_version text,
  item_set_id text,
  language text,
  stopped_reason text,
  duration_ms integer,
  derived jsonb,
  battery_run_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  items jsonb,
  battery_run jsonb,
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
  v_year public.academic_years%rowtype;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if not private.history_pull_enabled('assessments', v_actor_id) then
    raise exception using errcode = 'MR001', message = 'rollout_disabled';
  end if;
  if p_programme_id is null or p_academic_year_id is null then
    raise exception using errcode = '22023', message = 'Programme and academic year are required';
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
  select ay.* into v_year from public.academic_years ay where ay.is_active;
  if not found then
    raise exception using errcode = '55000', message = 'no_active_academic_year';
  end if;
  if v_year.id <> p_academic_year_id then
    raise exception using errcode = 'MR002', message = 'academic_year_mismatch';
  end if;

  v_after_updated_at := p_after_updated_at - pg_catalog.make_interval(secs => p_overlap_seconds);

  return query
  with owner_arm as (
    select a.id from public.assessments a
    where a.user_id = v_actor_id
      and a.programme_id = p_programme_id
      and a.question_code is not null
      and a.assessment_date between v_year.starts_on and v_year.ends_on
      and (p_after_updated_at is null
        or (a.updated_at, a.id) > (v_after_updated_at, p_after_id))
    order by a.updated_at, a.id
    limit p_page_size
  ),
  class_arm as (
    select a.id from public.assessments a
    where a.child_id in (
        select distinct ccm.child_id
        from public.class_ea_assignments cea
        join public.child_class_memberships ccm on ccm.class_id = cea.class_id
        where cea.ea_user_id = v_actor_id
          and cea.unassigned_at is null
          and ccm.academic_year_id = v_year.id
      )
      and a.programme_id = p_programme_id
      and a.question_code is not null
      and a.assessment_date between v_year.starts_on and v_year.ends_on
      and (p_after_updated_at is null
        or (a.updated_at, a.id) > (v_after_updated_at, p_after_id))
    order by a.updated_at, a.id
    limit p_page_size
  ),
  merged as (
    select o.id from owner_arm o
    union
    select g.id from class_arm g
  )
  select a.id, a.user_id, a.child_id, a.programme_id,
    a.assessment_tool_id, a.assessment_window_id, a.assessment_purpose, a.grade_snapshot,
    a.teacher_name_snapshot, a.assessment_type, a.capture_mode, a.assessment_date,
    a.score, a.total_items, a.notes, a.question_code,
    a.question_version, a.item_set_id, a.language, a.stopped_reason,
    a.duration_ms, a.derived, a.battery_run_id, a.created_at,
    a.updated_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'position', i.position, 'item_key', i.item_key, 'prompt', i.prompt,
        'response', i.response, 'is_correct', i.is_correct, 'metadata', i.metadata
      ) order by i.position)
      from public.assessment_items i where i.assessment_id = a.id
    ), '[]'::jsonb),
    -- A readable assessment grants this header even outside the run's year.
    -- This does not grant the run's other Questions or widen its own pager/RLS.
    case when r.id is null then null::jsonb else jsonb_build_object(
        'id', r.id,
        'user_id', r.user_id,
        'child_id', r.child_id,
        'programme_id', r.programme_id,
        'class_id', r.class_id,
        'battery_code', r.battery_code,
        'battery_version', r.battery_version,
        'assessment_purpose', r.assessment_purpose,
        'assessment_window_id', r.assessment_window_id,
        'language', r.language,
        'started_at', r.started_at,
        'completed_at', r.completed_at,
        'status', r.status,
        'notes', r.notes,
        'created_at', r.created_at,
        'updated_at', r.updated_at
      ) end,
    c.first_name, c.last_name, c.preferred_name
  from merged m
  join public.assessments a on a.id = m.id
  join public.children c on c.id = a.child_id
  left join public.battery_runs r on r.id = a.battery_run_id
  order by a.updated_at, a.id
  limit p_page_size;
end;
$$;
revoke execute on function public.get_assessment_history_page(uuid, uuid, integer, timestamptz, uuid, integer) from public, anon;
grant execute on function public.get_assessment_history_page(uuid, uuid, integer, timestamptz, uuid, integer) to authenticated;

-- 6. Runs have their own delta stream for zero-Question and status-only changes.
create or replace function public.get_battery_run_history_page(
  p_programme_id uuid,
  p_academic_year_id uuid,
  p_page_size integer default 200,
  p_after_updated_at timestamptz default null,
  p_after_id uuid default null,
  p_overlap_seconds integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  child_id uuid,
  programme_id uuid,
  class_id uuid,
  battery_code text,
  battery_version text,
  assessment_purpose text,
  assessment_window_id uuid,
  language text,
  started_at timestamptz,
  completed_at timestamptz,
  status text,
  notes text,
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
  v_year public.academic_years%rowtype;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if not private.history_pull_enabled('battery_runs', v_actor_id) then
    raise exception using errcode = 'MR001', message = 'rollout_disabled';
  end if;
  if p_programme_id is null or p_academic_year_id is null then
    raise exception using errcode = '22023', message = 'Programme and academic year are required';
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
  select ay.* into v_year from public.academic_years ay where ay.is_active;
  if not found then
    raise exception using errcode = '55000', message = 'no_active_academic_year';
  end if;
  if v_year.id <> p_academic_year_id then
    raise exception using errcode = 'MR002', message = 'academic_year_mismatch';
  end if;

  v_after_updated_at := p_after_updated_at - pg_catalog.make_interval(secs => p_overlap_seconds);

  return query
  with owner_arm as (
    select r.id from public.battery_runs r
    where r.user_id = v_actor_id
      and r.programme_id = p_programme_id
      and (r.started_at at time zone 'Africa/Johannesburg')::date between v_year.starts_on and v_year.ends_on
      and (p_after_updated_at is null
        or (r.updated_at, r.id) > (v_after_updated_at, p_after_id))
    order by r.updated_at, r.id
    limit p_page_size
  ),
  class_arm as (
    select r.id from public.battery_runs r
    where r.child_id in (
        select distinct ccm.child_id
        from public.class_ea_assignments cea
        join public.child_class_memberships ccm on ccm.class_id = cea.class_id
        where cea.ea_user_id = v_actor_id
          and cea.unassigned_at is null
          and ccm.academic_year_id = v_year.id
      )
      and r.programme_id = p_programme_id
      and (r.started_at at time zone 'Africa/Johannesburg')::date between v_year.starts_on and v_year.ends_on
      and (p_after_updated_at is null
        or (r.updated_at, r.id) > (v_after_updated_at, p_after_id))
    order by r.updated_at, r.id
    limit p_page_size
  ),
  merged as (
    select o.id from owner_arm o
    union
    select g.id from class_arm g
  )
  select r.id, r.user_id, r.child_id, r.programme_id,
    r.class_id, r.battery_code, r.battery_version, r.assessment_purpose,
    r.assessment_window_id, r.language, r.started_at, r.completed_at,
    r.status, r.notes, r.created_at, r.updated_at,
    c.first_name, c.last_name, c.preferred_name
  from merged m
  join public.battery_runs r on r.id = m.id
  join public.children c on c.id = r.child_id
  order by r.updated_at, r.id
  limit p_page_size;
end;
$$;
revoke execute on function public.get_battery_run_history_page(uuid, uuid, integer, timestamptz, uuid, integer) from public, anon;
grant execute on function public.get_battery_run_history_page(uuid, uuid, integer, timestamptz, uuid, integer) to authenticated;

-- 7. Current mastery: last writer or active deliverer, with no year/Programme filter.
create or replace function public.get_letter_mastery_page(
  p_after_updated_at timestamptz default null,
  p_after_id uuid default null,
  p_page_size integer default 200,
  p_overlap_seconds integer default 0
)
returns table (
  id uuid,
  child_id uuid,
  letter text,
  language text,
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
  if not private.history_pull_enabled('letter_mastery', v_actor_id) then
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
    select lm.id from public.letter_mastery lm
    where lm.changed_by = v_actor_id
      and (p_after_updated_at is null
        or (lm.updated_at, lm.id) > (v_after_updated_at, p_after_id))
    order by lm.updated_at, lm.id
    limit p_page_size
  ),
  delivery_arm as (
    select lm.id from public.letter_mastery lm
    where lm.child_id in (
        select distinct cea.child_id
        from public.child_ea_assignments cea
        where cea.user_id = v_actor_id and cea.unassigned_at is null
      )
      and (p_after_updated_at is null
        or (lm.updated_at, lm.id) > (v_after_updated_at, p_after_id))
    order by lm.updated_at, lm.id
    limit p_page_size
  ),
  merged as (
    select o.id from owner_arm o
    union
    select g.id from delivery_arm g
  )
  select lm.id, lm.child_id, lm.letter, lm.language,
    lm.confirmed, lm.changed_at, lm.correction_id, lm.changed_by,
    lm.programme_id, lm.created_at, lm.updated_at,
    c.first_name, c.last_name, c.preferred_name
  from merged m
  join public.letter_mastery lm on lm.id = m.id
  join public.children c on c.id = lm.child_id
  order by lm.updated_at, lm.id
  limit p_page_size;
end;
$$;
revoke execute on function public.get_letter_mastery_page(timestamptz, uuid, integer, integer) from public, anon;
grant execute on function public.get_letter_mastery_page(timestamptz, uuid, integer, integer) to authenticated;

notify pgrst, 'reload schema';
RESET statement_timeout;
RESET lock_timeout;
