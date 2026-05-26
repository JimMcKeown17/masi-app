create or replace function private.prevent_assignment_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'child_ea_assignments' then
    if new.id is distinct from old.id
      or new.user_id is distinct from old.user_id
      or new.child_id is distinct from old.child_id
      or new.assigned_at is distinct from old.assigned_at
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception 'child_ea_assignments identity columns cannot be changed after insert'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'class_ea_assignments' then
    if new.id is distinct from old.id
      or new.class_id is distinct from old.class_id
      or new.ea_user_id is distinct from old.ea_user_id
      or new.programme_id is distinct from old.programme_id
      or new.assigned_at is distinct from old.assigned_at
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception 'class_ea_assignments identity columns cannot be changed after insert'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'group_ea_assignments' then
    if new.id is distinct from old.id
      or new.group_id is distinct from old.group_id
      or new.ea_user_id is distinct from old.ea_user_id
      or new.programme_id is distinct from old.programme_id
      or new.assigned_at is distinct from old.assigned_at
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception 'group_ea_assignments identity columns cannot be changed after insert'
        using errcode = '23514';
    end if;
  else
    raise exception 'private.prevent_assignment_identity_change() cannot run on %.%',
      tg_table_schema,
      tg_table_name
      using errcode = '42809';
  end if;

  return new;
end;
$$;

revoke execute on function private.prevent_assignment_identity_change()
  from public, anon, authenticated;

drop trigger if exists child_ea_assignments_prevent_identity_change
  on public.child_ea_assignments;
create trigger child_ea_assignments_prevent_identity_change
  before update on public.child_ea_assignments
  for each row execute function private.prevent_assignment_identity_change();

drop trigger if exists class_ea_assignments_prevent_identity_change
  on public.class_ea_assignments;
create trigger class_ea_assignments_prevent_identity_change
  before update on public.class_ea_assignments
  for each row execute function private.prevent_assignment_identity_change();

drop trigger if exists group_ea_assignments_prevent_identity_change
  on public.group_ea_assignments;
create trigger group_ea_assignments_prevent_identity_change
  before update on public.group_ea_assignments
  for each row execute function private.prevent_assignment_identity_change();

drop policy if exists child_ea_assignments_update_own on public.child_ea_assignments;
drop policy if exists child_ea_assignments_update_self_archive on public.child_ea_assignments;
drop policy if exists child_ea_assignments_delete_own on public.child_ea_assignments;
drop policy if exists child_ea_assignments_delete_self on public.child_ea_assignments;

create policy child_ea_assignments_update_self_archive
  on public.child_ea_assignments
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists class_ea_assignments_update_self on public.class_ea_assignments;
drop policy if exists class_ea_assignments_delete_self on public.class_ea_assignments;

create policy class_ea_assignments_update_self
  on public.class_ea_assignments
  for update to authenticated
  using (ea_user_id = (select auth.uid()))
  with check (ea_user_id = (select auth.uid()));

drop policy if exists group_ea_assignments_update_self on public.group_ea_assignments;
drop policy if exists group_ea_assignments_delete_self on public.group_ea_assignments;

create policy group_ea_assignments_update_self
  on public.group_ea_assignments
  for update to authenticated
  using (ea_user_id = (select auth.uid()))
  with check (ea_user_id = (select auth.uid()));

revoke delete on public.child_ea_assignments from authenticated;
revoke delete on public.class_ea_assignments from authenticated;
revoke delete on public.group_ea_assignments from authenticated;

drop policy if exists classes_update_created_by on public.classes;
drop policy if exists classes_update_assigned_ea on public.classes;
drop policy if exists classes_delete_created_by on public.classes;
drop policy if exists classes_delete_assigned_ea on public.classes;

create policy classes_update_assigned_ea
  on public.classes
  for update to authenticated
  using ((select private.current_user_can_write_for_class(id)))
  with check ((select private.current_user_can_write_for_class(id)));

create policy classes_delete_assigned_ea
  on public.classes
  for delete to authenticated
  using ((select private.current_user_can_write_for_class(id)));

drop policy if exists assessments_select_assigned_child_history on public.assessments;
create policy assessments_select_assigned_child_history
  on public.assessments
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.current_user_can_read_child(child_id))
  );

drop policy if exists assessment_items_select_visible_assessment on public.assessment_items;
create policy assessment_items_select_visible_assessment
  on public.assessment_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.assessments a
      where a.id = assessment_items.assessment_id
        and (
          a.user_id = (select auth.uid())
          or (select private.current_user_can_read_child(a.child_id))
        )
    )
  );

drop policy if exists letter_mastery_select_assigned_child_history on public.letter_mastery;
create policy letter_mastery_select_assigned_child_history
  on public.letter_mastery
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.current_user_can_read_child(child_id))
  );

drop policy if exists children_select_created_by on public.children;
drop policy if exists classes_select_created_by on public.classes;
drop policy if exists groups_select_created_by on public.groups;

revoke insert, update, delete on public.schools from authenticated;
revoke insert, update, delete on public.job_titles from authenticated;
revoke insert, update, delete on public.programmes from authenticated;
revoke insert, update, delete on public.academic_years from authenticated;
revoke insert, update, delete on public.assessment_windows from authenticated;
revoke insert, update, delete on public.assessment_tools from authenticated;
revoke insert, update, delete on public.teachers from authenticated;
revoke insert, update, delete on public.staff_programme_assignments from authenticated;
revoke insert, update, delete on public.users from authenticated;

grant select on public.schools to authenticated;
grant select on public.job_titles to authenticated;
grant select on public.programmes to authenticated;
grant select on public.academic_years to authenticated;
grant select on public.assessment_windows to authenticated;
grant select on public.assessment_tools to authenticated;
grant select on public.teachers to authenticated;
grant select on public.staff_programme_assignments to authenticated;
grant select on public.users to authenticated;
