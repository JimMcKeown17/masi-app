do $$
declare
  revoke_statement text;
begin
  for revoke_statement in
    select format(
      'revoke execute on function %s from public, anon, authenticated',
      p.oid::regprocedure
    )
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rls_auto_enable'
  loop
    execute revoke_statement;
  end loop;
end $$;

drop policy if exists users_read_own_profile on public.users;
drop policy if exists staff_programme_assignments_read_own on public.staff_programme_assignments;
drop policy if exists classes_select_assigned_school on public.classes;
drop policy if exists classes_select_created_by on public.classes;
drop policy if exists classes_insert_created_by on public.classes;
drop policy if exists classes_update_created_by on public.classes;
drop policy if exists classes_delete_created_by on public.classes;
drop policy if exists children_select_assigned on public.children;
drop policy if exists children_select_created_by on public.children;
drop policy if exists children_insert_created_by on public.children;
drop policy if exists children_update_active_assignment_or_creator on public.children;
drop policy if exists children_delete_active_assignment_or_creator on public.children;
drop policy if exists child_ea_assignments_select_own on public.child_ea_assignments;
drop policy if exists child_ea_assignments_insert_own on public.child_ea_assignments;
drop policy if exists child_ea_assignments_update_own on public.child_ea_assignments;
drop policy if exists child_ea_assignments_delete_own on public.child_ea_assignments;
drop policy if exists child_programme_enrollments_select_assigned_child on public.child_programme_enrollments;
drop policy if exists child_programme_enrollments_insert_active_assignment on public.child_programme_enrollments;
drop policy if exists child_programme_enrollments_update_active_assignment on public.child_programme_enrollments;
drop policy if exists child_programme_enrollments_delete_active_assignment on public.child_programme_enrollments;
drop policy if exists groups_select_active_programme on public.groups;
drop policy if exists groups_select_created_by on public.groups;
drop policy if exists groups_insert_active_programme on public.groups;
drop policy if exists groups_update_created_by on public.groups;
drop policy if exists groups_delete_created_by on public.groups;
drop policy if exists child_group_memberships_select_visible_group_or_child on public.child_group_memberships;
drop policy if exists child_group_memberships_insert_active_assignment on public.child_group_memberships;
drop policy if exists child_group_memberships_update_created_by on public.child_group_memberships;
drop policy if exists child_group_memberships_delete_created_by on public.child_group_memberships;
drop policy if exists time_entries_select_own on public.time_entries;
drop policy if exists time_entries_insert_own on public.time_entries;
drop policy if exists time_entries_update_own on public.time_entries;
drop policy if exists time_entries_delete_own on public.time_entries;
drop policy if exists sessions_select_own_or_assigned_child_history on public.sessions;
drop policy if exists sessions_insert_active_programme on public.sessions;
drop policy if exists sessions_update_own on public.sessions;
drop policy if exists sessions_delete_own on public.sessions;
drop policy if exists session_attendees_select_assigned_child_history on public.session_attendees;
drop policy if exists session_attendees_insert_active_assignment on public.session_attendees;
drop policy if exists session_attendees_update_active_assignment on public.session_attendees;
drop policy if exists session_attendees_delete_active_assignment on public.session_attendees;
drop policy if exists assessments_select_assigned_child_history on public.assessments;
drop policy if exists assessments_insert_active_assignment on public.assessments;
drop policy if exists assessments_update_active_assignment on public.assessments;
drop policy if exists assessments_delete_active_assignment on public.assessments;
drop policy if exists assessment_items_select_visible_assessment on public.assessment_items;
drop policy if exists assessment_items_insert_own_active_assessment on public.assessment_items;
drop policy if exists assessment_items_update_own_active_assessment on public.assessment_items;
drop policy if exists assessment_items_delete_own_active_assessment on public.assessment_items;
drop policy if exists letter_mastery_select_assigned_child_history on public.letter_mastery;
drop policy if exists letter_mastery_insert_active_assignment on public.letter_mastery;
drop policy if exists letter_mastery_update_active_assignment on public.letter_mastery;
drop policy if exists letter_mastery_delete_active_assignment on public.letter_mastery;

create policy users_read_own_profile on public.users
  for select to authenticated
  using (id = (select auth.uid()));

create policy staff_programme_assignments_read_own on public.staff_programme_assignments
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy classes_select_assigned_school on public.classes
  for select to authenticated
  using (
    exists (
      select 1
      from public.staff_programme_assignments spa
      where spa.user_id = (select auth.uid())
        and spa.school_id = classes.school_id
        and spa.ended_at is null
    )
  );

