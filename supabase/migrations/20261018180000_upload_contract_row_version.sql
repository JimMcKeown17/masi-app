set lock_timeout = '10s';
set statement_timeout = '60s';

alter table public.children
  add column if not exists row_version bigint not null default 1;
alter table public.classes
  add column if not exists row_version bigint not null default 1;
alter table public.groups
  add column if not exists row_version bigint not null default 1;
alter table public.child_ea_assignments
  add column if not exists row_version bigint not null default 1;
alter table public.class_ea_assignments
  add column if not exists row_version bigint not null default 1;
alter table public.group_ea_assignments
  add column if not exists row_version bigint not null default 1;
alter table public.child_programme_enrollments
  add column if not exists row_version bigint not null default 1;
alter table public.child_class_memberships
  add column if not exists row_version bigint not null default 1;
alter table public.child_group_memberships
  add column if not exists row_version bigint not null default 1;
alter table public.grouping_versions
  add column if not exists row_version bigint not null default 1;
alter table public.class_grouping_state
  add column if not exists row_version bigint not null default 1;

-- Ties preserve unversioned writers, including FK actions and membership exits.
create or replace function private.enforce_row_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.row_version < old.row_version then
    raise exception using
      errcode = 'MV001',
      message = 'stale_version',
      detail = format('%s id=%s incoming row_version=%s stored row_version=%s',
        tg_table_name, new.id, new.row_version, old.row_version);
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_row_version() from public, anon, authenticated;

drop trigger if exists children_enforce_row_version on public.children;
create trigger children_enforce_row_version
  before update on public.children
  for each row execute function private.enforce_row_version();

drop trigger if exists classes_enforce_row_version on public.classes;
create trigger classes_enforce_row_version
  before update on public.classes
  for each row execute function private.enforce_row_version();

drop trigger if exists groups_enforce_row_version on public.groups;
create trigger groups_enforce_row_version
  before update on public.groups
  for each row execute function private.enforce_row_version();

drop trigger if exists child_ea_assignments_enforce_row_version on public.child_ea_assignments;
create trigger child_ea_assignments_enforce_row_version
  before update on public.child_ea_assignments
  for each row execute function private.enforce_row_version();

drop trigger if exists class_ea_assignments_enforce_row_version on public.class_ea_assignments;
create trigger class_ea_assignments_enforce_row_version
  before update on public.class_ea_assignments
  for each row execute function private.enforce_row_version();

drop trigger if exists group_ea_assignments_enforce_row_version on public.group_ea_assignments;
create trigger group_ea_assignments_enforce_row_version
  before update on public.group_ea_assignments
  for each row execute function private.enforce_row_version();

drop trigger if exists child_programme_enrollments_enforce_row_version on public.child_programme_enrollments;
create trigger child_programme_enrollments_enforce_row_version
  before update on public.child_programme_enrollments
  for each row execute function private.enforce_row_version();

drop trigger if exists child_class_memberships_enforce_row_version on public.child_class_memberships;
create trigger child_class_memberships_enforce_row_version
  before update on public.child_class_memberships
  for each row execute function private.enforce_row_version();

drop trigger if exists child_group_memberships_enforce_row_version on public.child_group_memberships;
create trigger child_group_memberships_enforce_row_version
  before update on public.child_group_memberships
  for each row execute function private.enforce_row_version();

drop trigger if exists grouping_versions_enforce_row_version on public.grouping_versions;
create trigger grouping_versions_enforce_row_version
  before update on public.grouping_versions
  for each row execute function private.enforce_row_version();

drop trigger if exists class_grouping_state_enforce_row_version on public.class_grouping_state;
create trigger class_grouping_state_enforce_row_version
  before update on public.class_grouping_state
  for each row execute function private.enforce_row_version();

notify pgrst, 'reload schema';

reset statement_timeout;
reset lock_timeout;
