SET lock_timeout = '10s';
SET statement_timeout = '60s';

-- Lifecycle safety S1 (docs/superpowers/plans/2026-11-04-lifecycle-safety.md, ADR-0014 rules
-- 3 and 4): an end is written once, and the server decides archive-versus-archive conflicts.
-- MA-BUG-20261104-006 (a phone overwrote or reopened what Head Office ended), -007 (a fast
-- phone clock made ends fail with 23514), and the server parts of -011 and -013.
--
-- Absorb, don't refuse: the guard never raises and always returns NEW. A stale, redundant or
-- reopening write from an EA becomes a one-row no-op that 1.5.0 acknowledges; an archive the
-- caller may not apply for everyone becomes "leave" (archived_at stays NULL, still one row).
-- Rows the UPDATE policies hide from the EA still return 0 rows (review finding 2): RLS USING
-- runs before any trigger, and this batch adds no "former holder" UPDATE arm.

-- "Does anyone other than p_actor still hold this?" Shared by the guard (S1) and Delete child
-- (S3, 20261105120300). With p_lock it first takes the lock protocol's row locks, ids
-- ascending, in the global order children -> classes -> groups (the child or entity row itself
-- is already locked by the caller's UPDATE or by S3). Head Office grant changes (the H1 script)
-- take the same locks in the same order before inserting or reopening an assignment, so the
-- predicate below, evaluated after the locks with a fresh READ COMMITTED snapshot, sees any
-- holder whose grant committed first. VOLATILE on purpose: each query takes a new snapshot.
create or replace function private.other_active_holder(
  p_table text,
  p_id uuid,
  p_actor uuid,
  p_lock boolean default false
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_table = 'children' then
    if p_lock then
      perform 1 from public.classes c
      where c.id in (
        select m.class_id from public.child_class_memberships m
        where m.child_id = p_id and m.exited_at is null
      )
      order by c.id
      for update of c;
      perform 1 from public.groups g
      where g.id in (
        select m.group_id from public.child_group_memberships m
        where m.child_id = p_id and m.removed_at is null
      )
      order by g.id
      for update of g;
    end if;
    -- The three arms of private.current_user_can_write_for_child, for everyone but p_actor.
    return exists (
      select 1 from public.child_ea_assignments a
      where a.child_id = p_id
        and a.user_id is distinct from p_actor
        and a.unassigned_at is null
    )
    or exists (
      select 1 from public.class_ea_assignments cls
      join public.child_class_memberships m
        on m.class_id = cls.class_id and m.exited_at is null
      where m.child_id = p_id
        and cls.ea_user_id is distinct from p_actor
        and cls.unassigned_at is null
    )
    or exists (
      select 1 from public.group_ea_assignments grp
      join public.child_group_memberships m
        on m.group_id = grp.group_id and m.removed_at is null
      where m.child_id = p_id
        and grp.ea_user_id is distinct from p_actor
        and grp.unassigned_at is null
    );
  elsif p_table = 'classes' then
    if p_lock then
      perform 1 from public.classes c where c.id = p_id for update;
    end if;
    -- Someone else holds the class when they teach it, or when they hold one of its children
    -- directly or through a group of the class: an archive would hide that child from them.
    -- Children and groups are read, not locked, so the global lock order is kept. That is safe
    -- because any Head Office grant that makes someone a holder here (a class assignment, a
    -- direct assignment to a child of the class, a group assignment on a group of the class)
    -- locks this class row first, in the children -> classes -> groups order.
    return exists (
      select 1 from public.class_ea_assignments a
      where a.class_id = p_id
        and a.ea_user_id is distinct from p_actor
        and a.unassigned_at is null
    )
    or exists (
      select 1 from public.child_class_memberships m
      join public.child_ea_assignments a
        on a.child_id = m.child_id and a.unassigned_at is null
      where m.class_id = p_id
        and m.exited_at is null
        and a.user_id is distinct from p_actor
    )
    or exists (
      select 1 from public.groups g
      join public.group_ea_assignments a
        on a.group_id = g.id and a.unassigned_at is null
      join public.child_group_memberships m
        on m.group_id = g.id and m.removed_at is null
      where g.class_id = p_id
        and a.ea_user_id is distinct from p_actor
    );
  elsif p_table = 'groups' then
    if p_lock then
      perform 1 from public.groups g where g.id = p_id for update;
    end if;
    return exists (
      select 1 from public.group_ea_assignments a
      where a.group_id = p_id
        and a.ea_user_id is distinct from p_actor
        and a.unassigned_at is null
    );
  end if;
  -- Unknown entity: answer "someone else holds it", so no caller gets a global effect.
  return true;
end;
$$;

revoke execute on function private.other_active_holder(text, uuid, uuid, boolean)
  from public, anon;
grant execute on function private.other_active_holder(text, uuid, uuid, boolean)
  to authenticated;

-- One guard for every lifecycle table, configured through TG_ARGV:
--   TG_ARGV[0]  the end column (unassigned_at, ended_at, exited_at, removed_at, archived_at)
--   TG_ARGV[1]  the start column, or '' when the row has none (children, classes, groups)
--   TG_ARGV[2:] columns that belong to the end and are kept with it (handover_reason, ...)
-- Rules:
--   1. Any writer: an end never precedes its start (end := greatest(end, start)), so the
--      date CHECKs stay invariants that skew can no longer trip.
--   2. Only a direct EA write (current_user = 'authenticated'; SECURITY DEFINER functions run
--      as their owner and Head Office SQL as postgres or service_role, so they keep control):
--      a. An UPDATE of a row whose end is set keeps that end and its companions: no clear,
--         no move. Stale and redundant archives, restores, un-ends and merge-upsert replays
--         (ON CONFLICT DO UPDATE fires BEFORE UPDATE) become one-row no-ops.
--      b. A first end is bounded to [start, now()].
--      c. A first archived_at on children, classes or groups applies only when the caller
--         holds the entity now and nobody else does (private.other_active_holder, with the
--         lock protocol); a class also needs the caller to be its creator (D4). Otherwise
--         archived_at stays NULL, which means "leave". An archive that applies records
--         archived_by_user_id = the caller.
--      d. An UPDATE keeps OLD's start as well, so rule 1 can never move a kept end and an EA
--         cannot shrink an interval another EA's history authority relies on.
--   3. Always RETURN NEW. Never NULL, never RAISE.
create or replace function private.guard_lifecycle_row()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_end_col text := tg_argv[0];
  v_start_col text := nullif(tg_argv[1], '');
  v_keep text[] := coalesce(tg_argv[2:tg_nargs - 1], array[]::text[]);
  v_new jsonb := pg_catalog.to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then pg_catalog.to_jsonb(old) else null end;
  v_end timestamptz := (v_new ->> v_end_col)::timestamptz;
  v_old_end timestamptz := (v_old ->> v_end_col)::timestamptz;
  v_start timestamptz := case when v_start_col is null then null
    else (v_new ->> v_start_col)::timestamptz end;
  v_start_moved boolean := false;
  v_patch jsonb := '{}'::jsonb;
  v_actor uuid;
  v_applies boolean;
  v_column text;
begin
  if current_user = 'authenticated' then
    -- 2d. An EA cannot move a start either (review follow-up 1): moving it past a kept end would
    -- move that end through rule 1, and shrinking it would cut history authority another EA
    -- relies on. The three assignment tables already refuse a changed assigned_at (their
    -- identity trigger fires first); enrolments and memberships keep OLD's start here.
    if tg_op = 'UPDATE' and v_start_col is not null then
      v_start := (v_old ->> v_start_col)::timestamptz;
      v_start_moved := (v_new -> v_start_col) is distinct from (v_old -> v_start_col);
      if v_start_moved then
        v_patch := v_patch || pg_catalog.jsonb_build_object(v_start_col, v_old -> v_start_col);
      end if;
    end if;
    if v_old_end is not null then
      -- 2a. Written once: keep OLD's end and everything that belongs to it.
      v_end := v_old_end;
      v_patch := v_patch || pg_catalog.jsonb_build_object(v_end_col, v_old -> v_end_col);
      foreach v_column in array v_keep loop
        v_patch := v_patch || pg_catalog.jsonb_build_object(v_column, v_old -> v_column);
      end loop;
    elsif v_end is not null and tg_table_name in ('children', 'classes', 'groups') then
      -- 2c. A first archive is decided by the server, over its own data.
      v_actor := (select auth.uid());
      if tg_table_name = 'children' then
        v_applies := coalesce((select private.current_user_can_write_for_child(new.id)), false);
      elsif tg_table_name = 'classes' then
        v_applies := (v_old ->> 'created_by')::uuid is not distinct from v_actor
          and exists (
            select 1 from public.class_ea_assignments a
            where a.class_id = new.id and a.ea_user_id = v_actor and a.unassigned_at is null
          );
      else
        v_applies := exists (
          select 1 from public.group_ea_assignments a
          where a.group_id = new.id and a.ea_user_id = v_actor and a.unassigned_at is null
        );
      end if;
      if v_applies then
        v_applies := not private.other_active_holder(tg_table_name, new.id, v_actor, true);
      end if;
      if v_applies then
        v_end := least(v_end, pg_catalog.now());
        v_patch := v_patch || pg_catalog.jsonb_build_object(
          v_end_col, v_end, 'archived_by_user_id', v_actor);
      else
        -- Leave: the entity stays live for its other holders.
        v_end := null;
        v_patch := v_patch || pg_catalog.jsonb_build_object(v_end_col, null);
        foreach v_column in array v_keep loop
          v_patch := v_patch || pg_catalog.jsonb_build_object(
            v_column, case when v_old is null then null else v_old -> v_column end);
        end loop;
      end if;
    elsif v_end is not null then
      -- 2b. A first end is bounded to [start, now()] (the start bound is rule 1 below).
      v_end := least(v_end, pg_catalog.now());
      v_patch := v_patch || pg_catalog.jsonb_build_object(v_end_col, v_end);
    end if;
  end if;

  -- 1. Any writer: an end never precedes its start.
  if v_end is not null and v_start is not null and v_end < v_start then
    v_end := v_start;
    v_patch := v_patch || pg_catalog.jsonb_build_object(v_end_col, v_end);
  end if;

  if v_patch <> '{}'::jsonb then
    new := pg_catalog.jsonb_populate_record(new, v_patch);
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_lifecycle_row()
  from public, anon, authenticated;

-- "zz" keeps the guard after <table>_enforce_row_version, <table>_prevent_identity_change,
-- <table>_set_updated_at and the classes/groups triggers (BEFORE row triggers fire in name
-- order); the lifecycle-compat harness pins this order.
drop trigger if exists child_ea_assignments_zz_lifecycle_guard on public.child_ea_assignments;
create trigger child_ea_assignments_zz_lifecycle_guard
  before insert or update on public.child_ea_assignments
  for each row execute function private.guard_lifecycle_row('unassigned_at', 'assigned_at');

drop trigger if exists class_ea_assignments_zz_lifecycle_guard on public.class_ea_assignments;
create trigger class_ea_assignments_zz_lifecycle_guard
  before insert or update on public.class_ea_assignments
  for each row execute function private.guard_lifecycle_row('unassigned_at', 'assigned_at', 'handover_reason');

drop trigger if exists group_ea_assignments_zz_lifecycle_guard on public.group_ea_assignments;
create trigger group_ea_assignments_zz_lifecycle_guard
  before insert or update on public.group_ea_assignments
  for each row execute function private.guard_lifecycle_row('unassigned_at', 'assigned_at', 'handover_reason');

drop trigger if exists child_programme_enrollments_zz_lifecycle_guard on public.child_programme_enrollments;
create trigger child_programme_enrollments_zz_lifecycle_guard
  before insert or update on public.child_programme_enrollments
  for each row execute function private.guard_lifecycle_row('ended_at', 'enrolled_at');

drop trigger if exists child_class_memberships_zz_lifecycle_guard on public.child_class_memberships;
create trigger child_class_memberships_zz_lifecycle_guard
  before insert or update on public.child_class_memberships
  for each row execute function private.guard_lifecycle_row('exited_at', 'enrolled_at');

drop trigger if exists child_group_memberships_zz_lifecycle_guard on public.child_group_memberships;
create trigger child_group_memberships_zz_lifecycle_guard
  before insert or update on public.child_group_memberships
  for each row execute function private.guard_lifecycle_row('removed_at', 'joined_at');

drop trigger if exists children_zz_lifecycle_guard on public.children;
create trigger children_zz_lifecycle_guard
  before update on public.children
  for each row execute function private.guard_lifecycle_row('archived_at', '', 'archived_by_user_id', 'archive_reason');

drop trigger if exists classes_zz_lifecycle_guard on public.classes;
create trigger classes_zz_lifecycle_guard
  before update on public.classes
  for each row execute function private.guard_lifecycle_row('archived_at', '', 'archived_by_user_id', 'archive_reason');

drop trigger if exists groups_zz_lifecycle_guard on public.groups;
create trigger groups_zz_lifecycle_guard
  before update on public.groups
  for each row execute function private.guard_lifecycle_row('archived_at', '', 'archived_by_user_id', 'archive_reason');

RESET statement_timeout;
RESET lock_timeout;
