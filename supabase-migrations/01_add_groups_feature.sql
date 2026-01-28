-- ============================================================
-- Masi App - Schema Migration: Add Groups Feature
-- ============================================================
-- This migration adds group functionality to allow staff to:
-- 1. Create named groups of children (e.g., "Group 2")
-- 2. Assign multiple children to groups
-- 3. Select entire groups when recording sessions
-- 4. Track which groups were used in sessions
--
-- Run this in Supabase SQL Editor to add groups to your database
-- ============================================================

-- Create groups table
CREATE TABLE IF NOT EXISTS groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  staff_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  synced BOOLEAN DEFAULT FALSE,

  -- Ensure group names are unique per staff member
  UNIQUE(staff_id, name)
);

-- Create junction table for many-to-many relationship between children and groups
CREATE TABLE IF NOT EXISTS children_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id UUID REFERENCES children(id) ON DELETE CASCADE NOT NULL,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Prevent duplicate assignments
  UNIQUE(child_id, group_id)
);

-- Add group_ids column to sessions table to track which groups were used
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS group_ids UUID[];

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_groups_staff_id ON groups(staff_id);
CREATE INDEX IF NOT EXISTS idx_children_groups_child_id ON children_groups(child_id);
CREATE INDEX IF NOT EXISTS idx_children_groups_group_id ON children_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_sessions_group_ids ON sessions USING GIN(group_ids);

-- Enable Row Level Security on new tables
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE children_groups ENABLE ROW LEVEL SECURITY;

-- RLS Policies for groups table
CREATE POLICY "Users can view own groups" ON groups
  FOR SELECT USING (staff_id = auth.uid());

CREATE POLICY "Users can insert own groups" ON groups
  FOR INSERT WITH CHECK (staff_id = auth.uid());

CREATE POLICY "Users can update own groups" ON groups
  FOR UPDATE USING (staff_id = auth.uid());

CREATE POLICY "Users can delete own groups" ON groups
  FOR DELETE USING (staff_id = auth.uid());

-- RLS Policies for children_groups table
-- Staff can only manage group assignments for their own groups
CREATE POLICY "Users can view own group assignments" ON children_groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = children_groups.group_id
      AND groups.staff_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own group assignments" ON children_groups
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = children_groups.group_id
      AND groups.staff_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own group assignments" ON children_groups
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = children_groups.group_id
      AND groups.staff_id = auth.uid()
    )
  );

-- Create helper function to get all children in a group
CREATE OR REPLACE FUNCTION get_children_in_group(group_uuid UUID)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  teacher TEXT,
  class TEXT,
  age INTEGER,
  school TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.first_name, c.last_name, c.teacher, c.class, c.age, c.school
  FROM children c
  INNER JOIN children_groups cg ON c.id = cg.child_id
  WHERE cg.group_id = group_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to update updated_at timestamp on groups
CREATE OR REPLACE FUNCTION update_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER groups_updated_at_trigger
  BEFORE UPDATE ON groups
  FOR EACH ROW
  EXECUTE FUNCTION update_groups_updated_at();

-- ============================================================
-- Migration Complete!
-- ============================================================
-- You can now:
-- 1. Create groups for staff members
-- 2. Assign children to multiple groups
-- 3. Select groups when recording sessions
-- 4. Track historical group usage in sessions
--
-- Next steps in the app:
-- - Create GroupsContext for state management
-- - Build GroupForm component
-- - Add group selection to session forms
-- - Implement group sync in offline queue
-- ============================================================
