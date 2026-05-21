create table if not exists public.academic_years (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  starts_on date not null,
  ends_on date not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_years_date_range_chk check (ends_on >= starts_on)
);

create unique index if not exists idx_academic_years_active_unique
  on public.academic_years((1)) where is_active = true;

create table if not exists public.assessment_windows (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  label text not null,
  window_type text not null check (window_type in ('baseline', 'midline', 'endline')),
  starts_on date not null,
  ends_on date not null,
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_windows_date_range_chk check (ends_on >= starts_on),
  constraint assessment_windows_unique_window unique (academic_year_id, window_type)
);

create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  display_name text generated always as (first_name || ' ' || last_name) stored,
  school_id uuid references public.schools(id) on delete restrict,
  archived_at timestamptz,
  archived_by_user_id uuid references public.users(id) on delete set null,
  archive_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.class_ea_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  ea_user_id uuid not null references public.users(id) on delete cascade,
  programme_id uuid not null references public.programmes(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  handover_reason text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_ea_assignments_dates_chk check (
    unassigned_at is null or unassigned_at >= assigned_at
  )
);

create table if not exists public.group_ea_assignments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  ea_user_id uuid not null references public.users(id) on delete cascade,
  programme_id uuid not null references public.programmes(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  handover_reason text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_ea_assignments_dates_chk check (
    unassigned_at is null or unassigned_at >= assigned_at
  )
);

create table if not exists public.grouping_versions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  version_number integer not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  accepted_at timestamptz,
  accepted_by_user_id uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  archived_by_user_id uuid references public.users(id) on delete set null,
  archive_reason text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grouping_versions_unique_version unique (class_id, academic_year_id, version_number)
);

create unique index if not exists idx_grouping_versions_active_unique
  on public.grouping_versions(class_id, academic_year_id)
  where status = 'active';

create table if not exists public.class_grouping_state (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  class_list_status text not null default 'building' check (
    class_list_status in ('building', 'complete', 'reopened')
  ),
  class_list_completed_at timestamptz,
  class_list_completed_by_user_id uuid references public.users(id) on delete set null,
  class_list_reopened_at timestamptz,
  class_list_reopened_by_user_id uuid references public.users(id) on delete set null,
  active_grouping_version_id uuid references public.grouping_versions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_grouping_state_unique unique (class_id, academic_year_id)
);

create table if not exists public.child_class_memberships (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  enrolled_at timestamptz not null default now(),
  exited_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint child_class_membership_dates_chk check (
    exited_at is null or exited_at >= enrolled_at
  )
);

alter table public.classes
  add column if not exists academic_year_id uuid references public.academic_years(id) on delete restrict,
  add column if not exists teacher_id uuid references public.teachers(id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists archive_reason text;

alter table public.children
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists archive_reason text;

alter table public.groups
  add column if not exists grouping_version_id uuid references public.grouping_versions(id) on delete restrict,
  add column if not exists display_number integer,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists archive_reason text;

alter table public.child_group_memberships
  add column if not exists grouping_version_id uuid references public.grouping_versions(id) on delete restrict;

alter table public.assessments
  add column if not exists assessment_window_id uuid references public.assessment_windows(id) on delete set null,
  add column if not exists assessment_purpose text not null default 'progress_check' check (
    assessment_purpose in ('official_window', 'progress_check', 'other')
  ),
  add column if not exists grade_snapshot text,
  add column if not exists teacher_name_snapshot text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assessments_window_purpose_chk'
  ) then
    alter table public.assessments
      add constraint assessments_window_purpose_chk check (
        (
          assessment_purpose = 'official_window'
          and assessment_window_id is not null
        )
        or
        (
          assessment_purpose <> 'official_window'
          and assessment_window_id is null
        )
      );
  end if;
end $$;

alter table public.session_attendees
  add column if not exists grade_snapshot text;

alter table public.letter_mastery
  add column if not exists deleted_at timestamptz;

create index if not exists idx_academic_years_is_active
  on public.academic_years(is_active);
create index if not exists idx_assessment_windows_academic_year
  on public.assessment_windows(academic_year_id);
create index if not exists idx_teachers_school_id
  on public.teachers(school_id);
create index if not exists idx_classes_academic_year_id
  on public.classes(academic_year_id);
create index if not exists idx_classes_teacher_id
  on public.classes(teacher_id);
create index if not exists idx_class_ea_assignments_class
  on public.class_ea_assignments(class_id);
create index if not exists idx_class_ea_assignments_ea
  on public.class_ea_assignments(ea_user_id);
create index if not exists idx_class_ea_assignments_programme
  on public.class_ea_assignments(programme_id);
create index if not exists idx_group_ea_assignments_group
  on public.group_ea_assignments(group_id);
create index if not exists idx_group_ea_assignments_ea
  on public.group_ea_assignments(ea_user_id);
create index if not exists idx_group_ea_assignments_programme
  on public.group_ea_assignments(programme_id);
create index if not exists idx_grouping_versions_class_year_status
  on public.grouping_versions(class_id, academic_year_id, status);
create index if not exists idx_class_grouping_state_active_version
  on public.class_grouping_state(active_grouping_version_id);
create index if not exists idx_child_class_memberships_child
  on public.child_class_memberships(child_id);
create index if not exists idx_child_class_memberships_class
  on public.child_class_memberships(class_id);
create index if not exists idx_child_class_memberships_academic_year
  on public.child_class_memberships(academic_year_id);
create index if not exists idx_groups_grouping_version_id
  on public.groups(grouping_version_id);
create index if not exists idx_child_group_memberships_grouping_version
  on public.child_group_memberships(grouping_version_id);
create index if not exists idx_assessments_assessment_window
  on public.assessments(assessment_window_id);
create index if not exists idx_letter_mastery_deleted_at
  on public.letter_mastery(deleted_at);

create unique index if not exists idx_class_ea_assignments_active_unique
  on public.class_ea_assignments(class_id, ea_user_id, programme_id)
  where unassigned_at is null;

create unique index if not exists idx_group_ea_assignments_active_unique
  on public.group_ea_assignments(group_id)
  where unassigned_at is null;

create unique index if not exists idx_groups_active_display_number
  on public.groups(grouping_version_id, display_number)
  where archived_at is null and display_number is not null;

create unique index if not exists idx_child_class_memberships_active_unique
  on public.child_class_memberships(child_id, academic_year_id)
  where exited_at is null;

drop index if exists idx_child_group_memberships_active_unique;

create unique index if not exists idx_child_group_memberships_active_by_version
  on public.child_group_memberships(child_id, grouping_version_id)
  where removed_at is null;

drop index if exists idx_letter_mastery_unique_active;
drop index if exists idx_letter_mastery_unique;

create unique index if not exists idx_letter_mastery_unique_active
  on public.letter_mastery(user_id, child_id, programme_id, letter, language, source)
  where deleted_at is null;

drop trigger if exists academic_years_set_updated_at on public.academic_years;
create trigger academic_years_set_updated_at
  before update on public.academic_years
  for each row execute function private.set_updated_at();

drop trigger if exists assessment_windows_set_updated_at on public.assessment_windows;
create trigger assessment_windows_set_updated_at
  before update on public.assessment_windows
  for each row execute function private.set_updated_at();

drop trigger if exists teachers_set_updated_at on public.teachers;
create trigger teachers_set_updated_at
  before update on public.teachers
  for each row execute function private.set_updated_at();

drop trigger if exists class_ea_assignments_set_updated_at on public.class_ea_assignments;
create trigger class_ea_assignments_set_updated_at
  before update on public.class_ea_assignments
  for each row execute function private.set_updated_at();

drop trigger if exists group_ea_assignments_set_updated_at on public.group_ea_assignments;
create trigger group_ea_assignments_set_updated_at
  before update on public.group_ea_assignments
  for each row execute function private.set_updated_at();

drop trigger if exists grouping_versions_set_updated_at on public.grouping_versions;
create trigger grouping_versions_set_updated_at
  before update on public.grouping_versions
  for each row execute function private.set_updated_at();

drop trigger if exists class_grouping_state_set_updated_at on public.class_grouping_state;
create trigger class_grouping_state_set_updated_at
  before update on public.class_grouping_state
  for each row execute function private.set_updated_at();

drop trigger if exists child_class_memberships_set_updated_at on public.child_class_memberships;
create trigger child_class_memberships_set_updated_at
  before update on public.child_class_memberships
  for each row execute function private.set_updated_at();

create or replace function private.ensure_active_year_baseline_window()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_active is true then
    insert into public.assessment_windows (
      academic_year_id,
      label,
      window_type,
      starts_on,
      ends_on,
      is_required
    )
    values (
      new.id,
      new.label || ' Baseline',
      'baseline',
      new.starts_on,
      new.ends_on,
      true
    )
    on conflict (academic_year_id, window_type) do update
    set label = excluded.label,
        starts_on = coalesce(public.assessment_windows.starts_on, excluded.starts_on),
        ends_on = coalesce(public.assessment_windows.ends_on, excluded.ends_on),
        is_required = true,
        updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_active_year_baseline_window_trigger
  on public.academic_years;

create trigger ensure_active_year_baseline_window_trigger
  after insert or update of is_active, label, starts_on, ends_on
  on public.academic_years
  for each row
  execute function private.ensure_active_year_baseline_window();

create or replace function private.current_user_can_access_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = p_class_id
      and (
        c.created_by = (select auth.uid())
        or exists (
          select 1
          from public.staff_programme_assignments spa
          where spa.user_id = (select auth.uid())
            and spa.school_id = c.school_id
            and spa.ended_at is null
        )
        or exists (
          select 1
          from public.class_ea_assignments cea
          where cea.class_id = c.id
            and cea.ea_user_id = (select auth.uid())
        )
      )
  );
$$;

create or replace function private.current_user_can_write_for_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = p_class_id
      and c.created_by = (select auth.uid())
  )
  or exists (
    select 1
    from public.class_ea_assignments cea
    where cea.class_id = p_class_id
      and cea.ea_user_id = (select auth.uid())
      and cea.unassigned_at is null
  );
$$;

create or replace function private.current_user_can_access_group(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and (
        g.created_by = (select auth.uid())
        or exists (
          select 1
          from public.staff_programme_assignments spa
          where spa.user_id = (select auth.uid())
            and spa.programme_id = g.programme_id
            and spa.ended_at is null
        )
        or exists (
          select 1
          from public.group_ea_assignments gea
          where gea.group_id = g.id
            and gea.ea_user_id = (select auth.uid())
        )
      )
  );
$$;

create or replace function private.current_user_can_write_for_group(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and g.created_by = (select auth.uid())
  )
  or exists (
    select 1
    from public.group_ea_assignments gea
    where gea.group_id = p_group_id
      and gea.ea_user_id = (select auth.uid())
      and gea.unassigned_at is null
  );
$$;

create or replace function private.current_user_can_read_child(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.children c
    where c.id = p_child_id
      and c.created_by = (select auth.uid())
  )
  or exists (
    select 1
    from public.child_ea_assignments cea
    where cea.child_id = p_child_id
      and cea.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.class_ea_assignments cls
    join public.child_class_memberships ccm
      on ccm.class_id = cls.class_id
     and ccm.exited_at is null
    where ccm.child_id = p_child_id
      and cls.ea_user_id = (select auth.uid())
      and cls.unassigned_at is null
  )
  or exists (
    select 1
    from public.group_ea_assignments grp
    join public.child_group_memberships cgm
      on cgm.group_id = grp.group_id
     and cgm.removed_at is null
    where cgm.child_id = p_child_id
      and grp.ea_user_id = (select auth.uid())
      and grp.unassigned_at is null
  );
$$;

create or replace function private.current_user_can_write_for_child(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.child_ea_assignments cea
    where cea.child_id = p_child_id
      and cea.user_id = (select auth.uid())
      and cea.unassigned_at is null
  )
  or exists (
    select 1
    from public.class_ea_assignments cls
    join public.child_class_memberships ccm
      on ccm.class_id = cls.class_id
     and ccm.exited_at is null
    where ccm.child_id = p_child_id
      and cls.ea_user_id = (select auth.uid())
      and cls.unassigned_at is null
  )
  or exists (
    select 1
    from public.group_ea_assignments grp
    join public.child_group_memberships cgm
      on cgm.group_id = grp.group_id
     and cgm.removed_at is null
    where cgm.child_id = p_child_id
      and grp.ea_user_id = (select auth.uid())
      and grp.unassigned_at is null
  );
$$;

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
          where sa.session_id = s.id
            and (select private.current_user_can_read_child(sa.child_id))
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
  or (select private.current_user_can_read_child(p_child_id));
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
    where sa.session_id = p_session_id
      and (select private.current_user_can_write_for_child(sa.child_id))
  );
$$;

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
    where s.id = p_session_id
      and s.user_id = (select auth.uid())
      and (select private.current_user_can_write_for_child(p_child_id))
  );
$$;

grant usage on schema private to authenticated;

revoke execute on function private.ensure_active_year_baseline_window() from public, anon;
revoke execute on function private.current_user_can_access_class(uuid) from public, anon;
revoke execute on function private.current_user_can_write_for_class(uuid) from public, anon;
revoke execute on function private.current_user_can_access_group(uuid) from public, anon;
revoke execute on function private.current_user_can_write_for_group(uuid) from public, anon;
revoke execute on function private.current_user_can_read_child(uuid) from public, anon;
revoke execute on function private.current_user_can_write_for_child(uuid) from public, anon;
revoke execute on function private.can_read_session(uuid) from public, anon;
revoke execute on function private.can_read_session_attendee(uuid, uuid) from public, anon;
revoke execute on function private.has_active_session_attendee_assignment(uuid) from public, anon;
revoke execute on function private.can_modify_session_attendee(uuid, uuid) from public, anon;

grant execute on function private.ensure_active_year_baseline_window() to authenticated;
grant execute on function private.current_user_can_access_class(uuid) to authenticated;
grant execute on function private.current_user_can_write_for_class(uuid) to authenticated;
grant execute on function private.current_user_can_access_group(uuid) to authenticated;
grant execute on function private.current_user_can_write_for_group(uuid) to authenticated;
grant execute on function private.current_user_can_read_child(uuid) to authenticated;
grant execute on function private.current_user_can_write_for_child(uuid) to authenticated;
grant execute on function private.can_read_session(uuid) to authenticated;
grant execute on function private.can_read_session_attendee(uuid, uuid) to authenticated;
grant execute on function private.has_active_session_attendee_assignment(uuid) to authenticated;
grant execute on function private.can_modify_session_attendee(uuid, uuid) to authenticated;

alter table public.academic_years enable row level security;
alter table public.assessment_windows enable row level security;
alter table public.teachers enable row level security;
alter table public.class_ea_assignments enable row level security;
alter table public.group_ea_assignments enable row level security;
alter table public.grouping_versions enable row level security;
alter table public.class_grouping_state enable row level security;
alter table public.child_class_memberships enable row level security;

grant select on public.academic_years to authenticated;
grant select on public.assessment_windows to authenticated;
grant select on public.teachers to authenticated;
grant select, insert, update, delete on public.class_ea_assignments to authenticated;
grant select, insert, update, delete on public.group_ea_assignments to authenticated;
grant select, insert, update, delete on public.grouping_versions to authenticated;
grant select, insert, update, delete on public.class_grouping_state to authenticated;
grant select, insert, update, delete on public.child_class_memberships to authenticated;

drop policy if exists academic_years_read on public.academic_years;
create policy academic_years_read on public.academic_years
  for select to authenticated
  using (true);

drop policy if exists assessment_windows_read on public.assessment_windows;
create policy assessment_windows_read on public.assessment_windows
  for select to authenticated
  using (true);

drop policy if exists teachers_read on public.teachers;
create policy teachers_read on public.teachers
  for select to authenticated
  using (archived_at is null);

drop policy if exists classes_select_assigned_school on public.classes;
create policy classes_select_assigned_school on public.classes
  for select to authenticated
  using ((select private.current_user_can_access_class(id)));

drop policy if exists classes_update_created_by on public.classes;
create policy classes_update_created_by on public.classes
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

drop policy if exists children_select_assigned on public.children;
create policy children_select_assigned on public.children
  for select to authenticated
  using ((select private.current_user_can_read_child(id)));

drop policy if exists children_update_active_assignment_or_creator on public.children;
create policy children_update_active_assignment_or_creator on public.children
  for update to authenticated
  using (
    created_by = (select auth.uid())
    or (select private.current_user_can_write_for_child(id))
  )
  with check (
    created_by = (select auth.uid())
    or (select private.current_user_can_write_for_child(id))
  );

drop policy if exists children_delete_active_assignment_or_creator on public.children;
create policy children_delete_active_assignment_or_creator on public.children
  for delete to authenticated
  using (
    created_by = (select auth.uid())
    or (select private.current_user_can_write_for_child(id))
  );

drop policy if exists child_programme_enrollments_select_assigned_child on public.child_programme_enrollments;
create policy child_programme_enrollments_select_assigned_child on public.child_programme_enrollments
  for select to authenticated
  using ((select private.current_user_can_read_child(child_id)));

drop policy if exists child_programme_enrollments_insert_active_assignment on public.child_programme_enrollments;
create policy child_programme_enrollments_insert_active_assignment on public.child_programme_enrollments
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.current_user_can_write_for_child(child_id))
  );

drop policy if exists child_programme_enrollments_update_active_assignment on public.child_programme_enrollments;
create policy child_programme_enrollments_update_active_assignment on public.child_programme_enrollments
  for update to authenticated
  using ((select private.current_user_can_write_for_child(child_id)))
  with check ((select private.current_user_can_write_for_child(child_id)));

drop policy if exists child_programme_enrollments_delete_active_assignment on public.child_programme_enrollments;
create policy child_programme_enrollments_delete_active_assignment on public.child_programme_enrollments
  for delete to authenticated
  using ((select private.current_user_can_write_for_child(child_id)));

drop policy if exists groups_select_active_programme on public.groups;
create policy groups_select_active_programme on public.groups
  for select to authenticated
  using ((select private.current_user_can_access_group(id)));

drop policy if exists groups_update_created_by on public.groups;
create policy groups_update_created_by on public.groups
  for update to authenticated
  using ((select private.current_user_can_write_for_group(id)))
  with check ((select private.current_user_can_write_for_group(id)));

drop policy if exists groups_delete_created_by on public.groups;
create policy groups_delete_created_by on public.groups
  for delete to authenticated
  using ((select private.current_user_can_write_for_group(id)));

drop policy if exists class_ea_assignments_select_visible on public.class_ea_assignments;
create policy class_ea_assignments_select_visible on public.class_ea_assignments
  for select to authenticated
  using (
    ea_user_id = (select auth.uid())
    or created_by = (select auth.uid())
    or (select private.current_user_can_access_class(class_id))
  );

drop policy if exists class_ea_assignments_insert_self on public.class_ea_assignments;
create policy class_ea_assignments_insert_self on public.class_ea_assignments
  for insert to authenticated
  with check (
    ea_user_id = (select auth.uid())
    and created_by = (select auth.uid())
    and (select private.current_user_can_access_class(class_id))
    and exists (
      select 1
      from public.staff_programme_assignments spa
      where spa.user_id = (select auth.uid())
        and spa.programme_id = class_ea_assignments.programme_id
        and spa.ended_at is null
    )
  );

drop policy if exists class_ea_assignments_update_self on public.class_ea_assignments;
create policy class_ea_assignments_update_self on public.class_ea_assignments
  for update to authenticated
  using (ea_user_id = (select auth.uid()) or created_by = (select auth.uid()))
  with check (ea_user_id = (select auth.uid()) or created_by = (select auth.uid()));

drop policy if exists class_ea_assignments_delete_self on public.class_ea_assignments;
create policy class_ea_assignments_delete_self on public.class_ea_assignments
  for delete to authenticated
  using (ea_user_id = (select auth.uid()) or created_by = (select auth.uid()));

drop policy if exists group_ea_assignments_select_visible on public.group_ea_assignments;
create policy group_ea_assignments_select_visible on public.group_ea_assignments
  for select to authenticated
  using (
    ea_user_id = (select auth.uid())
    or created_by = (select auth.uid())
    or (select private.current_user_can_access_group(group_id))
  );

drop policy if exists group_ea_assignments_insert_self on public.group_ea_assignments;
create policy group_ea_assignments_insert_self on public.group_ea_assignments
  for insert to authenticated
  with check (
    ea_user_id = (select auth.uid())
    and created_by = (select auth.uid())
    and exists (
      select 1
      from public.groups g
      where g.id = group_ea_assignments.group_id
        and g.created_by = (select auth.uid())
    )
    and exists (
      select 1
      from public.staff_programme_assignments spa
      where spa.user_id = (select auth.uid())
        and spa.programme_id = group_ea_assignments.programme_id
        and spa.ended_at is null
    )
  );

drop policy if exists group_ea_assignments_update_self on public.group_ea_assignments;
create policy group_ea_assignments_update_self on public.group_ea_assignments
  for update to authenticated
  using (ea_user_id = (select auth.uid()) or created_by = (select auth.uid()))
  with check (ea_user_id = (select auth.uid()) or created_by = (select auth.uid()));

drop policy if exists group_ea_assignments_delete_self on public.group_ea_assignments;
create policy group_ea_assignments_delete_self on public.group_ea_assignments
  for delete to authenticated
  using (ea_user_id = (select auth.uid()) or created_by = (select auth.uid()));

drop policy if exists grouping_versions_select_visible on public.grouping_versions;
create policy grouping_versions_select_visible on public.grouping_versions
  for select to authenticated
  using ((select private.current_user_can_access_class(class_id)));

drop policy if exists grouping_versions_insert_write_class on public.grouping_versions;
create policy grouping_versions_insert_write_class on public.grouping_versions
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.current_user_can_write_for_class(class_id))
  );

drop policy if exists grouping_versions_update_write_class on public.grouping_versions;
create policy grouping_versions_update_write_class on public.grouping_versions
  for update to authenticated
  using ((select private.current_user_can_write_for_class(class_id)))
  with check ((select private.current_user_can_write_for_class(class_id)));

drop policy if exists grouping_versions_delete_write_class on public.grouping_versions;
create policy grouping_versions_delete_write_class on public.grouping_versions
  for delete to authenticated
  using ((select private.current_user_can_write_for_class(class_id)));

drop policy if exists class_grouping_state_select_visible on public.class_grouping_state;
create policy class_grouping_state_select_visible on public.class_grouping_state
  for select to authenticated
  using ((select private.current_user_can_access_class(class_id)));

drop policy if exists class_grouping_state_insert_write_class on public.class_grouping_state;
create policy class_grouping_state_insert_write_class on public.class_grouping_state
  for insert to authenticated
  with check ((select private.current_user_can_write_for_class(class_id)));

drop policy if exists class_grouping_state_update_write_class on public.class_grouping_state;
create policy class_grouping_state_update_write_class on public.class_grouping_state
  for update to authenticated
  using ((select private.current_user_can_write_for_class(class_id)))
  with check ((select private.current_user_can_write_for_class(class_id)));

drop policy if exists class_grouping_state_delete_write_class on public.class_grouping_state;
create policy class_grouping_state_delete_write_class on public.class_grouping_state
  for delete to authenticated
  using ((select private.current_user_can_write_for_class(class_id)));

drop policy if exists child_class_memberships_select_visible on public.child_class_memberships;
create policy child_class_memberships_select_visible on public.child_class_memberships
  for select to authenticated
  using (
    (select private.current_user_can_read_child(child_id))
    or (select private.current_user_can_access_class(class_id))
  );

drop policy if exists child_class_memberships_insert_write_child_class on public.child_class_memberships;
create policy child_class_memberships_insert_write_child_class on public.child_class_memberships
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.current_user_can_write_for_child(child_id))
    and (select private.current_user_can_access_class(class_id))
  );

drop policy if exists child_class_memberships_update_write_child_class on public.child_class_memberships;
create policy child_class_memberships_update_write_child_class on public.child_class_memberships
  for update to authenticated
  using (
    (select private.current_user_can_write_for_child(child_id))
    and (select private.current_user_can_access_class(class_id))
  )
  with check (
    (select private.current_user_can_write_for_child(child_id))
    and (select private.current_user_can_access_class(class_id))
  );

drop policy if exists child_class_memberships_delete_write_child_class on public.child_class_memberships;
create policy child_class_memberships_delete_write_child_class on public.child_class_memberships
  for delete to authenticated
  using (
    (select private.current_user_can_write_for_child(child_id))
    and (select private.current_user_can_access_class(class_id))
  );

drop policy if exists child_group_memberships_select_visible_group_or_child on public.child_group_memberships;
create policy child_group_memberships_select_visible_group_or_child on public.child_group_memberships
  for select to authenticated
  using (
    (select private.current_user_can_read_child(child_id))
    or (select private.current_user_can_access_group(group_id))
  );

drop policy if exists child_group_memberships_insert_active_assignment on public.child_group_memberships;
create policy child_group_memberships_insert_active_assignment on public.child_group_memberships
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.current_user_can_write_for_child(child_id))
    and (select private.current_user_can_write_for_group(group_id))
  );

drop policy if exists child_group_memberships_update_created_by on public.child_group_memberships;
create policy child_group_memberships_update_created_by on public.child_group_memberships
  for update to authenticated
  using (
    (select private.current_user_can_write_for_child(child_id))
    and (select private.current_user_can_write_for_group(group_id))
  )
  with check (
    (select private.current_user_can_write_for_child(child_id))
    and (select private.current_user_can_write_for_group(group_id))
  );

drop policy if exists child_group_memberships_delete_created_by on public.child_group_memberships;
create policy child_group_memberships_delete_created_by on public.child_group_memberships
  for delete to authenticated
  using (
    (select private.current_user_can_write_for_child(child_id))
    and (select private.current_user_can_write_for_group(group_id))
  );

drop policy if exists sessions_select_own_or_assigned_child_history on public.sessions;
create policy sessions_select_own_or_assigned_child_history on public.sessions
  for select to authenticated
  using ((select private.can_read_session(id)));

drop policy if exists sessions_update_active_assignment_after_attendee on public.sessions;
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

drop policy if exists sessions_delete_active_assignment_after_attendee on public.sessions;
create policy sessions_delete_active_assignment_after_attendee on public.sessions
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.has_active_session_attendee_assignment(id))
  );

