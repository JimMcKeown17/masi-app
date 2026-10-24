-- Whole-Class Assessment Access Task 1. Additive; schema_version remains 1.
SET lock_timeout = '10s';
SET statement_timeout = '60s';

-- A grant must intersect the Johannesburg day, and class/group grant and
-- membership intervals must intersect each other as well. Current authority
-- remains a separate OR arm in the two public write boundaries below.
create or replace function private.user_held_grant_on(p_child uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with day_bounds as (
    select (p_day::timestamp at time zone 'Africa/Johannesburg') as ds,
           ((p_day + 1)::timestamp at time zone 'Africa/Johannesburg') as de
  )
  select p_day <= (pg_catalog.now() at time zone 'Africa/Johannesburg')::date
    and exists (
      select 1 from public.academic_years ay
      where ay.is_active and p_day between ay.starts_on and ay.ends_on
    )
    and (
      exists (
        select 1 from public.child_ea_assignments cea
        cross join day_bounds d
        where cea.user_id = (select auth.uid()) and cea.child_id = p_child
          and cea.assigned_at < d.de
          and coalesce(cea.unassigned_at, 'infinity'::timestamptz) > d.ds
      )
      or exists (
        select 1 from public.class_ea_assignments cea
        join public.child_class_memberships m on m.class_id = cea.class_id
        cross join day_bounds d
        where cea.ea_user_id = (select auth.uid()) and m.child_id = p_child
          and greatest(cea.assigned_at, m.enrolled_at) < least(
            coalesce(cea.unassigned_at, 'infinity'::timestamptz),
            coalesce(m.exited_at, 'infinity'::timestamptz))
          and greatest(cea.assigned_at, m.enrolled_at) < d.de
          and least(coalesce(cea.unassigned_at, 'infinity'::timestamptz),
            coalesce(m.exited_at, 'infinity'::timestamptz)) > d.ds
      )
      or exists (
        select 1 from public.group_ea_assignments gea
        join public.child_group_memberships m on m.group_id = gea.group_id
        cross join day_bounds d
        where gea.ea_user_id = (select auth.uid()) and m.child_id = p_child
          and greatest(gea.assigned_at, m.joined_at) < least(
            coalesce(gea.unassigned_at, 'infinity'::timestamptz),
            coalesce(m.removed_at, 'infinity'::timestamptz))
          and greatest(gea.assigned_at, m.joined_at) < d.de
          and least(coalesce(gea.unassigned_at, 'infinity'::timestamptz),
            coalesce(m.removed_at, 'infinity'::timestamptz)) > d.ds
      )
    );
$$;

-- Only the definer RPCs need this helper. Revoke Supabase default ACLs too.
revoke all on function private.user_held_grant_on(uuid, date)
  from public, anon, authenticated, authenticator, service_role;

create or replace function public.submit_assessment(p_assessment jsonb, p_items jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_in public.assessments%rowtype;
  v_existing public.assessments%rowtype;
  v_key text;
  v_item jsonb;
  v_item_id uuid;
  v_position integer;
  v_item_ids uuid[] := array[]::uuid[];
  v_positions integer[] := array[]::integer[];
  v_stored_item_ids uuid[];
  v_constraint text;
begin
  -- 1. Caller, including on retries.
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  begin
    v_in.user_id := (p_assessment ->> 'user_id')::uuid;
  exception when data_exception then
    raise exception 'Invalid assessment user_id' using errcode = '22023';
  end;
  -- A missing user_id is rejected by the required-field check below.
  if v_in.user_id <> v_actor_id then
    raise exception 'Assessment belongs to another EA' using errcode = '42501';
  end if;

  -- 2. Validate before any mutation. Cast failures are malformed payloads too.
  begin
    if pg_catalog.jsonb_typeof(p_assessment) is distinct from 'object' then
      raise exception 'Assessment must be an object' using errcode = '22023';
    end if;
    foreach v_key in array array[
      'id', 'user_id', 'child_id', 'programme_id', 'assessment_type', 'assessment_date',
      'assessment_purpose', 'question_code', 'question_version', 'item_set_id',
      'language', 'stopped_reason'
    ] loop
      if pg_catalog.jsonb_typeof(p_assessment -> v_key) is distinct from 'string'
        or pg_catalog.btrim(p_assessment ->> v_key) = '' then
        raise exception 'Missing or invalid assessment field: %', v_key using errcode = '22023';
      end if;
    end loop;
    foreach v_key in array array[
      'assessment_tool_id', 'battery_run_id', 'assessment_window_id', 'created_at',
      'capture_mode', 'notes', 'grade_snapshot', 'teacher_name_snapshot'
    ] loop
      if p_assessment ->> v_key is not null
        and pg_catalog.jsonb_typeof(p_assessment -> v_key) <> 'string' then
        raise exception 'Invalid assessment field: %', v_key using errcode = '22023';
      end if;
    end loop;
    if (p_assessment ->> 'language') !~ '^[a-z]{2}$'
      or (p_assessment ->> 'stopped_reason') not in (
        'completed', 'timer', 'ea_ended', 'stop_rule',
        'skipped_child_refused', 'skipped_tired', 'skipped_time', 'skipped_age',
        'skipped_prerequisite_unmet', 'skipped_other'
      )
      or pg_catalog.jsonb_typeof(p_assessment -> 'derived') is distinct from 'object'
      or pg_catalog.jsonb_typeof(p_assessment -> 'total_items') is distinct from 'number'
      or (p_assessment ->> 'total_items') !~ '^[0-9]+$' then
      raise exception 'Invalid result shape' using errcode = '22023';
    end if;
    if p_assessment ->> 'score' is not null and (
      pg_catalog.jsonb_typeof(p_assessment -> 'score') <> 'number'
      or (p_assessment ->> 'score') !~ '^-?[0-9]+$'
    ) then
      raise exception 'Score must be an integer or null' using errcode = '22023';
    end if;
    if p_assessment ->> 'duration_ms' is not null and (
      pg_catalog.jsonb_typeof(p_assessment -> 'duration_ms') <> 'number'
      or (p_assessment ->> 'duration_ms') !~ '^[0-9]+$'
    ) then
      raise exception 'Duration must be a non-negative integer or null' using errcode = '22023';
    end if;

    v_in.id := (p_assessment ->> 'id')::uuid;
    v_in.child_id := (p_assessment ->> 'child_id')::uuid;
    v_in.programme_id := (p_assessment ->> 'programme_id')::uuid;
    v_in.assessment_tool_id := (p_assessment ->> 'assessment_tool_id')::uuid;
    v_in.battery_run_id := (p_assessment ->> 'battery_run_id')::uuid;
    v_in.assessment_window_id := (p_assessment ->> 'assessment_window_id')::uuid;
    v_in.assessment_type := p_assessment ->> 'assessment_type';
    v_in.assessment_date := (p_assessment ->> 'assessment_date')::date;
    v_in.assessment_purpose := p_assessment ->> 'assessment_purpose';
    v_in.question_code := p_assessment ->> 'question_code';
    v_in.question_version := p_assessment ->> 'question_version';
    v_in.item_set_id := p_assessment ->> 'item_set_id';
    v_in.language := p_assessment ->> 'language';
    v_in.stopped_reason := p_assessment ->> 'stopped_reason';
    v_in.duration_ms := (p_assessment ->> 'duration_ms')::integer;
    v_in.derived := p_assessment -> 'derived';
    v_in.score := (p_assessment ->> 'score')::integer;
    v_in.total_items := (p_assessment ->> 'total_items')::integer;
    v_in.capture_mode := p_assessment ->> 'capture_mode';
    v_in.notes := p_assessment ->> 'notes';
    v_in.grade_snapshot := p_assessment ->> 'grade_snapshot';
    v_in.teacher_name_snapshot := p_assessment ->> 'teacher_name_snapshot';
    v_in.created_at := coalesce((p_assessment ->> 'created_at')::timestamptz, pg_catalog.now());

    -- Separate checks: jsonb_array_length must never run against a non-array.
    if pg_catalog.jsonb_typeof(p_items) is distinct from 'array' then
      raise exception 'Items must be an array' using errcode = '22023';
    end if;
    if pg_catalog.jsonb_array_length(p_items) <> v_in.total_items then
      raise exception 'Item count differs from total_items' using errcode = '22023';
    end if;
    for v_item in select e.value from pg_catalog.jsonb_array_elements(p_items) as e(value) loop
      if pg_catalog.jsonb_typeof(v_item) is distinct from 'object'
        or pg_catalog.jsonb_typeof(v_item -> 'id') is distinct from 'string'
        or pg_catalog.jsonb_typeof(v_item -> 'assessment_id') is distinct from 'string'
        or pg_catalog.jsonb_typeof(v_item -> 'position') is distinct from 'number'
        or (v_item ->> 'position') !~ '^[0-9]+$'
        or pg_catalog.jsonb_typeof(v_item -> 'item_key') is distinct from 'string'
        or pg_catalog.btrim(v_item ->> 'item_key') = ''
        or pg_catalog.jsonb_typeof(v_item -> 'is_correct') is distinct from 'boolean'
        or pg_catalog.jsonb_typeof(v_item -> 'metadata') is distinct from 'object' then
        raise exception 'Malformed assessment item' using errcode = '22023';
      end if;
      v_item_id := (v_item ->> 'id')::uuid;
      v_position := (v_item ->> 'position')::integer;
      if (v_item ->> 'assessment_id')::uuid is distinct from v_in.id
        or v_item_id = any(v_item_ids)
        or v_position = any(v_positions) then
        raise exception 'Item parent, id or position is invalid' using errcode = '22023';
      end if;
      foreach v_key in array array['prompt', 'response', 'created_at'] loop
        if v_item ->> v_key is not null and pg_catalog.jsonb_typeof(v_item -> v_key) <> 'string' then
          raise exception 'Invalid item field: %', v_key using errcode = '22023';
        end if;
      end loop;
      -- Check the optional timestamp before the insert block as well.
      perform (v_item ->> 'created_at')::timestamptz;
      v_item_ids := pg_catalog.array_append(v_item_ids, v_item_id);
      v_positions := pg_catalog.array_append(v_positions, v_position);
    end loop;
  exception when data_exception then
    raise exception 'Malformed assessment payload: %', sqlerrm using errcode = '22023';
  end;

  -- 3. A committed family is confirmed before checking current assignments.
  if not exists (select 1 from public.assessments a where a.id = v_in.id) then
    -- 4. New family authority.
    if (private.current_user_can_write_for_child(v_in.child_id)
      or private.user_held_grant_on(v_in.child_id, v_in.assessment_date)) is not true
      or not exists (
        select 1 from public.staff_programme_assignments spa
        where spa.user_id = v_actor_id and spa.programme_id = v_in.programme_id
          and spa.ended_at is null
      ) then
      raise exception 'No authority to submit assessment' using errcode = '42501';
    end if;
    -- 5. A late Question may belong to a completed or abandoned run.
    if v_in.battery_run_id is not null and not exists (
      select 1 from public.battery_runs r
      where r.id = v_in.battery_run_id and r.user_id = v_actor_id
        and r.child_id = v_in.child_id and r.programme_id = v_in.programme_id
    ) then
      raise exception 'Assessment run does not match caller, child and programme' using errcode = '42501';
    end if;

    begin
      insert into public.assessments (
        id, user_id, child_id, programme_id, assessment_tool_id, assessment_type,
        assessment_date, score, total_items, notes, assessment_purpose,
        assessment_window_id, grade_snapshot, teacher_name_snapshot, capture_mode,
        question_code, question_version, item_set_id, language, stopped_reason,
        duration_ms, derived, battery_run_id, created_at, updated_at
      ) values (
        v_in.id, v_in.user_id, v_in.child_id, v_in.programme_id, v_in.assessment_tool_id,
        v_in.assessment_type, v_in.assessment_date, v_in.score, v_in.total_items,
        v_in.notes, v_in.assessment_purpose, v_in.assessment_window_id,
        v_in.grade_snapshot, v_in.teacher_name_snapshot, v_in.capture_mode,
        v_in.question_code, v_in.question_version, v_in.item_set_id, v_in.language,
        v_in.stopped_reason, v_in.duration_ms, v_in.derived, v_in.battery_run_id,
        v_in.created_at, pg_catalog.now()
      );
      insert into public.assessment_items (
        id, assessment_id, item_key, prompt, response, is_correct, position, metadata, created_at, updated_at
      )
      select (e.value ->> 'id')::uuid, v_in.id, e.value ->> 'item_key',
        e.value ->> 'prompt', e.value ->> 'response', (e.value ->> 'is_correct')::boolean,
        (e.value ->> 'position')::integer, e.value -> 'metadata',
        coalesce((e.value ->> 'created_at')::timestamptz, v_in.created_at), pg_catalog.now()
      from pg_catalog.jsonb_array_elements(p_items) as e(value);
      return 'inserted';
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'assessments_pkey' then
        raise; -- Includes assessments_battery_run_question_key; preserve 23505.
      end if;
    end;
  end if;

  -- 6. Also reached after an overlapping insert committed while ours waited.
  select a.* into v_existing from public.assessments a where a.id = v_in.id;
  if not found then
    raise exception 'Assessment family is missing after conflict' using errcode = 'MA001';
  end if;
  select coalesce(pg_catalog.array_agg(i.id order by i.id), array[]::uuid[])
    into v_stored_item_ids from public.assessment_items i where i.assessment_id = v_in.id;
  select coalesce(pg_catalog.array_agg(i.id order by i.id), array[]::uuid[])
    into v_item_ids from pg_catalog.unnest(v_item_ids) as i(id);
  if v_existing.user_id is distinct from v_actor_id
    or v_existing.child_id is distinct from v_in.child_id
    or v_existing.programme_id is distinct from v_in.programme_id
    or v_existing.battery_run_id is distinct from v_in.battery_run_id
    or v_existing.question_code is distinct from v_in.question_code
    or v_existing.item_set_id is distinct from v_in.item_set_id
    or v_stored_item_ids is distinct from v_item_ids then
    raise exception 'Assessment family identity mismatch' using errcode = 'MA001';
  end if;
  return 'already_present';
end;
$$;

revoke all on function public.submit_assessment(jsonb, jsonb)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.submit_assessment(jsonb, jsonb) to authenticated;

create or replace function public.save_battery_run(p_run jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_in public.battery_runs%rowtype;
  v_existing public.battery_runs%rowtype;
  v_key text;
  v_constraint text;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  begin
    v_in.user_id := (p_run ->> 'user_id')::uuid;
  exception when data_exception then
    raise exception 'Invalid run user_id' using errcode = '22023';
  end;
  -- A missing user_id is rejected by the required-field check below.
  if v_in.user_id <> v_actor_id then
    raise exception 'Run belongs to another EA' using errcode = '42501';
  end if;

  begin
    if pg_catalog.jsonb_typeof(p_run) is distinct from 'object' then
      raise exception 'Run must be an object' using errcode = '22023';
    end if;
    foreach v_key in array array[
      'id', 'user_id', 'child_id', 'programme_id', 'battery_code', 'battery_version',
      'assessment_purpose', 'language', 'started_at', 'status'
    ] loop
      if pg_catalog.jsonb_typeof(p_run -> v_key) is distinct from 'string'
        or pg_catalog.btrim(p_run ->> v_key) = '' then
        raise exception 'Missing or invalid run field: %', v_key using errcode = '22023';
      end if;
    end loop;
    foreach v_key in array array['class_id', 'assessment_window_id', 'completed_at', 'notes', 'created_at'] loop
      if p_run ->> v_key is not null and pg_catalog.jsonb_typeof(p_run -> v_key) <> 'string' then
        raise exception 'Invalid run field: %', v_key using errcode = '22023';
      end if;
    end loop;
    if (p_run ->> 'language') !~ '^[a-z]{2}$'
      or (p_run ->> 'status') not in ('in_progress', 'completed', 'abandoned')
      or ((p_run ->> 'completed_at') is not null) <> ((p_run ->> 'status') = 'completed') then
      raise exception 'Invalid run language, status or completed_at' using errcode = '22023';
    end if;
    v_in.id := (p_run ->> 'id')::uuid;
    v_in.child_id := (p_run ->> 'child_id')::uuid;
    v_in.programme_id := (p_run ->> 'programme_id')::uuid;
    v_in.class_id := (p_run ->> 'class_id')::uuid;
    v_in.battery_code := p_run ->> 'battery_code';
    v_in.battery_version := p_run ->> 'battery_version';
    v_in.assessment_purpose := p_run ->> 'assessment_purpose';
    v_in.assessment_window_id := (p_run ->> 'assessment_window_id')::uuid;
    v_in.language := p_run ->> 'language';
    v_in.started_at := (p_run ->> 'started_at')::timestamptz;
    v_in.completed_at := (p_run ->> 'completed_at')::timestamptz;
    v_in.status := p_run ->> 'status';
    v_in.notes := p_run ->> 'notes';
    v_in.created_at := coalesce((p_run ->> 'created_at')::timestamptz, pg_catalog.now());
  exception when data_exception then
    raise exception 'Malformed run payload: %', sqlerrm using errcode = '22023';
  end;

  if not exists (select 1 from public.battery_runs r where r.id = v_in.id) then
    if (private.current_user_can_write_for_child(v_in.child_id)
      or private.user_held_grant_on(v_in.child_id,
        (v_in.started_at at time zone 'Africa/Johannesburg')::date)) is not true
      or not exists (
        select 1 from public.staff_programme_assignments spa
        where spa.user_id = v_actor_id and spa.programme_id = v_in.programme_id
          and spa.ended_at is null
      ) then
      raise exception 'No authority to start run' using errcode = '42501';
    end if;
    if v_in.class_id is not null and not exists (
      select 1 from public.child_class_memberships ccm
      where ccm.child_id = v_in.child_id and ccm.class_id = v_in.class_id
        and ccm.enrolled_at <= v_in.started_at
        and (ccm.exited_at is null or ccm.exited_at > v_in.started_at)
    ) then
      raise exception 'Child was not in the run class at started_at' using errcode = '42501';
    end if;
    begin
      insert into public.battery_runs (
        id, battery_code, battery_version, child_id, user_id, programme_id, class_id,
        assessment_purpose, assessment_window_id, language, started_at, completed_at,
        status, notes, created_at, updated_at
      ) values (
        v_in.id, v_in.battery_code, v_in.battery_version, v_in.child_id, v_in.user_id,
        v_in.programme_id, v_in.class_id, v_in.assessment_purpose, v_in.assessment_window_id,
        v_in.language, v_in.started_at, v_in.completed_at, v_in.status, v_in.notes,
        v_in.created_at, pg_catalog.now()
      );
      return 'inserted';
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'battery_runs_pkey' then
        raise;
      end if;
    end;
  end if;

  -- Existing runs require ownership only. Lock before inspecting the lifecycle
  -- so two finalizers cannot both decide from an old in_progress snapshot.
  select r.* into v_existing from public.battery_runs r where r.id = v_in.id for update;
  if not found then
    raise exception 'Run is missing after conflict' using errcode = 'MA001';
  end if;
  if v_existing.user_id is distinct from v_actor_id
    or v_existing.child_id is distinct from v_in.child_id
    or v_existing.programme_id is distinct from v_in.programme_id
    or v_existing.class_id is distinct from v_in.class_id
    or v_existing.battery_code is distinct from v_in.battery_code
    or v_existing.battery_version is distinct from v_in.battery_version
    or v_existing.language is distinct from v_in.language
    or v_existing.started_at is distinct from v_in.started_at then
    raise exception 'Run identity mismatch' using errcode = 'MA001';
  end if;
  -- An old open payload has no completed_at; it must not conflict with a close.
  if v_in.status = 'in_progress' then
    return 'unchanged';
  end if;
  if v_existing.status = 'in_progress' then
    update public.battery_runs
      set status = v_in.status, completed_at = v_in.completed_at
      where id = v_in.id;
    -- Notes remain the original capture; only the lifecycle changes.
    return 'updated';
  end if;
  if v_existing.status is distinct from v_in.status
    or v_existing.completed_at is distinct from v_in.completed_at then
    raise exception 'Conflicting terminal run status or completed_at' using errcode = 'MA002';
  end if;
  return 'unchanged';
end;
$$;

revoke all on function public.save_battery_run(jsonb)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.save_battery_run(jsonb) to authenticated;

create or replace function private.get_reconcile_acknowledgments()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_active_programme_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required for reconcile acknowledgments'
      using errcode = '42501';
  end if;

  select spa.programme_id
  into v_active_programme_id
  from public.staff_programme_assignments spa
  where spa.user_id = v_user_id
    and spa.ended_at is null
  order by spa.assigned_at desc, spa.id desc
  limit 1;

  return (
    with child_assignments as (
      select cea.id, cea.child_id
      from public.child_ea_assignments cea
      where cea.user_id = v_user_id
        and cea.unassigned_at is null
    ),
    visible_children as (
      select distinct ca.child_id
      from child_assignments ca
      join public.child_programme_enrollments cpe
        on cpe.child_id = ca.child_id
       and cpe.programme_id = v_active_programme_id
       and cpe.ended_at is null
    ),
    programme_enrollments as (
      select cpe.id
      from public.child_programme_enrollments cpe
      join child_assignments ca on ca.child_id = cpe.child_id
      where cpe.programme_id = v_active_programme_id
        and cpe.ended_at is null
    ),
    class_memberships as (
      select ccm.id
      from public.child_class_memberships ccm
      join visible_children vc on vc.child_id = ccm.child_id
      where ccm.exited_at is null
    ),
    class_assignments as (
      select cea.id, cea.class_id
      from public.class_ea_assignments cea
      where cea.ea_user_id = v_user_id
        and cea.programme_id = v_active_programme_id
        and cea.unassigned_at is null
    ),
    roster_memberships as (
      select ccm.id
      from public.child_class_memberships ccm
      join class_assignments ca on ca.class_id = ccm.class_id
      where ccm.exited_at is null
    ),
    group_assignments as (
      select gea.id, gea.group_id
      from public.group_ea_assignments gea
      join public.groups g on g.id = gea.group_id
      where gea.ea_user_id = v_user_id
        and gea.programme_id = v_active_programme_id
        and gea.unassigned_at is null
        and g.programme_id = v_active_programme_id
    ),
    group_memberships as (
      select cgm.id
      from public.child_group_memberships cgm
      join group_assignments ga on ga.group_id = cgm.group_id
      where cgm.removed_at is null
    )
    select jsonb_build_object(
      'schema_version', 1,
      'complete', true,
      'user_id', v_user_id,
      'generated_at', transaction_timestamp(),
      'active_programme_id', v_active_programme_id,
      'child_ea_assignment_ids', coalesce(
        (select jsonb_agg(ca.id order by ca.id) from child_assignments ca),
        '[]'::jsonb
      ),
      'assigned_child_ids', coalesce(
        (select jsonb_agg(ca.child_id order by ca.child_id) from child_assignments ca),
        '[]'::jsonb
      ),
      'visible_child_ids', coalesce(
        (select jsonb_agg(vc.child_id order by vc.child_id) from visible_children vc),
        '[]'::jsonb
      ),
      'child_programme_enrollment_ids', coalesce(
        (select jsonb_agg(pe.id order by pe.id) from programme_enrollments pe),
        '[]'::jsonb
      ),
      'child_class_membership_ids', coalesce(
        (select jsonb_agg(cm.id order by cm.id) from class_memberships cm),
        '[]'::jsonb
      ),
      'class_ea_assignment_ids', coalesce(
        (select jsonb_agg(ca.id order by ca.id) from class_assignments ca),
        '[]'::jsonb
      ),
      'class_ids', coalesce(
        (select jsonb_agg(ca.class_id order by ca.class_id) from class_assignments ca),
        '[]'::jsonb
      ),
      'roster_class_ids', coalesce(
        (select jsonb_agg(ca.class_id order by ca.class_id) from class_assignments ca),
        '[]'::jsonb
      ),
      'roster_membership_ids', coalesce(
        (select jsonb_agg(rm.id order by rm.id) from roster_memberships rm),
        '[]'::jsonb
      ),
      'group_ea_assignment_ids', coalesce(
        (select jsonb_agg(ga.id order by ga.id) from group_assignments ga),
        '[]'::jsonb
      ),
      'group_ids', coalesce(
        (select jsonb_agg(ga.group_id order by ga.group_id) from group_assignments ga),
        '[]'::jsonb
      ),
      'child_group_membership_ids', coalesce(
        (select jsonb_agg(gm.id order by gm.id) from group_memberships gm),
        '[]'::jsonb
      )
    )
  );
end;
$$;

-- CREATE OR REPLACE preserves the acknowledgment function's authenticated-only ACL.
RESET statement_timeout;
RESET lock_timeout;