create policy classes_select_created_by on public.classes
  for select to authenticated
  using (created_by = (select auth.uid()));

create policy classes_insert_created_by on public.classes
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy classes_update_created_by on public.classes
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy classes_delete_created_by on public.classes
  for delete to authenticated
  using (created_by = (select auth.uid()));

create policy children_select_assigned on public.children
  for select to authenticated
  using (
    exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = children.id
        and cea.user_id = (select auth.uid())
    )
  );

create policy children_select_created_by on public.children
  for select to authenticated
  using (created_by = (select auth.uid()));

create policy children_insert_created_by on public.children
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy children_update_active_assignment_or_creator on public.children
  for update to authenticated
  using (
    created_by = (select auth.uid())
    or exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = children.id
        and cea.user_id = (select auth.uid())
        and cea.unassigned_at is null
    )
  )
  with check (
    created_by = (select auth.uid())
    or exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = children.id
        and cea.user_id = (select auth.uid())
        and cea.unassigned_at is null
    )
  );

create policy children_delete_active_assignment_or_creator on public.children
  for delete to authenticated
  using (
    created_by = (select auth.uid())
    or exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = children.id
        and cea.user_id = (select auth.uid())
        and cea.unassigned_at is null
    )
  );

create policy child_ea_assignments_select_own on public.child_ea_assignments
  for select to authenticated
  using (user_id = (select auth.uid()) or created_by = (select auth.uid()));

create policy child_ea_assignments_insert_own on public.child_ea_assignments
  for insert to authenticated
  with check (user_id = (select auth.uid()) and created_by = (select auth.uid()));

create policy child_ea_assignments_update_own on public.child_ea_assignments
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy child_ea_assignments_delete_own on public.child_ea_assignments
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy child_programme_enrollments_select_assigned_child on public.child_programme_enrollments
  for select to authenticated
  using (
    exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = child_programme_enrollments.child_id
        and cea.user_id = (select auth.uid())
    )
  );

create policy child_programme_enrollments_insert_active_assignment on public.child_programme_enrollments
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = child_programme_enrollments.child_id
        and cea.user_id = (select auth.uid())
        and cea.unassigned_at is null
    )
  );

create policy child_programme_enrollments_update_active_assignment on public.child_programme_enrollments
  for update to authenticated
  using (
    exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = child_programme_enrollments.child_id
        and cea.user_id = (select auth.uid())
        and cea.unassigned_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = child_programme_enrollments.child_id
        and cea.user_id = (select auth.uid())
        and cea.unassigned_at is null
    )
  );

create policy child_programme_enrollments_delete_active_assignment on public.child_programme_enrollments
  for delete to authenticated
  using (
    exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = child_programme_enrollments.child_id
        and cea.user_id = (select auth.uid())
        and cea.unassigned_at is null
    )
  );

create policy groups_select_active_programme on public.groups
  for select to authenticated
  using (
    exists (
      select 1
      from public.staff_programme_assignments spa
      where spa.user_id = (select auth.uid())
        and spa.programme_id = groups.programme_id
        and spa.ended_at is null
    )
  );

create policy groups_select_created_by on public.groups
  for select to authenticated
  using (created_by = (select auth.uid()));

create policy groups_insert_active_programme on public.groups
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.staff_programme_assignments spa
      where spa.user_id = (select auth.uid())
        and spa.programme_id = groups.programme_id
        and spa.ended_at is null
    )
  );

create policy groups_update_created_by on public.groups
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy groups_delete_created_by on public.groups
  for delete to authenticated
  using (created_by = (select auth.uid()));

create policy child_group_memberships_select_visible_group_or_child on public.child_group_memberships
  for select to authenticated
  using (
    exists (
      select 1
      from public.groups g
      where g.id = child_group_memberships.group_id
        and (
          g.created_by = (select auth.uid())
          or exists (
            select 1
            from public.staff_programme_assignments spa
            where spa.user_id = (select auth.uid())
              and spa.programme_id = g.programme_id
              and spa.ended_at is null
          )
        )
    )
    or exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = child_group_memberships.child_id
        and cea.user_id = (select auth.uid())
    )
  );

create policy child_group_memberships_insert_active_assignment on public.child_group_memberships
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = child_group_memberships.child_id
        and cea.user_id = (select auth.uid())
        and cea.unassigned_at is null
    )
    and exists (
      select 1
      from public.groups g
      where g.id = child_group_memberships.group_id
        and g.created_by = (select auth.uid())
    )
  );

create policy child_group_memberships_update_created_by on public.child_group_memberships
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy child_group_memberships_delete_created_by on public.child_group_memberships
  for delete to authenticated
  using (created_by = (select auth.uid()));

