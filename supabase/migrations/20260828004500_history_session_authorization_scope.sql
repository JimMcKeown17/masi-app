-- Session history is delivery-scoped, not a projection of every way an EA can
-- see a child. Keep owner visibility for queued upsert conflict checks and let
-- any historical direct child assignment grant the delivery diary. Class,
-- group, and child-creator visibility deliberately do not grant session history.

create or replace function private.can_read_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sessions s
    where s.id = p_session_id
      and (
        s.user_id = (select auth.uid())
        or exists (
          select 1
          from public.session_attendees sa
          join public.child_ea_assignments cea
            on cea.child_id = sa.child_id
          where sa.session_id = s.id
            and cea.user_id = (select auth.uid())
        )
      )
  );
$$;

create or replace function private.can_read_session_attendee(
  p_session_id uuid,
  p_child_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- A session is one historical aggregate. Once the parent is authorized, its
  -- attendee family follows the same authority instead of becoming a second,
  -- broader child-read surface.
  select private.can_read_session(p_session_id);
$$;

revoke execute on function private.can_read_session(uuid) from public, anon;
revoke execute on function private.can_read_session_attendee(uuid, uuid) from public, anon;

grant execute on function private.can_read_session(uuid) to authenticated;
grant execute on function private.can_read_session_attendee(uuid, uuid) to authenticated;

drop policy if exists sessions_select_own_or_assigned_child_history on public.sessions;
create policy sessions_select_own_or_assigned_child_history
  on public.sessions
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.can_read_session(id))
  );

drop policy if exists session_attendees_select_assigned_child_history
  on public.session_attendees;
create policy session_attendees_select_assigned_child_history
  on public.session_attendees
  for select to authenticated
  using ((select private.can_read_session_attendee(session_id, child_id)));
