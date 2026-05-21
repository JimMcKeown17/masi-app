grant usage on schema private to authenticated;

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
          join public.child_ea_assignments cea on cea.child_id = sa.child_id
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
  select exists (
    select 1
    from public.sessions s
    where s.id = p_session_id
      and s.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.child_ea_assignments cea
    where cea.child_id = p_child_id
      and cea.user_id = (select auth.uid())
  );
$$;

create or replace function private.has_active_session_attendee_assignment(
  p_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.session_attendees sa
    join public.child_ea_assignments cea on cea.child_id = sa.child_id
    where sa.session_id = p_session_id
      and cea.user_id = (select auth.uid())
      and cea.unassigned_at is null
  );
$$;

revoke execute on function private.can_read_session(uuid) from public, anon;
revoke execute on function private.can_read_session_attendee(uuid, uuid) from public, anon;
revoke execute on function private.has_active_session_attendee_assignment(uuid) from public, anon;

grant execute on function private.can_read_session(uuid) to authenticated;
grant execute on function private.can_read_session_attendee(uuid, uuid) to authenticated;
grant execute on function private.has_active_session_attendee_assignment(uuid) to authenticated;

drop policy if exists sessions_select_own_or_assigned_child_history on public.sessions;
drop policy if exists sessions_update_own on public.sessions;
drop policy if exists sessions_delete_own on public.sessions;
drop policy if exists session_attendees_select_assigned_child_history on public.session_attendees;
drop policy if exists assessments_update_active_assignment on public.assessments;
drop policy if exists letter_mastery_update_active_assignment on public.letter_mastery;

create policy sessions_select_own_or_assigned_child_history on public.sessions
  for select to authenticated
  using ((select private.can_read_session(id)));

create policy sessions_update_active_assignment_after_attendee on public.sessions
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.has_active_session_attendee_assignment(id))
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.staff_programme_assignments spa
      where spa.user_id = (select auth.uid())
        and spa.programme_id = sessions.programme_id
        and spa.ended_at is null
    )
    and (select private.has_active_session_attendee_assignment(id))
  );

create policy sessions_delete_active_assignment_after_attendee on public.sessions
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.has_active_session_attendee_assignment(id))
  );

create policy session_attendees_select_assigned_child_history on public.session_attendees
  for select to authenticated
  using ((select private.can_read_session_attendee(session_id, child_id)));

create policy assessments_update_active_assignment on public.assessments
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = assessments.child_id
        and cea.user_id = (select auth.uid())
        and cea.unassigned_at is null
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = assessments.child_id
        and cea.user_id = (select auth.uid())
        and cea.unassigned_at is null
    )
    and exists (
      select 1
      from public.staff_programme_assignments spa
      where spa.user_id = (select auth.uid())
        and spa.programme_id = assessments.programme_id
        and spa.ended_at is null
    )
  );

create policy letter_mastery_update_active_assignment on public.letter_mastery
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = letter_mastery.child_id
        and cea.user_id = (select auth.uid())
        and cea.unassigned_at is null
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = letter_mastery.child_id
        and cea.user_id = (select auth.uid())
        and cea.unassigned_at is null
    )
    and exists (
      select 1
      from public.staff_programme_assignments spa
      where spa.user_id = (select auth.uid())
        and spa.programme_id = letter_mastery.programme_id
        and spa.ended_at is null
    )
  );
