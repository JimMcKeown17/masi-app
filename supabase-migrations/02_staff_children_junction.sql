-- Phase 3.0: Staff-Children Many-to-Many Relationship Migration
-- This migration changes child assignment from one-to-one (assigned_staff_id)
-- to many-to-many (staff_children junction table)
-- This allows one child to have multiple coaches (e.g., literacy + numeracy)

-- Step 1: Create staff_children junction table
CREATE TABLE IF NOT EXISTS staff_children (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID REFERENCES users(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(staff_id, child_id)  -- Can't assign same child twice to same staff
);

-- Step 2: Migrate existing assignments from assigned_staff_id to junction table
-- Only migrate if assigned_staff_id exists and is not null
INSERT INTO staff_children (staff_id, child_id, assigned_at, synced)
SELECT assigned_staff_id, id, created_at, TRUE
FROM children
WHERE assigned_staff_id IS NOT NULL;

-- Step 3: Update RLS policies for children table
DROP POLICY IF EXISTS "Users can view assigned children" ON children;
CREATE POLICY "Users can view assigned children" ON children
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM staff_children
      WHERE staff_children.child_id = children.id
      AND staff_children.staff_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert assigned children" ON children;
CREATE POLICY "Users can insert children" ON children
  FOR INSERT WITH CHECK (TRUE);  -- Can create any child (assignment happens via staff_children)

DROP POLICY IF EXISTS "Users can update assigned children" ON children;
CREATE POLICY "Users can update assigned children" ON children
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM staff_children
      WHERE staff_children.child_id = children.id
      AND staff_children.staff_id = auth.uid()
    )
  );

-- Step 4: Add RLS policies for staff_children table
ALTER TABLE staff_children ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own assignments" ON staff_children
  FOR SELECT USING (staff_id = auth.uid());

CREATE POLICY "Users can create assignments" ON staff_children
  FOR INSERT WITH CHECK (staff_id = auth.uid());

CREATE POLICY "Users can delete own assignments" ON staff_children
  FOR DELETE USING (staff_id = auth.uid());

-- Step 5: Remove assigned_staff_id column (AFTER migration complete and tested)
-- KEEP COMMENTED UNTIL PHASE 3 FULLY IMPLEMENTED AND TESTED
-- ALTER TABLE children DROP COLUMN assigned_staff_id;

-- Add index for junction table query performance
CREATE INDEX IF NOT EXISTS idx_staff_children_staff_id ON staff_children(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_children_child_id ON staff_children(child_id);
