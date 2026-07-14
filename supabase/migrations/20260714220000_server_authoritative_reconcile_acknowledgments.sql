-- One privileged, authenticated snapshot supplies absence semantics for mobile pull reconcile.
-- Ordinary RLS-scoped SELECTs still hydrate rows, but their empty results can no longer authorize
-- local relationship endings because PostgreSQL RLS may suppress rows without returning an error.

create index if not exists idx_class_ea_assignments_reconcile_snapshot
  on public.class_ea_assignments(ea_user_id, programme_id, class_id)
  where unassigned_at is null;

create index if not exists idx_group_ea_assignments_reconcile_snapshot
  on public.group_ea_assignments(ea_user_id, programme_id, group_id)
  where unassigned_at is null;

create index if not exists idx_child_group_memberships_active_group
  on public.child_group_memberships(group_id, id)
  where removed_at is null;

create or replace function private.get_reconcile_acknowledgments()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_active_programme_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required for reconcile acknowledgments'
      using errcode = '42501';
  end if;

  select spa.programme_id
  into v_active_programme_id
  from public.staff_programme_assignments spa
  where spa.user_id = v_user_id
    and spa.ended_at is null
  order by spa.assigned_at desc, spa.id desc
  limit 1;

  return (
    with child_assignments as (
      select cea.id, cea.child_id
      from public.child_ea_assignments cea
      where cea.user_id = v_user_id
        and cea.unassigned_at is null
    ),
    visible_children as (
      select distinct ca.child_id
      from child_assignments ca
      join public.child_programme_enrollments cpe
        on cpe.child_id = ca.child_id
       and cpe.programme_id = v_active_programme_id
       and cpe.ended_at is null
    ),
    programme_enrollments as (
      select cpe.id
      from public.child_programme_enrollments cpe
      join child_assignments ca on ca.child_id = cpe.child_id
      where cpe.programme_id = v_active_programme_id
        and cpe.ended_at is null
    ),
    class_memberships as (
      select ccm.id
      from public.child_class_memberships ccm
      join visible_children vc on vc.child_id = ccm.child_id
      where ccm.exited_at is null
    ),
    class_assignments as (
      select cea.id, cea.class_id
      from public.class_ea_assignments cea
      where cea.ea_user_id = v_user_id
        and cea.programme_id = v_active_programme_id
        and cea.unassigned_at is null
    ),
    group_assignments as (
      select gea.id, gea.group_id
      from public.group_ea_assignments gea
      join public.groups g on g.id = gea.group_id
      where gea.ea_user_id = v_user_id
        and gea.programme_id = v_active_programme_id
        and gea.unassigned_at is null
        and g.programme_id = v_active_programme_id
    ),
    group_memberships as (
      select cgm.id
      from public.child_group_memberships cgm
      join group_assignments ga on ga.group_id = cgm.group_id
      where cgm.removed_at is null
    )
    select jsonb_build_object(
      'schema_version', 1,
      'complete', true,
      'user_id', v_user_id,
      'generated_at', transaction_timestamp(),
      'active_programme_id', v_active_programme_id,
      'child_ea_assignment_ids', coalesce(
        (select jsonb_agg(ca.id order by ca.id) from child_assignments ca),
        '[]'::jsonb
      ),
      'assigned_child_ids', coalesce(
        (select jsonb_agg(ca.child_id order by ca.child_id) from child_assignments ca),
        '[]'::jsonb
      ),
      'visible_child_ids', coalesce(
        (select jsonb_agg(vc.child_id order by vc.child_id) from visible_children vc),
        '[]'::jsonb
      ),
      'child_programme_enrollment_ids', coalesce(
        (select jsonb_agg(pe.id order by pe.id) from programme_enrollments pe),
        '[]'::jsonb
      ),
      'child_class_membership_ids', coalesce(
        (select jsonb_agg(cm.id order by cm.id) from class_memberships cm),
        '[]'::jsonb
      ),
      'class_ea_assignment_ids', coalesce(
        (select jsonb_agg(ca.id order by ca.id) from class_assignments ca),
        '[]'::jsonb
      ),
      'class_ids', coalesce(
        (select jsonb_agg(ca.class_id order by ca.class_id) from class_assignments ca),
        '[]'::jsonb
      ),
      'group_ea_assignment_ids', coalesce(
        (select jsonb_agg(ga.id order by ga.id) from group_assignments ga),
        '[]'::jsonb
      ),
      'group_ids', coalesce(
        (select jsonb_agg(ga.group_id order by ga.group_id) from group_assignments ga),
        '[]'::jsonb
      ),
      'child_group_membership_ids', coalesce(
        (select jsonb_agg(gm.id order by gm.id) from group_memberships gm),
        '[]'::jsonb
      )
    )
  );
end;
$$;

create or replace function public.get_reconcile_acknowledgments()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_reconcile_acknowledgments();
$$;

revoke all on function private.get_reconcile_acknowledgments() from public, anon;
revoke all on function public.get_reconcile_acknowledgments() from public, anon;

grant usage on schema private to authenticated;
grant execute on function private.get_reconcile_acknowledgments() to authenticated;
grant execute on function public.get_reconcile_acknowledgments() to authenticated;
