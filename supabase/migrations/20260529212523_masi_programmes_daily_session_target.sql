-- Go-live UX tranche: per-programme daily session targets for the Sessions Today ring.
-- Additive + nullable, forward-compatible with older field builds (they simply never
-- read these columns). NULL target means "no daily goal" (1000 Stories, zazi_izandi).
-- The app reads these values via reference-data sync; the local SQLite mirror gains the
-- same columns in migration v2 (programmes_daily_session_target) and the reference-sync
-- allowlist carries them.

alter table public.programmes add column if not exists daily_session_target integer;
alter table public.programmes add column if not exists daily_session_ceiling integer;

-- Seed per-programme values for the programmes that exist today.
--   numeracy  : target 5
--   yeboneer  : target 1 (the after-school block; during-day work is attendance-only)
--   literacy  : target 3 / ceiling 5 — the Core Literacy (Grade R-3) values, used as the
--               INTERIM for the single `literacy` row. NOTE: the DB does not yet split
--               literacy into core_literacy_r3 (3/5) and core_literacy_ecd (5). Until that
--               split lands (separate data PRD), ECD EAs see the R-3 target. The ring is
--               data-driven (reads the row), so it becomes correct automatically once the
--               split seeds distinct rows.
--   one_thousand_stories, zazi_izandi : no daily target — left NULL.

update public.programmes set daily_session_target = 5, daily_session_ceiling = 5 where code = 'numeracy';
update public.programmes set daily_session_target = 1, daily_session_ceiling = 1 where code = 'yeboneer';
update public.programmes set daily_session_target = 3, daily_session_ceiling = 5 where code = 'literacy';
