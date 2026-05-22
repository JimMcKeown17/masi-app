drop policy if exists sessions_select_own_or_assigned_child_history on public.sessions;

create policy sessions_select_own_or_assigned_child_history on public.sessions
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.can_read_session(id))
  );
