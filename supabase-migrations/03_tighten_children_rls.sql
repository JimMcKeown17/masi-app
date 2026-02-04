-- Migration 03: Tighten children INSERT RLS policy
--
-- Problem: the existing INSERT policy uses WITH CHECK (TRUE), meaning any
-- authenticated user can insert a row into children.  We want to restrict
-- inserts so that only the user who created the row can do so.
--
-- Approach: a BEFORE INSERT trigger auto-sets created_by = auth.uid().  The
-- policy then checks created_by = auth.uid().  This works with offline sync
-- because:
--   INSERT path  → trigger fires, overwrites created_by with the real uid.
--   UPDATE path  → trigger does NOT fire (BEFORE INSERT only), and the
--                  upsert payload does not include created_by, so the
--                  existing value persists.

-- 1. Add column
ALTER TABLE children ADD COLUMN IF NOT EXISTS created_by UUID;

-- 2. Backfill from staff_children for existing rows
UPDATE children SET created_by = sc.staff_id
FROM staff_children sc
WHERE sc.child_id = children.id;

-- 3. Trigger: auto-set created_by on every INSERT
CREATE OR REPLACE FUNCTION set_children_created_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS children_set_created_by ON children;
CREATE TRIGGER children_set_created_by
  BEFORE INSERT ON children
  FOR EACH ROW
  EXECUTE FUNCTION set_children_created_by();

-- 4. Replace the lenient INSERT policy
DROP POLICY IF EXISTS "Users can insert children" ON children;
CREATE POLICY "Users can insert children" ON children
  FOR INSERT WITH CHECK (created_by = auth.uid());
