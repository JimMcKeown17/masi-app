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
  ) then
    return true;
  end if;

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
