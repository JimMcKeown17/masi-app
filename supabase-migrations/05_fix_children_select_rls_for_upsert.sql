-- Migration 05: Add SELECT policy for children created_by
--
-- Problem: The sync uses upsert (INSERT ... ON CONFLICT DO UPDATE) to sync
-- children records. PostgreSQL requires SELECT visibility through RLS to
-- perform the conflict check on the unique index, even when no conflict
-- exists (i.e., the record is brand new).
--
-- The existing SELECT policy only allows viewing children via the
-- staff_children junction table. But when a new child is created locally,
-- the staff_children assignment hasn't been synced yet — so the SELECT
-- policy blocks visibility and the upsert fails with error 42501.
--
-- Fix: Add a second permissive SELECT policy that allows users to view
-- children they created (via created_by = auth.uid()). Permissive policies
-- are OR'd together, so this gives the upsert the SELECT access it needs
-- without weakening security. Once staff_children syncs, the existing
-- junction-based policy also grants access.

CREATE POLICY "Users can view own created children" ON children
  FOR SELECT USING (created_by = auth.uid());
