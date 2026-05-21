create or replace function private.can_modify_session_attendee(
  p_session_id uuid,
  p_child_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sessions s
    join public.child_ea_assignments cea on cea.child_id = p_child_id
    where s.id = p_session_id
      and s.user_id = (select auth.uid())
      and cea.user_id = (select auth.uid())
      and cea.unassigned_at is null
  );
$$;

revoke execute on function private.can_modify_session_attendee(uuid, uuid) from public, anon;
grant execute on function private.can_modify_session_attendee(uuid, uuid) to authenticated;

drop policy if exists child_ea_assignments_insert_own on public.child_ea_assignments;
drop policy if exists child_ea_assignments_update_own on public.child_ea_assignments;
drop policy if exists child_ea_assignments_delete_own on public.child_ea_assignments;
drop policy if exists session_attendees_update_active_assignment on public.session_attendees;
drop policy if exists session_attendees_delete_active_assignment on public.session_attendees;

create policy child_ea_assignments_insert_created_child on public.child_ea_assignments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and created_by = (select auth.uid())
    and exists (
      select 1
      from public.children c
      where c.id = child_ea_assignments.child_id
        and c.created_by = (select auth.uid())
    )
  );

create policy session_attendees_update_own_session_active_assignment
  on public.session_attendees
  for update to authenticated
  using ((select private.can_modify_session_attendee(session_id, child_id)))
  with check ((select private.can_modify_session_attendee(session_id, child_id)));

create policy session_attendees_delete_own_session_active_assignment
  on public.session_attendees
  for delete to authenticated
  using ((select private.can_modify_session_attendee(session_id, child_id)));
