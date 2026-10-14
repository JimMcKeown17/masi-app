-- Organisation label v1 (Jim, 2026-10-14; design from Zazi iZandi's
-- 20260922175324_organization_label_v1.sql). Identity only: no RLS policy,
-- trigger, or app behaviour reads it. The phone ignores the column.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (pg_catalog.btrim(name) <> ''),
  created_at timestamptz not null default now()
);

-- Masinyusane uses the same fixed id as in Zazi iZandi, so one organisation
-- has one id across the portfolio. Partners are added by migration.
insert into public.organizations (id, slug, name)
values ('a111879f-d066-47c9-95a1-bed2a400319a', 'masinyusane', 'Masinyusane');

-- RLS on with no policies: no API role reads through RLS. service_role gets
-- SELECT only, so provisioning can resolve a slug. A disposable database has
-- no default ACLs, so the harness asserts these grants explicitly.
alter table public.organizations enable row level security;
revoke all on table public.organizations
  from public, anon, authenticated, authenticator, service_role;
grant select on table public.organizations to service_role;

-- Every existing user is Masinyusane staff (Jim, 2026-10-14). A constant
-- default is stored once in the catalog: existing rows read it without a
-- rewrite and without firing the users updated_at trigger. Dropping the
-- default then leaves future inserts with none, so a writer that omits the
-- organisation fails with 23502 instead of filing a partner under Masinyusane.
alter table public.users
  add column organization_id uuid
    default 'a111879f-d066-47c9-95a1-bed2a400319a'
    references public.organizations (id) on delete restrict;

alter table public.users
  alter column organization_id drop default,
  alter column organization_id set not null;

create index idx_users_organization_id on public.users (organization_id);

comment on column public.users.organization_id is
  'Employing organisation. Written once at account creation; never changed.';
