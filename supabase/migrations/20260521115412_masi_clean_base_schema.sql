create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  school_uid text unique,
  school_number text,
  name text not null unique,
  school_type text,
  suburb text,
  coord_east numeric,
  coord_south numeric,
  google_maps_link text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_titles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.programmes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  job_title_id uuid references public.job_titles(id) on delete restrict,
  school_id uuid references public.schools(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_programme_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  programme_id uuid not null references public.programmes(id) on delete restrict,
  school_id uuid references public.schools(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_programme_assignment_dates_chk check (
    ended_at is null or ended_at >= assigned_at
  )
);

create table if not exists public.assessment_tools (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes(id) on delete restrict,
  code text not null unique,
  name text not null,
  subject text,
  language text,
  version text,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  name text not null,
  grade text not null,
  teacher text,
  home_language text,
  academic_year integer,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  preferred_name text,
  date_of_birth date,
  age integer,
  gender text,
  class_id uuid references public.classes(id) on delete set null,
  hidden_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint children_age_chk check (age is null or (age >= 0 and age < 25)),
  constraint children_gender_chk check (
    gender is null or gender in ('female', 'male', 'non_binary', 'unknown')
  )
);

create table if not exists public.child_ea_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint child_ea_assignment_dates_chk check (
    unassigned_at is null or unassigned_at >= assigned_at
  )
);