create policy time_entries_select_own on public.time_entries
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy time_entries_insert_own on public.time_entries
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy time_entries_update_own on public.time_entries
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy time_entries_delete_own on public.time_entries
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy sessions_select_own_or_assigned_child_history on public.sessions
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.session_attendees sa
      join public.child_ea_assignments cea on cea.child_id = sa.child_id
      where sa.session_id = sessions.id
        and cea.user_id = (select auth.uid())
    )
  );

create policy sessions_insert_active_programme on public.sessions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.staff_programme_assignments spa
      where spa.user_id = (select auth.uid())
        and spa.programme_id = sessions.programme_id
        and spa.ended_at is null
    )
  );

create policy sessions_update_own on public.sessions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy sessions_delete_own on public.sessions
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy session_attendees_select_assigned_child_history on public.session_attendees
  for select to authenticated
  using (
    exists (
      select 1
      from public.sessions s
      where s.id = session_attendees.session_id
        and s.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = session_attendees.child_id
        and cea.user_id = (select auth.uid())
    )
  );

create policy session_attendees_insert_active_assignment on public.session_attendees
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.sessions s
      where s.id = session_attendees.session_id
        and s.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = session_attendees.child_id
        and cea.user_id = (select auth.uid())
        and cea.unassigned_at is null
    )
  );

create policy session_attendees_update_active_assignment on public.session_attendees
  for update to authenticated
  using (
    exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = session_attendees.child_id
        and cea.user_id = (select auth.uid())
        and cea.unassigned_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = session_attendees.child_id
        and cea.user_id = (select auth.uid())
        and cea.unassigned_at is null
    )
  );

create policy session_attendees_delete_active_assignment on public.session_attendees
  for delete to authenticated
  using (
    exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = session_attendees.child_id
        and cea.user_id = (select auth.uid())
        and cea.unassigned_at is null
    )
  );

create policy assessments_select_assigned_child_history on public.assessments
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = assessments.child_id
        and cea.user_id = (select auth.uid())
    )
  );

create policy assessments_insert_active_assignment on public.assessments
  for insert to authenticated
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
  with check (user_id = (select auth.uid()));

create policy assessments_delete_active_assignment on public.assessments
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = assessments.child_id
        and cea.user_id = (select auth.uid())
        and cea.unassigned_at is null
    )
  );

create policy assessment_items_select_visible_assessment on public.assessment_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.assessments a
      where a.id = assessment_items.assessment_id
        and (
          a.user_id = (select auth.uid())
          or exists (
            select 1
            from public.child_ea_assignments cea
            where cea.child_id = a.child_id
              and cea.user_id = (select auth.uid())
          )
        )
    )
  );

create policy assessment_items_insert_own_active_assessment on public.assessment_items
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.assessments a
      join public.child_ea_assignments cea on cea.child_id = a.child_id
      where a.id = assessment_items.assessment_id
        and a.user_id = (select auth.uid())
        and cea.user_id = (select auth.uid())
        and cea.unassigned_at is null
    )
  );

create policy assessment_items_update_own_active_assessment on public.assessment_items
  for update to authenticated
  using (
    exists (
      select 1
      from public.assessments a
      join public.child_ea_assignments cea on cea.child_id = a.child_id
      where a.id = assessment_items.assessment_id
        and a.user_id = (select auth.uid())
        and cea.user_id = (select auth.uid())
        and cea.unassigned_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.assessments a
      join public.child_ea_assignments cea on cea.child_id = a.child_id
      where a.id = assessment_items.assessment_id
        and a.user_id = (select auth.uid())
        and cea.user_id = (select auth.uid())
        and cea.unassigned_at is null
    )
  );

create policy assessment_items_delete_own_active_assessment on public.assessment_items
  for delete to authenticated
  using (
    exists (
      select 1
      from public.assessments a
      join public.child_ea_assignments cea on cea.child_id = a.child_id
      where a.id = assessment_items.assessment_id
        and a.user_id = (select auth.uid())
        and cea.user_id = (select auth.uid())
        and cea.unassigned_at is null
    )
  );

create policy letter_mastery_select_assigned_child_history on public.letter_mastery
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = letter_mastery.child_id
        and cea.user_id = (select auth.uid())
    )
  );

create policy letter_mastery_insert_active_assignment on public.letter_mastery
  for insert to authenticated
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
  with check (user_id = (select auth.uid()));

create policy letter_mastery_delete_active_assignment on public.letter_mastery
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = letter_mastery.child_id
        and cea.user_id = (select auth.uid())
        and cea.unassigned_at is null
    )
  );
