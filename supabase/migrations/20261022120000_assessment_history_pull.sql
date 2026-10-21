-- Assessment Results Plan 3: current-year class history and gated downloads.
-- 1. Session-level bounds also protect CLI execution outside a transaction.
SET lock_timeout = '10s';
SET statement_timeout = '60s';

-- 2. Ownership has no year bound. Class scope includes exited memberships in
-- the active year, across programmes, but never delivery/group/creator scope.
create or replace function private.can_read_assessment(
  p_user_id uuid, p_child_id uuid, p_assessment_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
    or exists (
      select 1
      from public.class_ea_assignments cea
      join public.child_class_memberships ccm on ccm.class_id = cea.class_id
      join public.academic_years ay on ay.id = ccm.academic_year_id
      where cea.ea_user_id = (select auth.uid())
        and cea.unassigned_at is null
        and ccm.child_id = p_child_id
        and ay.is_active
        and p_assessment_date between ay.starts_on and ay.ends_on
    );
$$;
revoke execute on function private.can_read_assessment(uuid,uuid,date) from public, anon;
grant execute on function private.can_read_assessment(uuid,uuid,date) to authenticated;

drop policy if exists assessments_select_assigned_child_history on public.assessments;
drop policy if exists assessments_select_owner_or_class_year on public.assessments;
create policy assessments_select_owner_or_class_year on public.assessments
  for select to authenticated
  using (private.can_read_assessment(user_id, child_id, assessment_date));

drop policy if exists assessment_items_select_visible_assessment on public.assessment_items;
drop policy if exists assessment_items_select_readable_assessment on public.assessment_items;
create policy assessment_items_select_readable_assessment on public.assessment_items
  for select to authenticated
  using (exists (
    select 1 from public.assessments a
    where a.id = assessment_items.assessment_id
      and private.can_read_assessment(a.user_id, a.child_id, a.assessment_date)
  ));

drop policy if exists battery_runs_select_assigned_child_history on public.battery_runs;
drop policy if exists battery_runs_select_owner_or_class_year on public.battery_runs;
create policy battery_runs_select_owner_or_class_year on public.battery_runs
  for select to authenticated
  using (private.can_read_assessment(
    user_id, child_id, (started_at at time zone 'Africa/Johannesburg')::date
  ));

-- Plan 2's letter_mastery_select_writer_or_deliverer stays unchanged.

-- 3. Only definer RPCs may consult this switch. A present user row, including
-- false, wins over everyone; missing both means off.
create table if not exists private.history_pull_rollout (
  feature text not null check (feature in ('assessments','battery_runs','letter_mastery')),
  user_id uuid references auth.users(id) on delete cascade,
  enabled boolean not null,
  note text,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_history_pull_rollout_feature_user
  on private.history_pull_rollout (
    feature, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
alter table private.history_pull_rollout enable row level security;
revoke all privileges on private.history_pull_rollout from public, anon, authenticated;

insert into private.history_pull_rollout (feature, enabled)
select seed.feature, true
from (values ('assessments'), ('battery_runs'), ('letter_mastery')) as seed(feature)
where not exists (
  select 1 from private.history_pull_rollout existing
  where existing.feature = seed.feature and existing.user_id is null
);

create or replace function private.history_pull_enabled(p_feature text, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select r.enabled from private.history_pull_rollout r
      where r.feature = p_feature and r.user_id = p_user_id),
    (select r.enabled from private.history_pull_rollout r
      where r.feature = p_feature and r.user_id is null),
    false
  );
$$;
revoke execute on function private.history_pull_enabled(text,uuid) from public, anon, authenticated;

-- 4. Positive-grant keysets and class/year membership lookups for the pagers.
create index if not exists idx_assessments_owner_programme_updated
  on public.assessments (user_id, programme_id, updated_at, id);
create index if not exists idx_assessments_child_programme_updated
  on public.assessments (child_id, programme_id, updated_at, id);
create index if not exists idx_battery_runs_owner_programme_updated
  on public.battery_runs (user_id, programme_id, updated_at, id);
create index if not exists idx_battery_runs_child_programme_updated
  on public.battery_runs (child_id, programme_id, updated_at, id);
create index if not exists idx_child_class_memberships_class_year_child
  on public.child_class_memberships (class_id, academic_year_id, child_id);
create index if not exists idx_letter_mastery_changed_by_updated
  on public.letter_mastery (changed_by, updated_at, id);
create index if not exists idx_letter_mastery_child_updated
  on public.letter_mastery (child_id, updated_at, id);

RESET statement_timeout;
RESET lock_timeout;
