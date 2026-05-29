-- Go-live schema forward-prep: additive session columns for a future session
-- state machine. No UX in this tranche writes them. Submit-and-go sessions get
-- state = 'completed' from the column default; group_id stays NULL.
--
-- Additive + forward-compatible: older field builds that never send these
-- columns keep syncing without error — the server fills the default for `state`
-- and leaves `group_id` NULL. The mobile client does NOT add these to its session
-- sync push payload yet (that lands with the state-machine slice, AFTER this
-- migration is applied to the backend), so applying this ahead of the client is safe.
--
-- The local SQLite mirror gains the same columns in migration v3
-- (sessions_forward_prep_columns).

alter table public.sessions
  add column if not exists group_id uuid references public.groups(id) on delete set null;

alter table public.sessions
  add column if not exists state text not null default 'completed'
  check (state in ('completed', 'in_progress', 'paused', 'discarded'));
