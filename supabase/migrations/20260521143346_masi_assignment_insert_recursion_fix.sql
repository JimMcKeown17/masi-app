create or replace function private.can_insert_child_ea_assignment(
  p_child_id uuid,
  p_user_id uuid,
  p_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
    and p_created_by = (select auth.uid())
    and exists (
      select 1
      from public.children c
      where c.id = p_child_id
        and c.created_by = (select auth.uid())
    );
$$;

revoke execute on function private.can_insert_child_ea_assignment(uuid, uuid, uuid)
  from public, anon;
grant execute on function private.can_insert_child_ea_assignment(uuid, uuid, uuid)
  to authenticated;

drop policy if exists child_ea_assignments_insert_created_child
  on public.child_ea_assignments;

create policy child_ea_assignments_insert_created_child
  on public.child_ea_assignments
  for insert to authenticated
  with check (
    (select private.can_insert_child_ea_assignment(child_id, user_id, created_by))
  );
