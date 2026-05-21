drop policy if exists children_delete_active_assignment_or_creator on public.children;

revoke delete on public.children from authenticated;

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
  );
$$;

create or replace function private.delete_child_if_no_history(p_child_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_count integer;
begin
  if not exists (
    select 1
    from public.children c
    where c.id = p_child_id
      and (
        c.created_by = (select auth.uid())
        or (select private.current_user_can_write_for_child(p_child_id))
      )
  ) then
    raise exception 'Not authorized to delete child %', p_child_id
      using errcode = '42501';
  end if;

  if (select private.child_has_delete_blocking_history(p_child_id)) then
    return false;
  end if;

  delete from public.child_class_memberships
  where child_id = p_child_id;

  delete from public.child_programme_enrollments
  where child_id = p_child_id;

  delete from public.child_ea_assignments
  where child_id = p_child_id;

  delete from public.children
  where id = p_child_id;

  get diagnostics v_deleted_count = row_count;

  return v_deleted_count > 0;
end;
$$;

create or replace function public.delete_child_if_no_history(p_child_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.delete_child_if_no_history(p_child_id);
$$;

revoke all on function private.child_has_delete_blocking_history(uuid) from public, anon;
revoke all on function private.delete_child_if_no_history(uuid) from public, anon;
revoke all on function public.delete_child_if_no_history(uuid) from public, anon;

grant execute on function private.child_has_delete_blocking_history(uuid) to authenticated;
grant execute on function private.delete_child_if_no_history(uuid) to authenticated;
grant execute on function public.delete_child_if_no_history(uuid) to authenticated;
