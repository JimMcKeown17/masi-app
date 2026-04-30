-- Migration 12: Soft-delete column for children
--
-- Field testers reported "deleted" children reappearing after sync. Root cause:
-- ChildrenContext.deleteChild only removed the row from local AsyncStorage; the
-- server still had it, so the next loadChildren merge resurrected it.
--
-- We model "delete" as a universal hide so that:
--   - hidden children are filtered out of every staff member's list
--     (use cases: accidental duplicate, child left the school)
--   - the row stays recoverable via UPDATE children SET hidden_at = NULL
--   - sessions/assessments/letter_mastery FKs are not broken
--
-- IF NOT EXISTS makes this idempotent and additive — old app builds in the
-- field continue working because the column is nullable with no default.

ALTER TABLE children
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN children.hidden_at IS
  'Universal soft-delete marker. Non-NULL means hidden from every staff member''s list. Set NULL to restore.';
