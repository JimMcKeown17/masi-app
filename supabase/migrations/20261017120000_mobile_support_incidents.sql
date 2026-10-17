-- Minimal support-incident envelope (actor-lifecycle spec §7.4; Zazi iZandi's proven shape).
-- Phones report counts-only incidents through one SECURITY DEFINER RPC; only service_role
-- reads them. Session-level bounds: the Supabase CLI runs this outside a transaction block,
-- so SET LOCAL would be a no-op (25P01).
SET lock_timeout = '10s';
SET statement_timeout = '60s';

create table public.mobile_support_incidents (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'left_behind_unsent_work', 'foreign_owner_in_file', 'legacy_shared_file_unsent'
  )),
  repeat_key text not null check (pg_catalog.length(repeat_key) between 1 and 512),
  payload jsonb not null check (pg_catalog.jsonb_typeof(payload) = 'object'),
  received_at timestamptz not null default now(),
  -- Idempotency: the same reporter, kind and repeat key is recorded once.
  constraint mobile_support_incidents_once unique (reporter_id, kind, repeat_key)
);

alter table public.mobile_support_incidents enable row level security;
revoke all on table public.mobile_support_incidents
  from public, anon, authenticated, authenticator, service_role;
grant select on table public.mobile_support_incidents to service_role;

create or replace function public.report_mobile_support_incident(
  p_kind text,
  p_repeat_key text,
  p_payload jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_inserted integer;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_kind is null or p_kind not in (
    'left_behind_unsent_work', 'foreign_owner_in_file', 'legacy_shared_file_unsent'
  ) then
    raise exception 'Unknown incident kind' using errcode = '22023';
  end if;
  if p_repeat_key is null or pg_catalog.length(p_repeat_key) not between 1 and 512 then
    raise exception 'Repeat key must be 1-512 characters' using errcode = '22023';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Incident payload must be a JSON object' using errcode = '22023';
  end if;
  if pg_catalog.octet_length(p_payload::text) > 8192 then
    raise exception 'Incident payload exceeds 8192 bytes' using errcode = '22023';
  end if;

  insert into public.mobile_support_incidents (reporter_id, kind, repeat_key, payload)
  values (v_actor_id, p_kind, p_repeat_key, p_payload)
  on conflict on constraint mobile_support_incidents_once do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

revoke all on function public.report_mobile_support_incident(text, text, jsonb)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.report_mobile_support_incident(text, text, jsonb) to authenticated;

RESET statement_timeout;
RESET lock_timeout;
