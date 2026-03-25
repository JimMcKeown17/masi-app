-- Migration 07: Restore dropped columns on children for backwards compatibility.
--
-- Context: Migration 06 dropped `class`, `teacher`, and `school` columns and
-- replaced them with `class_id UUID` (referencing the new classes table). However,
-- app v1.0.0 (iOS build 2, commit 5d782ec, deployed March 7) still saves children
-- records with these three TEXT fields. When these records sync, Supabase rejects
-- them with PGRST204 ("Could not find the 'X' column in the schema cache"),
-- which cascades into FK failures on staff_children and children_groups.
--
-- Fix: Re-add all three as nullable TEXT columns so old app versions can sync.
-- The new app version (classes feature) uses `class_id` and does not send these
-- fields, so both versions coexist safely.
--
-- These columns can be dropped once all users have updated past v1.0.0.

ALTER TABLE children ADD COLUMN IF NOT EXISTS class TEXT;
ALTER TABLE children ADD COLUMN IF NOT EXISTS teacher TEXT;
ALTER TABLE children ADD COLUMN IF NOT EXISTS school TEXT;
