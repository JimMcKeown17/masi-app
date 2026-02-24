-- Migration 04: Drop stale assigned_staff_id column from children
--
-- The assigned_staff_id column was replaced by the staff_children junction
-- table (migration 02) to support many-to-many staff-child assignments.
-- The column was made nullable but never dropped. The app no longer reads
-- or writes this column, so remove it to avoid confusion.

ALTER TABLE children DROP CONSTRAINT IF EXISTS children_assigned_staff_id_fkey;
ALTER TABLE children DROP COLUMN IF EXISTS assigned_staff_id;
