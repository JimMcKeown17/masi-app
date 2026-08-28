-- Raw Programme-scoped session queries force RLS to test every candidate row,
-- including sessions the actor cannot see. Build the authorized set from the
-- two positive grants first, then keyset-page that set. The client remains
-- responsible for a request deadline and for withholding hydration-complete
-- until every page and dependent attendee page succeeds.

create index if not exists idx_sessions_owner_programme_history_cursor
  on public.sessions(
    user_id,
    programme_id,
    session_date desc,
    created_at desc,
    id desc
  );

create or replace function public.get_delivery_history_session_page(
  p_programme_id uuid,
  p_page_size integer default 100,
  p_before_session_date date default null,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns setof public.sessions
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null then
    raise exception 'Authentication required'
      using errcode = '28000';
  end if;

  if p_programme_id is null then
    raise exception 'p_programme_id is required'
      using errcode = '22023';
  end if;

  if p_page_size is null or p_page_size < 1 or p_page_size > 200 then
    raise exception 'p_page_size must be between 1 and 200'
      using errcode = '22023';
  end if;

  if not (
    (
      p_before_session_date is null
      and p_before_created_at is null
      and p_before_id is null
    )
    or
    (
      p_before_session_date is not null
      and p_before_created_at is not null
      and p_before_id is not null
    )
  ) then
    raise exception 'The session history cursor must be wholly null or wholly populated'
      using errcode = '22023';
  end if;

  return query
  with authorized_session_ids as (
    select s.id
    from public.sessions s
    where s.programme_id = p_programme_id
      and s.user_id = v_actor_id
      and (
        p_before_session_date is null
        or (s.session_date, s.created_at, s.id) < (
          p_before_session_date,
          p_before_created_at,
          p_before_id
        )
      )

    union

    select s.id
    from public.child_ea_assignments cea
    join public.session_attendees sa
      on sa.child_id = cea.child_id
    join public.sessions s
      on s.id = sa.session_id
    where cea.user_id = v_actor_id
      and s.programme_id = p_programme_id
      and (
        p_before_session_date is null
        or (s.session_date, s.created_at, s.id) < (
          p_before_session_date,
          p_before_created_at,
          p_before_id
        )
      )
  )
  select s.*
  from authorized_session_ids authorized
  join public.sessions s
    on s.id = authorized.id
  order by
    s.session_date desc,
    s.created_at desc,
    s.id desc
  limit p_page_size;
end;
$$;

revoke execute on function public.get_delivery_history_session_page(
  uuid, integer, date, timestamptz, uuid
) from public, anon;

grant execute on function public.get_delivery_history_session_page(
  uuid, integer, date, timestamptz, uuid
) to authenticated;
