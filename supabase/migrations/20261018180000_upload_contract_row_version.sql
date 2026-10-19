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

-- An EA's late open snapshot must not undo a close. Keep returning the row so
-- absorbed retries still receive the phone's exact one-row acknowledgement.
create or replace function private.time_entries_forward_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (auth.uid() = new.user_id) is not true then
      return new;
    end if;
  else
    if (auth.uid() = old.user_id) is not true then
      return new;
    end if;
    if old.sign_out_time is not null then
      if old.auto_clocked_out and old.sign_out_time = old.sign_in_time + interval '10 hours'
          and new.sign_out_time <= old.sign_out_time then
        return new;
      end if;
      new.sign_out_time := old.sign_out_time;
      new.sign_out_lat := old.sign_out_lat;
      new.sign_out_lon := old.sign_out_lon;
      new.sign_out_location_status := old.sign_out_location_status;
      new.auto_clocked_out := old.auto_clocked_out;
      return new;
    end if;
  end if;

  -- A shift captured entirely offline first arrives as an already-closed insert.
  if new.sign_out_time > new.sign_in_time + interval '10 hours' then
    new.sign_out_time := new.sign_in_time + interval '10 hours';
    new.sign_out_lat := null;
    new.sign_out_lon := null;
    new.sign_out_location_status := null;
    new.auto_clocked_out := true;
  end if;
  return new;
end;
$$;

revoke execute on function private.time_entries_forward_only() from public, anon, authenticated;

drop trigger if exists time_entries_forward_only on public.time_entries;
create trigger time_entries_forward_only
  before insert or update on public.time_entries
  for each row execute function private.time_entries_forward_only();

create or replace function private.close_overdue_time_entries()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  closed_count integer;
begin
  update public.time_entries
    set sign_out_time = sign_in_time + interval '10 hours',
      auto_clocked_out = true,
      sign_out_lat = null,
      sign_out_lon = null,
      sign_out_location_status = null
    where sign_out_time is null
      and sign_in_time < now() - interval '10 hours';
  get diagnostics closed_count = row_count;
  return closed_count;
end;
$$;

revoke execute on function private.close_overdue_time_entries() from public, anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') and
      current_database() = 'postgres' then
    create extension if not exists pg_cron;
    execute $cron$
      select cron.schedule('masi_close_overdue_time_entries', '*/15 * * * *',
        'select private.close_overdue_time_entries();');
    $cron$;
  end if;
end;
$$;

notify pgrst, 'reload schema';

reset statement_timeout;
reset lock_timeout;