create table if not exists public.child_programme_enrollments (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  programme_id uuid not null references public.programmes(id) on delete restrict,
  enrolled_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint child_programme_enrollment_dates_chk check (
    ended_at is null or ended_at >= enrolled_at
  )
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  programme_id uuid not null references public.programmes(id) on delete restrict,
  class_id uuid references public.classes(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.child_group_memberships (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint child_group_membership_dates_chk check (
    removed_at is null or removed_at >= joined_at
  )
);

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  sign_in_time timestamptz not null,
  sign_in_lat numeric(9, 6) not null,
  sign_in_lon numeric(9, 6) not null,
  sign_out_time timestamptz,
  sign_out_lat numeric(9, 6),
  sign_out_lon numeric(9, 6),
  auto_clocked_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  programme_id uuid not null references public.programmes(id) on delete restrict,
  class_id uuid references public.classes(id) on delete set null,
  session_date date not null,
  started_at timestamptz,
  ended_at timestamptz,
  activities jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.session_attendees (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  attendance_status text not null default 'present',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_attendees_status_chk check (
    attendance_status in ('present', 'absent', 'late', 'excused')
  )
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  programme_id uuid not null references public.programmes(id) on delete restrict,
  assessment_tool_id uuid references public.assessment_tools(id) on delete restrict,
  assessment_type text not null,
  assessment_date date not null,
  score integer,
  total_items integer,
  items_tested jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assessment_items (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  item_key text not null,
  prompt text,
  response text,
  is_correct boolean,
  position integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.letter_mastery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  programme_id uuid not null references public.programmes(id) on delete restrict,
  letter text not null,
  language text not null,
  source text not null default 'taught',
  mastered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_schools_school_uid on public.schools(school_uid);
create index if not exists idx_users_school_id on public.users(school_id);
create index if not exists idx_users_job_title_id on public.users(job_title_id);
create index if not exists idx_staff_programme_assignments_user on public.staff_programme_assignments(user_id);
create index if not exists idx_staff_programme_assignments_programme on public.staff_programme_assignments(programme_id);
create index if not exists idx_assessment_tools_programme on public.assessment_tools(programme_id);
create index if not exists idx_classes_school_id on public.classes(school_id);
create index if not exists idx_classes_created_by on public.classes(created_by);
create index if not exists idx_children_class_id on public.children(class_id);
create index if not exists idx_children_created_by on public.children(created_by);
create index if not exists idx_child_ea_assignments_user on public.child_ea_assignments(user_id);
create index if not exists idx_child_ea_assignments_child on public.child_ea_assignments(child_id);
create index if not exists idx_child_programme_enrollments_child on public.child_programme_enrollments(child_id);
create index if not exists idx_child_programme_enrollments_programme on public.child_programme_enrollments(programme_id);
create index if not exists idx_groups_programme_id on public.groups(programme_id);
create index if not exists idx_groups_class_id on public.groups(class_id);
create index if not exists idx_groups_created_by on public.groups(created_by);
create index if not exists idx_child_group_memberships_child on public.child_group_memberships(child_id);
create index if not exists idx_child_group_memberships_group on public.child_group_memberships(group_id);
create index if not exists idx_time_entries_user_id on public.time_entries(user_id);
create index if not exists idx_time_entries_sign_in_time on public.time_entries(sign_in_time);
create index if not exists idx_sessions_user_programme on public.sessions(user_id, programme_id);
create index if not exists idx_sessions_session_date on public.sessions(session_date);
create index if not exists idx_session_attendees_session on public.session_attendees(session_id);
create index if not exists idx_session_attendees_child on public.session_attendees(child_id);
create index if not exists idx_assessments_child_programme on public.assessments(child_id, programme_id);
create index if not exists idx_assessments_user_programme on public.assessments(user_id, programme_id);
create index if not exists idx_assessment_items_assessment on public.assessment_items(assessment_id);
create index if not exists idx_letter_mastery_child_programme on public.letter_mastery(child_id, programme_id);
create index if not exists idx_letter_mastery_user on public.letter_mastery(user_id);

create unique index if not exists idx_child_ea_assignments_active_unique
  on public.child_ea_assignments(user_id, child_id)
  where unassigned_at is null;

create unique index if not exists idx_child_programme_enrollments_active_unique
  on public.child_programme_enrollments(child_id, programme_id)
  where ended_at is null;

create unique index if not exists idx_child_group_memberships_active_unique
  on public.child_group_memberships(child_id, group_id)
  where removed_at is null;

create unique index if not exists idx_assessment_items_unique_position
  on public.assessment_items(assessment_id, position)
  where position is not null;

create unique index if not exists idx_letter_mastery_unique
  on public.letter_mastery(user_id, child_id, programme_id, letter, language, source);

create trigger schools_set_updated_at
  before update on public.schools
  for each row execute function private.set_updated_at();

create trigger job_titles_set_updated_at
  before update on public.job_titles
  for each row execute function private.set_updated_at();

create trigger programmes_set_updated_at
  before update on public.programmes
  for each row execute function private.set_updated_at();

create trigger users_set_updated_at
  before update on public.users
  for each row execute function private.set_updated_at();

create trigger staff_programme_assignments_set_updated_at
  before update on public.staff_programme_assignments
  for each row execute function private.set_updated_at();

create trigger assessment_tools_set_updated_at
  before update on public.assessment_tools
  for each row execute function private.set_updated_at();

create trigger classes_set_updated_at
  before update on public.classes
  for each row execute function private.set_updated_at();

create trigger children_set_updated_at
  before update on public.children
  for each row execute function private.set_updated_at();

create trigger child_ea_assignments_set_updated_at
  before update on public.child_ea_assignments
  for each row execute function private.set_updated_at();

create trigger child_programme_enrollments_set_updated_at
  before update on public.child_programme_enrollments
  for each row execute function private.set_updated_at();

create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function private.set_updated_at();

create trigger child_group_memberships_set_updated_at
  before update on public.child_group_memberships
  for each row execute function private.set_updated_at();

create trigger time_entries_set_updated_at
  before update on public.time_entries
  for each row execute function private.set_updated_at();

create trigger sessions_set_updated_at
  before update on public.sessions
  for each row execute function private.set_updated_at();

create trigger session_attendees_set_updated_at
  before update on public.session_attendees
  for each row execute function private.set_updated_at();

create trigger assessments_set_updated_at
  before update on public.assessments
  for each row execute function private.set_updated_at();

create trigger assessment_items_set_updated_at
  before update on public.assessment_items
  for each row execute function private.set_updated_at();

create trigger letter_mastery_set_updated_at
  before update on public.letter_mastery
  for each row execute function private.set_updated_at();
