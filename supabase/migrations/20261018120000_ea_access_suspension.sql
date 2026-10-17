-- Auth bans enforce EA suspension; profile inactivity is an operational label.
-- Session-level bounds also work when the CLI applies this without BEGIN/COMMIT.
SET lock_timeout = '10s';
SET statement_timeout = '60s';

create schema if not exists private;

create table if not exists private.ea_access_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action in ('suspend', 'restore')),
  reason text not null check (char_length(reason) between 1 and 1000),
  operator text not null check (char_length(operator) between 1 and 200),
  banned_until_before timestamptz,
  banned_until_after timestamptz,
  was_active_before boolean,
  is_active_after boolean,
  created_at timestamptz not null default now()
);

create index if not exists ea_access_events_user_created_idx
  on private.ea_access_events (user_id, created_at desc);

alter table private.ea_access_events enable row level security;
revoke all on table private.ea_access_events
  from public, anon, authenticated, authenticator, service_role;

create or replace function private.suspend_ea(p_user_id uuid, p_reason text, p_operator text)
returns private.ea_access_events
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_banned_before timestamptz;
  v_banned_after timestamptz := now() + interval '876000 hours';
  v_active_before boolean;
  v_latest private.ea_access_events%rowtype;
  v_event private.ea_access_events%rowtype;
begin
  if p_reason is null or char_length(p_reason) not between 1 and 1000 or btrim(p_reason) = '' then
    raise exception 'Reason must contain 1-1000 characters' using errcode = '22023';
  end if;
  if p_operator is null or char_length(p_operator) not between 1 and 200 or btrim(p_operator) = '' then
    raise exception 'Operator must contain 1-200 characters' using errcode = '22023';
  end if;

  -- All access changes acquire Auth, then profile, so concurrent calls serialize.
  select banned_until into v_banned_before from auth.users where id = p_user_id for update;
  if not found then
    raise exception 'ea_not_found' using errcode = 'PE001', hint = 'The target UUID must exist in auth.users.';
  end if;
  select is_active into v_active_before from public.users where id = p_user_id for update;
  if not found then
    raise exception 'ea_profile_not_found' using errcode = 'PE002', hint = 'The Auth user must have a public.users EA profile.';
  end if;
  select * into v_latest from private.ea_access_events
    where user_id = p_user_id order by created_at desc, id desc limit 1;

  update auth.users set banned_until = v_banned_after where id = p_user_id;
  update public.users set is_active = false where id = p_user_id and is_active = true;
  insert into private.ea_access_events (
    user_id, action, reason, operator, banned_until_before, banned_until_after,
    was_active_before, is_active_after, created_at
  ) values (
    p_user_id, 'suspend', p_reason, p_operator, v_banned_before, v_banned_after,
    v_active_before, false,
    -- now() is transaction-start time, which can precede an earlier lock holder.
    greatest(clock_timestamp(), v_latest.created_at + interval '1 microsecond')
  ) returning * into v_event;
  return v_event;
end;
$$;

create or replace function private.restore_ea(p_user_id uuid, p_reason text, p_operator text)
returns private.ea_access_events
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_banned_before timestamptz;
  v_active_before boolean;
  v_active_after boolean;
  v_reactivate boolean;
  v_latest private.ea_access_events%rowtype;
  v_event private.ea_access_events%rowtype;
begin
  if p_reason is null or char_length(p_reason) not between 1 and 1000 or btrim(p_reason) = '' then
    raise exception 'Reason must contain 1-1000 characters' using errcode = '22023';
  end if;
  if p_operator is null or char_length(p_operator) not between 1 and 200 or btrim(p_operator) = '' then
    raise exception 'Operator must contain 1-200 characters' using errcode = '22023';
  end if;

  select banned_until into v_banned_before from auth.users where id = p_user_id for update;
  if not found then
    raise exception 'ea_not_found' using errcode = 'PE001', hint = 'The target UUID must exist in auth.users.';
  end if;
  select is_active into v_active_before from public.users where id = p_user_id for update;
  if not found then
    raise exception 'ea_profile_not_found' using errcode = 'PE002', hint = 'The Auth user must have a public.users EA profile.';
  end if;
  select * into v_latest from private.ea_access_events
    where user_id = p_user_id order by created_at desc, id desc limit 1;
  if not found or v_latest.action <> 'suspend' then
    raise exception 'restore_not_available' using errcode = 'PE003',
      hint = 'Only an un-restored suspension recorded by these functions may be restored.';
  end if;

  -- Repeated suspends record real before/after state without losing the run's baseline.
  select e.was_active_before into v_reactivate from private.ea_access_events e
    where e.user_id = p_user_id and e.action = 'suspend'
      and e.created_at > coalesce((
        select max(r.created_at) from private.ea_access_events r
        where r.user_id = p_user_id and r.action = 'restore'
      ), '-infinity'::timestamptz)
    order by e.created_at, e.id limit 1;

  update auth.users set banned_until = null where id = p_user_id;
  if v_reactivate = true then
    update public.users set is_active = true where id = p_user_id and is_active = false;
  end if;
  select is_active into v_active_after from public.users where id = p_user_id;
  insert into private.ea_access_events (
    user_id, action, reason, operator, banned_until_before, banned_until_after,
    was_active_before, is_active_after, created_at
  ) values (
    p_user_id, 'restore', p_reason, p_operator, v_banned_before, null,
    v_active_before, v_active_after,
    greatest(clock_timestamp(), v_latest.created_at + interval '1 microsecond')
  ) returning * into v_event;
  return v_event;
end;
$$;

create or replace function private.ea_access_status(p_user_id uuid)
returns table (email text, banned_until timestamptz, is_active boolean, latest_event jsonb, restore_is_active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select a.email::text, a.banned_until, p.is_active,
    case when latest.id is not null then to_jsonb(latest) end,
    case when latest.action = 'suspend' then p.is_active or first_suspend.was_active_before else null end
  from auth.users a
  left join public.users p on p.id = a.id
  left join lateral (
    select e.* from private.ea_access_events e where e.user_id = a.id
    order by e.created_at desc, e.id desc limit 1
  ) latest on true
  left join lateral (
    select e.was_active_before from private.ea_access_events e
    where e.user_id = a.id and e.action = 'suspend'
      and e.created_at > coalesce((
        select max(r.created_at) from private.ea_access_events r
        where r.user_id = a.id and r.action = 'restore'
      ), '-infinity'::timestamptz)
    order by e.created_at, e.id limit 1
  ) first_suspend on true
  where a.id = p_user_id;
$$;

revoke all on function private.suspend_ea(uuid, text, text), private.restore_ea(uuid, text, text),
  private.ea_access_status(uuid) from public, anon, authenticated, authenticator, service_role;
grant usage on schema private to service_role;
grant execute on function private.suspend_ea(uuid, text, text), private.restore_ea(uuid, text, text),
  private.ea_access_status(uuid) to service_role;

RESET statement_timeout;
RESET lock_timeout;
