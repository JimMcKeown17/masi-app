-- Migration 06: Add schools and classes tables, restructure children
-- Schools are admin-managed (read-only for field workers).
-- Classes are offline-first CRUD by workers. Children belong to a class.

-- ============================================================
-- 1. Schools table (admin-managed, read-only for workers)
-- ============================================================
CREATE TABLE schools (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read schools
CREATE POLICY "Authenticated users can view schools"
  ON schools FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies for workers — admin-only via dashboard/service role

-- ============================================================
-- 2. Classes table (offline-first CRUD by workers)
-- ============================================================
CREATE TABLE classes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,                    -- e.g. "1A", "2B"
  grade TEXT NOT NULL,                   -- e.g. "Grade R", "Grade 1"
  teacher TEXT NOT NULL,
  home_language TEXT NOT NULL,
  school_id UUID REFERENCES schools(id) ON DELETE RESTRICT NOT NULL,
  staff_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, name, school_id)
);

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- Dual SELECT policy for upsert visibility (same pattern as children fix in migration 05)
CREATE POLICY "Users can view own classes"
  ON classes FOR SELECT
  TO authenticated
  USING (staff_id = auth.uid());

CREATE POLICY "Users can view own created classes"
  ON classes FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can insert own classes"
  ON classes FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update own classes"
  ON classes FOR UPDATE
  TO authenticated
  USING (staff_id = auth.uid());

CREATE POLICY "Users can delete own classes"
  ON classes FOR DELETE
  TO authenticated
  USING (staff_id = auth.uid());

-- Auto-set created_by on insert
CREATE OR REPLACE FUNCTION set_class_created_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_by := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER classes_set_created_by
  BEFORE INSERT ON classes
  FOR EACH ROW
  EXECUTE FUNCTION set_class_created_by();

-- Auto-update updated_at on update
CREATE OR REPLACE FUNCTION update_class_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER classes_update_timestamp
  BEFORE UPDATE ON classes
  FOR EACH ROW
  EXECUTE FUNCTION update_class_timestamp();

-- ============================================================
-- 3. Alter children table
-- ============================================================
ALTER TABLE children ADD COLUMN class_id UUID REFERENCES classes(id) ON DELETE SET NULL;
ALTER TABLE children ADD COLUMN gender TEXT;
ALTER TABLE children DROP COLUMN IF EXISTS teacher;
ALTER TABLE children DROP COLUMN IF EXISTS class;
ALTER TABLE children DROP COLUMN IF EXISTS school;

CREATE INDEX idx_children_class_id ON children(class_id);
