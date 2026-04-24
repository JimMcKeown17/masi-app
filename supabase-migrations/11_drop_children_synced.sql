-- Reconcile `supabase-migrations/` with production: drop `children.synced`.
--
-- Background: `00_initial_schema.sql` defines children with a `synced BOOLEAN
-- DEFAULT FALSE` column, but the production Masi Supabase has no such column
-- (confirmed 2026-04-24 via mcp__supabase__list_tables). The drop is not
-- recorded in any migration file — it was presumably applied manually via
-- Studio at some point.
--
-- Dropping the column in migration form brings migration history in line with
-- production so that a fresh deploy (new CI env, the upcoming ZZ fork) doesn't
-- accidentally reintroduce it. The feature loss is zero: the mobile app's
-- offlineSync.js:122 strips `synced` from every upsert payload before sending,
-- so the cloud column was never a useful sync-state indicator for children.
-- Local sync state still lives in AsyncStorage (markAsSynced in utils/storage.js).
--
-- IF EXISTS makes the migration idempotent — safe to run on any current state.
-- Running it again on prod is a no-op.

ALTER TABLE children
  DROP COLUMN IF EXISTS synced;