drop policy if exists session_attendees_select_assigned_child_history on public.session_attendees;
create policy session_attendees_select_assigned_child_history on public.session_attendees
  for select to authenticated
  using ((select private.can_read_session_attendee(session_id, child_id)));

drop policy if exists session_attendees_insert_active_assignment on public.session_attendees;
create policy session_attendees_insert_active_assignment on public.session_attendees
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.sessions s
      where s.id = session_attendees.session_id
        and s.user_id = (select auth.uid())
    )
    and (select private.current_user_can_write_for_child(child_id))
  );

drop policy if exists session_attendees_update_own_session_active_assignment on public.session_attendees;
create policy session_attendees_update_own_session_active_assignment on public.session_attendees
  for update to authenticated
  using (
    (select private.can_modify_session_attendee(session_id, child_id))
    and (select private.current_user_can_write_for_child(child_id))
  )
  with check (
    (select private.can_modify_session_attendee(session_id, child_id))
    and (select private.current_user_can_write_for_child(child_id))
  );

drop policy if exists session_attendees_delete_own_session_active_assignment on public.session_attendees;
create policy session_attendees_delete_own_session_active_assignment on public.session_attendees
  for delete to authenticated
  using (
    (select private.can_modify_session_attendee(session_id, child_id))
    and (select private.current_user_can_write_for_child(child_id))
  );

drop policy if exists assessments_insert_active_assignment on public.assessments;
create policy assessments_insert_active_assignment on public.assessments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.current_user_can_write_for_child(child_id))
    and exists (
      select 1
      from public.staff_programme_assignments spa
      where spa.user_id = (select auth.uid())
        and spa.programme_id = assessments.programme_id
        and spa.ended_at is null
    )
  );

drop policy if exists assessments_update_active_assignment on public.assessments;
create policy assessments_update_active_assignment on public.assessments
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.current_user_can_write_for_child(child_id))
  )
  with check (
    user_id = (select auth.uid())
    and (select private.current_user_can_write_for_child(child_id))
    and exists (
      select 1
      from public.staff_programme_assignments spa
      where spa.user_id = (select auth.uid())
        and spa.programme_id = assessments.programme_id
        and spa.ended_at is null
    )
  );

drop policy if exists assessments_delete_active_assignment on public.assessments;
create policy assessments_delete_active_assignment on public.assessments
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.current_user_can_write_for_child(child_id))
  );

drop policy if exists assessment_items_insert_own_active_assessment on public.assessment_items;
create policy assessment_items_insert_own_active_assessment on public.assessment_items
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.assessments a
      where a.id = assessment_items.assessment_id
        and a.user_id = (select auth.uid())
        and (select private.current_user_can_write_for_child(a.child_id))
    )
  );

drop policy if exists assessment_items_update_own_active_assessment on public.assessment_items;
create policy assessment_items_update_own_active_assessment on public.assessment_items
  for update to authenticated
  using (
    exists (
      select 1
      from public.assessments a
      where a.id = assessment_items.assessment_id
        and a.user_id = (select auth.uid())
        and (select private.current_user_can_write_for_child(a.child_id))
    )
  )
  with check (
    exists (
      select 1
      from public.assessments a
      where a.id = assessment_items.assessment_id
        and a.user_id = (select auth.uid())
        and (select private.current_user_can_write_for_child(a.child_id))
    )
  );

drop policy if exists assessment_items_delete_own_active_assessment on public.assessment_items;
create policy assessment_items_delete_own_active_assessment on public.assessment_items
  for delete to authenticated
  using (
    exists (
      select 1
      from public.assessments a
      where a.id = assessment_items.assessment_id
        and a.user_id = (select auth.uid())
        and (select private.current_user_can_write_for_child(a.child_id))
    )
  );

drop policy if exists letter_mastery_insert_active_assignment on public.letter_mastery;
create policy letter_mastery_insert_active_assignment on public.letter_mastery
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.current_user_can_write_for_child(child_id))
    and exists (
      select 1
      from public.staff_programme_assignments spa
      where spa.user_id = (select auth.uid())
        and spa.programme_id = letter_mastery.programme_id
        and spa.ended_at is null
    )
  );

drop policy if exists letter_mastery_update_active_assignment on public.letter_mastery;
create policy letter_mastery_update_active_assignment on public.letter_mastery
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.current_user_can_write_for_child(child_id))
  )
  with check (
    user_id = (select auth.uid())
    and (select private.current_user_can_write_for_child(child_id))
    and exists (
      select 1
      from public.staff_programme_assignments spa
      where spa.user_id = (select auth.uid())
        and spa.programme_id = letter_mastery.programme_id
        and spa.ended_at is null
    )
  );

drop policy if exists letter_mastery_delete_active_assignment on public.letter_mastery;
create policy letter_mastery_delete_active_assignment on public.letter_mastery
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.current_user_can_write_for_child(child_id))
  );

insert into public.academic_years (label, starts_on, ends_on, is_active) values
  ('2026', '2026-01-15', '2026-12-15', true)
on conflict (label) do update
set starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.assessment_windows (academic_year_id, label, window_type, starts_on, ends_on, is_required)
select id, '2026 Baseline', 'baseline', '2026-01-15', '2026-03-15', true
from public.academic_years
where label = '2026'
on conflict (academic_year_id, window_type) do update
set label = excluded.label,
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    is_required = excluded.is_required,
    updated_at = now();

