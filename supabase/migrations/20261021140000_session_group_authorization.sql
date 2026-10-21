SET lock_timeout = '10s';
SET statement_timeout = '60s';

-- C19: a completed session may name a group when the EA holds or has held an
-- assignment to that group and the group's own programme matches the session.
-- The live permissive UPDATE policy is
-- sessions_update_active_assignment_after_attendee, not sessions_update_own as
-- the forward-prep migration's historical comment says; these RESTRICTIVE
-- policies add the group/state guard without replacing that ownership check.

create or replace function private.current_user_has_held_group_assignment(
  p_group_id uuid,
  p_programme_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.groups g
    join public.group_ea_assignments gea on gea.group_id = g.id
    where g.id = p_group_id
      and g.programme_id = p_programme_id
      and gea.ea_user_id = (select auth.uid())
  );
$$;

revoke execute on function private.current_user_has_held_group_assignment(uuid, uuid)
  from public, anon;
grant execute on function private.current_user_has_held_group_assignment(uuid, uuid)
  to authenticated;

drop policy if exists sessions_state_completed_group_held_insert on public.sessions;
create policy sessions_state_completed_group_held_insert
  on public.sessions
  as restrictive
  for insert to authenticated
  with check (
    state = 'completed'
    and (
      group_id is null
      or (select private.current_user_has_held_group_assignment(group_id, programme_id))
    )
  );

drop policy if exists sessions_state_completed_group_held_update on public.sessions;
create policy sessions_state_completed_group_held_update
  on public.sessions
  as restrictive
  for update to authenticated
  using (true)
  with check (
    state = 'completed'
    and (
      group_id is null
      or (select private.current_user_has_held_group_assignment(group_id, programme_id))
    )
  );

drop policy if exists session_attendees_group_held_insert on public.session_attendees;
create policy session_attendees_group_held_insert
  on public.session_attendees
  as restrictive
  for insert to authenticated
  with check (
    group_id is null
    or (
      select private.current_user_has_held_group_assignment(
        group_id,
        (
          select s.programme_id
          from public.sessions s
          where s.id = session_attendees.session_id
        )
      )
    )
  );

drop policy if exists session_attendees_group_held_update on public.session_attendees;
create policy session_attendees_group_held_update
  on public.session_attendees
  as restrictive
  for update to authenticated
  using (true)
  with check (
    group_id is null
    or (
      select private.current_user_has_held_group_assignment(
        group_id,
        (
          select s.programme_id
          from public.sessions s
          where s.id = session_attendees.session_id
        )
      )
    )
  );

-- Install every replacement guard before removing the forward-prep pins, so
-- concurrent writers never see a window without a RESTRICTIVE policy.
drop policy if exists sessions_forward_prep_pin_defaults_insert on public.sessions;
drop policy if exists sessions_forward_prep_pin_defaults_update on public.sessions;

RESET statement_timeout;
RESET lock_timeout;
