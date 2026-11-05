SET lock_timeout = '10s';
SET statement_timeout = '120s';

-- Lifecycle safety S4 (docs/superpowers/plans/2026-11-04-lifecycle-safety.md, ADR-0014 rule 5):
-- nothing holding history or authority evidence can be hard-deleted or cascade-wiped.
-- MA-BUG-20261104-008 (deleting a user account wiped their history) and -009 (an EA token
-- could hard-delete classes and memberships).
--
-- Absorb, don't refuse: no 1.5.0 request shape loses. The installed client (f002e08) sends no
-- DELETE (a children hard_delete goes through delete_child_if_no_history, a SECURITY DEFINER
-- function) and sends sessions only as insert-or-ignore, which needs no UPDATE privilege.

-- (a) EAs hold no DELETE rights on any public table. This mirrors 20261021140000 for groups.
-- RLS already filtered anon to nothing; revoking from both states it outright.
drop policy if exists child_class_memberships_delete_write_child_class on public.child_class_memberships;
drop policy if exists child_group_memberships_delete_created_by on public.child_group_memberships;
drop policy if exists child_programme_enrollments_delete_active_assignment on public.child_programme_enrollments;
drop policy if exists class_grouping_state_delete_write_class on public.class_grouping_state;
drop policy if exists classes_delete_assigned_ea on public.classes;
drop policy if exists grouping_versions_delete_write_class on public.grouping_versions;
drop policy if exists session_attendees_delete_own_session_active_assignment on public.session_attendees;
drop policy if exists sessions_delete_active_assignment_after_attendee on public.sessions;
drop policy if exists time_entries_delete_own on public.time_entries;
revoke delete on all tables in schema public from anon, authenticated;

-- (b) Sessions are written once. The only producer is an insert-or-ignore upload
-- (ON CONFLICT DO NOTHING); private.touch_session_family is SECURITY DEFINER. Attendees keep
-- UPDATE, which their merge upsert needs.
drop policy if exists sessions_update_active_assignment_after_attendee on public.sessions;
drop policy if exists sessions_state_completed_group_held_update on public.sessions;
revoke update on public.sessions from anon, authenticated;

-- (c) History and authority evidence reference people and lifecycle entities with
-- ON DELETE RESTRICT, so a delete of the parent fails instead of wiping the rows. Each swap is
-- guarded (only while the constraint still cascades) and added NOT VALID, then validated.
-- auth.users -> public.users stays CASCADE so never-used test accounts still delete, and the
-- SET NULL audit columns stay as they are.
do $restrict_history_fks$
declare
  v_fk record;
begin
  for v_fk in
    select * from (values
      ('public', 'sessions', 'sessions_user_id_fkey', 'user_id', 'public.users'),
      ('public', 'assessments', 'assessments_user_id_fkey', 'user_id', 'public.users'),
      ('public', 'time_entries', 'time_entries_user_id_fkey', 'user_id', 'public.users'),
      ('public', 'child_ea_assignments', 'child_ea_assignments_user_id_fkey', 'user_id', 'public.users'),
      ('public', 'class_ea_assignments', 'class_ea_assignments_ea_user_id_fkey', 'ea_user_id', 'public.users'),
      ('public', 'group_ea_assignments', 'group_ea_assignments_ea_user_id_fkey', 'ea_user_id', 'public.users'),
      ('public', 'staff_programme_assignments', 'staff_programme_assignments_user_id_fkey', 'user_id', 'public.users'),
      ('public', 'session_attendees', 'session_attendees_child_id_fkey', 'child_id', 'public.children'),
      ('public', 'assessments', 'assessments_child_id_fkey', 'child_id', 'public.children'),
      ('public', 'letter_mastery', 'letter_mastery_child_id_fkey', 'child_id', 'public.children'),
      ('public', 'letter_mastery_corrections', 'letter_mastery_corrections_child_id_fkey', 'child_id', 'public.children'),
      ('public', 'child_ea_assignments', 'child_ea_assignments_child_id_fkey', 'child_id', 'public.children'),
      ('public', 'child_programme_enrollments', 'child_programme_enrollments_child_id_fkey', 'child_id', 'public.children'),
      ('public', 'child_class_memberships', 'child_class_memberships_child_id_fkey', 'child_id', 'public.children'),
      ('public', 'child_group_memberships', 'child_group_memberships_child_id_fkey', 'child_id', 'public.children'),
      ('public', 'class_ea_assignments', 'class_ea_assignments_class_id_fkey', 'class_id', 'public.classes'),
      ('public', 'grouping_versions', 'grouping_versions_class_id_fkey', 'class_id', 'public.classes'),
      ('public', 'class_grouping_state', 'class_grouping_state_class_id_fkey', 'class_id', 'public.classes'),
      ('public', 'child_group_memberships', 'child_group_memberships_group_id_fkey', 'group_id', 'public.groups'),
      ('public', 'group_ea_assignments', 'group_ea_assignments_group_id_fkey', 'group_id', 'public.groups'),
      ('public', 'mobile_support_incidents', 'mobile_support_incidents_reporter_id_fkey', 'reporter_id', 'auth.users'),
      ('private', 'ea_access_events', 'ea_access_events_user_id_fkey', 'user_id', 'auth.users'),
      ('private', 'history_pull_rollout', 'history_pull_rollout_user_id_fkey', 'user_id', 'auth.users')
    ) as fk(schema_name, table_name, constraint_name, column_name, referenced)
  loop
    if not exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conname = v_fk.constraint_name
        and c.conrelid = pg_catalog.format('%I.%I', v_fk.schema_name, v_fk.table_name)::regclass
        and c.contype = 'f'
    ) then
      raise exception 'expected foreign key %.%.% is missing', v_fk.schema_name, v_fk.table_name, v_fk.constraint_name;
    end if;
    if exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conname = v_fk.constraint_name
        and c.conrelid = pg_catalog.format('%I.%I', v_fk.schema_name, v_fk.table_name)::regclass
        and c.confdeltype <> 'r'
    ) then
      execute pg_catalog.format('alter table %I.%I drop constraint %I',
        v_fk.schema_name, v_fk.table_name, v_fk.constraint_name);
      execute pg_catalog.format(
        'alter table %I.%I add constraint %I foreign key (%I) references %s(id) on delete restrict not valid',
        v_fk.schema_name, v_fk.table_name, v_fk.constraint_name, v_fk.column_name, v_fk.referenced);
      execute pg_catalog.format('alter table %I.%I validate constraint %I',
        v_fk.schema_name, v_fk.table_name, v_fk.constraint_name);
    end if;
  end loop;
end
$restrict_history_fks$;

RESET statement_timeout;
RESET lock_timeout;
