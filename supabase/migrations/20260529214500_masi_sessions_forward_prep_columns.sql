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

-- Forward-prep write guard. The columns above are CHECK/FK-constrained but the
-- existing permissive session policies (sessions_insert_active_programme,
-- sessions_update_own) only validate user_id / active programme — they do NOT
-- gate the new columns. Until the state-machine slice ships real per-state and
-- per-group authorization, pin these columns to their defaults at the RLS
-- boundary so a direct/raw client cannot set a non-default state or an
-- unauthorized group on its own session.
--
-- RESTRICTIVE policies are ANDed with the permissive policies, so this tightens
-- without replacing them. Submit-and-go inserts omit these columns, so the
-- server fills state='completed' / group_id=NULL and the WITH CHECK passes;
-- ordinary updates that don't touch these columns preserve those values.
--
-- The state-machine slice MUST drop both guard policies and add the real
-- group/state authorization in the same migration that wires the client writes.
drop policy if exists sessions_forward_prep_pin_defaults_insert on public.sessions;
create policy sessions_forward_prep_pin_defaults_insert on public.sessions
  as restrictive
  for insert to authenticated
  with check (state = 'completed' and group_id is null);

drop policy if exists sessions_forward_prep_pin_defaults_update on public.sessions;
create policy sessions_forward_prep_pin_defaults_update on public.sessions
  as restrictive
  for update to authenticated
  using (true)
  with check (state = 'completed' and group_id is null);
