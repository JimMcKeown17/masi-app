do $$
declare
  revoke_statement text;
begin
  for revoke_statement in
    select format(
      'revoke execute on function %s from anon, authenticated',
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

alter table public.schools enable row level security;
alter table public.job_titles enable row level security;
alter table public.programmes enable row level security;
alter table public.users enable row level security;
alter table public.staff_programme_assignments enable row level security;
alter table public.assessment_tools enable row level security;
alter table public.classes enable row level security;
alter table public.children enable row level security;
alter table public.child_ea_assignments enable row level security;
alter table public.child_programme_enrollments enable row level security;
alter table public.groups enable row level security;
alter table public.child_group_memberships enable row level security;
alter table public.time_entries enable row level security;
alter table public.sessions enable row level security;
alter table public.session_attendees enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_items enable row level security;
alter table public.letter_mastery enable row level security;

grant select on public.schools to authenticated;
grant select on public.job_titles to authenticated;
grant select on public.programmes to authenticated;
grant select on public.assessment_tools to authenticated;

grant select on public.users to authenticated;
grant select on public.staff_programme_assignments to authenticated;

grant select, insert, update, delete on public.classes to authenticated;
grant select, insert, update, delete on public.children to authenticated;
grant select, insert, update, delete on public.child_ea_assignments to authenticated;
grant select, insert, update, delete on public.child_programme_enrollments to authenticated;
grant select, insert, update, delete on public.groups to authenticated;
grant select, insert, update, delete on public.child_group_memberships to authenticated;
grant select, insert, update, delete on public.time_entries to authenticated;
grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, update, delete on public.session_attendees to authenticated;
grant select, insert, update, delete on public.assessments to authenticated;
grant select, insert, update, delete on public.assessment_items to authenticated;
grant select, insert, update, delete on public.letter_mastery to authenticated;

create policy schools_read on public.schools
  for select to authenticated
  using (is_active = true);

create policy job_titles_read on public.job_titles
  for select to authenticated
  using (is_active = true);

create policy programmes_read on public.programmes
  for select to authenticated
  using (is_active = true);

create policy users_read_own_profile on public.users
  for select to authenticated
  using (id = auth.uid());

create policy staff_programme_assignments_read_own on public.staff_programme_assignments
  for select to authenticated
  using (user_id = auth.uid());

create policy assessment_tools_read on public.assessment_tools
  for select to authenticated
  using (is_active = true);

create policy classes_select_assigned_school on public.classes
  for select to authenticated
  using (
    exists (
      select 1
      from public.staff_programme_assignments spa
      where spa.user_id = auth.uid()
        and spa.school_id = classes.school_id
        and spa.ended_at is null
    )
  );

create policy classes_select_created_by on public.classes
  for select to authenticated
  using (created_by = auth.uid());

create policy classes_insert_created_by on public.classes
  for insert to authenticated
  with check (created_by = auth.uid());

create policy classes_update_created_by on public.classes
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy classes_delete_created_by on public.classes
  for delete to authenticated
  using (created_by = auth.uid());

create policy children_select_assigned on public.children
  for select to authenticated
  using (
    exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = children.id
        and cea.user_id = auth.uid()
    )
  );

create policy children_select_created_by on public.children
  for select to authenticated
  using (created_by = auth.uid());

create policy children_insert_created_by on public.children
  for insert to authenticated
  with check (created_by = auth.uid());

create policy children_update_active_assignment_or_creator on public.children
  for update to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = children.id
        and cea.user_id = auth.uid()
        and cea.unassigned_at is null
    )
  )
  with check (
    created_by = auth.uid()
    or exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = children.id
        and cea.user_id = auth.uid()
        and cea.unassigned_at is null
    )
  );

create policy children_delete_active_assignment_or_creator on public.children
  for delete to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = children.id
        and cea.user_id = auth.uid()
        and cea.unassigned_at is null
    )
  );

create policy child_ea_assignments_select_own on public.child_ea_assignments
  for select to authenticated
  using (user_id = auth.uid() or created_by = auth.uid());

create policy child_ea_assignments_insert_own on public.child_ea_assignments
  for insert to authenticated
  with check (user_id = auth.uid() and created_by = auth.uid());

create policy child_ea_assignments_update_own on public.child_ea_assignments
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy child_ea_assignments_delete_own on public.child_ea_assignments
  for delete to authenticated
  using (user_id = auth.uid());

create policy child_programme_enrollments_select_assigned_child on public.child_programme_enrollments
  for select to authenticated
  using (
    exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = child_programme_enrollments.child_id
        and cea.user_id = auth.uid()
    )
  );

create policy child_programme_enrollments_insert_active_assignment on public.child_programme_enrollments
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = child_programme_enrollments.child_id
        and cea.user_id = auth.uid()
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
        and cea.user_id = auth.uid()
        and cea.unassigned_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = child_programme_enrollments.child_id
        and cea.user_id = auth.uid()
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
        and cea.user_id = auth.uid()
        and cea.unassigned_at is null
    )
  );

create policy groups_select_active_programme on public.groups
  for select to authenticated
  using (
    exists (
      select 1
      from public.staff_programme_assignments spa
      where spa.user_id = auth.uid()
        and spa.programme_id = groups.programme_id
        and spa.ended_at is null
    )
  );

create policy groups_select_created_by on public.groups
  for select to authenticated
  using (created_by = auth.uid());

create policy groups_insert_active_programme on public.groups
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.staff_programme_assignments spa
      where spa.user_id = auth.uid()
        and spa.programme_id = groups.programme_id
        and spa.ended_at is null
    )
  );