-- School rows generated from scripts/masi-schools-db-apr26.csv: 325
with school_seed as (
  select *
  from jsonb_to_recordset($schools$[
  {
    "name": "Aaron Gqadu",
    "school_type": "Primary",
    "school_uid": "SCH-00276",
    "school_number": "276",
    "suburb": "Kwazakhele",
    "coord_east": "-33.866501",
    "coord_south": "25.58553850",
    "google_maps_link": "https://www.google.com/maps?q=-33.86650101804531,25.585538502261464",
    "info": "School Address: Mbilana Crescent, Kwazakhele, Gqeberha, 6205\nSchool Email: okubizamokoth@vodamail.co.za\nSchool Principal: Not publicly listed\nSchool Phone number: 041 459 5105 / 041 466 9018\nSuburb: Kwazakhele"
  },
  {
    "name": "Abraham Levy",
    "school_type": "Primary",
    "school_uid": "SCH-00144",
    "school_number": "144",
    "suburb": "Schauderville",
    "coord_east": "-33.932858",
    "coord_south": "25.56468424",
    "google_maps_link": "https://www.google.com/maps?q=-33.9328575407312,25.564684239678407",
    "info": "School Address: Searle Road, Schauderville, Gqeberha, 6020\nSchool Email: abrahamlevypr@gmail.com\nSchool Principal: Not publicly listed\nSchool Phone number: 041 453 3461\nSuburb: Schauderville"
  },
  {
    "name": "Adcoc Brighton kids",
    "school_type": "ECD",
    "school_uid": "SCH-00245",
    "school_number": "245",
    "suburb": "New Brighton",
    "coord_east": "-33.902751",
    "coord_south": "25.59117600",
    "google_maps_link": "https://www.google.com/maps?q=-33.902751,25.591176",
    "info": "- School Address: No publicly listed street address found, but Google Maps coordinates place it in Brighton, Port Elizabeth, Eastern Cape, near -33.902751, 25.591176.\n- School Email: Not publicly available.\n- School Principal: Not publicly available.\n- School Phone number: Not publicly available.\n- Suburb: Brighton, Port Elizabeth, Eastern Cape."
  },
  {
    "name": "Adolph Schauder",
    "school_type": "Primary",
    "school_uid": "SCH-00123",
    "school_number": "123",
    "suburb": "Schauderville",
    "coord_east": "-33.931740",
    "coord_south": "25.56131061",
    "google_maps_link": "https://www.google.com/maps?q=-33.93174022285777,25.561310610842995",
    "info": "School Address: Gideon Road, Schauderville, Port Elizabeth, 6020\nSchool Email: adolphschauder16@gmail.com\nSchool Principal: F. Flores (recent sources also mention Thomas Matthews as principal in 2016)\nSchool Phone number: 041 451 4406\nSuburb: Schauderville"
  },
  {
    "name": "Alex Jayiya",
    "school_type": "Primary",
    "school_uid": "SCH-00109",
    "school_number": "109",
    "suburb": "KwaNobuhle",
    "coord_east": "-33.804988",
    "coord_south": "25.39323752",
    "google_maps_link": "https://www.google.com/maps?q=-33.80498806366577,25.39323752248251",
    "info": "School Address: Ngane Road, Kwanobuhle, Kariega, 6242\nSchool Email: moc.liamg@26lposibmab (may be a general or SGB email)\nSchool Principal: Not publicly listed in recent sources\nSchool Phone number: 041 476 0296\nSuburb: Kwanobuhle, Kariega"
  },
  {
    "name": "Alexander",
    "school_type": "High School",
    "school_uid": "SCH-00324",
    "school_number": "324",
    "suburb": "Newton Park",
    "coord_east": "-33.941706",
    "coord_south": "25.57280346",
    "google_maps_link": "https://www.google.com/maps?q=-33.94170625991824,25.57280346481949",
    "info": "School Address: Alexander Road, Newton Park, Gqeberha, 6045\nSchool Email: info@arhs.co.za\nSchool Principal: Mr. J. E. Lovemore\nSchool Phone number: 041 365 1270\nSuburb: Newton Park"
  },
  {
    "name": "Alfonso Arries",
    "school_type": "Primary",
    "school_uid": "SCH-00142",
    "school_number": "142",
    "suburb": "Booysen Park",
    "coord_east": "-33.852326",
    "coord_south": "25.44845081",
    "google_maps_link": "https://www.google.com/maps?q=-33.85232574235959,25.448450808991165",
    "info": "School Address: Chatty Ext 12, Booysens Park, Gqeberha, 6059\nSchool Email: alfonsoarriesps@gmail.com\nSchool Principal: Mr. Z. W. Nkukwana\nSchool Phone number: +27 41 466 2509\nSuburb: Booysens Park."
  },
  {
    "name": "Alpha",
    "school_type": "Primary",
    "school_uid": "SCH-00115",
    "school_number": "115",
    "suburb": "Galvandale",
    "coord_east": "-33.912363",
    "coord_south": "25.54753364",
    "google_maps_link": "https://www.google.com/maps?q=-33.912362894149595,25.54753363967728",
    "info": "School Address: Bell Road, Gelvandale, Gqeberha, 6020, Eastern Cape\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 041 452 3255\nSuburb: Gelvandale"
  },
  {
    "name": "Amanzi",
    "school_type": "Primary",
    "school_uid": "SCH-00165",
    "school_number": "165",
    "suburb": "Amanzi Estate Farm",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Arcadia",
    "school_type": "Primary",
    "school_uid": "SCH-00146",
    "school_number": "146",
    "suburb": "Arcadia",
    "coord_east": "-33.881186",
    "coord_south": "25.52313216",
    "google_maps_link": "https://www.google.com/maps?q=-33.881186083742975,25.52313216481606",
    "info": "School Address: Kimberley Rd, Arcadia, East London, 5201\nSchool Email: admin@arcadiaps.co.za\nSchool Principal: Not publicly listed\nSchool Phone number: 043 743 5503\nSuburb: Arcadia, East London"
  },
  {
    "name": "Arise and Shine",
    "school_type": "ECD",
    "school_uid": "SCH-00256",
    "school_number": "256",
    "suburb": "Motherwell",
    "coord_east": "-33.804378",
    "coord_south": "25.60580724",
    "google_maps_link": "https://www.google.com/maps?q=-33.80437810796366,25.60580723809042",
    "info": "School Address: Lot 2 Erf 313 Highland A/A, Bizana, 4800\nSchool Email: ariseandshine@vodamail.co.za\nSchool Principal: Not publicly listed\nSchool Phone number: +27 63 124 6381\nSuburb: Bizana"
  },
  {
    "name": "Ashton Gontshi",
    "school_type": "Primary",
    "school_uid": "SCH-00127",
    "school_number": "127",
    "suburb": "KwaNobuhle",
    "coord_east": "-33.808362",
    "coord_south": "25.38886013",
    "google_maps_link": "https://www.google.com/maps?q=-33.80836185397413,25.38886012617755",
    "info": "School Address: 1 Mdledle Street, Kwanobuhle, Kariega, 6242\nSchool Email: ihstnognothsa@hotmail.com\nSchool Principal: NM Blaauw\nSchool Phone number: +27 41 978 5065\nSuburb: Kwanobuhle"
  },
  {
    "name": "Astra",
    "school_type": "Primary",
    "school_uid": "SCH-00278",
    "school_number": "278",
    "suburb": "Bethelsdorp",
    "coord_east": "-33.867854",
    "coord_south": "25.49525803",
    "google_maps_link": "https://www.google.com/maps?q=-33.86785425541227,25.49525802554974",
    "info": "School Address: Laurence Erasmus Drive, Bloemendal, Gqeberha, 6059\nSchool Email: ten.asmoklet@11spa (may need to verify as it appears reversed)\nSchool Principal: Not publicly listed in recent sources\nSchool Phone number: 041 481 5125\nSuburb: Bloemendal, Gqeberha"
  },
  {
    "name": "Baby Daycare",
    "school_type": "ECD",
    "school_uid": "SCH-00218",
    "school_number": "218",
    "suburb": "Motherwell",
    "coord_east": "-33.783849",
    "coord_south": "25.58979339",
    "google_maps_link": "https://www.google.com/maps?q=-33.78384855371517,25.58979338844639",
    "info": "School Address: 181 Circular Drive, Port Elizabeth, Eastern Cape, 6070\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: (041) 368-7855 / 083 294 1532\nSuburb: Charlo"
  },
  {
    "name": "Bambino",
    "school_type": "ECD",
    "school_uid": "SCH-00298",
    "school_number": "298",
    "suburb": "Clarkson",
    "coord_east": "-34.011901",
    "coord_south": "24.34647901",
    "google_maps_link": "https://www.google.com/maps?q=-34.011900712874024,24.34647900963787",
    "info": "School Address: Bambino Day Care Centre, Eastern Cape, South Africa\nSchool Email: Not publicly listed\nSchool Principal: Annelize Nagel\nSchool Phone number: Not publicly listed\nSuburb: Not specified, but based on coordinates, likely Humansdorp or nearby"
  },
  {
    "name": "Bavumeleni",
    "school_type": "ECD",
    "school_uid": "SCH-00053",
    "school_number": "53",
    "suburb": "Motherwell",
    "coord_east": "-33.807776",
    "coord_south": "25.59114572",
    "google_maps_link": "https://www.google.com/maps?q=-33.80777610353109,25.591145717499714",
    "info": "School Address: Elujecweni A/A, Tsolo, 5170\nSchool Email: 220004ssjinelemuvab@gmail.com\nSchool Principal: Not publicly listed\nSchool Phone number: 083 349 1764\nSuburb: St Cuthberts rural, Tsolo"
  },
  {
    "name": "Bayview",
    "school_type": "Primary",
    "school_uid": "SCH-00173",
    "school_number": "173",
    "suburb": "Helenvale",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Ben Nyati",
    "school_type": "Primary",
    "school_uid": "SCH-00203",
    "school_number": "203",
    "suburb": "Kwazakhele",
    "coord_east": "-33.881926",
    "coord_south": "25.58863118",
    "google_maps_link": "https://www.google.com/maps?q=-33.88192649885194,25.588631181373636",
    "info": "School Address: Maqubela Street, Kwazakhele, Gqeberha, 6205\nSchool Email: az.vog.vorp.ude@750001002\nSchool Principal: Mh Dukwe\nSchool Phone number: 041 467 4506\nSuburb: Kwazakhele"
  },
  {
    "name": "Ben Sinuka",
    "school_type": "Primary",
    "school_uid": "SCH-00289",
    "school_number": "289",
    "suburb": "New Brighton",
    "coord_east": "-33.892277",
    "coord_south": "25.60263263",
    "google_maps_link": "https://www.google.com/maps?q=-33.892276994066776,25.602632631083768",
    "info": "School Address: 1 Gunguluza Street, New Brighton, Port Elizabeth, 6200\nSchool Email: principal.200100058@ecschools.org.za / abawcul.elidna@gmail.com\nSchool Principal: Mr Liza Notuku\nSchool Phone number: 041 454 0211\nSuburb: New Brighton"
  },
  {
    "name": "Bethelsdorp",
    "school_type": "Primary",
    "school_uid": "SCH-00087",
    "school_number": "87",
    "suburb": "Korsten",
    "coord_east": "-33.867870",
    "coord_south": "25.51287296",
    "google_maps_link": "https://www.google.com/maps?q=-33.867870478015405,25.512872958174313",
    "info": "School Address: Felcass Road, Salt Lake, Bethelsdorp, Gqeberha, 6059\nSchool Email: bethelsdorpcomp@gmail.com\nSchool Principal: (Not publicly listed in current sources)\nSchool Phone number: 041 481 6263\nSuburb: Salt Lake, Bethelsdorp"
  },
  {
    "name": "Bethvale",
    "school_type": "Primary",
    "school_uid": "SCH-00072",
    "school_number": "72",
    "suburb": "Bethelsdorp",
    "coord_east": "-33.877126",
    "coord_south": "25.50194034",
    "google_maps_link": "https://www.google.com/maps?q=-33.877126279731684,25.501940339675247",
    "info": "School Address: Bowker Street, Bloemendal, Gqeberha, 6059\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 041 481 5009\nSuburb: Bloemendal, Gqeberha"
  },
  {
    "name": "BJ Mnyanda",
    "school_type": "Primary",
    "school_uid": "SCH-00057",
    "school_number": "57",
    "suburb": "Kwazakhele",
    "coord_east": "-33.888347",
    "coord_south": "25.58640198",
    "google_maps_link": "https://www.google.com/maps?q=-33.888347,25.58640198",
    "info": "School Address: Njoli Road, Kwazakhele, Gqeberha, 6205\nSchool Email: bj.mnyanda9@gmail.com\nSchool Principal: Mr. Simphiwe Lukasi\nSchool Phone number: 041 466 5440\nSuburb: Kwazakhele"
  },
  {
    "name": "Boet Jegels",
    "school_type": "Primary",
    "school_uid": "SCH-00159",
    "school_number": "159",
    "suburb": "Booysen Park",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Bomi obutsha",
    "school_type": "ECD",
    "school_uid": "SCH-00257",
    "school_number": "257",
    "suburb": null,
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Bright Angels",
    "school_type": "ECD",
    "school_uid": "SCH-00299",
    "school_number": "299",
    "suburb": "Motherwell",
    "coord_east": "-33.803449",
    "coord_south": "25.57836548",
    "google_maps_link": "https://www.google.com/maps?q=-33.80344859167251,25.578365483217258",
    "info": "School Address: No confirmed address in Eastern Cape found; the website lists 30 KG 9 Avenue, Nyarutarama, Kigali, Rwanda, which does not match the Eastern Cape, South Africa.\nSchool Email: info@brightangelsinternationalschool.com\nSchool Principal: Not named, but principal's contact is 0788305818\nSchool Phone number: 0788305818 (Principal), 0788567387 (Director & Founder), 0783586558 (Receptionist)\nSuburb: Not confirmed for Eastern Cape\n\nNote: The information found is for Bright Angels International School in Kigali, Rwanda, not the Eastern Cape, South Africa. No verified details for a Bright Angels school in the Eastern Cape were found in the public sources reviewed."
  },
  {
    "name": "Busy Bee",
    "school_type": "ECD",
    "school_uid": "SCH-00262",
    "school_number": "262",
    "suburb": "Zwide",
    "coord_east": "-33.868025",
    "coord_south": "25.57241663",
    "google_maps_link": "https://www.google.com/maps?q=-33.868025,25.57241663",
    "info": "School Address: 18 Carnegie Street, Extension 2, Butterworth, 4960\nSchool Email: Not publicly listed\nSchool Principal: Lulema R.\nSchool Phone number: 047 491 8130\nSuburb: Butterworth"
  },
  {
    "name": "C W Hendrickse",
    "school_type": "Primary",
    "school_uid": "SCH-00122",
    "school_number": "122",
    "suburb": "Rosedale",
    "coord_east": "-33.739724",
    "coord_south": "25.37254448",
    "google_maps_link": "https://www.google.com/maps?q=-33.73972422059023,25.372544481996997",
    "info": "School Address: 137 Acacia Avenue, Mountain View, Kariega, 6229\nSchool Email: cwhprimary@hotmail.com\nSchool Principal: Reciet Ag\nSchool Phone number: 041 988 1198\nSuburb: Mountain View, Kariega"
  },
  {
    "name": "Canzibe",
    "school_type": "Primary",
    "school_uid": "SCH-00090",
    "school_number": "90",
    "suburb": "Motherwell",
    "coord_east": "-33.802247",
    "coord_south": "25.59731976",
    "google_maps_link": "https://www.google.com/maps?q=-33.802247,25.59731976",
    "info": "School Address: 162 Mkhombe Street, Motherwell, Gqeberha (Port Elizabeth), 6211\nSchool Email: Not publicly listed; general contact via Eastern Cape Education Department\nSchool Principal: Not publicly listed\nSchool Phone number: 041 469 2098\nSuburb: Motherwell, Gqeberha (Port Elizabeth)"
  },
  {
    "name": "Caritas",
    "school_type": "Primary",
    "school_uid": "SCH-00182",
    "school_number": "182",
    "suburb": "Rosedale",
    "coord_east": "-33.732837",
    "coord_south": "25.37111518",
    "google_maps_link": "https://www.google.com/maps?q=-33.7328374889468,25.371115181520935",
    "info": "School Address: Warbler Road, Rosedale, Uitenhage, 6230\nSchool Email: amirpsatirac@gmail.com\nSchool Principal: Not publicly listed\nSchool Phone number: 041 988 4204 / 041 988 4202\nSuburb: Rosedale, Uitenhage"
  },
  {
    "name": "Cebelihle",
    "school_type": "Primary",
    "school_uid": "SCH-00068",
    "school_number": "68",
    "suburb": "Zwide",
    "coord_east": "-33.867528",
    "coord_south": "25.54803349",
    "google_maps_link": "https://www.google.com/maps?q=-33.86752756212128,25.548033493650596",
    "info": "School Address: Mbeki Street, Govan Mbeki Township, Gqeberha, 6001\nSchool Email: yramirpelhilebec@moklet.as (reverse to: cebelihleprimary@telkomsa.net)\nSchool Principal: Not publicly listed in recent sources\nSchool Phone number: 041 464 2241\nSuburb: Govan Mbeki Township, Gqeberha"
  },
  {
    "name": "Cedarberg",
    "school_type": "Primary",
    "school_uid": "SCH-00110",
    "school_number": "110",
    "suburb": "Booysen Park",
    "coord_east": "-33.862788",
    "coord_south": "25.46711079",
    "google_maps_link": "https://www.google.com/maps?q=-33.862787649758445,25.46711079365035",
    "info": "School Address: Cedarberg Close, Booysen Park, Port Elizabeth, 6059\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 061 466 1132 / +27 41 456 4221\nSuburb: Booysen Park"
  },
  {
    "name": "Charles Duna",
    "school_type": "Primary",
    "school_uid": "SCH-00281",
    "school_number": "281",
    "suburb": "New Brighton",
    "coord_east": "-33.895661",
    "coord_south": "25.59254770",
    "google_maps_link": "https://www.google.com/maps?q=-33.89566123178045,25.592547701661456",
    "info": "School Address: Msimka Street, New Brighton, Port Elizabeth, 6200\nSchool Email: Not publicly listed (general contact via Eastern Cape Education Department)\nSchool Principal: Sume Nm\nSchool Phone number: 041 454 1397 / 041 464 4003\nSuburb: New Brighton, Gqeberha (Port Elizabeth)"
  },
  {
    "name": "Charlotte Educare",
    "school_type": "ECD",
    "school_uid": "SCH-00329",
    "school_number": "329",
    "suburb": null,
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Chubekile",
    "school_type": "High School",
    "school_uid": "SCH-00036",
    "school_number": "36",
    "suburb": "Kwazakhele",
    "coord_east": "-33.877926",
    "coord_south": "25.57214225",
    "google_maps_link": "https://www.google.com/maps?q=-33.877925533346506,25.572142251321974",
    "info": "School Address: Tubali Street, Kwazakhele, Gqeberha, 6205\nSchool Email: Not publicly listed\nSchool Principal: M.T. Ntdla\nSchool Phone number: 041 450 2729\nSuburb: Kwazakhele"
  },
  {
    "name": "Cillie",
    "school_type": "High School",
    "school_uid": "SCH-00325",
    "school_number": "325",
    "suburb": "Sydenham",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Cingani",
    "school_type": "High School",
    "school_uid": "SCH-00026",
    "school_number": "26",
    "suburb": "Motherwell",
    "coord_east": "-33.821006",
    "coord_south": "25.58854341",
    "google_maps_link": "https://www.google.com/maps?q=-33.82100558010914,25.58854340898934",
    "info": "School Address: 61 Kabonqaba Street, Swartkopsvalley, Gqeberha, 6211\nSchool Email: Not publicly listed\nSchool Principal: S Faku\nSchool Phone number: 041 462 6056\nSuburb: Swartkopsvalley"
  },
  {
    "name": "Clarkson",
    "school_type": "Primary",
    "school_uid": "SCH-00319",
    "school_number": "319",
    "suburb": "Clarkson",
    "coord_east": "-34.010486",
    "coord_south": "24.34785856",
    "google_maps_link": "https://www.google.com/maps?q=-34.010486417378,24.347858558901436",
    "info": "School Address: Church Street, Clarkson, 6302\nSchool Email: Not publicly listed\nSchool Principal: Booysen Rca\nSchool Phone number: +27 42 280 0023 or +27 42 280 6204\nSuburb: Clarkson, Eastern Cape."
  },
  {
    "name": "Coega",
    "school_type": "Primary",
    "school_uid": "SCH-00190",
    "school_number": "190",
    "suburb": "Wells Estate",
    "coord_east": "-33.820179",
    "coord_south": "25.63557420",
    "google_maps_link": "https://www.google.com/maps?q=-33.82017871258245,25.63557419502069",
    "info": "School Address: Polska Street, Motherwell Ext, Motherwell, 6211\nSchool Email: Not publicly listed\nSchool Principal: Vuyisile Mbombela\nSchool Phone number: 073 393 8425\nSuburb: Motherwell, Gqeberha (Port Elizabeth)"
  },
  {
    "name": "Colchester",
    "school_type": "Primary",
    "school_uid": "SCH-00113",
    "school_number": "113",
    "suburb": "Colchester",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Colleen Glen",
    "school_type": "Primary",
    "school_uid": "SCH-00111",
    "school_number": "111",
    "suburb": "Seaview",
    "coord_east": "-33.970214",
    "coord_south": "25.36963135",
    "google_maps_link": "https://www.google.com/maps?q=-33.97021392573423,25.36963135317452",
    "info": "School Address: 66 Dromedaris Road, Seaview, Gqeberha, 6018\nSchool Email: 200100129@vodamail.co.za\nSchool Principal: Makunga Nc\nSchool Phone number: 041 372 2296\nSuburb: Seaview"
  },
  {
    "name": "Coselelani",
    "school_type": "High School",
    "school_uid": "SCH-00001",
    "school_number": "1",
    "suburb": "Motherwell",
    "coord_east": "-33.804930",
    "coord_south": "25.57257724",
    "google_maps_link": "https://www.google.com/maps?q=-33.80492979897343,25.57257723782387",
    "info": "School Address: Ngqokweni Street, Motherwell, Gqeberha, 6211\nSchool Email: hgihinalelesoc@gmail.com\nSchool Principal: Not publicly listed\nSchool Phone number: 041 205 0816\nSuburb: Motherwell, Gqeberha"
  },
  {
    "name": "Cowan",
    "school_type": "High School",
    "school_uid": "SCH-00037",
    "school_number": "37",
    "suburb": "New Brighton",
    "coord_east": "-33.903894",
    "coord_south": "25.59309875",
    "google_maps_link": "https://www.google.com/maps?q=-33.903893794138995,25.593098753170832",
    "info": "School Address: 20 Madala Street, New Brighton, Gqeberha, 6200\nSchool Email: Not publicly listed\nSchool Principal: Trevor Dolley\nSchool Phone number: 041 454 3325\nSuburb: New Brighton"
  },
  {
    "name": "Cuttee Babies Nursery",
    "school_type": "ECD",
    "school_uid": "SCH-00232",
    "school_number": "232",
    "suburb": "Kwazakhele",
    "coord_east": "-33.897187",
    "coord_south": "25.60321669",
    "google_maps_link": "https://www.google.com/maps?q=-33.89718748030103,25.60321668705437",
    "info": "School Address: 1A 5th Avenue, Newton Park, Gqeberha, 6045, Eastern Cape\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: Not publicly listed\nSuburb: Newton Park\n\nNo official website or public directory lists the principal, email, or phone number for Cuttee Babies Nursery. The address is confirmed via Google Maps."
  },
  {
    "name": "Dalrose",
    "school_type": "Primary",
    "school_uid": "SCH-00196",
    "school_number": "196",
    "suburb": "Rosedale",
    "coord_east": "-33.738101",
    "coord_south": "25.37292219",
    "google_maps_link": "https://www.google.com/maps?q=-33.73810100044496,25.372922193169632",
    "info": "School Address: Pelican Street, Rosedale, Uitenhage, 6230\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 041 988 4545\nSuburb: Rosedale, Uitenhage"
  },
  {
    "name": "Dalubuhle",
    "school_type": "High School",
    "school_uid": "SCH-00010",
    "school_number": "10",
    "suburb": "Alice",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Daniels",
    "school_type": "Primary",
    "school_uid": "SCH-00098",
    "school_number": "98",
    "suburb": "Zwide",
    "coord_east": "-33.866675",
    "coord_south": "25.56901188",
    "google_maps_link": "https://www.google.com/maps?q=-33.86667473433699,25.56901187830917",
    "info": "School Address: Haya Street, Zwide, Gqeberha, 6200\nSchool Email: yramirpsleinad@gmail.com\nSchool Principal: Not publicly listed\nSchool Phone number: 041 459 0181\nSuburb: Zwide, Gqeberha"
  },
  {
    "name": "David Vuku",
    "school_type": "Primary",
    "school_uid": "SCH-00064",
    "school_number": "64",
    "suburb": "New Brighton",
    "coord_east": "-33.894887",
    "coord_south": "25.59907722",
    "google_maps_link": "https://www.google.com/maps?q=-33.894886696846164,25.599077222731083",
    "info": "School Address: Naude Street, New Brighton, Port Elizabeth, 6200\nSchool Email: az.oc.liamadov@251001002\nSchool Principal: Not publicly listed\nSchool Phone number: 041 458 5025 / 073 870 7417\nSuburb: New Brighton"
  },
  {
    "name": "De Vos Malan",
    "school_type": "Primary",
    "school_uid": "SCH-00114",
    "school_number": "114",
    "suburb": "Schauderville",
    "coord_east": "-33.929302",
    "coord_south": "25.56685108",
    "google_maps_link": "https://www.google.com/maps?q=-33.929302025365274,25.566851083854964",
    "info": "School Address: c/o Dinsmore Road and Lawler Street, Schauderville, Port Elizabeth, 6020\nSchool Email: devosmalanprimary@gmail.com\nSchool Principal: (Not listed on public sources; recent posts mention the passing of Mr Derrick Raubenheimer, possibly the previous principal)\nSchool Phone number: +27 67 133 5909\nSuburb: Schauderville"
  },
  {
    "name": "Despatch",
    "school_type": "Primary",
    "school_uid": "SCH-00132",
    "school_number": "132",
    "suburb": "Resevoir Hills",
    "coord_east": "-33.816337",
    "coord_south": "25.46301195",
    "google_maps_link": "https://www.google.com/maps?q=-33.8163365353468,25.463011951318403",
    "info": "School Address: Amperbo Street, Bothasrus, Despatch, 6220\nSchool Email: Not publicly listed\nSchool Principal: Colin Bartle\nSchool Phone number: 041 933 5104\nSuburb: Bothasrus, Despatch"
  },
  {
    "name": "Dias",
    "school_type": "Primary",
    "school_uid": "SCH-00189",
    "school_number": "189",
    "suburb": "Theescombe",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Die Heuwel",
    "school_type": "Primary",
    "school_uid": "SCH-00153",
    "school_number": "153",
    "suburb": "Hillside",
    "coord_east": "-33.899824",
    "coord_south": "25.53224312",
    "google_maps_link": "https://www.google.com/maps?q=-33.89982399705243,25.532243122487795",
    "info": "School Address: Carelson Street, Hillside, Gqeberha, 6059\nSchool Email: mjordaan@dieheuwelprimary.co.za\nSchool Principal: (Not publicly listed in recent sources)\nSchool Phone number: 041 450 7692 / 041 452 3313\nSuburb: Hillside, Gqeberha"
  },
  {
    "name": "Dietrich",
    "school_type": "Primary",
    "school_uid": "SCH-00121",
    "school_number": "121",
    "suburb": "Schauderville",
    "coord_east": "-33.936037",
    "coord_south": "25.57731125",
    "google_maps_link": "https://www.google.com/maps?q=-33.936037448660194,25.577311253172695",
    "info": "School Address: Grundlingh Street, Schauderville, Gqeberha, 6020\nSchool Email: dietrichps@gmail.com\nSchool Principal: Chantel Milborrow\nSchool Phone number: +27 41 453 3655\nSuburb: Schauderville"
  },
  {
    "name": "Dorcas Educare Centre",
    "school_type": "ECD",
    "school_uid": "SCH-00239",
    "school_number": "239",
    "suburb": "Bethelsdorp",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Dorothy",
    "school_type": "ECD",
    "school_uid": "SCH-00318",
    "school_number": "318",
    "suburb": "Kwazakhele",
    "coord_east": "-33.886021",
    "coord_south": "25.59799722",
    "google_maps_link": "https://www.google.com/maps?q=-33.88602111972884,25.597997219949217",
    "info": "School Address: 50306 Stofile Street, Kwa Zakhele, Gqeberha, 6205\nSchool Email: Not publicly listed\nSchool Principal: Nomnganga Pn (2023)\nSchool Phone number: (+27) 63 133 6311\nSuburb: Kwa Zakhele, Gqeberha"
  },
  {
    "name": "Douglas Mbopa",
    "school_type": "High School",
    "school_uid": "SCH-00002",
    "school_number": "2",
    "suburb": "Motherwell",
    "coord_east": "-33.798380",
    "coord_south": "25.60828648",
    "google_maps_link": "https://www.google.com/maps?q=-33.79838036013801,25.608286480152778",
    "info": "School Address: 1 Matanzima Street, NU 2, Motherwell, Gqeberha, 6211\nSchool Email: 10apobmsalguod@gmail.com\nSchool Principal: Mr N F Bottoman\nSchool Phone number: 041 469 1135\nSuburb: Motherwell"
  },
  {
    "name": "Dr A W Habelgaarn",
    "school_type": "Primary",
    "school_uid": "SCH-00191",
    "school_number": "191",
    "suburb": "Chatty",
    "coord_east": "-33.866032",
    "coord_south": "25.50363172",
    "google_maps_link": "https://www.google.com/maps?q=-33.86603228954331,25.503631720166496",
    "info": "School Address: Arkeldien Street, Chatty, Gqeberha, 6059\nSchool Email: habelgaarnprimaryschool@gmail.com\nSchool Principal: Mrs. Rochelle Botha\nSchool Phone number: 041 481 2534 / 041 481 3425\nSuburb: Chatty, Gqeberha"
  },
  {
    "name": "Dumani",
    "school_type": "Primary",
    "school_uid": "SCH-00280",
    "school_number": "280",
    "suburb": "Motherwell",
    "coord_east": "-33.810768",
    "coord_south": "25.60414135",
    "google_maps_link": "https://www.google.com/maps?q=-33.810768,25.60414135",
    "info": "School Address: Khwalimanzi Street, Nu 3 Motherwell, Gqeberha, 6211\nSchool Email: az.oc.liamadov@481001002\nSchool Principal: Not publicly listed\nSchool Phone number: 041 469 1191\nSuburb: Motherwell, Gqeberha"
  },
  {
    "name": "Early Rose",
    "school_type": "ECD",
    "school_uid": "SCH-00230",
    "school_number": "230",
    "suburb": null,
    "coord_east": "-33.797187",
    "coord_south": "25.60007679",
    "google_maps_link": "https://www.google.com/maps?q=-33.797187,25.60007679",
    "info": "'- School Address: No publicly listed street address found, but coordinates are -33.797187, 25.60007679 (per Google Maps link), which places it in the suburb of Motherwell, Gqeberha (Port Elizabeth), Eastern Cape.\n- School Email: Not publicly available.\n- School Principal: Not publicly available.\n- School Phone number: Not publicly available.\n- Suburb: Motherwell, Gqeberha (Port Elizabeth), Eastern Cape."
  },
  {
    "name": "Ebongweni",
    "school_type": "Primary",
    "school_uid": "SCH-00288",
    "school_number": "288",
    "suburb": "Kwazakhele",
    "coord_east": "-33.886577",
    "coord_south": "25.59307854",
    "google_maps_link": "https://www.google.com/maps?q=-33.88657731182538,25.593078539044985",
    "info": "School Address: 2 Madikane Street, Kwazakhele, Gqeberha, 6205\nSchool Email: az.vog.vorpce.ude@781001002\nSchool Principal: Not publicly listed\nSchool Phone number: 041 466 0921 / 082 436 0792\nSuburb: Kwazakhele"
  },
  {
    "name": "Ekhaya",
    "school_type": "ECD",
    "school_uid": "SCH-00282",
    "school_number": "282",
    "suburb": "New Brighton",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Elufefeni",
    "school_type": "Primary",
    "school_uid": "SCH-00274",
    "school_number": "274",
    "suburb": "Motherwell",
    "coord_east": "-33.815895",
    "coord_south": "25.57832300",
    "google_maps_link": "https://www.google.com/maps?q=-33.815895,25.578323",
    "info": "School Address: 34 Mzwazwa Street, Motherwell, Gqeberha, 6211\nSchool Email: yramirpinefefule@gmail.com\nSchool Principal: Not publicly listed\nSchool Phone number: 041 476 0217\nSuburb: Motherwell"
  },
  {
    "name": "Elukholweni",
    "school_type": "Primary",
    "school_uid": "SCH-00108",
    "school_number": "108",
    "suburb": "Theescombe",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Elundini",
    "school_type": "Primary",
    "school_uid": "SCH-00054",
    "school_number": "54",
    "suburb": "Motherwell",
    "coord_east": "-33.800416",
    "coord_south": "25.59449585",
    "google_maps_link": "https://www.google.com/maps?q=-33.800415905113304,25.594495854268374",
    "info": "School Address: 23 Bikana Street, Motherwell, 6211, Eastern Cape\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 041 489 0323\nSuburb: Motherwell, Gqeberha (Port Elizabeth)"
  },
  {
    "name": "Emafini",
    "school_type": "Primary",
    "school_uid": "SCH-00073",
    "school_number": "73",
    "suburb": "KwaDwesi",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Emfundweni",
    "school_type": "Primary",
    "school_uid": "SCH-00210",
    "school_number": "210",
    "suburb": "Zwide",
    "coord_east": "-33.858890",
    "coord_south": "25.55241160",
    "google_maps_link": "https://www.google.com/maps?q=-33.85889000634322,25.552411596136718",
    "info": "School Address: Qeto Location, Peddie, 5640\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 079 500 5830\nSuburb: Peddie"
  },
  {
    "name": "Emfundweni Pre-R Educare",
    "school_type": "ECD",
    "school_uid": "SCH-00213",
    "school_number": "213",
    "suburb": "Zwide",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Emmanuel Day Care",
    "school_type": "ECD",
    "school_uid": "SCH-00091",
    "school_number": "91",
    "suburb": "Kwazakhele",
    "coord_east": "-33.882236",
    "coord_south": "25.58708277",
    "google_maps_link": "https://www.google.com/maps?q=-33.88223647819642,25.587082772014572",
    "info": "School Address: Willowvale, Eastern Cape, P.O Box 328\nSchool Email: Not publicly listed\nSchool Principal: Lindelwa Tokozani Ntwasa\nSchool Phone number: Not publicly listed\nSuburb: Willowvale"
  },
  {
    "name": "Empumalanga",
    "school_type": "Primary",
    "school_uid": "SCH-00305",
    "school_number": "305",
    "suburb": "Motherwell",
    "coord_east": "-33.802862",
    "coord_south": "25.57756184",
    "google_maps_link": "https://www.google.com/maps?q=-33.80286155057907,25.57756184442606",
    "info": "School Address: Ntsanyana Street, Nu9, Motherwell, 6211\nSchool Email: 200100203@vodamail.co.za\nSchool Principal: Maqanda Nl (2023)\nSchool Phone number: (+27) 41 462 0082\nSuburb: Motherwell"
  },
  {
    "name": "Emsengeni",
    "school_type": "Primary",
    "school_uid": "SCH-00076",
    "school_number": "76",
    "suburb": "Soweto On Sea",
    "coord_east": "-33.865656",
    "coord_south": "25.56207521",
    "google_maps_link": "https://www.google.com/maps?q=-33.86565618061583,25.56207521160438",
    "info": "School Address: Naka Street, Zwide, Gqebera, 6201\nSchool Email: lanyoka3@gmail.com / az.oc.liamadov@402001002\nSchool Principal: Not publicly listed\nSchool Phone number: 041 464 5780 / 041 464 5781 / 078 886 5335\nSuburb: Zwide, Gqebera"
  },
  {
    "name": "Emzomncane",
    "school_type": "Primary",
    "school_uid": "SCH-00099",
    "school_number": "99",
    "suburb": "Zwide",
    "coord_east": "-33.866267",
    "coord_south": "25.57792042",
    "google_maps_link": "https://www.google.com/maps?q=-33.866267077235044,25.5779204204903",
    "info": "School Address: James Street, Zwide, Gqeberha, 6061\nSchool Email: emzomncaneprimary@gmail.com\nSchool Principal: (Not publicly listed in available sources)\nSchool Phone number: 041 467 0184\nSuburb: Zwide"
  },
  {
    "name": "Enkulekweni",
    "school_type": "Primary",
    "school_uid": "SCH-00075",
    "school_number": "75",
    "suburb": "Motherwell",
    "coord_east": "-33.772173",
    "coord_south": "25.57161513",
    "google_maps_link": "https://www.google.com/maps?q=-33.772173252599856,25.571615126175484",
    "info": "School Address: Ward 54, Nu 29, Motherwell, Port Elizabeth\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: Not publicly listed\nSuburb: Motherwell, Port Elizabeth, Eastern Cape"
  },
  {
    "name": "Enkwenkwezini",
    "school_type": "Primary",
    "school_uid": "SCH-00070",
    "school_number": "70",
    "suburb": "Motherwell",
    "coord_east": "-33.800786",
    "coord_south": "25.61273917",
    "google_maps_link": "https://www.google.com/maps?q=-33.800785765084896,25.612739166658976",
    "info": "School Address: Dyamala Location, Alice, 5700, Eastern Cape\nSchool Email: enkwenkwezinisss@gmail.com\nSchool Principal: Not publicly listed\nSchool Phone number: +27 72 484 2313 / +27 47 564 1241\nSuburb: Dyamala Location, Alice"
  },
  {
    "name": "Enqileni",
    "school_type": "Primary",
    "school_uid": "SCH-00097",
    "school_number": "97",
    "suburb": "Motherwell",
    "coord_east": "-33.804634",
    "coord_south": "25.60595884",
    "google_maps_link": "https://www.google.com/maps?q=-33.80463379329519,25.60595884336618",
    "info": "School Address: Phalo Street, N.U. 2, Motherwell, 6211\nSchool Email: vuyiswaamam@yahoo.com\nSchool Principal: Not publicly listed in recent sources\nSchool Phone number: 041 469 2034\nSuburb: Motherwell, Gqeberha (Port Elizabeth)"
  },
  {
    "name": "Entokozweni EduCare",
    "school_type": "ECD",
    "school_uid": "SCH-00247",
    "school_number": "247",
    "suburb": null,
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Esitiyeni",
    "school_type": "Primary",
    "school_uid": "SCH-00198",
    "school_number": "198",
    "suburb": "Zwide",
    "coord_east": "-33.859314",
    "coord_south": "25.56174444",
    "google_maps_link": "https://www.google.com/maps?q=-33.8593135221202,25.561744439198915",
    "info": "School Address: Cnr Katyu & Ndabambi Street, Zwide, Gqeberha (Port Elizabeth), 6201\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: +27 41 464 2377 / +27 81 410 3096\nSuburb: Zwide"
  },
  {
    "name": "EZ Kabane",
    "school_type": "High School",
    "school_uid": "SCH-00046",
    "school_number": "46",
    "suburb": "Kwa-Dwesi",
    "coord_east": "-33.840035",
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Ezibeleni ",
    "school_type": "ECD",
    "school_uid": "SCH-00231",
    "school_number": "231",
    "suburb": null,
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Fernwood Park",
    "school_type": "Primary",
    "school_uid": "SCH-00164",
    "school_number": "164",
    "suburb": "Hillside",
    "coord_east": "-33.865372",
    "coord_south": "25.51732061",
    "google_maps_link": "https://www.google.com/maps?q=-33.86537245649928,25.51732060851798",
    "info": "School Address: C/O Nicholson & Soudien Road, Fernwood Park Ext. 29, Gqeberha (Port Elizabeth), 6059\nSchool Email: az.oc.liamadov@912001002\nSchool Principal: Melisha Benjamin\nSchool Phone number: 041 485 1559\nSuburb: Fernwood Park, Gqeberha (Port Elizabeth)"
  },
  {
    "name": "Fontein",
    "school_type": "Primary",
    "school_uid": "SCH-00161",
    "school_number": "161",
    "suburb": "Galvandale",
    "coord_east": "-33.912376",
    "coord_south": "25.55539306",
    "google_maps_link": "https://www.google.com/maps?q=-33.91237570919772,25.555393064345097",
    "info": "School Address: Mcmanus Crescent, Gelvandale, Port Elizabeth, 6016\nSchool Email: remlesmailliw@gmail.com\nSchool Principal: Groenewald G (2023)\nSchool Phone number: (+27) 41 452 1341\nSuburb: Gelvandale, Port Elizabeth"
  },
  {
    "name": "Frank Joubert",
    "school_type": "Primary",
    "school_uid": "SCH-00180",
    "school_number": "180",
    "suburb": "Schauderville",
    "coord_east": "-33.931611",
    "coord_south": "25.57211218",
    "google_maps_link": "https://www.google.com/maps?q=-33.93161072420069,25.572112181533065",
    "info": "School Address: Highfield Road, Schauderville, Gqeberha, 6020\nSchool Email: frank.joubert1943@gmail.com\nSchool Principal: (Not publicly listed in recent sources)\nSchool Phone number: +27 41 110 2478\nSuburb: Schauderville"
  },
  {
    "name": "Fumisukoma",
    "school_type": "Primary",
    "school_uid": "SCH-00283",
    "school_number": "283",
    "suburb": "Motherwell",
    "coord_east": "-33.802852",
    "coord_south": "25.58195450",
    "google_maps_link": "https://www.google.com/maps?q=-33.802852,25.5819545",
    "info": "School Address: Ngqokweni Street, NU 9, Motherwell, 6211\nSchool Email: Not publicly listed (may use district/department email)\nSchool Principal: Not publicly listed\nSchool Phone number: 041 462 1204\nSuburb: Motherwell, Gqeberha (Port Elizabeth)"
  },
  {
    "name": "Funimfundo",
    "school_type": "Primary",
    "school_uid": "SCH-00062",
    "school_number": "62",
    "suburb": "Zwide",
    "coord_east": "-33.854207",
    "coord_south": "25.55261465",
    "google_maps_link": "https://www.google.com/maps?q=-33.85420710598839,25.552614653167943",
    "info": "School Address: Koyana Street, Zwide, Gqeberha (Port Elizabeth), 6000\nSchool Email: podnufminuf@gmail.com\nSchool Principal: Duna Km\nSchool Phone number: 041 459 5555 / 041 464 7777\nSuburb: Zwide"
  },
  {
    "name": "Future Angels ",
    "school_type": "ECD",
    "school_uid": "SCH-00052",
    "school_number": "52",
    "suburb": "Motherwell",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Future Kids Educare",
    "school_type": "ECD",
    "school_uid": "SCH-00225",
    "school_number": "225",
    "suburb": "Kwazakhele",
    "coord_east": "-33.893066",
    "coord_south": "25.59292460",
    "google_maps_link": "https://www.google.com/maps?q=-33.893066,25.5929246",
    "info": "School Address: 28 Moduka Street, Port Elizabeth, Eastern Cape\nSchool Email: Not publicly listed\nSchool Principal: Lungisa Maneli\nSchool Phone number: Not publicly listed\nSuburb: Port Elizabeth"
  },
  {
    "name": "Future Stars",
    "school_type": "ECD",
    "school_uid": "SCH-00255",
    "school_number": "255",
    "suburb": null,
    "coord_east": "-33.811756",
    "coord_south": "25.60075933",
    "google_maps_link": "https://www.google.com/maps?q=-33.811756,25.60075933",
    "info": "School Address: Not explicitly listed, but based on the Google Maps coordinates, it is in the suburb of Walmer, Gqeberha (Port Elizabeth), Eastern Cape.\nSchool Email: contact@futurestarschool.com\nSchool Principal: Not publicly listed.\nSchool Phone number: Not publicly listed.\nSuburb: Walmer, Gqeberha (Port Elizabeth)"
  },
  {
    "name": "G J Louw",
    "school_type": "Primary",
    "school_uid": "SCH-00155",
    "school_number": "155",
    "suburb": "Schauderville",
    "coord_east": "-33.935996",
    "coord_south": "25.57927837",
    "google_maps_link": "https://www.google.com/maps?q=-33.93599614343864,25.579278366666603",
    "info": "School Address: Grundling Street, Schauderville, Gqeberha (Port Elizabeth), 6020\nSchool Email: g.j.louw@telkomsa.net\nSchool Principal: Stevens Ba\nSchool Phone number: +27 41 451 1539\nSuburb: Schauderville"
  },
  {
    "name": "Garrett",
    "school_type": "Primary",
    "school_uid": "SCH-00088",
    "school_number": "88",
    "suburb": "Zwide",
    "coord_east": "-33.866781",
    "coord_south": "25.55838072",
    "google_maps_link": "https://www.google.com/maps?q=-33.86678061125113,25.55838072433332",
    "info": "School Address: Cnr Bertram And Johnson Road, Zwide, Gqeberha, 6205\nSchool Email: garretprim@gmail.com / garrettprimary@gmail.com\nSchool Principal: Mrs K.C Mdingi\nSchool Phone number: 041 464 1198 / 041 463 1198\nSuburb: Zwide"
  },
  {
    "name": "Gelvan Park",
    "school_type": "Primary",
    "school_uid": "SCH-00170",
    "school_number": "170",
    "suburb": "Gelvan Park",
    "coord_east": "-33.919547",
    "coord_south": "25.56233597",
    "google_maps_link": "https://www.google.com/maps?q=-33.91954698890374,25.562335966191586",
    "info": "School Address: Raphael Crescent, Gelvan Park, Port Elizabeth, 6016\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 041 452 2660\nSuburb: Gelvan Park"
  },
  {
    "name": "Gelvandale",
    "school_type": "Primary",
    "school_uid": "SCH-00130",
    "school_number": "130",
    "suburb": "Galvandale",
    "coord_east": "-33.915326",
    "coord_south": "25.55693785",
    "google_maps_link": "https://www.google.com/maps?q=-33.915326293762064,25.556937851323944",
    "info": "School Address: Martin Street, Gelvandale, Gqeberha, 6020\nSchool Email: gelvandalehigh@eject.co.za\nSchool Principal: Not publicly listed in recent sources\nSchool Phone number: 041-456 1632\nSuburb: Gelvandale"
  },
  {
    "name": "Gertrude Shope",
    "school_type": "Primary",
    "school_uid": "SCH-00275",
    "school_number": "275",
    "suburb": "Zinyoka ",
    "coord_east": "-33.859704",
    "coord_south": "25.54130200",
    "google_maps_link": "https://www.google.com/maps?q=-33.859704,25.541302",
    "info": "School Address: Baart Street, Govan Mbeki Township, Gqeberha, 6001\nSchool Email: epohsedurtreg@telkomsa.net\nSchool Principal: Ngcape T\nSchool Phone number: 041 464 2280\nSuburb: Govan Mbeki Township, Gqeberha"
  },
  {
    "name": "Good Hope",
    "school_type": "ECD",
    "school_uid": "SCH-00287",
    "school_number": "287",
    "suburb": "New Brighton",
    "coord_east": "-33.902598",
    "coord_south": "25.60338327",
    "google_maps_link": "https://www.google.com/maps?q=-33.902598,25.60338327",
    "info": "School Address: Nyanisweni Location, Cofimvaba, 5403\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 060 435 5989 / 073 359 8644\nSuburb: Cofimvaba"
  },
  {
    "name": "Govan Mbeki",
    "school_type": "ECD",
    "school_uid": "SCH-00223",
    "school_number": "223",
    "suburb": "Bethelsdorp",
    "coord_east": "-33.798819",
    "coord_south": "25.58876210",
    "google_maps_link": "https://www.google.com/maps?q=-33.798819,25.5887621",
    "info": "- School Address: 4 Glendale Ave, Fernglen, Gqeberha, Eastern Cape\n- School Email: Not publicly listed\n- School Principal: Not publicly listed\n- School Phone number: 064 531 2249\n- Suburb: Fernglen, Gqeberha"
  },
  {
    "name": "Green Apple",
    "school_type": "ECD",
    "school_uid": "SCH-00301",
    "school_number": "301",
    "suburb": "Kwazakhele",
    "coord_east": "-33.867071",
    "coord_south": "25.58793328",
    "google_maps_link": "https://www.google.com/maps?q=-33.86707115202112,25.58793327845681",
    "info": "School Address: 6807 Ngwendu Street, Kwazakhele, Port Elizabeth, 6205\nSchool Email: greenapplecreche@gmail.com\nSchool Principal: Not publicly listed\nSchool Phone number: 073 869 2323\nSuburb: Kwazakhele"
  },
  {
    "name": "Greenville",
    "school_type": "Primary",
    "school_uid": "SCH-00112",
    "school_number": "112",
    "suburb": "Chatty",
    "coord_east": "-33.870826",
    "coord_south": "25.50163708",
    "google_maps_link": "https://www.google.com/maps?q=-33.87082617881431,25.50163708015685",
    "info": "School Address: Etyeni A/A, Greenville Location, Bizana, 4800\nSchool Email: Not publicly listed\nSchool Principal: Mr. K Gamndana\nSchool Phone number: 079 973 8719\nSuburb: Bizana, Eastern Cape"
  },
  {
    "name": "Helenvale",
    "school_type": "Primary",
    "school_uid": "SCH-00145",
    "school_number": "145",
    "suburb": "Helenvale",
    "coord_east": "-33.910843",
    "coord_south": "25.55188882",
    "google_maps_link": "https://www.google.com/maps?q=-33.9108431517283,25.55188882064093",
    "info": "School Address: C/O Leith And Kobus Road, Gelvandale, Gqeberha, 6020\nSchool Email: spelavneleh@gmail.com\nSchool Principal: (Not publicly listed in available sources)\nSchool Phone number: 041 452 1616\nSuburb: Gelvandale"
  },
  {
    "name": "Hillcrest",
    "school_type": "Primary",
    "school_uid": "SCH-00166",
    "school_number": "166",
    "suburb": "Helenvale",
    "coord_east": "-33.707917",
    "coord_south": "25.54532815",
    "google_maps_link": "https://www.google.com/maps?q=-33.70791650168423,25.545328145437544",
    "info": "School Address: C/O Ethel & Chamois Street, Helenvale, Gqeberha (Port Elizabeth), 6020\nSchool Email: hillcrestschool@telkomsa.net\nSchool Principal: Not publicly listed\nSchool Phone number: 041 452 2638\nSuburb: Helenvale"
  },
  {
    "name": "Hlokoma",
    "school_type": "High School",
    "school_uid": "SCH-00044",
    "school_number": "44",
    "suburb": "East London",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Hlumelo",
    "school_type": "ECD",
    "school_uid": "SCH-00258",
    "school_number": "258",
    "suburb": null,
    "coord_east": "-33.808345",
    "coord_south": "25.60379802",
    "google_maps_link": "https://www.google.com/maps?q=-33.808345,25.60379802",
    "info": "'- School Address: Hlumelo, Eastern Cape (exact suburb not specified in the available government list, but matches the coordinates provided)\n- School Email: Not listed in the public government directory\n- School Principal: Not listed in the public government directory\n- School Phone number: Not listed in the public government directory\n- Suburb: Not specified in the public directory, but the coordinates place it near Motherwell, Gqeberha (Port Elizabeth)\n\nNote: The official government directory for Eastern Cape schools lists Hlumelo but does not provide principal, email, or phone number details. For the most current contact information, contacting the Eastern Cape Department of Education or visiting the school in person may be necessary."
  },
  {
    "name": "Holy Name Community",
    "school_type": "ECD",
    "school_uid": "SCH-00261",
    "school_number": "261",
    "suburb": "Kwazakhele",
    "coord_east": "-33.904184",
    "coord_south": "25.59829863",
    "google_maps_link": "https://www.google.com/maps?q=-33.904184489353234,25.598298627540355",
    "info": "'- School Address: No publicly listed street address found, but Google Maps places it at the coordinates: -33.904184, 25.598299 (Easter Cape, South Africa)\n- School Email: Not publicly listed\n- School Principal: Not publicly listed\n- School Phone number: Not publicly listed\n- Suburb: Not explicitly listed, but the coordinates are in Gqeberha (Port Elizabeth), Eastern Cape\n\nNo official website or direct contact details for \"Holy Name Community\" in the Eastern Cape were found in public directories or government bulletins. The information may be available from the Eastern Cape Department of Education or local education directories, but it is not currently listed online in public sources."
  },
  {
    "name": "Hombakazi",
    "school_type": "Primary",
    "school_uid": "SCH-00184",
    "school_number": "184",
    "suburb": "KwaNobuhle",
    "coord_east": "-33.820426",
    "coord_south": "25.39174476",
    "google_maps_link": "https://www.google.com/maps?q=-33.82042561941802,25.391744764339418",
    "info": "School Address: Cnr Mahlahla & Majombozi Street, Kwanobuhle, Kariega, 6242\nSchool Email: izakabmoh@telkomsa.net\nSchool Principal: N.E. Sali\nSchool Phone number: 041 977 6856\nSuburb: Kwanobuhle, Kariega"
  },
  {
    "name": "Ikamvalethu",
    "school_type": "ECD",
    "school_uid": "SCH-00250",
    "school_number": "250",
    "suburb": "Kwazakhele",
    "coord_east": "-33.798033",
    "coord_south": "25.58107180",
    "google_maps_link": "https://www.google.com/maps?q=-33.798033,25.5810718",
    "info": "School Address: Zone 27 Off Washington Street, Temba Nqose Street, Langa 7455\nSchool Email: admin@ikamvalethu.wcape.school.za\nSchool Principal: Samkelo Mabece\nSchool Phone number: 021 694 9933\nSuburb: Langa"
  },
  {
    "name": "Ikhwezelihle",
    "school_type": "Primary",
    "school_uid": "SCH-00095",
    "school_number": "95",
    "suburb": "Motherwell",
    "coord_east": "-33.817415",
    "coord_south": "25.58376170",
    "google_maps_link": "https://www.google.com/maps?q=-33.81741541345923,25.583761695495234",
    "info": "School Address: Nyara Street, NU 6, Gqeberha (Port Elizabeth), 6211\nSchool Email: Not publicly listed; general contact via Eastern Cape Education Department\nSchool Principal: Not publicly listed\nSchool Phone number: 041 462 3273\nSuburb: Motherwell, Gqeberha"
  },
  {
    "name": "Ilinge",
    "school_type": "Primary",
    "school_uid": "SCH-00175",
    "school_number": "175",
    "suburb": "KwaLanga",
    "coord_east": "-33.743041",
    "coord_south": "25.38749504",
    "google_maps_link": "https://www.google.com/maps?q=-33.743040809177266,25.387495037345733",
    "info": "School Address: Cnr 20th Avenue & Maduna Road, Kwa-Langa, Kariega (Uitenhage), 6230\nSchool Email: ilingeprimaryschool@gmail.com\nSchool Principal: Not publicly listed\nSchool Phone number: 041 450 7541\nSuburb: Kwa-Langa, Kariega (Uitenhage)"
  },
  {
    "name": "Ilitha",
    "school_type": "Primary",
    "school_uid": "SCH-00105",
    "school_number": "105",
    "suburb": "Kwazakhele",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Ilithalethu",
    "school_type": "ECD",
    "school_uid": "SCH-00094",
    "school_number": "94",
    "suburb": "Motherwell",
    "coord_east": "-33.781716",
    "coord_south": "25.58129948",
    "google_maps_link": "https://www.google.com/maps?q=-33.7817163663,25.58129947814828",
    "info": "'- School Address: Based on the Google Maps link, the coordinates (-33.7817163663, 25.58129947814828) place Ilithalethu in the Eastern Cape, near Motherwell, Gqeberha (Port Elizabeth).\n- School Email: Not publicly listed in available sources.\n- School Principal: Not publicly listed in available sources.\n- School Phone number: Not publicly listed in available sources.\n- Suburb: Motherwell, Gqeberha (Port Elizabeth)\n\nPublicly available government and education directories do not list specific contact details for Ilithalethu school in the Eastern Cape."
  },
  {
    "name": "Imbasa",
    "school_type": "Primary",
    "school_uid": "SCH-00066",
    "school_number": "66",
    "suburb": "Motherwell",
    "coord_east": "-33.772690",
    "coord_south": "25.58732145",
    "google_maps_link": "https://www.google.com/maps?q=-33.77268979718923,25.58732144553482",
    "info": "School Address: 23463 Xhama Street, Nu 12 B Motherwell, Gqeberha, 6211\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 041 488 0024\nSuburb: Motherwell, Gqeberha"
  },
  {
    "name": "Inkqubela",
    "school_type": "Primary",
    "school_uid": "SCH-00055",
    "school_number": "55",
    "suburb": "Kwazakhele",
    "coord_east": "-33.877579",
    "coord_south": "25.60279000",
    "google_maps_link": "https://www.google.com/maps?q=-33.87757949882382,25.602789998568316",
    "info": "School Address: Stofile Street, Kwazakhele, Gqeberha, 6205\nSchool Email: AZ.OC.LIAMADOV@733001002\nSchool Principal: Not publicly listed\nSchool Phone number: +27 41 467 4484\nSuburb: Kwazakhele"
  },
  {
    "name": "Isaac Booi",
    "school_type": "Primary",
    "school_uid": "SCH-00277",
    "school_number": "277",
    "suburb": "Zwide",
    "coord_east": "-33.869901",
    "coord_south": "25.56702346",
    "google_maps_link": "https://www.google.com/maps?q=-33.86990109981518,25.567023463076644",
    "info": "School Address: Ngqungwana Street, Zwide, Gqeberha (Port Elizabeth), 6201\nSchool Email: iooiobcaasi@gmail.com\nSchool Principal: S.P. Mtyobo\nSchool Phone number: 041 464 3260\nSuburb: Zwide"
  },
  {
    "name": "Isilimela",
    "school_type": "High School",
    "school_uid": "SCH-00008",
    "school_number": "8",
    "suburb": "Berlin",
    "coord_east": "-33.945811",
    "coord_south": "18.54018845",
    "google_maps_link": "https://www.google.com/maps?q=-33.94581126476353,18.540188445221464",
    "info": "School Address: Gomolo A/A, Port St Johns, 5120, Eastern Cape, South Africa\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 047 564 9620\nSuburb: Port St Johns"
  },
  {
    "name": "Isizwe Sethu",
    "school_type": "ECD",
    "school_uid": "SCH-00265",
    "school_number": "265",
    "suburb": null,
    "coord_east": "-33.797585",
    "coord_south": "25.60199828",
    "google_maps_link": "https://www.google.com/maps?q=-33.797585,25.60199828",
    "info": "'- School Address: Coordinates -33.797585, 25.60199828 (per Google Maps, this is in Motherwell, Gqeberha, Eastern Cape)\n- School Email: Not publicly listed\n- School Principal: Not publicly listed\n- School Phone number: Not publicly listed\n- Suburb: Motherwell, Gqeberha, Eastern Cape"
  },
  {
    "name": "Ithembalethu",
    "school_type": "ECD",
    "school_uid": "SCH-00268",
    "school_number": "268",
    "suburb": "New Brighton",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Ithembelihle",
    "school_type": "High School",
    "school_uid": "SCH-00013",
    "school_number": "13",
    "suburb": "New Brighton",
    "coord_east": "-33.902457",
    "coord_south": "25.58552687",
    "google_maps_link": "https://www.google.com/maps?q=-33.90245668679504,25.585526866664686",
    "info": "School Address: Marwanqa Street, New Brighton, Gqeberha, 6200\nSchool Email: elhilebmeti@telkomsa.net\nSchool Principal: Not publicly listed in available sources\nSchool Phone number: 041 454 1308\nSuburb: New Brighton"
  },
  {
    "name": "J K Zondi",
    "school_type": "Primary",
    "school_uid": "SCH-00169",
    "school_number": "169",
    "suburb": "Kwazakhele",
    "coord_east": "-33.877141",
    "coord_south": "25.57278062",
    "google_maps_link": "https://www.google.com/maps?q=-33.877140564915294,25.57278062385935",
    "info": "School Address: 5008 Tubali Street, Kwazakhele, Port Elizabeth, 6205\nSchool Email: moc.liamg@54eikron (may be a generic or placeholder email)\nSchool Principal: Not publicly listed in recent sources\nSchool Phone number: 041 464 7376\nSuburb: Kwazakhele"
  },
  {
    "name": "J N Tulwana",
    "school_type": "Primary",
    "school_uid": "SCH-00194",
    "school_number": "194",
    "suburb": "KwaNobuhle",
    "coord_east": "-33.808550",
    "coord_south": "25.38245673",
    "google_maps_link": "https://www.google.com/maps?q=-33.80855030140856,25.38245673363234",
    "info": "School Address: 29 Mtirara Street, Kwanobuhle, Uitenhage, 6242\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: +27 41 977 0097 / +27 47 553 0054\nSuburb: Kwanobuhle, Uitenhage (now Kariega)"
  },
  {
    "name": "James Jolobe",
    "school_type": "High School",
    "school_uid": "SCH-00024",
    "school_number": "24",
    "suburb": "Motherwell",
    "coord_east": "-33.813516",
    "coord_south": "25.58926007",
    "google_maps_link": "https://www.google.com/maps?q=-33.81351586202761,25.58926006850705",
    "info": "School Address: 237 Nyara Street, NU 4a, Motherwell, 6211\nSchool Email: az.oc.liamadov@743001002\nSchool Principal: Not publicly listed\nSchool Phone number: 041 476 0731 / 041 469 1077\nSuburb: Motherwell, Port Elizabeth (Gqeberha)"
  },
  {
    "name": "James Ndulula",
    "school_type": "Primary",
    "school_uid": "SCH-00163",
    "school_number": "163",
    "suburb": "KwaLanga",
    "coord_east": "-33.735137",
    "coord_south": "25.39051803",
    "google_maps_link": "https://www.google.com/maps?q=-33.735136584059475,25.390518033652995",
    "info": "School Address: Pongolo Street, Langa Location, Kariega, 6241\nSchool Email: aluludnsemaj@gmail.com\nSchool Principal: Not publicly listed\nSchool Phone number: 041 988 0051\nSuburb: Langa Location, Kariega"
  },
  {
    "name": "James Ntungwana",
    "school_type": "Primary",
    "school_uid": "SCH-00116",
    "school_number": "116",
    "suburb": "KwaNobuhle",
    "coord_east": "-33.803117",
    "coord_south": "25.38084416",
    "google_maps_link": "https://www.google.com/maps?q=-33.80311709425297,25.380844164811776",
    "info": "School Address: Tyhulu Street, Kwanobuhle Township, Uitenhage, 6242\nSchool Email: AZ.OC.LIAMTOH@EJMALOZ (may be a placeholder or encoded, as no direct school email is listed)\nSchool Principal: Bloouw Zj (listed as contact person)\nSchool Phone number: 041 977 1103\nSuburb: Kariega (Kwanobuhle)"
  },
  {
    "name": "Jarvis Gqamlana",
    "school_type": "Primary",
    "school_uid": "SCH-00049",
    "school_number": "49",
    "suburb": "New Brighton",
    "coord_east": "-33.903182",
    "coord_south": "25.60289521",
    "google_maps_link": "https://www.google.com/maps?q=-33.903181597594866,25.60289520836473",
    "info": "School Address: Singaphi Street, New Brighton, Gqeberha (Port Elizabeth), 6200\nSchool Email: az.oc.liambew@elemefasmud\nSchool Principal: Not publicly listed in recent sources\nSchool Phone number: 041 458 5024\nSuburb: New Brighton"
  },
  {
    "name": "Jeffrey's Bay",
    "school_type": "High School",
    "school_uid": "SCH-00015",
    "school_number": "15",
    "suburb": "Jeffery's Bay",
    "coord_east": "-34.050288",
    "coord_south": "24.91195819",
    "google_maps_link": "https://www.google.com/maps?q=-34.05028841319953,24.91195819299756",
    "info": "School Address: St Francis Street, Jeffreys Bay, Eastern Cape\nSchool Email: jbayschool@epweb.co.za\nSchool Principal: Not publicly listed\nSchool Phone number: 042 293 1343\nSuburb: Jeffreys Bay"
  },
  {
    "name": "Jesus Dominion",
    "school_type": "ECD",
    "school_uid": "SCH-00310",
    "school_number": "310",
    "suburb": "Motherwell",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Joe Slovo",
    "school_type": "Primary",
    "school_uid": "SCH-00131",
    "school_number": "131",
    "suburb": "KwaDwesi",
    "coord_east": "-33.829716",
    "coord_south": "25.50267762",
    "google_maps_link": "https://www.google.com/maps?q=-33.82971585116566,25.502677622483915",
    "info": "School Address: 185-205 Melumzi Street, Joe Slovo Township, Gqeberha 6004\nSchool Email: normankupa@yahoo.com\nSchool Principal: Not publicly listed\nSchool Phone number: 041 485 7005\nSuburb: Joe Slovo Township, Gqeberha"
  },
  {
    "name": "John Masiza",
    "school_type": "Primary",
    "school_uid": "SCH-00192",
    "school_number": "192",
    "suburb": "Walmer",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Jongilanga",
    "school_type": "ECD",
    "school_uid": "SCH-00290",
    "school_number": "290",
    "suburb": "New Brighton",
    "coord_east": "-33.892279",
    "coord_south": "25.60689462",
    "google_maps_link": "https://www.google.com/maps?q=-33.892279,25.60689462",
    "info": "School Address: Jongilanga Location, Kwelerha, East London, 5200\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 073 280 9545 / +27 79 203 1980\nSuburb: Kwelerha, East London"
  },
  {
    "name": "Jongingomso ECD",
    "school_type": "ECD",
    "school_uid": "SCH-00267",
    "school_number": "267",
    "suburb": "Motherwell",
    "coord_east": "-33.805937",
    "coord_south": "25.60518046",
    "google_maps_link": "https://www.google.com/maps?q=-33.80593666819742,25.60518045818854",
    "info": "School Address: 335 Vinjiwe Crescent, Motherwell, Eastern Cape\nSchool Email: Not publicly listed\nSchool Principal: Tandiswa Hlalukana\nSchool Phone number: Not publicly listed\nSuburb: Motherwell"
  },
  {
    "name": "Jubilee Park",
    "school_type": "Primary",
    "school_uid": "SCH-00171",
    "school_number": "171",
    "suburb": "Gerald Smith",
    "coord_east": "-33.754513",
    "coord_south": "25.38044213",
    "google_maps_link": "https://www.google.com/maps?q=-33.75451300818391,25.38044212569802",
    "info": "School Address: 27 Makappa Street, Gerald Smith Township, Kariega (Uitenhage), 6241\nSchool Email: Not publicly listed (only \"Eastern Cape ...\" found, no full email)\nSchool Principal: Not publicly listed\nSchool Phone number: 041 988 3131 or 067 926 7249\nSuburb: Gerald Smith Township, Kariega (Uitenhage)"
  },
  {
    "name": "Kama",
    "school_type": "Primary",
    "school_uid": "SCH-00071",
    "school_number": "71",
    "suburb": "New Brighton",
    "coord_east": "-33.903996",
    "coord_south": "25.59887605",
    "google_maps_link": "https://www.google.com/maps?q=-33.90399612032088,25.59887605085005",
    "info": "School Address: Annshaw Location, Middledrift, 5685\nSchool Email: Not publicly listed\nSchool Principal: Kg Mtotywa\nSchool Phone number: 040 657 3454\nSuburb: Middledrift"
  },
  {
    "name": "Kamvalethu Daycare",
    "school_type": "ECD",
    "school_uid": "SCH-00214",
    "school_number": "214",
    "suburb": "Kwa-Dwesi",
    "coord_east": "-33.826530",
    "coord_south": "25.50873476",
    "google_maps_link": "https://www.google.com/maps?q=-33.826529702079064,25.50873476416316",
    "info": "- School Address: 7 Thandaswa Street, Despatch, Eastern Cape\n- School Email: kamvalethudaycare@gmail.com\n- School Principal: Nokuzola Mphalisa\n- School Phone number: +27 84 428 3498\n- Suburb: Despatch"
  },
  {
    "name": "Kayser Ngxwana",
    "school_type": "Primary",
    "school_uid": "SCH-00065",
    "school_number": "65",
    "suburb": "Kwazakhele",
    "coord_east": "-33.876243",
    "coord_south": "25.59342664",
    "google_maps_link": "https://www.google.com/maps?q=-33.87624287519675,25.593426637827807",
    "info": "School Address: Mavavana Street, Kwazakhele, Gqeberha, 6205\nSchool Email: chumasandwani@gmail.com\nSchool Principal: Tesana Mo\nSchool Phone number: +27 41 205 0839\nSuburb: Kwazakhele"
  },
  {
    "name": "Khanyisa",
    "school_type": "Primary",
    "school_uid": "SCH-00317",
    "school_number": "317",
    "suburb": "Mdantsane",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Khanyisa HS",
    "school_type": "High School",
    "school_uid": "SCH-00047",
    "school_number": "47",
    "suburb": "Kwa-Dwesi",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Khazimla Pre-School",
    "school_type": "ECD",
    "school_uid": "SCH-00208",
    "school_number": "208",
    "suburb": "Motherwell",
    "coord_east": "-33.784356",
    "coord_south": "25.56355004",
    "google_maps_link": "https://www.google.com/maps?q=-33.78435559694722,25.56355004395153",
    "info": "'- School Address: No publicly listed street address found, but location is at coordinates -33.78435559694722, 25.56355004395153 (as per Google Maps)\n- School Email: Not publicly available\n- School Principal: Not publicly available\n- School Phone number: Not publicly available\n- Suburb: Motherwell, Gqeberha (based on Google Maps coordinates)"
  },
  {
    "name": "Khulile",
    "school_type": "Primary",
    "school_uid": "SCH-00086",
    "school_number": "86",
    "suburb": "Motherwell",
    "coord_east": "-33.810946",
    "coord_south": "25.58231362",
    "google_maps_link": "https://www.google.com/maps?q=-33.81094561433684,25.58231362248281",
    "info": "School Address: Ndakana Street, Nu 7, Motherwell, 6211\nSchool Email: az.oc.liamadov@yramirp.eliluhk\nSchool Principal: Not publicly listed\nSchool Phone number: 041 462 3120\nSuburb: Motherwell, Gqeberha"
  },
  {
    "name": "Khumbulani",
    "school_type": "High School",
    "school_uid": "SCH-00005",
    "school_number": "5",
    "suburb": "Richmond Hill",
    "coord_east": "-33.957430",
    "coord_south": "25.61477420",
    "google_maps_link": "https://www.google.com/maps?q=-33.95743048071028,25.614774197350563",
    "info": "School Address: 17 Lutman Street, Centrahill, Central, Qeberha (Port Elizabeth), 6001\nSchool Email: Not publicly listed\nSchool Principal: Mrs Manyathi (recently retired; current principal not clearly listed)\nSchool Phone number: 041 582 2430\nSuburb: Centrahill, Central, Qeberha (Port Elizabeth)"
  },
  {
    "name": "Khwezi Lomso",
    "school_type": "High School",
    "school_uid": "SCH-00004",
    "school_number": "4",
    "suburb": "Zwide",
    "coord_east": "-33.868159",
    "coord_south": "25.55375010",
    "google_maps_link": "https://www.google.com/maps?q=-33.86815882968297,25.55375010308872",
    "info": "School Address: Johnson Road, Zwide, Gqeberha (Port Elizabeth), 6201\nSchool Email: khwezilomso@telkomsa.net\nSchool Principal: Not publicly listed in available sources\nSchool Phone number: 041 464 1326 / +27 41 023 0280\nSuburb: Zwide, Gqeberha (Port Elizabeth)"
  },
  {
    "name": "Kideo Learning Centre",
    "school_type": "ECD",
    "school_uid": "SCH-00222",
    "school_number": "222",
    "suburb": "Motherwell",
    "coord_east": "-33.823376",
    "coord_south": "25.58350758",
    "google_maps_link": "https://www.google.com/maps?q=-33.82337578572086,25.58350757931889",
    "info": "School Address: 1A Nile Road, Perridgevale, Port Elizabeth, Eastern Cape, 6001\nSchool Email: Not publicly listed\nSchool Principal: Lindiwe Ntenteni\nSchool Phone number: Not publicly listed\nSuburb: Perridgevale"
  },
  {
    "name": "Kids College",
    "school_type": "ECD",
    "school_uid": "SCH-00056",
    "school_number": "56",
    "suburb": "Motherwell",
    "coord_east": "-33.776859",
    "coord_south": "25.57055492",
    "google_maps_link": "https://www.google.com/maps?q=-33.77685901212574,25.57055492043574",
    "info": "'- School Address: No publicly listed address found for \"Kids College\" in Eastern Cape, but the Google Maps coordinates point to an area in Gqeberha (Port Elizabeth).\n- School Email: Not publicly available.\n- School Principal: Not publicly available.\n- School Phone number: Not publicly available.\n- Suburb: The coordinates are in the suburb of Walmer, Gqeberha (Port Elizabeth), Eastern Cape.\n\nNo official website or public directory entry for \"Kids College\" in the Eastern Cape was found in current online sources."
  },
  {
    "name": "Kings and Quuens",
    "school_type": "ECD",
    "school_uid": "SCH-00237",
    "school_number": "237",
    "suburb": "New Brighton",
    "coord_east": "-33.865724",
    "coord_south": "25.57466131",
    "google_maps_link": "https://www.google.com/maps?q=-33.865723583230995,25.574661305043687",
    "info": "School Address: 43 Burthurst Street, Makhanda, Eastern Cape\nSchool Email: Not publicly listed\nSchool Principal: Julia Nungi\nSchool Phone number: Not publicly listed\nSuburb: Makhanda\n\nSource: https://www.school-register.co.za/school/kings-and-queens-2/"
  },
  {
    "name": "KK Ncwana",
    "school_type": "Primary",
    "school_uid": "SCH-00089",
    "school_number": "89",
    "suburb": "Kwazakhele",
    "coord_east": "-33.880010",
    "coord_south": "25.57602828",
    "google_maps_link": "https://www.google.com/maps?q=-33.88000954461438,25.57602828015732",
    "info": "School Address: Gaika Street, Kwazakhele, Port Elizabeth (Gqeberha), 6205\nSchool Email: 463001002@vodamail.co.za\nSchool Principal: Ms. E Hlobo\nSchool Phone number: 041 464 6264\nSuburb: Kwazakhele"
  },
  {
    "name": "Kleinskool",
    "school_type": "Primary",
    "school_uid": "SCH-00137",
    "school_number": "137",
    "suburb": "Saltville",
    "coord_east": "-33.857259",
    "coord_south": "25.51656528",
    "google_maps_link": "https://www.google.com/maps?q=-33.85725925435003,25.516565278308704",
    "info": "School Address: C/O Kleinskool & Soudien Rd, Saltville, Gqeberha, 6058\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed (Deputy Principal: Buyiswa Kaya)\nSchool Phone number: 041 485 6020\nSuburb: Saltville, Gqeberha"
  },
  {
    "name": "Koester",
    "school_type": "ECD",
    "school_uid": "SCH-00106",
    "school_number": "106",
    "suburb": "Motherwell",
    "coord_east": "-33.815336",
    "coord_south": "25.58711732",
    "google_maps_link": "https://www.google.com/maps?q=-33.81533579830646,25.587117317512114",
    "info": "School Address: 60 Mgwenyana Street, Port Elizabeth, Eastern Cape\nSchool Email: Not publicly listed\nSchool Principal: Thandeka Yoyo\nSchool Phone number: Not publicly listed\nSuburb: Port Elizabeth"
  },
  {
    "name": "Kokkewiet",
    "school_type": "ECD",
    "school_uid": "SCH-00292",
    "school_number": "292",
    "suburb": "Oysterbay",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Kroneberg",
    "school_type": "Primary",
    "school_uid": "SCH-00077",
    "school_number": "77",
    "suburb": "Bethelsdorp",
    "coord_east": "-33.865135",
    "coord_south": "25.49408062",
    "google_maps_link": "https://www.google.com/maps?q=-33.865134973246356,25.49408062433332",
    "info": "School Address: Kroneberg Drive, Extension 21, Chatty, Qeberha, 6059\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 041 481 8710\nSuburb: Chatty, Qeberha"
  },
  {
    "name": "Kruisrivier",
    "school_type": "Primary",
    "school_uid": "SCH-00186",
    "school_number": "186",
    "suburb": "Kruisriver",
    "coord_east": "-33.765362",
    "coord_south": "25.34922857",
    "google_maps_link": "https://www.google.com/maps?q=-33.76536241967626,25.34922856618221",
    "info": "School Address: 117 Kruisrivier Road, Kruisriver, Uitenhage, 6230\nSchool Email: spreivirsiurk@gmail.com\nSchool Principal: Muller Lr (2023)\nSchool Phone number: (+27) 41 991 1947\nSuburb: Uitenhage Farms"
  },
  {
    "name": "Kuyga",
    "school_type": "Primary",
    "school_uid": "SCH-00183",
    "school_number": "183",
    "suburb": "Kuyga",
    "coord_east": "-33.923017",
    "coord_south": "25.44427145",
    "google_maps_link": "https://www.google.com/maps?q=-33.92301743074197,25.444271452697272",
    "info": "School Address: Erf 651 Nkanjeni Drive, Kuyga Township, Port Elizabeth, 6390\nSchool Email: jnyvrem@evil.co.za (decoded from az.oc.evil@jnyvrem)\nSchool Principal: Not publicly listed in recent sources\nSchool Phone number: +27 41 476 0704\nSuburb: Kuyga Township, Port Elizabeth"
  },
  {
    "name": "Kwakhanya",
    "school_type": "ECD",
    "school_uid": "SCH-00240",
    "school_number": "240",
    "suburb": "New Brighton",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Kwakhanya Daycare",
    "school_type": "ECD",
    "school_uid": "SCH-00209",
    "school_number": "209",
    "suburb": "Motherwell",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "KwaMagxaki",
    "school_type": "High School",
    "school_uid": "SCH-00023",
    "school_number": "23",
    "suburb": "Kwa-Magxaki",
    "coord_east": "-33.848020",
    "coord_south": "25.54222395",
    "google_maps_link": "https://www.google.com/maps?q=-33.84801992644832,25.542223953167625",
    "info": "School Address: 2 Ralo Road, KwaMagxaki, Gqeberha, 6201\nSchool Email: kwamagxakiss@gmail.com\nSchool Principal: Mr M Kalashe\nSchool Phone number: 041 463 3966\nSuburb: KwaMagxaki."
  },
  {
    "name": "KwaNoXolo",
    "school_type": "Primary",
    "school_uid": "SCH-00082",
    "school_number": "82",
    "suburb": "KwaNoxolo",
    "coord_east": "-33.857541",
    "coord_south": "25.48796558",
    "google_maps_link": "https://www.google.com/maps?q=-33.857541169778905,25.487965582003472",
    "info": "School Address: 2681 Lingelihle Street, Kwanoxolo, Gqeberha, 6059\nSchool Email: 387loohcsyramirp.oloxonawk@gmail.com\nSchool Principal: Not publicly listed\nSchool Phone number: 067 622 0909\nSuburb: Kwanoxolo, Gqeberha"
  },
  {
    "name": "Kwazakhele",
    "school_type": "High School",
    "school_uid": "SCH-00028",
    "school_number": "28",
    "suburb": "Kwazakhele",
    "coord_east": "-33.883520",
    "coord_south": "25.57578934",
    "google_maps_link": "https://www.google.com/maps?q=-33.88351981060781,25.57578933967558",
    "info": "School Address: Jakavula Street, Kwa Zakhele, Gqeberha, 6205\nSchool Email: Not publicly listed (general: Eastern Cape Education)\nSchool Principal: Not publicly listed\nSchool Phone number: 041 464 7429\nSuburb: Kwa Zakhele"
  },
  {
    "name": "Lamani",
    "school_type": "Primary",
    "school_uid": "SCH-00067",
    "school_number": "67",
    "suburb": "New Brighton",
    "coord_east": "-33.893829",
    "coord_south": "25.59003491",
    "google_maps_link": "https://www.google.com/maps?q=-33.893829,25.59003491",
    "info": "School Address: Maselana Street, New Brighton, Gqeberha, 6200\nSchool Email: agnolodz@gmail.com\nSchool Principal: Not publicly listed\nSchool Phone number: 041 454 1357\nSuburb: New Brighton"
  },
  {
    "name": "Lavela Pre-School",
    "school_type": "ECD",
    "school_uid": "SCH-00215",
    "school_number": "215",
    "suburb": "Kwa-Dwesi",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Libhongo Lwethu",
    "school_type": "ECD",
    "school_uid": "SCH-00061",
    "school_number": "61",
    "suburb": "Zwide",
    "coord_east": "-33.817753",
    "coord_south": "25.58517385",
    "google_maps_link": "https://www.google.com/maps?q=-33.817752707466994,25.585173853805117",
    "info": "- School Address: No publicly listed street address found, but coordinates place it in Motherwell, Gqeberha, Eastern Cape.\n- School Email: Not publicly available.\n- School Principal: Not publicly available.\n- School Phone number: Not publicly available.\n- Suburb: Motherwell, Gqeberha, Eastern Cape."
  },
  {
    "name": "lihlombe Educare",
    "school_type": "ECD",
    "school_uid": "SCH-00207",
    "school_number": "207",
    "suburb": "Zwide",
    "coord_east": "-33.876113",
    "coord_south": "25.56777245",
    "google_maps_link": "https://www.google.com/maps?q=-33.876112569529624,25.56777244881056",
    "info": "School Address: 24 Mpehla Street, Eastern Cape\nSchool Email: Not publicly listed\nSchool Principal: Linda Ngwendu\nSchool Phone number: Not publicly listed\nSuburb: Not specified, but based on the coordinates, it is in Motherwell, Gqeberha (Port Elizabeth)"
  },
  {
    "name": "Likhaya Daycare",
    "school_type": "ECD",
    "school_uid": "SCH-00216",
    "school_number": "216",
    "suburb": "Soweto On Sea",
    "coord_east": "-33.861104",
    "coord_south": "25.57001441",
    "google_maps_link": "https://www.google.com/maps?q=-33.86110447356961,25.57001440644629",
    "info": "School Address: Not explicitly listed, but located in a city in the Eastern Cape (see Google Maps coordinates)\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: Not publicly listed\nSuburb: Not explicitly listed, but the coordinates place it in or near Port Elizabeth/Gqeberha\n\nThe only public listing found confirms the existence of \"Likhaya Day Care Centre\" as a registered daycare/aftercare facility in a city in the Eastern Cape, but no direct contact details or principal name are provided in the available public records."
  },
  {
    "name": "Linge Tots",
    "school_type": "ECD",
    "school_uid": "SCH-00244",
    "school_number": "244",
    "suburb": "New Brighton",
    "coord_east": "-33.870429",
    "coord_south": "25.58653796",
    "google_maps_link": "https://www.google.com/maps?q=-33.87042893406667,25.58653795619738",
    "info": "School Address: Mtshiselwa Street, Kwazakele, Eastern Cape\nSchool Email: Not publicly listed\nSchool Principal: Fezeka Gawula\nSchool Phone number: 082 511 7904\nSuburb: Kwazakele"
  },
  {
    "name": "Lingelethu",
    "school_type": "Primary",
    "school_uid": "SCH-00322",
    "school_number": "322",
    "suburb": "Buizedenhoutville",
    "coord_east": "-32.691737",
    "coord_south": "26.30642032",
    "google_maps_link": "https://www.google.com/maps?q=-32.69173724467355,26.306420324922748",
    "info": "School Address: Adelaide, Eastern Cape (based on Google Maps and Facebook listing)\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: +27 63 843 0563\nSuburb: Adelaide"
  },
  {
    "name": "Lithemba",
    "school_type": "ECD",
    "school_uid": "SCH-00309",
    "school_number": "309",
    "suburb": "Kwazakhele",
    "coord_east": "-33.870954",
    "coord_south": "25.58511004",
    "google_maps_link": "https://www.google.com/maps?q=-33.87095351349572,25.585110036828645",
    "info": "School Address: No specific street address found, but located in Eastern Cape (see suburb below)\nSchool Email: admin@lithembaacademyschools.co.za\nSchool Principal: Not publicly listed\nSchool Phone number: 063 007 8597 / 072 064 3182\nSuburb: Motherwell, Gqeberha (based on Google Maps coordinates)\n\nSources:\n- https://www.lithembaacademyschools.co.za/\n- https://www.facebook.com/100091649477847/photos/lithemba-academy-registered-independent-schoolemis-number-5005070110333482756-i-/804551965943112/"
  },
  {
    "name": "Little Angels Unite",
    "school_type": "ECD",
    "school_uid": "SCH-00254",
    "school_number": "254",
    "suburb": "Kwazakhele",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Little Flower",
    "school_type": "Primary",
    "school_uid": "SCH-00187",
    "school_number": "187",
    "suburb": "Mosel",
    "coord_east": "-33.750837",
    "coord_south": "25.40018209",
    "google_maps_link": "https://www.google.com/maps?q=-33.75083718176702,25.400182093170432",
    "info": "School Address: Main Road to Kokstad, Qumbu Village, Qumbu, 5180, Eastern Cape\nSchool Email: Not publicly listed\nSchool Principal: Ll Kondlo\nSchool Phone number: 078 581 7419\nSuburb: Qumbu"
  },
  {
    "name": "Little Flowers ",
    "school_type": "ECD",
    "school_uid": "SCH-00328",
    "school_number": "328",
    "suburb": "Motherwell",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Little Ships",
    "school_type": "ECD",
    "school_uid": "SCH-00226",
    "school_number": "226",
    "suburb": null,
    "coord_east": "-33.891912",
    "coord_south": "25.60715675",
    "google_maps_link": "https://www.google.com/maps?q=-33.891912,25.60715675",
    "info": "- School Address: No publicly listed address found, but coordinates place it in Humewood, Port Elizabeth, Eastern Cape.\n- School Email: Not publicly available.\n- School Principal: Not publicly available.\n- School Phone number: Not publicly available.\n- Suburb: Humewood, Port Elizabeth, Eastern Cape\n\nNo official website or government listing with contact details for \"Little Ships\" in the Eastern Cape was found in public sources. The Google Maps link places it in Humewood, Port Elizabeth."
  },
  {
    "name": "Living Ubuntu",
    "school_type": "ECD",
    "school_uid": "SCH-00316",
    "school_number": "316",
    "suburb": "Umzamowethu",
    "coord_east": "-34.165628",
    "coord_south": "24.66436600",
    "google_maps_link": "https://www.google.com/maps?q=-34.165628,24.664366",
    "info": "- School Address: No publicly listed address found, but coordinates place it near Humansdorp, Eastern Cape.\n- School Email: Not publicly available.\n- School Principal: Not publicly available.\n- School Phone number: Not publicly available.\n- Suburb: Near Humansdorp, Eastern Cape.\n\nNo official or government listing for \"Living Ubuntu\" school in the Eastern Cape was found in public records or education department databases."
  },
  {
    "name": "Livuse",
    "school_type": "ECD",
    "school_uid": "SCH-00079",
    "school_number": "79",
    "suburb": "Motherwell",
    "coord_east": "-33.797813",
    "coord_south": "25.61568401",
    "google_maps_link": "https://www.google.com/maps?q=-33.79781278343788,25.615684011568295",
    "info": "'- School Address: No specific street address found, but location is at coordinates -33.79781278343788, 25.615684011568295 (as per Google Maps link)\n- School Email: Not publicly listed\n- School Principal: Not publicly listed\n- School Phone number: Not publicly listed\n- Suburb: Not explicitly listed, but coordinates place it near Motherwell, Gqeberha (Port Elizabeth), Eastern Cape\n\nNo official website or direct contact details for Livuse School were found in public sources."
  },
  {
    "name": "Lovemore Park",
    "school_type": "Primary",
    "school_uid": "SCH-00176",
    "school_number": "176",
    "suburb": "Lovemore Park",
    "coord_east": "-34.013873",
    "coord_south": "25.51990144",
    "google_maps_link": "https://www.google.com/maps?q=-34.013872689660005,25.519901437362172",
    "info": "School Address: Sardinia Bay Road, Lovemore Park, Gqeberha, 6011\nSchool Email: adnamuknadnaya@yahoo.com\nSchool Principal: Not publicly listed\nSchool Phone number: 041 366 1551\nSuburb: Lovemore Park"
  },
  {
    "name": "Loyiso",
    "school_type": "High School",
    "school_uid": "SCH-00042",
    "school_number": "42",
    "suburb": "Zwide",
    "coord_east": "-33.870509",
    "coord_south": "25.56410352",
    "google_maps_link": "https://www.google.com/maps?q=-33.87050854890195,25.56410351843085",
    "info": "School Address: Cnr Javu & Spondo Street, Zwide, Gqeberha, 6201\nSchool Email: apoh.amalul@yahoo.com\nSchool Principal: Not publicly listed\nSchool Phone number: +27 41 459 5043\nSuburb: Zwide, Gqeberha"
  },
  {
    "name": "Lukhanyiselo",
    "school_type": "ECD",
    "school_uid": "SCH-00241",
    "school_number": "241",
    "suburb": null,
    "coord_east": "-33.903268",
    "coord_south": "25.58865101",
    "google_maps_link": "https://www.google.com/maps?q=-33.903268,25.58865101",
    "info": "School Address: Khanyiso Loc, Lukhanyiso Str, Pearston 5860, Eastern Cape\nSchool Email: sposiynahkul@gmail.com\nSchool Principal: Mtayisi X (2023)\nSchool Phone number: 042 246 1621\nSuburb: Khanyiso Location"
  },
  {
    "name": "Lukhanyiso",
    "school_type": "ECD",
    "school_uid": "SCH-00229",
    "school_number": "229",
    "suburb": null,
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Lukhanyiso Educare",
    "school_type": "ECD",
    "school_uid": "SCH-00271",
    "school_number": "271",
    "suburb": "New Brighton",
    "coord_east": "-33.861050",
    "coord_south": "25.54001122",
    "google_maps_link": "https://www.google.com/maps?q=-33.86105011790571,25.5400112238584",
    "info": "School Address: A174, City of Cape Town, Western Cape\nSchool Email: Not publicly listed\nSchool Principal: Nonzuzo Mzinyathi\nSchool Phone number: Not publicly listed\nSuburb: City of Cape Town"
  },
  {
    "name": "Lukhanyiso Pre School",
    "school_type": "ECD",
    "school_uid": "SCH-00220",
    "school_number": "220",
    "suburb": "Motherwell",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Lukhanyo",
    "school_type": "ECD",
    "school_uid": "SCH-00063",
    "school_number": "63",
    "suburb": "Kwazakhele",
    "coord_east": "-33.878220",
    "coord_south": "25.59050672",
    "google_maps_link": "https://www.google.com/maps?q=-33.87822037098309,25.590506724885252",
    "info": "School Address: 54136 Kunene Street, Amalinda, East London, 5252, Eastern Cape, South Africa\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: +27 74 405 9135\nSuburb: Amalinda, East London"
  },
  {
    "name": "Lungisa",
    "school_type": "High School",
    "school_uid": "SCH-00022",
    "school_number": "22",
    "suburb": "Kwa-Dwesi",
    "coord_east": "-33.844498",
    "coord_south": "25.51518252",
    "google_maps_link": "https://www.google.com/maps?q=-33.844497888776345,25.51518252433201",
    "info": "School Address: Qumza Street, Kwadwesi, Gqeberha, 6201\nSchool Email: noxolopshiki@gmail.com\nSchool Principal: (Not publicly listed in available sources)\nSchool Phone number: 041 485 1598\nSuburb: Kwadwesi, Gqeberha"
  },
  {
    "name": "Lungiso",
    "school_type": "High School",
    "school_uid": "SCH-00045",
    "school_number": "45",
    "suburb": "Humansdorp",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Luv Birds Day care",
    "school_type": "ECD",
    "school_uid": "SCH-00253",
    "school_number": "253",
    "suburb": null,
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Machiu",
    "school_type": "Primary",
    "school_uid": "SCH-00179",
    "school_number": "179",
    "suburb": "Salt Lake",
    "coord_east": "-33.889987",
    "coord_south": "25.52665514",
    "google_maps_link": "https://www.google.com/maps?q=-33.88998711214483,25.526655139200766",
    "info": "School Address: 10 Kivetts Street, Salt Lake, Gqeberha, 6059\nSchool Email: machiu@telkomsa.net\nSchool Principal: Not publicly listed\nSchool Phone number: 041 481 6844\nSuburb: Salt Lake, Gqeberha"
  },
  {
    "name": "Magqabi",
    "school_type": "Primary",
    "school_uid": "SCH-00129",
    "school_number": "129",
    "suburb": "KwaNobuhle",
    "coord_east": "-33.824059",
    "coord_south": "25.39385785",
    "google_maps_link": "https://www.google.com/maps?q=-33.82405867473399,25.393857851318838",
    "info": "School Address: Cnr Mondile & Ponana Tini Str, Kwanobuhle, Kariega, 6230\nSchool Email: Not publicly listed\nSchool Principal: Mtyingizane Sd\nSchool Phone number: 0799547083\nSuburb: Kwanobuhle, Kariega"
  },
  {
    "name": "Malabar",
    "school_type": "Primary",
    "school_uid": "SCH-00181",
    "school_number": "181",
    "suburb": "Malabar",
    "coord_east": "-33.923769",
    "coord_south": "25.54232072",
    "google_maps_link": "https://www.google.com/maps?q=-33.923768529430504,25.542320723862222",
    "info": "School Address: Selago Crescent, Malabar, Gqeberha (Port Elizabeth), 6020\nSchool Email: malabarps@mweb.co.za\nSchool Principal: Patula La Reservee (as of December 2022)\nSchool Phone number: 041 457 1305\nSuburb: Malabar"
  },
  {
    "name": "Malikhanye Day Care",
    "school_type": "ECD",
    "school_uid": "SCH-00228",
    "school_number": "228",
    "suburb": null,
    "coord_east": "-33.801811",
    "coord_south": "25.58439876",
    "google_maps_link": "https://www.google.com/maps?q=-33.801811,25.58439876",
    "info": "School Address: Witzenberg, Cape Winelands District Municipality, Eastern Cape\nSchool Email: Not publicly listed\nSchool Principal: Ellennor Human\nSchool Phone number: 230041440\nSuburb: Witzenberg"
  },
  {
    "name": "Masakhane",
    "school_type": "Primary",
    "school_uid": "SCH-00138",
    "school_number": "138",
    "suburb": "Kwazakhele",
    "coord_east": "-33.874109",
    "coord_south": "25.57717802",
    "google_maps_link": "https://www.google.com/maps?q=-33.8741085412824,25.577178022486272",
    "info": "School Address: Moyakhe Street, Kwazakhele, Port Elizabeth, 6205\nSchool Email: Not publicly listed (Eastern Cape Education Department contact may be used)\nSchool Principal: Not publicly listed\nSchool Phone number: 041 467 1495 / 041 988 9071\nSuburb: Kwazakhele, Port Elizabeth"
  },
  {
    "name": "Masibambane",
    "school_type": "High School",
    "school_uid": "SCH-00043",
    "school_number": "43",
    "suburb": "Kwazakhele",
    "coord_east": "-33.868488",
    "coord_south": "25.58680271",
    "google_maps_link": "https://www.google.com/maps?q=-33.86848824799416,25.586802710839503",
    "info": "School Address: Tshawuka Street, Mbilana Crescent, Kwazakhele, 6205, Eastern Cape\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 041 467 4483\nSuburb: Kwazakhele, Port Elizabeth"
  },
  {
    "name": "Masiphathisane",
    "school_type": "High School",
    "school_uid": "SCH-00018",
    "school_number": "18",
    "suburb": "Motherwell",
    "coord_east": "-33.796288",
    "coord_south": "25.60202358",
    "google_maps_link": "https://www.google.com/maps?q=-33.796287928897115,25.60202357858626",
    "info": "School Address: 71 Ndlovu Street, N.U. 1, Motherwell, 6211\nSchool Email: masiphathisane@gmail.com\nSchool Principal: Maarman Ml\nSchool Phone number: 041 469 1992\nSuburb: Motherwell, Gqeberha"
  },
  {
    "name": "Mboniselo",
    "school_type": "Primary",
    "school_uid": "SCH-00101",
    "school_number": "101",
    "suburb": "Motherwell",
    "coord_east": "-33.794105",
    "coord_south": "25.60015771",
    "google_maps_link": "https://www.google.com/maps?q=-33.79410480296289,25.60015770898795",
    "info": "School Address: 39 Ndlovu Street, Motherwell, Gqeberha, 6211\nSchool Email: az.vog.vorpce.ude@205001002\nSchool Principal: Not publicly listed\nSchool Phone number: 041 469 1712\nSuburb: Motherwell"
  },
  {
    "name": "Mdengentonga",
    "school_type": "Primary",
    "school_uid": "SCH-00119",
    "school_number": "119",
    "suburb": "Motherwell",
    "coord_east": "-33.811679",
    "coord_south": "25.57574208",
    "google_maps_link": "https://www.google.com/maps?q=-33.811679288041724,25.575742082001014",
    "info": "School Address: 147 Kaulela Street, N.U 7 Motherwell, Gqeberha, 6211\nSchool Email: 200100504@vodamail.co.za\nSchool Principal: M.F Matshaya\nSchool Phone number: 041 462 0426 / 064 531 2249\nSuburb: Motherwell"
  },
  {
    "name": "Melisizwe",
    "school_type": "Primary",
    "school_uid": "SCH-00060",
    "school_number": "60",
    "suburb": "Motherwell",
    "coord_east": "-33.790333",
    "coord_south": "25.59184573",
    "google_maps_link": "https://www.google.com/maps?q=-33.790332751085955,25.591845726814704",
    "info": "School Address: 21 Masbhanka Street, N.U.10, Motherwell, 6211, Eastern Cape\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 041 465 5564 / 047 531 0390\nSuburb: Motherwell, Gqeberha"
  },
  {
    "name": "Melumzi",
    "school_type": "Primary",
    "school_uid": "SCH-00148",
    "school_number": "148",
    "suburb": "KwaNobuhle",
    "coord_east": "-33.826330",
    "coord_south": "25.40384573",
    "google_maps_link": "https://www.google.com/maps?q=-33.82632954384306,25.403845725702336",
    "info": "School Address: 26a Jonas Street, Kwanobuhle, Kariega, 6242\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 041 450 7105\nSuburb: Kwanobuhle, Kariega"
  },
  {
    "name": "Mfesane",
    "school_type": "High School",
    "school_uid": "SCH-00017",
    "school_number": "17",
    "suburb": "Motherwell",
    "coord_east": "-33.777149",
    "coord_south": "25.58798611",
    "google_maps_link": "https://www.google.com/maps?q=-33.77714860880096,25.587986112681797",
    "info": "School Address: 74 Inqu Street, Motherwell Nu-12, Gqeberha, 6211\nSchool Email: sssenasefm@gmail.com\nSchool Principal: Not publicly listed in available sources\nSchool Phone number: 041 465 0697\nSuburb: Motherwell, Gqeberha"
  },
  {
    "name": "Minnie Day Care",
    "school_type": "ECD",
    "school_uid": "SCH-00048",
    "school_number": "48",
    "suburb": "Motherwell",
    "coord_east": "-33.804675",
    "coord_south": "25.58112840",
    "google_maps_link": "https://www.google.com/maps?q=-33.804675,25.5811284",
    "info": "'- School Address: No publicly listed address found, but coordinates place it in Bethelsdorp, Gqeberha (Port Elizabeth), Eastern Cape.\n- School Email: Not publicly available.\n- School Principal: Not publicly available.\n- School Phone number: Not publicly available.\n- Suburb: Bethelsdorp, Gqeberha (Port Elizabeth), Eastern Cape\n\nNo official website or government listing with direct contact details for Minnie Day Care was found. The information is based on the Google Maps location provided."
  },
  {
    "name": "Missionvale",
    "school_type": "Primary",
    "school_uid": "SCH-00117",
    "school_number": "117",
    "suburb": "Missionvale",
    "coord_east": "-33.888794",
    "coord_south": "25.55549708",
    "google_maps_link": "https://www.google.com/maps?q=-33.888794036250005,25.55549708015783",
    "info": "School Address: Colorado Avenue, Missionvale, Gqeberha, 6001\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 041 452 2323\nSuburb: Missionvale, Gqeberha"
  },
  {
    "name": "Mjuleni",
    "school_type": "Primary",
    "school_uid": "SCH-00177",
    "school_number": "177",
    "suburb": "KwaNobuhle",
    "coord_east": "-33.812569",
    "coord_south": "25.37582300",
    "google_maps_link": "https://www.google.com/maps?q=-33.81256923220451,25.375822995020258",
    "info": "School Address: 03 Likhonda Street, Kariega, 6230\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 041 977 1206\nSuburb: Kariega"
  },
  {
    "name": "Mngcunube",
    "school_type": "Primary",
    "school_uid": "SCH-00152",
    "school_number": "152",
    "suburb": "KwaNobuhle",
    "coord_east": "-33.798171",
    "coord_south": "25.39147278",
    "google_maps_link": "https://www.google.com/maps?q=-33.79817130670961,25.391472781524847",
    "info": "School Address: Hintsa Street, Kwanobuhle T/Ship, Kariega (Uitenhage), 6242\nSchool Email: moc.liamg@loohcs.yramirp.ebunucgnm (mungcunube.primary.school@gmail.com)\nSchool Principal: V.F. Gaike\nSchool Phone number: 041 977 0547 / 041 977 4004\nSuburb: Kwanobuhle, Kariega (Uitenhage)"
  },
  {
    "name": "Mnqophiso",
    "school_type": "Primary",
    "school_uid": "SCH-00168",
    "school_number": "168",
    "suburb": "KwaNobuhle",
    "coord_east": "-33.873033",
    "coord_south": "25.56922562",
    "google_maps_link": "https://www.google.com/maps?q=-33.87303280791997,25.569225622012958",
    "info": "School Address: Mbobela Street, Zwide, Gqeberha, 6205\nSchool Email: moc.oohay@19kcidleinad\nSchool Principal: Not publicly listed\nSchool Phone number: 041 459 0420\nSuburb: Zwide"
  },
  {
    "name": "Molefe",
    "school_type": "Primary",
    "school_uid": "SCH-00284",
    "school_number": "284",
    "suburb": "New Brighton",
    "coord_east": "-33.906869",
    "coord_south": "25.59147571",
    "google_maps_link": "https://www.google.com/maps?q=-33.906869,25.59147571",
    "info": "School Address: 208 Connacher Street, New Brighton, Port Elizabeth (Gqeberha), 6200\nSchool Email: molefesp.school@gamil.com\nSchool Principal: Mahleza N\nSchool Phone number: 041 454 5205\nSuburb: New Brighton"
  },
  {
    "name": "Moses Mabhida",
    "school_type": "High School",
    "school_uid": "SCH-00041",
    "school_number": "41",
    "suburb": "Kirkwood",
    "coord_east": "-32.963987",
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Motherwell",
    "school_type": "High School",
    "school_uid": "SCH-00025",
    "school_number": "25",
    "suburb": "Motherwell",
    "coord_east": "-33.815262",
    "coord_south": "25.57488437",
    "google_maps_link": "https://www.google.com/maps?q=-33.81526159530772,25.574884368507202",
    "info": "School Address: Mzwazwa Street, Nu 7, Motherwell, 6211\nSchool Email: hgihllewrehtom@gmail.com\nSchool Principal: Mr Sonkwala\nSchool Phone number: 041 462 8171\nSuburb: Motherwell, Gqeberha"
  },
  {
    "name": "Mqhayi",
    "school_type": "Primary",
    "school_uid": "SCH-00140",
    "school_number": "140",
    "suburb": "KwaNobuhle",
    "coord_east": "-32.937128",
    "coord_south": "27.72922137",
    "google_maps_link": "https://www.google.com/maps?q=-32.93712786766852,27.729221367702234",
    "info": "School Address: 9 Jabavu Road, Kwanobuhle, Kariega, 6242\nSchool Email: 90iyahqm@gmail.com\nSchool Principal: Not publicly listed\nSchool Phone number: 041 977 3939\nSuburb: Kwanobuhle, Kariega"
  },
  {
    "name": "Msobomvu Full Service",
    "school_type": "Primary",
    "school_uid": "SCH-00323",
    "school_number": "323",
    "suburb": "Bongweni",
    "coord_east": "-32.739899",
    "coord_south": "25.79655624",
    "google_maps_link": "https://www.google.com/maps?q=-32.73989898,25.79655624",
    "info": "School Address: 136 Khala Street, Bongweni Location, Cookhouse, 5820\nSchool Email: spuvmobosm@gmail.com\nSchool Principal: Ziya-Gxoyiya T\nSchool Phone number: Not publicly listed\nSuburb: Bhongweni, Cookhouse"
  },
  {
    "name": "Msobomvu Preschool",
    "school_type": "ECD",
    "school_uid": "SCH-00297",
    "school_number": "297",
    "suburb": "Bongweni",
    "coord_east": "-32.745732",
    "coord_south": "25.79667515",
    "google_maps_link": "https://www.google.com/maps?q=-32.7457315820498,25.796675154926096",
    "info": "School Address: 136 Khala Street, Bongweni Location, Cookhouse, 5820\nSchool Email: spuvmobosm@gmail.com\nSchool Principal: Ziya-Gxoyiya T\nSchool Phone number: Not publicly listed\nSuburb: Bhongweni, Cookhouse"
  },
  {
    "name": "Mthonjeni",
    "school_type": "Primary",
    "school_uid": "SCH-00158",
    "school_number": "158",
    "suburb": "KwaNobuhle",
    "coord_east": "-33.802910",
    "coord_south": "25.38784437",
    "google_maps_link": "https://www.google.com/maps?q=-33.802910348210084,25.387844368506492",
    "info": "School Address: Runletts Location, Peddie, 5640, Eastern Cape\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: +27 83 683 1118, +27 47 553 0044\nSuburb: Runletts Location, Peddie"
  },
  {
    "name": "Mzamomhle Edu-care",
    "school_type": "ECD",
    "school_uid": "SCH-00294",
    "school_number": "294",
    "suburb": "Bethelsdorp",
    "coord_east": "-32.739804",
    "coord_south": "25.79875313",
    "google_maps_link": "https://www.google.com/maps?q=-32.73980434430372,25.798753127420422",
    "info": "School Address: Not explicitly listed, but located at the coordinates -32.73980434430372, 25.798753127420422 (Eastern Cape)\nSchool Email: Not publicly listed\nSchool Principal: Thembakazi Mqwayi\nSchool Phone number: Not publicly listed\nSuburb: Not explicitly listed, but based on the coordinates, it is near Hofmeyr, Eastern Cape\n\nFor more details, you may need to contact the Eastern Cape Department of Education or visit the school in person."
  },
  {
    "name": "Mzimhlophe",
    "school_type": "Primary",
    "school_uid": "SCH-00096",
    "school_number": "96",
    "suburb": "Zwide",
    "coord_east": "-33.857689",
    "coord_south": "25.55707017",
    "google_maps_link": "https://www.google.com/maps?q=-33.8576889837666,25.557070166187824",
    "info": "School Address: Qogi Street, Zwide, Gqeberha (Port Elizabeth), 6201\nSchool Email: ehpolhmizm@webmail.co.za\nSchool Principal: Msutwana M\nSchool Phone number: 041 464 1930\nSuburb: Zwide"
  },
  {
    "name": "Mzingisi",
    "school_type": "Primary",
    "school_uid": "SCH-00312",
    "school_number": "312",
    "suburb": "Mdantsane",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Mzomtsha",
    "school_type": "Primary",
    "school_uid": "SCH-00157",
    "school_number": "157",
    "suburb": "Kwazakhele",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Mzontsundu",
    "school_type": "High School",
    "school_uid": "SCH-00029",
    "school_number": "29",
    "suburb": "Kwazakhele",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Ncedo",
    "school_type": "High School",
    "school_uid": "SCH-00039",
    "school_number": "39",
    "suburb": "Motherwell",
    "coord_east": "-33.788632",
    "coord_south": "25.58968988",
    "google_maps_link": "https://www.google.com/maps?q=-33.78863200648807,25.589689881524286",
    "info": "School Address: 169 Mnenga Street, Nu 10, Motherwell, 6211, Eastern Cape\nSchool Email: ssodecn@gmail.com\nSchool Principal: Pityana-Keswa To (2023)\nSchool Phone number: +27 41 465 5007\nSuburb: Motherwell 6"
  },
  {
    "name": "Nceduluntu Edu-care",
    "school_type": "ECD",
    "school_uid": "SCH-00293",
    "school_number": "293",
    "suburb": "Buizedenhoutville",
    "coord_east": "-32.681651",
    "coord_south": "26.29227641",
    "google_maps_link": "https://www.google.com/maps?q=-32.68165081501924,26.29227641022517",
    "info": "- School Address: Banzi Administrative Area, Komkhulu Location, Eastern Cape\n- School Email: Not publicly listed\n- School Principal: Not publicly listed\n- School Phone number: Not publicly listed\n- Suburb: Komkhulu Location, near Whittlesea, Eastern Cape"
  },
  {
    "name": "Ndyebo",
    "school_type": "High School",
    "school_uid": "SCH-00027",
    "school_number": "27",
    "suburb": "Motherwell",
    "coord_east": "-33.808306",
    "coord_south": "25.58100072",
    "google_maps_link": "https://www.google.com/maps?q=-33.808306022373955,25.58100072433005",
    "info": "School Address: Nkobongo Street, Nu 9 Motherwell, Gqeberha, 6211\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 060 300 6871\nSuburb: Motherwell, Gqeberha"
  },
  {
    "name": "Ndzondelelo",
    "school_type": "High School",
    "school_uid": "SCH-00031",
    "school_number": "31",
    "suburb": "Zwide",
    "coord_east": "-33.862197",
    "coord_south": "25.55607487",
    "google_maps_link": "https://www.google.com/maps?q=-33.86219726996942,25.556074872404213",
    "info": "School Address: Koyana Street, Zwide, Gqeberha, 6201\nSchool Email: az.oc.liamadov@855001002\nSchool Principal: Not publicly listed\nSchool Phone number: 041 464 1106\nSuburb: Zwide"
  },
  {
    "name": "Nelisa",
    "school_type": "ECD",
    "school_uid": "SCH-00243",
    "school_number": "243",
    "suburb": "Motherwell",
    "coord_east": "-33.800678",
    "coord_south": "25.57951692",
    "google_maps_link": "https://www.google.com/maps?q=-33.800678,25.57951692",
    "info": "- School Address: Not found in public sources\n- School Email: Not found in public sources\n- School Principal: Not found in public sources\n- School Phone number: Not found in public sources\n- Suburb: Not found in public sources\n\nNo publicly available information was found for Nelisa School in the Eastern Cape using the provided details."
  },
  {
    "name": "New Brighton Future Kids",
    "school_type": "ECD",
    "school_uid": "SCH-00233",
    "school_number": "233",
    "suburb": null,
    "coord_east": "-33.905964",
    "coord_south": "25.59275929",
    "google_maps_link": "https://www.google.com/maps?q=-33.905964,25.59275929",
    "info": "'- School Address: No publicly listed street address found, but coordinates place it in New Brighton, Gqeberha (Port Elizabeth), Eastern Cape.\n- School Email: Not publicly available.\n- School Principal: Not publicly available.\n- School Phone number: Not publicly available.\n- Suburb: New Brighton, Gqeberha (Port Elizabeth), Eastern Cape."
  },
  {
    "name": "Newell",
    "school_type": "High School",
    "school_uid": "SCH-00016",
    "school_number": "16",
    "suburb": "New Brighton",
    "coord_east": "-33.898808",
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Njongozabantu",
    "school_type": "ECD",
    "school_uid": "SCH-00081",
    "school_number": "81",
    "suburb": "Motherwell",
    "coord_east": "-33.797261",
    "coord_south": "25.60559210",
    "google_maps_link": "https://www.google.com/maps?q=-33.797261,25.6055921",
    "info": "School Address: Mxhalanga Location, Izele, Mxhalanga, 5600\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 083 331 1674 / 084 773 4624\nSuburb: King William's Town (now known as Qonce)"
  },
  {
    "name": "Nkuthalo",
    "school_type": "Primary",
    "school_uid": "SCH-00074",
    "school_number": "74",
    "suburb": "Zwide",
    "coord_east": "-33.877910",
    "coord_south": "25.56494425",
    "google_maps_link": "https://www.google.com/maps?q=-33.877910496556275,25.564944252694595",
    "info": "School Address: Mahakana Street, Zwide Township, Gqeberha, 6205\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 073 995 2577\nSuburb: Zwide, Gqeberha"
  },
  {
    "name": "Nobandla",
    "school_type": "ECD",
    "school_uid": "SCH-00320",
    "school_number": "320",
    "suburb": "New Brighton",
    "coord_east": "-33.893886",
    "coord_south": "25.59293301",
    "google_maps_link": "https://www.google.com/maps?q=-33.893886,25.59293301",
    "info": "School Address: Boomplas Location, Machubeni Admin Area, Lady Frere, 5410\nSchool Email: Not publicly listed\nSchool Principal: Nothemba Ncipha (for Nobandla ECDC, which may be the same or related to the primary school)\nSchool Phone number: 073 125 3151\nSuburb: Lady Frere"
  },
  {
    "name": "Nokwezi",
    "school_type": "Primary",
    "school_uid": "SCH-00195",
    "school_number": "195",
    "suburb": "KwaNobuhle",
    "coord_east": "-33.828756",
    "coord_south": "25.37621881",
    "google_maps_link": "https://www.google.com/maps?q=-33.82875592330766,25.376218810361873",
    "info": "School Address: 10th Avenue, Kwanobuhle, Kariega, 6242\nSchool Email: okom.cirtaP@gmail.com (reverse of \"Patric.mok@Gmail.com\" as listed)\nSchool Principal: Not publicly listed\nSchool Phone number: 041 977 0150\nSuburb: Kwanobuhle, Kariega"
  },
  {
    "name": "Nolundi",
    "school_type": "ECD",
    "school_uid": "SCH-00224",
    "school_number": "224",
    "suburb": "New Brighton",
    "coord_east": "-33.894761",
    "coord_south": "25.58983908",
    "google_maps_link": "https://www.google.com/maps?q=-33.894761,25.58983908",
    "info": "School Address: Near coordinates -33.894761, 25.58983908, Eastern Cape (exact street address not listed publicly)\nSchool Email: Not publicly listed\nSchool Principal: Nolundi Vokwana\nSchool Phone number: Not publicly listed\nSuburb: Not explicitly listed, but location is near KwaNobuhle/Uitenhage, Eastern Cape"
  },
  {
    "name": "Noluthando",
    "school_type": "ECD",
    "school_uid": "SCH-00321",
    "school_number": "321",
    "suburb": "New Brighton",
    "coord_east": "-33.872573",
    "coord_south": "25.57191100",
    "google_maps_link": "https://www.google.com/maps?q=-33.872573,25.571911",
    "info": "School Address: Mtsheko A/A, Cacadu, 5410, Eastern Cape\nSchool Email: info@noluthandops.co.za\nSchool Principal: A.A. Ncinane\nSchool Phone number: 084 400 7341\nSuburb: Cacadu"
  },
  {
    "name": "Nomathamsanqa",
    "school_type": "Primary",
    "school_uid": "SCH-00167",
    "school_number": "167",
    "suburb": "Resevoir Hills",
    "coord_east": "-33.821454",
    "coord_south": "25.45486125",
    "google_maps_link": "https://www.google.com/maps?q=-33.82145388172952,25.454861248998878",
    "info": "School Address: 1 Tobile Busakwe, Khayamnadi, Despatch, 6220\nSchool Email: nomathamsanqaprimary@gmail.com\nSchool Principal: Not publicly listed\nSchool Phone number: +27 41 933 2446\nSuburb: Khayamnadi, Despatch"
  },
  {
    "name": "Nomonde",
    "school_type": "ECD",
    "school_uid": "SCH-00238",
    "school_number": "238",
    "suburb": "New Brighton",
    "coord_east": "-33.898924",
    "coord_south": "25.59167732",
    "google_maps_link": "https://www.google.com/maps?q=-33.898924,25.59167732",
    "info": "School Address: No 574 Hayiya Street, Molteno, 5500\nSchool Email: ozeqnm@gmail.com\nSchool Principal: Lubisi Mb\nSchool Phone number: +27 87 655 6766\nSuburb: Nomonde Township, Molteno"
  },
  {
    "name": "Nomtha",
    "school_type": "ECD",
    "school_uid": "SCH-00308",
    "school_number": "308",
    "suburb": "Kwazakhele",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Noninzi Luzipho",
    "school_type": "Primary",
    "school_uid": "SCH-00193",
    "school_number": "193",
    "suburb": "KwaNobuhle",
    "coord_east": "-33.808967",
    "coord_south": "25.36532896",
    "google_maps_link": "https://www.google.com/maps?q=-33.808967338566596,25.365328964338794",
    "info": "School Address: 17 Helen Joseph, Kwanobuhle, Uitenhage (Kariega), 6242\nSchool Email: noninziluziphoschool@gmail.com\nSchool Principal: Not publicly listed in recent sources\nSchool Phone number: 041 978 0215 / +27 47 874 0716\nSuburb: Kwanobuhle, Kariega (Uitenhage)"
  },
  {
    "name": "Nonkqubela",
    "school_type": "ECD",
    "school_uid": "SCH-00315",
    "school_number": "315",
    "suburb": "Motherwell",
    "coord_east": "-33.813010",
    "coord_south": "25.58137617",
    "google_maps_link": "https://www.google.com/maps?q=-33.813009862966666,25.58137616729963",
    "info": "School Address: Cabazana A/A, Mount Ayliff, 4735\nSchool Email: az.oc.liambew@canaldeqm\nSchool Principal: Cita (Contact Person)\nSchool Phone number: +27 76 829 2002\nSuburb: Mount Ayliff"
  },
  {
    "name": "Nontsapho",
    "school_type": "ECD",
    "school_uid": "SCH-00252",
    "school_number": "252",
    "suburb": "Motherwell",
    "coord_east": "-33.804926",
    "coord_south": "25.60950307",
    "google_maps_link": "https://www.google.com/maps?q=-33.804926,25.60950307",
    "info": "- School Address: Near coordinates -33.804926, 25.60950307, Eastern Cape, South Africa\n- School Email: Not publicly listed\n- School Principal: Not publicly listed\n- School Phone number: Not publicly listed\n- Suburb: Not explicitly listed, but based on coordinates, it is near KwaNobuhle, Uitenhage, Eastern Cape\n\nNo direct public listings for principal, email, or phone number were found for Nontsapho School."
  },
  {
    "name": "Nontsikelelo",
    "school_type": "ECD",
    "school_uid": "SCH-00300",
    "school_number": "300",
    "suburb": "Mdantsane",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Nosandla Educare",
    "school_type": "ECD",
    "school_uid": "SCH-00206",
    "school_number": "206",
    "suburb": "Zinyoka ",
    "coord_east": "-33.858149",
    "coord_south": "25.53613634",
    "google_maps_link": "https://www.google.com/maps?q=-33.858148768407794,25.536136341975947",
    "info": "I could not find specific public information for Nosandla Educare such as the principal, school email, or phone number. However, based on the Google Maps link, here is what can be provided:\n\n- School Address: Near -33.8581488, 25.5361363, Eastern Cape, South Africa\n- School Email: Not publicly available\n- School Principal: Not publicly available\n- School Phone number: Not publicly available\n- Suburb: Not explicitly listed, but coordinates are in the Eastern Cape region\n\nNo further details are available from public sources at this time."
  },
  {
    "name": "Nosipho",
    "school_type": "Primary",
    "school_uid": "SCH-00162",
    "school_number": "162",
    "suburb": "KwaNobuhle",
    "coord_east": "-33.822789",
    "coord_south": "25.40052412",
    "google_maps_link": "https://www.google.com/maps?q=-33.82278852409641,25.400524123856027",
    "info": "School Address: Makappa Street, Kwanobuhle, Kariega, 6230\nSchool Email: yramirpohpison@gmail.com\nSchool Principal: Not publicly listed\nSchool Phone number: 041 978 0750\nSuburb: Kwanobuhle, Kariega"
  },
  {
    "name": "Ntlemeza",
    "school_type": "Primary",
    "school_uid": "SCH-00172",
    "school_number": "172",
    "suburb": "KwaNobuhle",
    "coord_east": "-33.802569",
    "coord_south": "25.40192344",
    "google_maps_link": "https://www.google.com/maps?q=-33.80256926241739,25.401923435503267",
    "info": "School Address: 02 Anta Street, Kwa-Nobuhle, Kariega, 6242\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 083 347 6286 / 041 977 1014\nSuburb: Kwa-Nobuhle, Kariega"
  },
  {
    "name": "Ntyatyambo",
    "school_type": "Primary",
    "school_uid": "SCH-00083",
    "school_number": "83",
    "suburb": "Missionvale",
    "coord_east": "-33.871688",
    "coord_south": "25.55607330",
    "google_maps_link": "https://www.google.com/maps?q=-33.871687922610555,25.55607330094124",
    "info": "School Address: Sir George Grey Street, Zwide, Gqeberha, 6205\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 041 464 1920\nSuburb: Zwide, Gqeberha"
  },
  {
    "name": "Nxanelwimfundo",
    "school_type": "Primary",
    "school_uid": "SCH-00059",
    "school_number": "59",
    "suburb": "Motherwell",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "P.G Mangqana Pre-School",
    "school_type": "ECD",
    "school_uid": "SCH-00260",
    "school_number": "260",
    "suburb": null,
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "P.G Manqana",
    "school_type": "ECD",
    "school_uid": "SCH-00270",
    "school_number": "270",
    "suburb": "Kwazakhele",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Papenkuil",
    "school_type": "Primary",
    "school_uid": "SCH-00185",
    "school_number": "185",
    "suburb": "Galvandale",
    "coord_east": "-33.920859",
    "coord_south": "25.55307562",
    "google_maps_link": "https://www.google.com/maps?q=-33.92085852426192,25.553075622015886",
    "info": "School Address: Cnr Bell & Beetlestone Roads, Gelvandale, Port Elizabeth, 6016\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 041 457 2024\nSuburb: Gelvandale"
  },
  {
    "name": "Paulos Oyigcwele",
    "school_type": "ECD",
    "school_uid": "SCH-00296",
    "school_number": "296",
    "suburb": "Motherwell",
    "coord_east": "-33.808992",
    "coord_south": "25.59967265",
    "google_maps_link": "https://www.google.com/maps?q=-33.80899235007284,25.599672647660306",
    "info": "'- School Address: No publicly listed street address found, but location is at coordinates -33.80899235007284, 25.599672647660306 (per Google Maps)\n- School Email: Not publicly available\n- School Principal: Not publicly available\n- School Phone number: Not publicly available\n- Suburb: The coordinates place the school in or near Motherwell, Gqeberha (Port Elizabeth), Eastern Cape\n\nNo official school website or government listing with contact details was found in public search results."
  },
  {
    "name": "Pendla",
    "school_type": "Primary",
    "school_uid": "SCH-00078",
    "school_number": "78",
    "suburb": "New Brighton",
    "coord_east": "-33.900606",
    "coord_south": "25.58775072",
    "google_maps_link": "https://www.google.com/maps?q=-33.900606398277866,25.58775072433527",
    "info": "School Address: Ntshekisa Road, New Brighton, Gqeberha, 6200\nSchool Email: Not publicly listed\nSchool Principal: P M Peter\nSchool Phone number: 041 454 1392\nSuburb: New Brighton"
  },
  {
    "name": "Phakama",
    "school_type": "Primary",
    "school_uid": "SCH-00104",
    "school_number": "104",
    "suburb": "Kwazakhele",
    "coord_east": "-33.865499",
    "coord_south": "25.58162366",
    "google_maps_link": "https://www.google.com/maps?q=-33.86549856180082,25.58162365501606",
    "info": "School Address: Ngqondela Street, Kwazakhele, Gqeberha, 6205\nSchool Email: Not publicly listed (general contact: moc.liamg@skosem)\nSchool Principal: Not publicly listed\nSchool Phone number: 041 467 0020\nSuburb: Kwazakhele"
  },
  {
    "name": "Phakamile",
    "school_type": "Primary",
    "school_uid": "SCH-00285",
    "school_number": "285",
    "suburb": "Mdantsane",
    "coord_east": "-33.821083",
    "coord_south": "25.38644927",
    "google_maps_link": "https://www.google.com/maps?q=-33.82108279416098,25.386449267877442",
    "info": "School Address: Site 3104, NU 1, Mdantsane, 5219, Eastern Cape\nSchool Email: spjelimakahp@gmail.com\nSchool Principal: Pumlomo Glj\nSchool Phone number: 063 568 5960\nSuburb: Mdantsane"
  },
  {
    "name": "Phakamisa",
    "school_type": "High School",
    "school_uid": "SCH-00032",
    "school_number": "32",
    "suburb": "Zwide",
    "coord_east": "-33.857783",
    "coord_south": "25.56218855",
    "google_maps_link": "https://www.google.com/maps?q=-33.85778258800996,25.562188551320826",
    "info": "School Address: Katyu Street, Zwide, Gqeberha (Port Elizabeth), 6201\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 041 464 3435\nSuburb: Zwide"
  },
  {
    "name": "Phindubuye",
    "school_type": "Primary",
    "school_uid": "SCH-00201",
    "school_number": "201",
    "suburb": "KwaNobuhle",
    "coord_east": "-33.819592",
    "coord_south": "25.39819963",
    "google_maps_link": "https://www.google.com/maps?q=-33.81959193215531,25.398199627515535",
    "info": "School Address: 1 Freemantle Street, Kwa-Nobuhle, Kariega, 6242\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 041 977 1992\nSuburb: Kwa-Nobuhle, Kariega"
  },
  {
    "name": "Qaphelani",
    "school_type": "High School",
    "school_uid": "SCH-00003",
    "school_number": "3",
    "suburb": "Kwazakhele",
    "coord_east": "-33.881620",
    "coord_south": "25.58561627",
    "google_maps_link": "https://www.google.com/maps?q=-33.881619868547794,25.585616268510798",
    "info": "School Address: Kulati Street, Kwazakhele, Gqeberha, 6205\nSchool Email: hgihinalehpaq@gmail.com\nSchool Principal: Not publicly listed\nSchool Phone number: 041 459 5015\nSuburb: Kwazakhele"
  },
  {
    "name": "Qaqawuli Godolozi",
    "school_type": "ECD",
    "school_uid": "SCH-00302",
    "school_number": "302",
    "suburb": "Zwide",
    "coord_east": "-33.813846",
    "coord_south": "25.60996804",
    "google_maps_link": "https://www.google.com/maps?q=-33.81384551919858,25.609968044538864",
    "info": "School Address: No official street address found, but located at coordinates -33.8138455, 25.6099680 (per Google Maps link)\nSchool Email: Not publicly listed; for official matters, use the Eastern Cape Department of Education: amos.fetsha@ecdoe.gov.za or customer care 086 063 8636\nSchool Principal: Not publicly listed\nSchool Phone number: Not publicly listed; Eastern Cape Department of Education: 040 608 4100\nSuburb: Amathole West District, Eastern Cape\n\nNote: Qaqawuli Godolozi Junior Primary School is listed under Amathole West District in the official Eastern Cape Department of Education records, but specific contact details and the principal’s name are not published in the latest available public documents."
  },
  {
    "name": "Qhamani Pre-school",
    "school_type": "ECD",
    "school_uid": "SCH-00212",
    "school_number": "212",
    "suburb": "Zwide",
    "coord_east": "-33.876655",
    "coord_south": "25.56320893",
    "google_maps_link": "https://www.google.com/maps?q=-33.876654516707596,25.56320892531386",
    "info": "School Address: Booi Street, Port Elizabeth, Eastern Cape\nSchool Email: Not publicly listed\nSchool Principal: Bulelwa Wendy Gebengana\nSchool Phone number: Not publicly listed\nSuburb: Nelson Mandela Bay (Port Elizabeth)"
  },
  {
    "name": "Qhayiyalethu",
    "school_type": "High School",
    "school_uid": "SCH-00020",
    "school_number": "20",
    "suburb": "Kareedouw",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "R H Godlo Senior",
    "school_type": "Primary",
    "school_uid": "SCH-00202",
    "school_number": "202",
    "suburb": "KwaNobuhle",
    "coord_east": "-33.803239",
    "coord_south": "25.37862111",
    "google_maps_link": "https://www.google.com/maps?q=-33.803238885398194,25.378621106668096",
    "info": "School Address: Relu Street, Kwanobuhle, Kariega (Uitenhage), 6242\nSchool Email: Not publicly listed (general contact via Eastern Cape Education Department)\nSchool Principal: Not publicly listed\nSchool Phone number: 041 977 3800 / +27 41 481 5025\nSuburb: Kwanobuhle, Kariega (Uitenhage)"
  },
  {
    "name": "Republic",
    "school_type": "Primary",
    "school_uid": "SCH-00118",
    "school_number": "118",
    "suburb": "Windvogel",
    "coord_east": "-33.897826",
    "coord_south": "25.54006751",
    "google_maps_link": "https://www.google.com/maps?q=-33.89782592011218,25.540067510366082",
    "info": "School Address: 5th Street, Windvogel, Port Elizabeth, 6059\nSchool Email: ten.asmoklet@smada.krc (reverse this to get correct email: crk.adams@telkom.net)\nSchool Principal: Daniels P (2023)\nSchool Phone number: (+27) 41 452 2861\nSuburb: Windvogel, Port Elizabeth"
  },
  {
    "name": "Rock of Ages",
    "school_type": "ECD",
    "school_uid": "SCH-00227",
    "school_number": "227",
    "suburb": "Motherwell",
    "coord_east": "-33.804092",
    "coord_south": "25.57437781",
    "google_maps_link": "https://www.google.com/maps?q=-33.804092,25.57437781",
    "info": "'- School Address: No publicly listed address found, but coordinates place it in Gqeberha (Port Elizabeth), Eastern Cape.\n- School Email: Not publicly available.\n- School Principal: Not publicly available.\n- School Phone number: Not publicly available.\n- Suburb: Gqeberha (Port Elizabeth), Eastern Cape.\n\nNo official website or directory listing for \"Rock of Ages\" school in the Eastern Cape was found in public sources."
  },
  {
    "name": "Rocklands",
    "school_type": "High School",
    "school_uid": "SCH-00006",
    "school_number": "6",
    "suburb": "Uitenhage",
    "coord_east": "-34.057497",
    "coord_south": "18.60897891",
    "google_maps_link": "https://www.google.com/maps?q=-34.057497378805095,18.608978912697435",
    "info": "- School Address: Cnr Cedars Ave & Eisleben Road, Rocklands, Mitchell's Plain, 7798\n- School Email: Not publicly listed\n- School Principal: N Pelston\n- School Phone number: 021 392 7139\n- Suburb: Rocklands, Mitchell's Plain"
  },
  {
    "name": "Rufane Donkin",
    "school_type": "Primary",
    "school_uid": "SCH-00197",
    "school_number": "197",
    "suburb": "Galvandale",
    "coord_east": "-33.915095",
    "coord_south": "25.54695635",
    "google_maps_link": "https://www.google.com/maps?q=-33.9150950620373,25.546956350850742",
    "info": "School Address: 4 Terblanchè Street, Gelvandale, Gqeberha, 6020\nSchool Email: 766niknodenafur@gmail.com\nSchool Principal: Ms. Theron (recently retired; current principal not clearly listed)\nSchool Phone number: 041 457 2297\nSuburb: Gelvandale"
  },
  {
    "name": "Sakha Abantwana",
    "school_type": "ECD",
    "school_uid": "SCH-00100",
    "school_number": "100",
    "suburb": "New Brighton",
    "coord_east": "-33.907152",
    "coord_south": "25.58977497",
    "google_maps_link": "https://www.google.com/maps?q=-33.907152,25.58977497",
    "info": "School Address: Coordinates -33.907152, 25.58977497 (per Google Maps; specific street address not found)\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: Not publicly listed\nSuburb: Based on coordinates, likely in or near Motherwell, Gqeberha (Port Elizabeth), Eastern Cape\n\nNo official website or public directory entry with more details was found for Sakha Abantwana school."
  },
  {
    "name": "Sakhisizwe",
    "school_type": "High School",
    "school_uid": "SCH-00014",
    "school_number": "14",
    "suburb": "Zwide",
    "coord_east": "-33.878487",
    "coord_south": "25.56440500",
    "google_maps_link": "https://www.google.com/maps?q=-33.878487456346924,25.56440499734612",
    "info": "School Address: Mingo Street, Zwide Location, Port Elizabeth, 6005\nSchool Email: roinesewzisihkas@gmail.com\nSchool Principal: Not publicly listed in available sources\nSchool Phone number: 041 464 5627 / 047 878 0080\nSuburb: Zwide, Port Elizabeth"
  },
  {
    "name": "Sakhuxolo Educare",
    "school_type": "ECD",
    "school_uid": "SCH-00263",
    "school_number": "263",
    "suburb": "Bethelsdorp",
    "coord_east": "-33.860370",
    "coord_south": "25.54099066",
    "google_maps_link": "https://www.google.com/maps?q=-33.860369970994,25.54099066434193",
    "info": "'- School Address: No publicly listed street address found, but coordinates place it in Motherwell, Gqeberha (Port Elizabeth), Eastern Cape.\n- School Email: Not publicly available.\n- School Principal: Not publicly available.\n- School Phone number: Not publicly available.\n- Suburb: Motherwell, Gqeberha (Port Elizabeth), Eastern Cape."
  },
  {
    "name": "Samkelewe",
    "school_type": "High School",
    "school_uid": "SCH-00033",
    "school_number": "33",
    "suburb": "Addo",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Samuel Nongogo ",
    "school_type": "Primary",
    "school_uid": "SCH-00085",
    "school_number": "85",
    "suburb": "New Brighton",
    "coord_east": "-33.895776",
    "coord_south": "25.59904334",
    "google_maps_link": "https://www.google.com/maps?q=-33.89577609199437,25.599043335981495",
    "info": "School Address: Harmans Street, New Brighton, Gqeberha, 6200\nSchool Email: 576001002@vodamail.co.za\nSchool Principal: Not publicly listed\nSchool Phone number: 041 458 5011 / 041 457 1821\nSuburb: New Brighton"
  },
  {
    "name": "Sanctor",
    "school_type": "Primary",
    "school_uid": "SCH-00154",
    "school_number": "154",
    "suburb": "Sanctor",
    "coord_east": "-33.882622",
    "coord_south": "25.50694695",
    "google_maps_link": "https://www.google.com/maps?q=-33.88262240835983,25.50694695132211",
    "info": "School Address: Coleus Crescent, Sanctor, Gqeberha, 6059\nSchool Email: sanctorhighschool@gmail.com\nSchool Principal: Buck KVB\nSchool Phone number: 041 481 2657\nSuburb: Sanctor, Gqeberha"
  },
  {
    "name": "Sandwater",
    "school_type": "Primary",
    "school_uid": "SCH-00306",
    "school_number": "306",
    "suburb": "Umzamowethu",
    "coord_east": "-34.166199",
    "coord_south": "24.66398100",
    "google_maps_link": "https://www.google.com/maps?q=-34.166199,24.663981",
    "info": "School Address: 620 Oester Street, Umzamowethu, Oyster Bay, 6320, Eastern Cape\nSchool Email: Not publicly listed\nSchool Principal: Ej Augustus\nSchool Phone number: Not publicly listed\nSuburb: Umzamowethu, Oyster Bay"
  },
  {
    "name": "Sapphire",
    "school_type": "Primary",
    "school_uid": "SCH-00051",
    "school_number": "51",
    "suburb": "Chatty",
    "coord_east": "-33.853048",
    "coord_south": "25.47163391",
    "google_maps_link": "https://www.google.com/maps?q=-33.85304795419496,25.47163391205432",
    "info": "School Address: C/O Sapphire & Coral Road, Booysen Park, Port Elizabeth, 6059\nSchool Email: daorerihppas@telkomsa.net\nSchool Principal: (Not publicly listed in available sources)\nSchool Phone number: 041 483 1878\nSuburb: Booysen Park"
  },
  {
    "name": "Seagull",
    "school_type": "Primary",
    "school_uid": "SCH-00133",
    "school_number": "133",
    "suburb": "Rosedale",
    "coord_east": "-33.733035",
    "coord_south": "25.38555108",
    "google_maps_link": "https://www.google.com/maps?q=-33.73303541192428,25.38555108014914",
    "info": "School Address: Seagull Crescent, Rosedale, Kariega (Uitenhage), 6229\nSchool Email: Not officially listed; one source lists \"moc.oohay@ehcnalbreteneitte\" (likely a placeholder or reversed text)\nSchool Principal: Ettiene Terblanche\nSchool Phone number: 041 988 4517\nSuburb: Rosedale, Kariega (Uitenhage)"
  },
  {
    "name": "Sekunjalo PreSchool",
    "school_type": "ECD",
    "school_uid": "SCH-00272",
    "school_number": "272",
    "suburb": "New Brighton",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Seyisi",
    "school_type": "Primary",
    "school_uid": "SCH-00279",
    "school_number": "279",
    "suburb": "Kwazakhele",
    "coord_east": "-33.886369",
    "coord_south": "25.60077071",
    "google_maps_link": "https://www.google.com/maps?q=-33.886368761616716,25.600770711478294",
    "info": "School Address: Vakaza Street, Kwazakhele, Gqeberha (Port Elizabeth), 6200\nSchool Email: Not publicly listed (general contact via Eastern Cape Education Department)\nSchool Principal: M.B. Mannie\nSchool Phone number: 041 467 4499\nSuburb: Kwazakhele"
  },
  {
    "name": "Sifunimfundo",
    "school_type": "ECD",
    "school_uid": "SCH-00314",
    "school_number": "314",
    "suburb": "Motherwell",
    "coord_east": "-33.797608",
    "coord_south": "25.57737631",
    "google_maps_link": "https://www.google.com/maps?q=-33.79760787722665,25.577376314762574",
    "info": "School Address: 1027 C Block, Kwamashu, Durban, 4360\nSchool Email: Not publicly listed for the Eastern Cape location\nSchool Principal: Not publicly listed\nSchool Phone number: 031 519 2002\nSuburb: Kwamashu\n\nNote: Most available public records list Sifunimfundo Primary School in Kwamashu, Durban (KwaZulu-Natal), not the Eastern Cape. The Google Maps link provided points to a location in Gqeberha (Eastern Cape), but there is no matching public record for a Sifunimfundo school at that address in the Eastern Cape."
  },
  {
    "name": "Sikhothina",
    "school_type": "Primary",
    "school_uid": "SCH-00125",
    "school_number": "125",
    "suburb": "KwaNobuhle",
    "coord_east": "-33.824406",
    "coord_south": "25.38685542",
    "google_maps_link": "https://www.google.com/maps?q=-33.82440636611018,25.386855424330957",
    "info": "School Address: Cnr. Mbengo & Ponana Tini Road, Kwanobuhle, Kariega, 6242\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 076 467 5470 / 041 977 1514\nSuburb: Kwanobuhle, Kariega"
  },
  {
    "name": "Sikhulise Pre-School",
    "school_type": "ECD",
    "school_uid": "SCH-00205",
    "school_number": "205",
    "suburb": "Kwazakhele",
    "coord_east": "-33.886990",
    "coord_south": "25.60284458",
    "google_maps_link": "https://www.google.com/maps?q=-33.88699010517925,25.602844575246717",
    "info": "School Address: 10740 Mnyanda Street, Ntabankulu, Eastern Cape\nSchool Email: Not publicly listed\nSchool Principal: Nyameka Ntlamba\nSchool Phone number: Not publicly listed\nSuburb: Ntabankulu"
  },
  {
    "name": "Simanye",
    "school_type": "ECD",
    "school_uid": "SCH-00234",
    "school_number": "234",
    "suburb": null,
    "coord_east": "-33.896175",
    "coord_south": "25.58977076",
    "google_maps_link": "https://www.google.com/maps?q=-33.896175,25.58977076",
    "info": "School Address: Hlati Street, Nomzamo, 7140, Eastern Cape\nSchool Email: mcmatshoba@gmail.com\nSchool Principal: Mr. MC Matshoba\nSchool Phone number: 021 845 4280\nSuburb: Nomzamo"
  },
  {
    "name": "Sinethemba",
    "school_type": "ECD",
    "school_uid": "SCH-00291",
    "school_number": "291",
    "suburb": "Motherwell",
    "coord_east": "-33.801531",
    "coord_south": "25.59155759",
    "google_maps_link": "https://www.google.com/maps?q=-33.80153065048994,25.59155758868933",
    "info": "School Address: Mlungisi Location, Stutterheim, 4930\nSchool Email: twk377002002@gmail.com\nSchool Principal: Md Sakube\nSchool Phone number: 043 681 0397\nSuburb: Mlungisi, Stutterheim"
  },
  {
    "name": "Sipho Hashe",
    "school_type": "Primary",
    "school_uid": "SCH-00147",
    "school_number": "147",
    "suburb": "Kwazakhele",
    "coord_east": "-33.872819",
    "coord_south": "25.58565983",
    "google_maps_link": "https://www.google.com/maps?q=-33.872819400279354,25.58565982820476",
    "info": "School Address: Mbilini Road, Kwazakhele, Gqeberha, 6205\nSchool Email: az.oc.liamadov@105001002\nSchool Principal: Malusi Ne\nSchool Phone number: +27 81 815 4222\nSuburb: Kwazakhele"
  },
  {
    "name": "Sisonke",
    "school_type": "ECD",
    "school_uid": "SCH-00313",
    "school_number": "313",
    "suburb": "New Brighton",
    "coord_east": "-33.886378",
    "coord_south": "25.60775940",
    "google_maps_link": "https://www.google.com/maps?q=-33.88637770968649,25.607759402455912",
    "info": "School Address: Nxukhwebe Street, Kwa Nobuhle, Kariega, 6242\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 041 977 7358\nSuburb: Kwa Nobuhle, Kariega"
  },
  {
    "name": "Sithembile",
    "school_type": "Primary",
    "school_uid": "SCH-00139",
    "school_number": "139",
    "suburb": "Zwide",
    "coord_east": "-29.735573",
    "coord_south": "30.92281586",
    "google_maps_link": "https://www.google.com/maps?q=-29.7355725888522,30.922815864103423",
    "info": "School Address: Booi Street, Zwide, Port Elizabeth, 6005\nSchool Email: az.oc.liamadov@407001002\nSchool Principal: Shupi M.D (Acting, 2023)\nSchool Phone number: (+27) 41 464 3311\nSuburb: Zwide, Gqeberha (Port Elizabeth)"
  },
  {
    "name": "Sivuyiseni",
    "school_type": "Primary",
    "school_uid": "SCH-00204",
    "school_number": "204",
    "suburb": "KwaMagxaki",
    "coord_east": "-33.840070",
    "coord_south": "25.53088207",
    "google_maps_link": "https://www.google.com/maps?q=-33.84006986877782,25.530882065454854",
    "info": "School Address: Ngundwana Street, Kwa-Magxaki, Port Elizabeth, 6001\nSchool Email: info@sivuyiseniprimary.co.za\nSchool Principal: (Not publicly listed in search results)\nSchool Phone number: 061 024 5853 / 041 463 1124\nSuburb: Kwa-Magxaki, Gqeberha (Port Elizabeth)"
  },
  {
    "name": "Siyabulela ",
    "school_type": "ECD",
    "school_uid": "SCH-00092",
    "school_number": "92",
    "suburb": "Motherwell",
    "coord_east": "-33.807099",
    "coord_south": "25.59429308",
    "google_maps_link": "https://www.google.com/maps?q=-33.80709897604242,25.594293076287823",
    "info": "School Address: Ngcisininde A/A Ndiki Location, Nqamakwe, 4990, Eastern Cape Province, South Africa\nSchool Email: siyabulelasss@gmail.com\nSchool Principal: Mr. Nomatyenge Siphiwo\nSchool Phone number: 071 597 2377\nSuburb: Ndiki Location, Nqamakwe"
  },
  {
    "name": "Siyaphambili",
    "school_type": "Primary",
    "school_uid": "SCH-00069",
    "school_number": "69",
    "suburb": "Motherwell",
    "coord_east": "-33.802282",
    "coord_south": "25.61393552",
    "google_maps_link": "https://www.google.com/maps?q=-33.802281568264256,25.613935522482386",
    "info": "School Address: 116 Matanzima Street, Motherwell, Gqeberha, 6211\nSchool Email: lhcsssjilibmapayis@gmail.com\nSchool Principal: Gcinumzi Robert Nqweni\nSchool Phone number: 041 469 1085 / 041 469 1126\nSuburb: Motherwell"
  },
  {
    "name": "Siyazama",
    "school_type": "ECD",
    "school_uid": "SCH-00295",
    "school_number": "295",
    "suburb": "Wittekleibos",
    "coord_east": "-34.072749",
    "coord_south": "24.49660800",
    "google_maps_link": "https://www.google.com/maps?q=-34.072749,24.496608",
    "info": "School Address: Hombe A/A, Lusikisiki, 4820\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 27392531970\nSuburb: Lusikisiki"
  },
  {
    "name": "Sizamokuhle Daycare",
    "school_type": "ECD",
    "school_uid": "SCH-00221",
    "school_number": "221",
    "suburb": "Motherwell",
    "coord_east": "-33.802257",
    "coord_south": "25.59773858",
    "google_maps_link": "https://www.google.com/maps?q=-33.80225674195678,25.597738581028427",
    "info": "School Address: Coordinates -33.80225674195678, 25.597738581028427 (per Google Maps; specific street address not found)\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: Not publicly listed\nSuburb: Not explicitly listed, but coordinates place it in Gqeberha (Port Elizabeth), Eastern Cape\n\nNo direct public records for Sizamokuhle Daycare's principal, email, or phone number were found online."
  },
  {
    "name": "Smarties",
    "school_type": "ECD",
    "school_uid": "SCH-00269",
    "school_number": "269",
    "suburb": "Zwide",
    "coord_east": "-33.972831",
    "coord_south": "25.59451438",
    "google_maps_link": "https://www.google.com/maps?q=-33.972831203822736,25.594514381535475",
    "info": "School Address: 1A Nile Road, Perridgevale, Gqeberha, Eastern Cape\nSchool Email: Not publicly listed\nSchool Principal: Zainap Smart\nSchool Phone number: Not publicly listed\nSuburb: Perridgevale\n\nSource: https://www.school-register.co.za/school/smarties-montessori/"
  },
  {
    "name": "Sophakama Pre-School",
    "school_type": "ECD",
    "school_uid": "SCH-00219",
    "school_number": "219",
    "suburb": "Motherwell",
    "coord_east": "-33.782244",
    "coord_south": "25.58800368",
    "google_maps_link": "https://www.google.com/maps?q=-33.78224408988202,25.588003675063817",
    "info": "School Address: 136 Ngwevana Street, Port Elizabeth, Eastern Cape\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: Not publicly listed\nSuburb: New Brighton, Port Elizabeth"
  },
  {
    "name": "Soqhayisa",
    "school_type": "High School",
    "school_uid": "SCH-00034",
    "school_number": "34",
    "suburb": "Motherwell",
    "coord_east": "-33.804487",
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Soutpan",
    "school_type": "Primary",
    "school_uid": "SCH-00199",
    "school_number": "199",
    "suburb": "Arcadia",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Soweto-On-Sea",
    "school_type": "Primary",
    "school_uid": "SCH-00151",
    "school_number": "151",
    "suburb": "Soweto-on-Sea",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Spencer Mabija",
    "school_type": "Primary",
    "school_uid": "SCH-00093",
    "school_number": "93",
    "suburb": "KwaMagxaki",
    "coord_east": "-33.843326",
    "coord_south": "25.53820656",
    "google_maps_link": "https://www.google.com/maps?q=-33.8433263086302,25.538206555014753",
    "info": "School Address: 63 Mangcaka Street, Kwamagxaki, Gqeberha, 6201\nSchool Email: az.oc.liamadov@427001002\nSchool Principal: Qomfo Zj\nSchool Phone number: +27 41 463 1050\nSuburb: Kwamagxaki"
  },
  {
    "name": "St Augustines",
    "school_type": "Primary",
    "school_uid": "SCH-00303",
    "school_number": "303",
    "suburb": "Central",
    "coord_east": "-33.963111",
    "coord_south": "25.62175239",
    "google_maps_link": "https://www.google.com/maps?q=-33.963110838579915,25.621752388500926",
    "info": "School Address: 6 Prospect Hill, Central, Gqeberha, 6001\nSchool Email: admin@staugustines.co.za (listed as az.oc.senitsuguats@nimda, which is admin@staugustines.co.za reversed)\nSchool Principal: Not publicly listed in available sources\nSchool Phone number: 041 585 5459\nSuburb: Central, Gqeberha"
  },
  {
    "name": "St James",
    "school_type": "High School",
    "school_uid": "SCH-00035",
    "school_number": "35",
    "suburb": "Schauderville",
    "coord_east": "-33.935186",
    "coord_south": "25.57308583",
    "google_maps_link": "https://www.google.com/maps?q=-33.935186340124766,25.57308582618465",
    "info": "School Address: Brown Street, Schauderville, Gqeberha, 6020\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 041 453 3128\nSuburb: Schauderville"
  },
  {
    "name": "St Joseph'S",
    "school_type": "Primary",
    "school_uid": "SCH-00124",
    "school_number": "124",
    "suburb": "Gerald Smith",
    "coord_east": "-33.925149",
    "coord_south": "25.50154820",
    "google_maps_link": "https://www.google.com/maps?q=-33.92514908732505,25.501548195694134",
    "info": "School Address: 536 Cape Rd, Kabega Park, Port Elizabeth, 6025\nSchool Email: principal@stjosephsrcschool.co.za\nSchool Principal: (Not explicitly listed on public pages; please verify with the school)\nSchool Phone number: 041 360 8283\nSuburb: Kabega Park"
  },
  {
    "name": "St Magdalene",
    "school_type": "ECD",
    "school_uid": "SCH-00264",
    "school_number": "264",
    "suburb": null,
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "St Mary Magdalene",
    "school_type": "ECD",
    "school_uid": "SCH-00103",
    "school_number": "103",
    "suburb": "Motherwell",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "St Teresa'S (Rc)",
    "school_type": "Primary",
    "school_uid": "SCH-00160",
    "school_number": "160",
    "suburb": "Schauderville",
    "coord_east": "-33.936171",
    "coord_south": "25.57364412",
    "google_maps_link": "https://www.google.com/maps?q=-33.93617066037834,25.573644124337257",
    "info": "School Address: 48 Paulet Street, Francisvale, Somerset East, 5850\nSchool Email: saintsteresa40@gmail.com\nSchool Principal: Mrs. Jackie Wansink (Acting Principal)\nSchool Phone number: +27 42 243 2048\nSuburb: Francisvale, Somerset East"
  },
  {
    "name": "St Thomas",
    "school_type": "High School",
    "school_uid": "SCH-00038",
    "school_number": "38",
    "suburb": "Gelvandale",
    "coord_east": "-33.919038",
    "coord_south": "25.55710498",
    "google_maps_link": "https://www.google.com/maps?q=-33.91903837522131,25.557104980159565",
    "info": "School Address: 10 Queens Road, King William's Town, 5600, Eastern Cape\nSchool Email: stpschool@yahoo.com\nSchool Principal: (Not explicitly listed in the latest sources; previous principal mentioned as Mrs G and Mr. C.A Doncker in different sources)\nSchool Phone number: 043 642 5946\nSuburb: King William's Town"
  },
  {
    "name": "Stephen Mazungula",
    "school_type": "Primary",
    "school_uid": "SCH-00050",
    "school_number": "50",
    "suburb": "New Brighton",
    "coord_east": "-33.891207",
    "coord_south": "25.59182997",
    "google_maps_link": "https://www.google.com/maps?q=-33.891207206031346,25.591829967880322",
    "info": "School Address: Magongo Street, New Brighton, Gqeberha (Port Elizabeth), 6200\nSchool Email: alukejmison@gmail.com\nSchool Principal: Np Mjekula\nSchool Phone number: 041 454 4630\nSuburb: New Brighton"
  },
  {
    "name": "Stephen Nkomo",
    "school_type": "Primary",
    "school_uid": "SCH-00135",
    "school_number": "135",
    "suburb": "KwaNobuhle",
    "coord_east": "-33.797305",
    "coord_south": "25.39660211",
    "google_maps_link": "https://www.google.com/maps?q=-33.79730474214001,25.39660210714066",
    "info": "School Address: Gxiya Street, Kwanobuhle, Kariega, 6230\nSchool Email: 847omokn.nehpets@gmail.com\nSchool Principal: Zr Jiyela\nSchool Phone number: 041 977 3015\nSuburb: Kwanobuhle"
  },
  {
    "name": "Strelitzia",
    "school_type": "Primary",
    "school_uid": "SCH-00102",
    "school_number": "102",
    "suburb": "Bethelsdorp",
    "coord_east": "-33.860850",
    "coord_south": "25.49433186",
    "google_maps_link": "https://www.google.com/maps?q=-33.86084971218498,25.494331859203484",
    "info": "School Address: Daniel Pienaar Street, Fairbridge Heights, Kariega (Uitenhage), 6229\nSchool Email: mail@strelitziahs.co.za\nSchool Principal: Andre Oosthuizen\nSchool Phone number: 041 991 1000\nSuburb: Fairbridge Heights"
  },
  {
    "name": "Sume Centre",
    "school_type": "ECD",
    "school_uid": "SCH-00286",
    "school_number": "286",
    "suburb": "New Brighton",
    "coord_east": "-33.895676",
    "coord_south": "25.59227928",
    "google_maps_link": "https://www.google.com/maps?q=-33.89567557955318,25.592279281375124",
    "info": "School Address: Msimka Street, New Brighton, Port Elizabeth, Eastern Cape\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: Not publicly listed\nSuburb: New Brighton, Port Elizabeth\n\nNote: Only the address and suburb are publicly available; principal, email, and phone number are not listed in accessible sources."
  },
  {
    "name": "Sunnyside",
    "school_type": "ECD",
    "school_uid": "SCH-00251",
    "school_number": "251",
    "suburb": "New Brighton",
    "coord_east": "-33.901973",
    "coord_south": "25.59839494",
    "google_maps_link": "https://www.google.com/maps?q=-33.901973,25.59839494",
    "info": "School Address: Main Street, Flagstaff, 4810, Eastern Cape\nSchool Email: Not publicly confirmed\nSchool Principal: Marillier Cb\nSchool Phone number: 073 229 1096\nSuburb: Flagstaff"
  },
  {
    "name": "Swartkops",
    "school_type": "Primary",
    "school_uid": "SCH-00126",
    "school_number": "126",
    "suburb": "Swartkops",
    "coord_east": "-33.864810",
    "coord_south": "25.60248345",
    "google_maps_link": "https://www.google.com/maps?q=-33.86481036232352,25.60248344790797",
    "info": "School Address: 32 A Maxwell Street, Swartkops, Gqeberha, 6209\nSchool Email: yamirpspoktraws@gmail.com\nSchool Principal: Cikizwa Xhanti\nSchool Phone number: 041 466 5611\nSuburb: Swartkops"
  },
  {
    "name": "Takalani Daycare",
    "school_type": "ECD",
    "school_uid": "SCH-00211",
    "school_number": "211",
    "suburb": "Kwazakhele",
    "coord_east": "-33.872670",
    "coord_south": "25.57540569",
    "google_maps_link": "https://www.google.com/maps?q=-33.87266979315427,25.57540568700903",
    "info": "School Address: 2713 Malinda St\nSchool Email: Not publicly listed\nSchool Principal: Johanna Khoza\nSchool Phone number: Not publicly listed\nSuburb: Not explicitly listed, but based on the Google Maps link, it is in Gqeberha (Port Elizabeth), Eastern Cape"
  },
  {
    "name": "Thanda Abantwana",
    "school_type": "ECD",
    "school_uid": "SCH-00242",
    "school_number": "242",
    "suburb": null,
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Thandabantwana Daycare",
    "school_type": "ECD",
    "school_uid": "SCH-00217",
    "school_number": "217",
    "suburb": "Motherwell",
    "coord_east": "-33.789111",
    "coord_south": "25.58305465",
    "google_maps_link": "https://www.google.com/maps?q=-33.789111489952816,25.583054653183687",
    "info": "School Address: 447 Sigalo St\nSchool Email: Not publicly listed\nSchool Principal: Evenly Thwala\nSchool Phone number: Not publicly listed\nSuburb: Not specified (based on the Google Maps link, likely in or near Gqeberha/Port Elizabeth, Eastern Cape)\n\nNote: The school’s contact email and phone number are not publicly available in the sources found."
  },
  {
    "name": "Thandi's Educare & Aftercare",
    "school_type": "ECD",
    "school_uid": "SCH-00259",
    "school_number": "259",
    "suburb": "New Brighton",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Thembalethu",
    "school_type": "ECD",
    "school_uid": "SCH-00107",
    "school_number": "107",
    "suburb": "New Brighton",
    "coord_east": "-33.907308",
    "coord_south": "25.60010112",
    "google_maps_link": "https://www.google.com/maps?q=-33.907308243779894,25.600101123128002",
    "info": "School Address: Qhawa Street, Thembalethu, George, 6536\nSchool Email: Not publicly listed\nSchool Principal: Nm Cona\nSchool Phone number: 044 880 9182\nSuburb: Thembalethu, George"
  },
  {
    "name": "Tinara",
    "school_type": "High School",
    "school_uid": "SCH-00030",
    "school_number": "30",
    "suburb": "Uitenhage",
    "coord_east": "-33.811683",
    "coord_south": "25.39749493",
    "google_maps_link": "https://www.google.com/maps?q=-33.81168265916304,25.39749492617769",
    "info": "School Address: 2 Ponana Tini Road, KwaNobuhle, Kariega, 6242\nSchool Email: ten.asmoklet@aranit (reverse to get: tinara@telkomsa.net)\nSchool Principal: Not publicly listed in recent sources\nSchool Phone number: 041 977 3198\nSuburb: KwaNobuhle"
  },
  {
    "name": "Tinky Winky Day Care",
    "school_type": "ECD",
    "school_uid": "SCH-00235",
    "school_number": "235",
    "suburb": null,
    "coord_east": "-33.824381",
    "coord_south": "25.58975190",
    "google_maps_link": "https://www.google.com/maps?q=-33.824381,25.5897519",
    "info": "School Address: Ceru Street, Motherwell NU5, Port Elizabeth, Eastern Cape, 6211\nSchool Email: tinkywinkyplayschool@gmail.com\nSchool Principal: Veronica Sacks\nSchool Phone number: +27 61 427 6194\nSuburb: Motherwell NU5"
  },
  {
    "name": "Triomf",
    "school_type": "Primary",
    "school_uid": "SCH-00188",
    "school_number": "188",
    "suburb": "Salsoneville",
    "coord_east": "-33.887592",
    "coord_south": "25.51036135",
    "google_maps_link": "https://www.google.com/maps?q=-33.887591946171945,25.510361352695163",
    "info": "School Address: 1 Adams Street, Salsoneville, Gqeberha, 6059\nSchool Email: triomfprimaryschool@komast.net\nSchool Principal: Not publicly listed\nSchool Phone number: 041 481 2289\nSuburb: Salsoneville"
  },
  {
    "name": "Twinkle toes Educare ",
    "school_type": "ECD",
    "school_uid": "SCH-00266",
    "school_number": "266",
    "suburb": null,
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Tyhilulwazi",
    "school_type": "High School",
    "school_uid": "SCH-00040",
    "school_number": "40",
    "suburb": "Zinyoka",
    "coord_east": "-33.862420",
    "coord_south": "25.54295925",
    "google_maps_link": "https://www.google.com/maps?q=-33.86241977569894,25.542959253168434",
    "info": "School Address: Mbeki Street, Govan Mbeki Township, Gqeberha, 6001\nSchool Email: shizawluliyt@telkomsa.net\nSchool Principal: F.A. Magxalisa\nSchool Phone number: 041 450 7123\nSuburb: Govan Mbeki Township"
  },
  {
    "name": "Uitenhage",
    "school_type": "Primary",
    "school_uid": "SCH-00143",
    "school_number": "143",
    "suburb": "Gambleville",
    "coord_east": "-33.741340",
    "coord_south": "25.37387277",
    "google_maps_link": "https://www.google.com/maps?q=-33.741339584584864,25.373872766655698",
    "info": "'- School Address: 27 Essenwood Street, Gambleville, Kariega (Uitenhage), 6229\n- School Email: Not publicly listed\n- School Principal: Not publicly listed\n- School Phone number: Not publicly listed\n- Suburb: Gambleville, Kariega (Uitenhage)"
  },
  {
    "name": "Umzam'omhle Educare",
    "school_type": "ECD",
    "school_uid": "SCH-00273",
    "school_number": "273",
    "suburb": "Bethelsdorp",
    "coord_east": "-33.861112",
    "coord_south": "25.54003268",
    "google_maps_link": "https://www.google.com/maps?q=-33.861112481802856,25.540032681528714",
    "info": "'- School Address: Not explicitly listed, but located at the coordinates -33.861112481802856, 25.540032681528714 in the Eastern Cape (Amathole West district)\n- School Email: Not publicly listed\n- School Principal: Not publicly listed\n- School Phone number: Not publicly listed\n- Suburb: Not explicitly listed, but based on coordinates, likely in or near Mdantsane/Amathole West\n\nNo direct public listing for principal, email, or phone number was found in available sources. The school appears in government documents as \"Umzam'omhle Senior Secondary School\" in Amathole West."
  },
  {
    "name": "Van Der Kemp",
    "school_type": "Primary",
    "school_uid": "SCH-00149",
    "school_number": "149",
    "suburb": "Salt Lake",
    "coord_east": "-33.888971",
    "coord_south": "25.53330291",
    "google_maps_link": "https://www.google.com/maps?q=-33.88897059949112,25.533302910840597",
    "info": "School Address: Baartman Street, Salt Lake, Gqeberha, 6059\nSchool Email: debbie.jephta@gmail.com\nSchool Principal: Dr Jeptha\nSchool Phone number: 041 481 6128\nSuburb: Salt Lake, Gqeberha"
  },
  {
    "name": "Van Stadens",
    "school_type": "Primary",
    "school_uid": "SCH-00174",
    "school_number": "174",
    "suburb": "Thornhill",
    "coord_east": "-33.909612",
    "coord_south": "25.21666280",
    "google_maps_link": "https://www.google.com/maps?q=-33.9096117993681,25.216662801609772",
    "info": "School Address: Wild Flower Reserve, Witteklip, Thornhill, 6375\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 073 959 1625\nSuburb: Thornhill"
  },
  {
    "name": "Verite",
    "school_type": "Primary",
    "school_uid": "SCH-00134",
    "school_number": "134",
    "suburb": "Rosedale",
    "coord_east": "-33.738524",
    "coord_south": "25.36677901",
    "google_maps_link": "https://www.google.com/maps?q=-33.73852389516339,25.366779012202546",
    "info": "School Address: Eagle Drive, Rosedale, Uitenhage, 6230\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 041 988 5441\nSuburb: Rosedale, Uitenhage"
  },
  {
    "name": "Vezubuhle",
    "school_type": "Primary",
    "school_uid": "SCH-00084",
    "school_number": "84",
    "suburb": "Motherwell",
    "coord_east": "-33.817221",
    "coord_south": "25.59246774",
    "google_maps_link": "https://www.google.com/maps?q=-33.81722093098663,25.592467737824485",
    "info": "School Address: Mgwalana Street, Motherwell, Gqeberha, 6211\nSchool Email: az.oc.liamadov@918001002\nSchool Principal: Not publicly listed\nSchool Phone number: 041 462 0688\nSuburb: Motherwell, Gqeberha"
  },
  {
    "name": "VM Kwinana",
    "school_type": "High School",
    "school_uid": "SCH-00021",
    "school_number": "21",
    "suburb": "Uitenhage",
    "coord_east": "-33.797690",
    "coord_south": "25.39720291",
    "google_maps_link": "https://www.google.com/maps?q=-33.797690474419525,25.39720291083548",
    "info": "School Address: 56 Nomakhwezana Street, Kwa-Nobuhle, Kariega, 6242\nSchool Email: Not publicly listed\nSchool Principal: Jm Blou\nSchool Phone number: 041 977 7053 / 041 977 2355\nSuburb: Kwa-Nobuhle, Kariega"
  },
  {
    "name": "Vuba",
    "school_type": "Primary",
    "school_uid": "SCH-00128",
    "school_number": "128",
    "suburb": "KwaNobuhle",
    "coord_east": "-33.799112",
    "coord_south": "25.38556861",
    "google_maps_link": "https://www.google.com/maps?q=-33.799111783823626,25.385568608988237",
    "info": "School Address: 28 Soga Street, Kwanobuhle, Kariega, 6242\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 041 977 1617\nSuburb: Kwanobuhle, Kariega"
  },
  {
    "name": "Vukani Daycare",
    "school_type": "ECD",
    "school_uid": "SCH-00311",
    "school_number": "311",
    "suburb": "Clarkson",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Vukanibantu",
    "school_type": "Primary",
    "school_uid": "SCH-00080",
    "school_number": "80",
    "suburb": "Motherwell",
    "coord_east": "-33.826446",
    "coord_south": "25.59781321",
    "google_maps_link": "https://www.google.com/maps?q=-33.82644608977926,25.597813210837128",
    "info": "School Address: Chalumna Street, N.U 5, Motherwell, Gqeberha, 6211\nSchool Email: vukanibantuprimary@gmail.com\nSchool Principal: Not publicly listed\nSchool Phone number: 041 462 0089\nSuburb: Motherwell, Gqeberha"
  },
  {
    "name": "Vulamazibuko",
    "school_type": "High School",
    "school_uid": "SCH-00007",
    "school_number": "7",
    "suburb": "East London",
    "coord_east": "-32.939983",
    "coord_south": "27.74764259",
    "google_maps_link": "https://www.google.com/maps?q=-32.939982880110065,27.74764258934256",
    "info": "School Address: 1409 Nu 6, Mdantsane, East London, 5219\nSchool Email: principal.200200887@ecschools.org.za\nSchool Principal: Not publicly listed\nSchool Phone number: 043 555 0652\nSuburb: Mdantsane"
  },
  {
    "name": "Vulithemba",
    "school_type": "ECD",
    "school_uid": "SCH-00246",
    "school_number": "246",
    "suburb": "Zwide",
    "coord_east": "-33.867941",
    "coord_south": "25.57438521",
    "google_maps_link": "https://www.google.com/maps?q=-33.867941,25.57438521",
    "info": "'- School Address: Vulithemba, coordinates -33.867941, 25.57438521 (Google Maps location in Gqeberha, Eastern Cape)\n- School Email: Not publicly listed\n- School Principal: Not publicly listed\n- School Phone number: Not publicly listed\n- Suburb: Gqeberha (formerly Port Elizabeth), Eastern Cape\n\nNo direct public listings for principal, email, or phone number were found for Vulithemba at this location."
  },
  {
    "name": "Vulumzi",
    "school_type": "High School",
    "school_uid": "SCH-00019",
    "school_number": "19",
    "suburb": "Motherwell",
    "coord_east": "-33.827315",
    "coord_south": "25.59468040",
    "google_maps_link": "https://www.google.com/maps?q=-33.82731543106958,25.59468039549589",
    "info": "School Address: 54 Chalumna Street, Motherwell, Gqeberha, 6211\nSchool Email: sssizmuluv@gmail.com\nSchool Principal: Ms Quza\nSchool Phone number: 041 205 0924\nSuburb: Motherwell"
  },
  {
    "name": "W B Tshume",
    "school_type": "Primary",
    "school_uid": "SCH-00150",
    "school_number": "150",
    "suburb": "Kwazakhele",
    "coord_east": "-33.868539",
    "coord_south": "25.58098075",
    "google_maps_link": "https://www.google.com/maps?q=-33.8685393120859,25.58098074801691",
    "info": "School Address: Ngxokolo Street, Kwazakhele, Gqeberha, 6205\nSchool Email: npotelwa4@gmail.com\nSchool Principal: Mr. A.C Mfunda\nSchool Phone number: 060 566 0097 / 064 531 2249\nSuburb: Kwazakhele"
  },
  {
    "name": "Walmer",
    "school_type": "Primary",
    "school_uid": "SCH-00200",
    "school_number": "200",
    "suburb": "Walmer",
    "coord_east": "-33.983145",
    "coord_south": "25.59204782",
    "google_maps_link": "https://www.google.com/maps?q=-33.98314458768467,25.592047824594495",
    "info": "School Address: Corner Heugh Road & 9th Avenue, Walmer, Port Elizabeth, 6070\nSchool Email: Not publicly listed\nSchool Principal: Mr Siyanda Sitsheke (Walmer High School)\nSchool Phone number: 041 581 1075\nSuburb: Walmer"
  },
  {
    "name": "Walmer HS",
    "school_type": "High School",
    "school_uid": "SCH-00012",
    "school_number": "12",
    "suburb": "Walmer",
    "coord_east": "-33.984663",
    "coord_south": "25.58707228",
    "google_maps_link": "https://www.google.com/maps?q=-33.98466340728998,25.587072282010705",
    "info": "School Address: Corner Heugh Road & 9th Avenue, Walmer, Port Elizabeth, 6070\nSchool Email: Not publicly listed\nSchool Principal: Mr Siyanda Sitsheke\nSchool Phone number: 041 581 1075\nSuburb: Walmer"
  },
  {
    "name": "West End",
    "school_type": "Primary",
    "school_uid": "SCH-00136",
    "school_number": "136",
    "suburb": "Bethelsdorp",
    "coord_east": "-33.881385",
    "coord_south": "25.51862858",
    "google_maps_link": "https://www.google.com/maps?q=-33.88138484719807,25.518628582004904",
    "info": "School Address: 26-36 St Dominic Street, West End, Port Elizabeth, 6059\nSchool Email: 200108045@vodamail.co.za\nSchool Principal: Blignaut Yf (2023)\nSchool Phone number: (+27) 41 481 1914\nSuburb: West End, Port Elizabeth"
  },
  {
    "name": "Winterberg",
    "school_type": "Primary",
    "school_uid": "SCH-00120",
    "school_number": "120",
    "suburb": "Gerald Smith",
    "coord_east": "-33.769461",
    "coord_south": "25.39377555",
    "google_maps_link": "https://www.google.com/maps?q=-33.769461193223336,25.39377555316326",
    "info": "School Address: R344, Winterberg area, Tarkastad, 5370, Eastern Cape\nSchool Email: info@winterbergschool.org\nSchool Principal: Not publicly listed\nSchool Phone number: +27 (0)45 848 0004\nSuburb: Winterberg area, Tarkastad"
  },
  {
    "name": "Wongalethu",
    "school_type": "High School",
    "school_uid": "SCH-00009",
    "school_number": "9",
    "suburb": "East London",
    "coord_east": "-32.950130",
    "coord_south": "27.74998477",
    "google_maps_link": "https://www.google.com/maps?q=-32.95013003109316,27.749984766612005",
    "info": "School Address: 5107 NU 2, Mdantsane, East London, 5219\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed\nSchool Phone number: 043 760 0062 / 043 761 6496\nSuburb: Mdantsane"
  },
  {
    "name": "Yellowwoods",
    "school_type": "Primary",
    "school_uid": "SCH-00178",
    "school_number": "178",
    "suburb": "Witteklip",
    "coord_east": "-33.903179",
    "coord_south": "25.25738364",
    "google_maps_link": "https://www.google.com/maps?q=-33.903179445739774,25.25738363920157",
    "info": "School Address: Between Adelaide and Bedford, P.O. Box 136, Adelaide, 5760, Eastern Cape, South Africa\nSchool Email: ywadmin@procomp.co.za\nSchool Principal: Not listed on the official website\nSchool Phone number: 046 684 0708\nSuburb: Near Adelaide (between Adelaide and Bedford)"
  },
  {
    "name": "Yomelela EduCare",
    "school_type": "ECD",
    "school_uid": "SCH-00236",
    "school_number": "236",
    "suburb": "Kwazakhele",
    "coord_east": "-33.880337",
    "coord_south": "25.60037885",
    "google_maps_link": "https://www.google.com/maps?q=-33.88033705943463,25.600378852694693",
    "info": "School Address: 11524 Mathodlana Street, Port Elizabeth, Eastern Cape\nSchool Email: Not publicly listed\nSchool Principal: Nombulelo Mgqwanci\nSchool Phone number: Not publicly listed\nSuburb: Not explicitly listed, but located in Nelson Mandela Bay, Port Elizabeth"
  },
  {
    "name": "Zamukukhanya",
    "school_type": "Primary",
    "school_uid": "SCH-00156",
    "school_number": "156",
    "suburb": "Zwide",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Zanolwazi",
    "school_type": "High School",
    "school_uid": "SCH-00011",
    "school_number": "11",
    "suburb": "Despatch",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  },
  {
    "name": "Zanoxolo",
    "school_type": "Primary",
    "school_uid": "SCH-00058",
    "school_number": "58",
    "suburb": "Motherwell",
    "coord_east": "-33.797113",
    "coord_south": "25.60487174",
    "google_maps_link": "https://www.google.com/maps?q=-33.79711267861864,25.60487173967095",
    "info": "School Address: 1 Qhude Street, Motherwell, Gqeberha, 6211\nSchool Email: thembekaveto@gmail.co.za\nSchool Principal: Not publicly listed\nSchool Phone number: +27 41 469 2183\nSuburb: Motherwell, Gqeberha"
  },
  {
    "name": "Zizamele",
    "school_type": "ECD",
    "school_uid": "SCH-00304",
    "school_number": "304",
    "suburb": "New Brighton",
    "coord_east": "-33.892751",
    "coord_south": "25.60417254",
    "google_maps_link": "https://www.google.com/maps?q=-33.892751,25.60417254",
    "info": "School Address: Main Street, Zizamele Township, Msobomvu Township, Butterworth, 4960\nSchool Email: Not publicly listed\nSchool Principal: Not publicly listed (previously listed as Mbuyazwe Oz for Zizamele Primary, but not confirmed for this school)\nSchool Phone number: 073 258 9282\nSuburb: Msobomvu Township, Butterworth"
  },
  {
    "name": "Zukhanye",
    "school_type": "ECD",
    "school_uid": "SCH-00249",
    "school_number": "249",
    "suburb": null,
    "coord_east": "-33.797929",
    "coord_south": "25.60619036",
    "google_maps_link": "https://www.google.com/maps?q=-33.797929,25.60619036",
    "info": "School Address: Mzantsi Location, King Williams Town, 5600\nSchool Email: twk9550002002@gmail.com\nSchool Principal: Not publicly listed\nSchool Phone number: 079 480 5014\nSuburb: Mzantsi Location"
  },
  {
    "name": "Zukisa",
    "school_type": "Primary",
    "school_uid": "SCH-00307",
    "school_number": "307",
    "suburb": "Mdantsane",
    "coord_east": null,
    "coord_south": null,
    "google_maps_link": null,
    "info": null
  }
]$schools$::jsonb) as school(
    name text,
    school_type text,
    school_uid text,
    school_number text,
    suburb text,
    coord_east numeric,
    coord_south numeric,
    google_maps_link text,
    info text
  )
)
insert into public.schools (
  name,
  school_type,
  school_uid,
  school_number,
  suburb,
  coord_east,
  coord_south,
  google_maps_link,
  is_active
)
select
  school.name,
  school.school_type,
  school.school_uid,
  school.school_number,
  school.suburb,
  school.coord_east,
  school.coord_south,
  coalesce(school.google_maps_link, school.info),
  true
from school_seed school
where school.name is not null
on conflict (name) do update
set school_type = excluded.school_type,
    school_uid = excluded.school_uid,
    school_number = excluded.school_number,
    suburb = excluded.suburb,
    coord_east = excluded.coord_east,
    coord_south = excluded.coord_south,
    google_maps_link = excluded.google_maps_link,
    is_active = true,
    updated_at = now();
