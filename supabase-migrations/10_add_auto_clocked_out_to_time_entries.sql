-- Add auto_clocked_out flag to time_entries
--
-- Background: src/hooks/useTimeTracking.js:51-70 auto-closes a coach's active
-- time entry after MAX_SHIFT_HOURS (10h) have elapsed since sign_in_time, to
-- guard against a coach forgetting to clock out. The resulting record is
-- indistinguishable from a real 10-hour shift unless we capture a flag saying
-- "this close was automatic".
--
-- The client was writing auto_clocked_out: true on auto-close records but the
-- column was never created in Supabase, so every auto-clocked-out record
-- failed sync with PGRST204 ("column not found in schema cache"). This
-- migration completes the feature by adding the column.
--
-- Backwards-compatibility: additive change only. Older app versions that do
-- NOT write this field continue to work (the DEFAULT FALSE value is applied
-- on insert). Already-deployed versions that DO write the field will succeed
-- on their next sync retry. See CLAUDE.md "Adding nullable columns" is the
-- Safe category of schema change.
--
-- IF NOT EXISTS makes the migration idempotent in case the column was added
-- manually via Supabase Studio prior to this migration.

ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS auto_clocked_out BOOLEAN DEFAULT FALSE;
