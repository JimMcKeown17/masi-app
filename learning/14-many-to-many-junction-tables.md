# Many-to-Many Junction Tables: Staff-Children Implementation

## The Problem We Needed to Solve

**Original schema** (Phase 0-2):
```sql
CREATE TABLE children (
  id UUID PRIMARY KEY,
  assigned_staff_id UUID REFERENCES users(id),
  -- other fields...
);
```

This was a **one-to-many** relationship: one staff member → many children, but **each child could only have ONE coach**.

**Real-world problem discovered**:
- A child needs both a Literacy Coach AND a Numeracy Coach
- When a coach quits, their historical session records become orphaned
- Can't represent "this child worked with Coach A in January, then Coach B in February"

## The Solution: Junction Table

```sql
CREATE TABLE staff_children (
  id UUID PRIMARY KEY,
  staff_id UUID REFERENCES users(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(staff_id, child_id)  -- Can't assign same child twice to same staff
);
```

### Why This Works

**Before**: `children.assigned_staff_id = 'coach-uuid'` (single value)
**After**: Multiple rows in `staff_children` with different `staff_id` values for same `child_id`

```
staff_children table:
| staff_id (literacy) | child_id (alice) | assigned_at |
| staff_id (numeracy) | child_id (alice) | assigned_at |
```

Now Alice can work with both coaches simultaneously.

## Technical Implementation Details

### 1. Creating a Child Now Creates TWO Records

**In `ChildrenContext.addChild()`**:
```javascript
const addChild = async (childData) => {
  const childId = uuidv4();

  // Record 1: The child
  const child = {
    id: childId,
    ...childData,
    synced: false,
  };

  // Record 2: The assignment (junction entry)
  const assignment = {
    id: uuidv4(),
    staff_id: user.id,      // Current logged-in coach
    child_id: childId,
    synced: false,
  };

  // Save BOTH locally
  await storage.saveChild(child);
  await storage.saveStaffChild(assignment);  // NEW

  // Trigger sync for both tables
  await refreshSyncStatus();
};
```

**Why two records?**
- The `child` is the entity (exists independently)
- The `assignment` is the relationship (who's working with them)
- Separating these allows multiple assignments without duplicating child data

### 2. Querying Children Requires a JOIN

**Old query** (simple):
```javascript
const { data } = await supabase
  .from('children')
  .eq('assigned_staff_id', user.id);  // Direct filter
```

**New query** (via junction):
```javascript
const { data } = await supabase
  .from('children')
  .select(`
    *,
    staff_children!inner(staff_id)  // JOIN with junction table
  `)
  .eq('staff_children.staff_id', user.id);  // Filter on joined table
```

**What `!inner` means**:
- `!inner` = "only return children that have a matching staff_children row"
- Without it, you'd get ALL children (even those not assigned to this staff)
- The `!` syntax is Supabase's shorthand for inner join

**Why this is better**:
- Each coach only sees THEIR assigned children (RLS enforced)
- A child can appear in multiple coaches' lists (via different junction rows)
- Historical accuracy: if coach quits, child record remains intact

### 3. RLS Policies Changed from Direct to Junction

**Old policy**:
```sql
CREATE POLICY "Users can view assigned children" ON children
  FOR SELECT USING (assigned_staff_id = auth.uid());
```

**New policy**:
```sql
CREATE POLICY "Users can view assigned children" ON children
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM staff_children
      WHERE staff_children.child_id = children.id
      AND staff_children.staff_id = auth.uid()
    )
  );
```

**Why EXISTS subquery?**
- Checks if "there exists a junction row linking this child to the current user"
- More flexible than direct foreign key check
- Supports many-to-many relationships naturally

### 4. Offline Sync Handles Both Tables

**In `offlineSync.js`**:
```javascript
const SYNC_TABLES = {
  CHILDREN: {
    table: 'children',
    getRecords: () => storage.getUnsyncedChildren(),
  },
  STAFF_CHILDREN: {  // NEW
    table: 'staff_children',
    getRecords: () => storage.getUnsyncedStaffChildren(),
  },
};
```

**Critical sync order**:
1. **Children FIRST** (child must exist before assignment)
2. **Staff_children SECOND** (assignment references child)

If reversed, assignment would fail with "foreign key violation" because child doesn't exist yet.

## Migration Strategy: Zero Downtime

We couldn't just drop `assigned_staff_id` immediately (would break existing code). Instead:

```sql
-- Step 1: Create new table
CREATE TABLE staff_children (...);

-- Step 2: Migrate existing data
INSERT INTO staff_children (staff_id, child_id, assigned_at, synced)
SELECT assigned_staff_id, id, created_at, TRUE
FROM children
WHERE assigned_staff_id IS NOT NULL;

-- Step 3: Update RLS policies (queries now use junction)
DROP POLICY "Users can view assigned children" ON children;
CREATE POLICY "Users can view assigned children" ON children
  FOR SELECT USING (EXISTS (...));

-- Step 4: Keep assigned_staff_id column (for now)
-- ALTER TABLE children DROP COLUMN assigned_staff_id;  -- COMMENTED OUT
```

**Why keep the old column?**
- Backward compatibility during transition
- Easy rollback if issues discovered
- Can verify both methods work in parallel
- Will remove in future cleanup phase

## Performance Considerations

### Index Strategy

```sql
CREATE INDEX idx_staff_children_staff_id ON staff_children(staff_id);
CREATE INDEX idx_staff_children_child_id ON staff_children(child_id);
```

**Why two indexes?**
- `staff_id` index: "Show all children for this coach" (common query)
- `child_id` index: "Show all coaches for this child" (less common, but needed)

**Cost**: Each index adds ~10-20% write overhead, but makes reads 100x faster

### Query Performance

**Without indexes** (table scan):
```
Check all staff_children rows → filter by staff_id → return matches
Cost: O(n) where n = total assignments
```

**With indexes** (direct lookup):
```
Use staff_id index → jump directly to matching rows
Cost: O(log n) + O(matches)
```

For 1000 children with 3 coaches each = 3000 junction rows:
- **No index**: Scan all 3000 rows every query
- **With index**: Jump to ~1000 rows immediately

## When to Use Junction Tables

**Use junction table when**:
- Relationship is truly many-to-many
- Need to store metadata about the relationship (assigned_at, role, status)
- Need historical tracking of relationships
- Entities exist independently

**Don't use junction table when**:
- One-to-many is sufficient forever (e.g., invoice → line items)
- No relationship metadata needed
- One entity can't exist without the other (use embedding instead)

## Code Patterns to Remember

### Pattern 1: Create Entity + Relationship Together
```javascript
const entityId = uuidv4();
const entity = { id: entityId, ...data };
const relationship = { entity_id: entityId, related_id: user.id };

await storage.saveEntity(entity);
await storage.saveRelationship(relationship);
```

### Pattern 2: Query via Junction with Supabase
```javascript
.select('*, junction_table!inner(filter_field)')
.eq('junction_table.filter_field', value)
```

### Pattern 3: Unique Constraint on Junction
```sql
UNIQUE(entity_a_id, entity_b_id)  -- Prevent duplicate relationships
```

## Real-World Impact

**Before junction table**:
- Coach A assigned Child X
- Child X needs math help
- Coach B can't be assigned (already has Coach A)
- Workaround: Create duplicate child record (bad!)

**After junction table**:
- Coach A assigned Child X (literacy)
- Coach B assigned Child X (numeracy)
- Both see Child X in their list
- Sessions show which coach worked with them
- Child data stays consistent (one record)

This is why many-to-many relationships are critical for real-world flexibility.