create policy groups_update_created_by on public.groups
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy groups_delete_created_by on public.groups
  for delete to authenticated
  using (created_by = auth.uid());

create policy child_group_memberships_select_visible_group_or_child on public.child_group_memberships
  for select to authenticated
  using (
    exists (
      select 1
      from public.groups g
      where g.id = child_group_memberships.group_id
        and (
          g.created_by = auth.uid()
          or exists (
            select 1
            from public.staff_programme_assignments spa
            where spa.user_id = auth.uid()
              and spa.programme_id = g.programme_id
              and spa.ended_at is null
          )
        )
    )
    or exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = child_group_memberships.child_id
        and cea.user_id = auth.uid()
    )
  );

create policy child_group_memberships_insert_active_assignment on public.child_group_memberships
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = child_group_memberships.child_id
        and cea.user_id = auth.uid()
        and cea.unassigned_at is null
    )
    and exists (
      select 1
      from public.groups g
      where g.id = child_group_memberships.group_id
        and g.created_by = auth.uid()
    )
  );

create policy child_group_memberships_update_created_by on public.child_group_memberships
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy child_group_memberships_delete_created_by on public.child_group_memberships
  for delete to authenticated
  using (created_by = auth.uid());

create policy time_entries_select_own on public.time_entries
  for select to authenticated
  using (user_id = auth.uid());

create policy time_entries_insert_own on public.time_entries
  for insert to authenticated
  with check (user_id = auth.uid());

create policy time_entries_update_own on public.time_entries
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy time_entries_delete_own on public.time_entries
  for delete to authenticated
  using (user_id = auth.uid());

create policy sessions_select_own_or_assigned_child_history on public.sessions
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.session_attendees sa
      join public.child_ea_assignments cea on cea.child_id = sa.child_id
      where sa.session_id = sessions.id
        and cea.user_id = auth.uid()
    )
  );

create policy sessions_insert_active_programme on public.sessions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.staff_programme_assignments spa
      where spa.user_id = auth.uid()
        and spa.programme_id = sessions.programme_id
        and spa.ended_at is null
    )
  );

create policy sessions_update_own on public.sessions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy sessions_delete_own on public.sessions
  for delete to authenticated
  using (user_id = auth.uid());

create policy session_attendees_select_assigned_child_history on public.session_attendees
  for select to authenticated
  using (
    exists (
      select 1
      from public.sessions s
      where s.id = session_attendees.session_id
        and s.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = session_attendees.child_id
        and cea.user_id = auth.uid()
    )
  );

create policy session_attendees_insert_active_assignment on public.session_attendees
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.sessions s
      where s.id = session_attendees.session_id
        and s.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = session_attendees.child_id
        and cea.user_id = auth.uid()
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
        and cea.user_id = auth.uid()
        and cea.unassigned_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = session_attendees.child_id
        and cea.user_id = auth.uid()
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
        and cea.user_id = auth.uid()
        and cea.unassigned_at is null
    )
  );

create policy assessments_select_assigned_child_history on public.assessments
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = assessments.child_id
        and cea.user_id = auth.uid()
    )
  );

create policy assessments_insert_active_assignment on public.assessments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = assessments.child_id
        and cea.user_id = auth.uid()
        and cea.unassigned_at is null
    )
    and exists (
      select 1
      from public.staff_programme_assignments spa
      where spa.user_id = auth.uid()
        and spa.programme_id = assessments.programme_id
        and spa.ended_at is null
    )
  );

create policy assessments_update_active_assignment on public.assessments
  for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = assessments.child_id
        and cea.user_id = auth.uid()
        and cea.unassigned_at is null
    )
  )
  with check (user_id = auth.uid());

create policy assessments_delete_active_assignment on public.assessments
  for delete to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = assessments.child_id
        and cea.user_id = auth.uid()
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
          a.user_id = auth.uid()
          or exists (
            select 1
            from public.child_ea_assignments cea
            where cea.child_id = a.child_id
              and cea.user_id = auth.uid()
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
        and a.user_id = auth.uid()
        and cea.user_id = auth.uid()
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
        and a.user_id = auth.uid()
        and cea.user_id = auth.uid()
        and cea.unassigned_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.assessments a
      join public.child_ea_assignments cea on cea.child_id = a.child_id
      where a.id = assessment_items.assessment_id
        and a.user_id = auth.uid()
        and cea.user_id = auth.uid()
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
        and a.user_id = auth.uid()
        and cea.user_id = auth.uid()
        and cea.unassigned_at is null
    )
  );

create policy letter_mastery_select_assigned_child_history on public.letter_mastery
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = letter_mastery.child_id
        and cea.user_id = auth.uid()
    )
  );

create policy letter_mastery_insert_active_assignment on public.letter_mastery
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = letter_mastery.child_id
        and cea.user_id = auth.uid()
        and cea.unassigned_at is null
    )
    and exists (
      select 1
      from public.staff_programme_assignments spa
      where spa.user_id = auth.uid()
        and spa.programme_id = letter_mastery.programme_id
        and spa.ended_at is null
    )
  );

create policy letter_mastery_update_active_assignment on public.letter_mastery
  for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = letter_mastery.child_id
        and cea.user_id = auth.uid()
        and cea.unassigned_at is null
    )
  )
  with check (user_id = auth.uid());

create policy letter_mastery_delete_active_assignment on public.letter_mastery
  for delete to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.child_ea_assignments cea
      where cea.child_id = letter_mastery.child_id
        and cea.user_id = auth.uid()
        and cea.unassigned_at is null
    )
  );
