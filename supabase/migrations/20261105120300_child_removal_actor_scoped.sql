SET lock_timeout = '10s';
SET statement_timeout = '60s';

-- Lifecycle safety S3 (docs/superpowers/plans/2026-11-04-lifecycle-safety.md, ADR-0014 rules
-- 4, 5 and 7): Delete child is decided by the server, actor-scoped, and never hard-deletes.
-- MA-BUG-20261104-012 (Delete child after a handover kept coming back), part of -001, and the
-- server part of -014.
--
-- The public signature public.delete_child_if_no_history(uuid) -> boolean is unchanged (its SQL
-- wrapper from 20260521153217 is not touched). Every non-error path returns true, which the
-- 1.5.0 client acknowledges; the one refusal (42501 for a child the caller never held or
-- created) is today's. Existing ARCHIVE_REQUIRED terminal rows clear on the next forced pass.
-- There is no hard-delete branch (critique B1): a delete that ran before a queued lesson would
-- turn that lesson into a 23503/42501 refusal, and ordering would matter again.
--
-- This SECURITY DEFINER function runs as its owner, so the lifecycle guard's EA rules do not
-- apply to its writes (ADR-0014 rule 7): it encodes "ends are written once" and "leave unless
-- you are the last holder" itself, and the guard still keeps every end >= its start.
create or replace function private.delete_child_if_no_history(p_child_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_child public.children%rowtype;
begin
  -- Lock protocol (review finding 4): the child row first, then the classes and groups it has
  -- open memberships in (children -> classes -> groups, ids ascending). Every decision below
  -- reads state committed before these locks were granted.
  select c.* into v_child from public.children c where c.id = p_child_id for update;
  if not found then
    return true;
  end if;
  perform private.other_active_holder('children', p_child_id, v_actor, true);

  if not (select private.current_user_can_write_for_child(p_child_id))
    and v_child.created_by is distinct from v_actor
  then
    -- A former holder (a handover, a Head Office end) or an already-archived child: the
    -- removal has nothing left to do.
    if v_child.archived_at is not null or exists (
      select 1 from public.child_ea_assignments a
      where a.child_id = p_child_id and a.user_id = v_actor
    ) then
      return true;
    end if;
    raise exception 'Not authorized to delete child %', p_child_id
      using errcode = '42501';
  end if;

  -- The caller leaves: only their own grants end, never another EA's rows.
  update public.child_ea_assignments
  set unassigned_at = pg_catalog.now()
  where child_id = p_child_id and user_id = v_actor and unassigned_at is null;

  -- Memberships in groups the caller holds, and in groups the caller created that no other EA
  -- holds (review follow-up 4): the caller's group assignment INSERT may not have landed yet, and
  -- a membership in a created group is accepted through the creator arm. Upload order stays an
  -- optimisation.
  update public.child_group_memberships m
  set removed_at = pg_catalog.now()
  where m.child_id = p_child_id
    and m.removed_at is null
    and (
      exists (
        select 1 from public.group_ea_assignments g
        where g.group_id = m.group_id and g.ea_user_id = v_actor and g.unassigned_at is null
      )
      or (
        exists (
          select 1 from public.groups gr
          where gr.id = m.group_id and gr.created_by = v_actor
        )
        and not exists (
          select 1 from public.group_ea_assignments g
          where g.group_id = m.group_id and g.ea_user_id is distinct from v_actor
            and g.unassigned_at is null
        )
      )
    );
  -- When child_group_memberships.removal_reason exists (CONTEXT.md, ADR-0005), stamp it here.

  -- The last holder archives the child for everyone.
  if not private.other_active_holder('children', p_child_id, v_actor, false) then
    update public.child_programme_enrollments
    set ended_at = pg_catalog.now()
    where child_id = p_child_id and ended_at is null;

    update public.child_class_memberships
    set exited_at = pg_catalog.now()
    where child_id = p_child_id and exited_at is null;

    update public.children
    set archived_at = pg_catalog.now(),
        archived_by_user_id = v_actor,
        archive_reason = 'removed_by_ea'
    where id = p_child_id and archived_at is null;
  end if;

  return true;
end;
$$;

revoke all on function private.delete_child_if_no_history(uuid) from public, anon;
grant execute on function private.delete_child_if_no_history(uuid) to authenticated;

RESET statement_timeout;
RESET lock_timeout;
