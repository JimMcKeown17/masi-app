-- Index nullable session relationships without indexing the dominant NULL case.
-- These support FK maintenance now and the group-first session queries later.
-- updated_at indexes deliberately wait for the delta-pull predicates so their
-- column order and scope match real queries instead of adding speculative write cost.

create index if not exists idx_sessions_class_id
  on public.sessions(class_id)
  where class_id is not null;

create index if not exists idx_sessions_group_id
  on public.sessions(group_id)
  where group_id is not null;

create index if not exists idx_session_attendees_group_id
  on public.session_attendees(group_id)
  where group_id is not null;
