-- CAP-004 (ADR-0006, spec §4 and §12): session families converge on a server-stamped
-- family timestamp. sessions.updated_at now means "family last written on the server".

-- 1. The server owns updated_at on insert as well as update. Before this, an insert kept
--    the phone-sent value, so a wrong phone clock could hide a new session behind another
--    device's delta cursor.
drop trigger if exists sessions_set_updated_at on public.sessions;
create trigger sessions_set_updated_at
  before insert or update on public.sessions
  for each row execute function private.set_updated_at();

drop trigger if exists session_attendees_set_updated_at on public.session_attendees;
create trigger session_attendees_set_updated_at
  before insert or update on public.session_attendees
  for each row execute function private.set_updated_at();

-- 2. Any attendee write re-stamps its parent. It touches only updated_at, so the
--    restrictive forward-prep policy is unaffected; as a definer function owned by the
--    migration role it does not consult the attendee writer's session policies.
create or replace function private.touch_session_family()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.sessions set updated_at = now() where id = old.session_id;
    return old;
  end if;

  update public.sessions set updated_at = now() where id = new.session_id;
  if tg_op = 'UPDATE' and old.session_id is distinct from new.session_id then
    update public.sessions set updated_at = now() where id = old.session_id;
  end if;
  return new;
end;
$$;

revoke execute on function private.touch_session_family() from public, anon, authenticated;

drop trigger if exists session_attendees_touch_session_family on public.session_attendees;
create trigger session_attendees_touch_session_family
  after insert or update or delete on public.session_attendees
  for each row execute function private.touch_session_family();

-- 3. Indexes for the owner arm and the attendee keyset.
create index if not exists idx_sessions_owner_programme_updated
  on public.sessions (user_id, programme_id, updated_at, id);
create index if not exists idx_session_attendees_session_id_id
  on public.session_attendees (session_id, id);

-- 4. Parent page: ascending (updated_at, id) delta over the two positive grants.
create or replace function public.get_delivery_history_page(
  p_programme_id uuid,
  p_window_start date,
  p_page_size integer default 100,
  p_after_updated_at timestamptz default null,
  p_after_id uuid default null,
  p_overlap_seconds integer default 0
)
returns setof public.sessions
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
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_programme_id is null or p_window_start is null then
    raise exception 'p_programme_id and p_window_start are required' using errcode = '22023';
  end if;
  if p_page_size is null or p_page_size < 1 or p_page_size > 200 then
    raise exception 'p_page_size must be between 1 and 200' using errcode = '22023';
  end if;
  if p_overlap_seconds is null or p_overlap_seconds < 0 or p_overlap_seconds > 600 then
    raise exception 'p_overlap_seconds must be between 0 and 600' using errcode = '22023';
  end if;
  if (p_after_updated_at is null) <> (p_after_id is null) then
    raise exception 'The session history cursor must be wholly null or wholly populated'
      using errcode = '22023';
  end if;

  v_after_updated_at := p_after_updated_at - make_interval(secs => p_overlap_seconds);

  return query
  with owner_arm as (
    select s.id
    from public.sessions s
    where s.user_id = v_actor_id
      and s.programme_id = p_programme_id
      and s.session_date >= p_window_start
      and (p_after_updated_at is null
        or (s.updated_at, s.id) > (v_after_updated_at, p_after_id))
    order by s.updated_at, s.id
    limit p_page_size
  ),
  delivery_arm as (
    select s.id
    from public.sessions s
    where s.programme_id = p_programme_id
      and s.session_date >= p_window_start
      and (p_after_updated_at is null
        or (s.updated_at, s.id) > (v_after_updated_at, p_after_id))
      and s.id in (
        select sa.session_id
        from public.child_ea_assignments cea
        join public.session_attendees sa on sa.child_id = cea.child_id
        where cea.user_id = v_actor_id
      )
    order by s.updated_at, s.id
    limit p_page_size
  ),
  merged as (
    select id from owner_arm
    union
    select id from delivery_arm
  )
  select s.*
  from merged m
  join public.sessions s on s.id = m.id
  order by s.updated_at, s.id
  limit p_page_size;
end;
$$;

revoke execute on function public.get_delivery_history_page(
  uuid, date, integer, timestamptz, uuid, integer
) from public, anon;
grant execute on function public.get_delivery_history_page(
  uuid, date, integer, timestamptz, uuid, integer
) to authenticated;

-- 5. Attendee page: authorization re-derived per session at call time; the three child_*
--    columns are the history reference projection (display identity only).
create or replace function public.get_delivery_history_attendee_page(
  p_session_ids uuid[],
  p_page_size integer default 200,
  p_after_session_id uuid default null,
  p_after_attendee_id uuid default null
)
returns table (
  id uuid,
  session_id uuid,
  child_id uuid,
  group_id uuid,
  attendance_status text,
  grade_snapshot text,
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
#variable_conflict use_column
declare
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_session_ids is null
    or coalesce(cardinality(p_session_ids), 0) < 1
    or cardinality(p_session_ids) > 200 then
    raise exception 'p_session_ids must contain between 1 and 200 ids' using errcode = '22023';
  end if;
  if p_page_size is null or p_page_size < 1 or p_page_size > 200 then
    raise exception 'p_page_size must be between 1 and 200' using errcode = '22023';
  end if;
  if (p_after_session_id is null) <> (p_after_attendee_id is null) then
    raise exception 'The attendee cursor must be wholly null or wholly populated'
      using errcode = '22023';
  end if;

  return query
  select
    sa.id, sa.session_id, sa.child_id, sa.group_id, sa.attendance_status,
    sa.grade_snapshot, sa.notes, sa.created_at, sa.updated_at,
    c.first_name, c.last_name, c.preferred_name
  from public.session_attendees sa
  join public.children c on c.id = sa.child_id
  where sa.session_id in (
      select requested.id
      from unnest(p_session_ids) as requested(id)
      where private.can_read_session(requested.id)
    )
    and (p_after_session_id is null
      or (sa.session_id, sa.id) > (p_after_session_id, p_after_attendee_id))
  order by sa.session_id, sa.id
  limit p_page_size;
end;
$$;

revoke execute on function public.get_delivery_history_attendee_page(
  uuid[], integer, uuid, uuid
) from public, anon;
grant execute on function public.get_delivery_history_attendee_page(
  uuid[], integer, uuid, uuid
) to authenticated;

-- 6. One-time clean-up: before this migration, inserts kept the phone's clock, so an existing
--    row can carry a future updated_at that would pin a delta cursor ahead of every correctly
--    stamped later write (Codex review 2026-09-26). Idempotent; a no-op once clean.
update public.session_attendees set updated_at = now() where updated_at > now();
update public.sessions set updated_at = now() where updated_at > now();

-- 7. One contract: drop the date-ordered RPC that no phone ever called, and its index.
drop function if exists public.get_delivery_history_session_page(
  uuid, integer, date, timestamptz, uuid
);
drop index if exists public.idx_sessions_owner_programme_history_cursor;
