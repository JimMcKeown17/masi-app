# Children & Groups Management: Technical Implementation

## Architecture Overview

Phase 3 implements a complete offline-first CRUD system for managing children and groups with many-to-many relationships. Key components:

```
ChildrenContext (state + operations)
    ↓
storage.js (AsyncStorage wrapper)
    ↓
offlineSync.js (background sync)
    ↓
Supabase (server of truth)
```

## Core Design Pattern: Cache-First Loading

### The Problem
Users might be offline for days. We need:
1. **Instant UI** - Show data immediately on screen open
2. **Fresh data** - Fetch from server if online
3. **No flickering** - Don't show empty state then suddenly populate

### The Solution
```javascript
const loadChildren = async () => {
  setLoading(true);

  // 1. Load from cache FIRST (instant)
  const cached = await storage.getChildren();
  setChildren(cached);  // UI updates immediately

  // 2. Then fetch from server if online
  if (isOnline && user?.id) {
    const { data } = await supabase
      .from('children')
      .select(`*, staff_children!inner(staff_id)`)
      .eq('staff_children.staff_id', user.id);

    if (data) {
      await storage.setItem(STORAGE_KEYS.CHILDREN, data);
      setChildren(data);  // UI updates again with fresh data
    }
  }

  setLoading(false);
};
```

**Why this pattern?**
- User sees cached data in <50ms (feels instant)
- Server data arrives in 200-500ms (replaces cache if different)
- If offline, cached data is still useful
- No loading spinner if cache exists

**Tradeoff**: Potential "flicker" if cached data differs from server. Acceptable because:
- Offline sync keeps cache mostly in sync
- Flicker is better than long loading spinners
- Pull-to-refresh available for manual sync

## Optimistic UI Updates

### The Problem
If we wait for server confirmation, UX feels slow:
```
User adds child → Wait 500ms → Server responds → Update UI
```

### The Solution: Optimistic Updates
```javascript
const addChild = async (childData) => {
  const child = { id: uuidv4(), ...childData, synced: false };

  // 1. Save locally FIRST
  await storage.saveChild(child);

  // 2. Update UI immediately (optimistic)
  setChildren([...children, child]);

  // 3. Trigger background sync (async)
  await refreshSyncStatus();  // Non-blocking

  return { success: true, child };
};
```

**User perception**:
- Tap "Add Child" → Child appears in list instantly
- Behind the scenes: Sync happens in background
- If sync fails: Item shows "unsynced" indicator
- Retry happens automatically with exponential backoff

**Why `synced: false`?**
- Marks records that need server sync
- Sync service filters: `storage.getUnsyncedChildren()`
- After successful upsert: `storage.markAsSynced(id)`

## Group Management: Two Junction Tables

We have TWO many-to-many relationships:

### 1. Staff ↔ Children (via `staff_children`)
```javascript
// When adding child, create assignment
const assignment = {
  staff_id: user.id,
  child_id: childId,
  synced: false,
};
await storage.saveStaffChild(assignment);
```

### 2. Children ↔ Groups (via `children_groups`)
```javascript
// When adding child to group, create membership
const membership = {
  child_id: childId,
  group_id: groupId,
  synced: false,
};
await storage.saveChildrenGroup(membership);
```

**Why separate tables?**
- Different lifecycles (staff assignment vs group membership)
- Different permissions (who can modify)
- Different metadata needs (assigned_at vs joined_at)

## Helper Methods: Deriving State from Junction Data

### Getting Children in a Group
```javascript
const getChildrenInGroup = (groupId) => {
  // 1. Find all memberships for this group
  const membershipIds = childrenGroups
    .filter(cg => cg.group_id === groupId)
    .map(cg => cg.child_id);

  // 2. Return full child objects
  return childrenList.filter(c => membershipIds.includes(c.id));
};
```

**Why not store children array in group?**
```javascript
// ❌ Bad: Denormalized
const group = {
  id: 'group-1',
  children: [child1, child2, child3],  // Duplicates child data
};

// ✅ Good: Normalized with junction table
const group = { id: 'group-1', name: 'Group 2' };
const memberships = [
  { child_id: 'child-1', group_id: 'group-1' },
  { child_id: 'child-2', group_id: 'group-1' },
];
```

Benefits of normalized approach:
- Child data exists once (single source of truth)
- Update child name once (reflects everywhere)
- Add child to multiple groups without duplication
- Easy to query "all groups for a child" or "all children in group"

### Getting Groups for a Child
```javascript
const getGroupsForChild = (childId) => {
  const groupIds = childrenGroups
    .filter(cg => cg.child_id === childId)
    .map(cg => cg.group_id);

  return groups.filter(g => groupIds.includes(g.id));
};
```

Used in EditChildScreen to show which groups a child belongs to.

## Sync Strategy: Order Matters

### Critical Sync Order
```javascript
const syncAll = async () => {
  // ORDER MATTERS!
  await syncTable('CHILDREN');        // 1. Must sync children first
  await syncTable('STAFF_CHILDREN');  // 2. Then assignments (references children)
  await syncTable('GROUPS');          // 3. Then groups
  await syncTable('CHILDREN_GROUPS'); // 4. Finally memberships (references both)
};
```

**Why this order?**
- Foreign key constraints require parent records to exist first
- If you try to insert staff_children before children: `foreign key violation`
- Syncing in wrong order causes cascading failures

**How we enforce this**:
- `SYNC_TABLES` object defines order (JavaScript objects maintain insertion order)
- `for...of` loop processes sequentially (not in parallel)

## Storage Layer: Junction Table Methods

### Pattern: Arrays of Objects in AsyncStorage

```javascript
// Get all assignments
async getStaffChildren() {
  return await this.getItem(STORAGE_KEYS.STAFF_CHILDREN) || [];
}

// Add assignment
async saveStaffChild(assignment) {
  const assignments = await this.getStaffChildren();
  assignments.push(assignment);  // Append to array
  await this.setItem(STORAGE_KEYS.STAFF_CHILDREN, assignments);
}

// Remove assignment
async deleteStaffChild(staffId, childId) {
  const assignments = await this.getStaffChildren();
  const filtered = assignments.filter(
    a => !(a.staff_id === staffId && a.child_id === childId)
  );
  await this.setItem(STORAGE_KEYS.STAFF_CHILDREN, filtered);
}

// Get unsynced for sync service
async getUnsyncedStaffChildren() {
  const assignments = await this.getStaffChildren();
  return assignments.filter(a => a.synced === false);
}
```

**Why arrays?**
- AsyncStorage only stores strings (must serialize/deserialize)
- Arrays are natural structure for "collections of things"
- Easy to filter, map, find
- JSON.stringify/parse handles serialization

**Tradeoff**: Performance degrades with large arrays
- Reading 10 items: ~1ms
- Reading 1000 items: ~10ms
- Reading 10,000 items: ~100ms

For this app: <1000 children per coach → acceptable

## Screen-Level Patterns

### Search with Controlled Component
```javascript
const [searchTerm, setSearchTerm] = useState('');

// Derive filtered list (no separate state)
const filteredChildren = children.filter(child =>
  `${child.first_name} ${child.last_name}`
    .toLowerCase()
    .includes(searchTerm.toLowerCase())
);

return (
  <Searchbar
    value={searchTerm}
    onChangeText={setSearchTerm}  // Updates on every keystroke
  />
  <FlatList data={filteredChildren} />
);
```

**Why not debounce search?**
- Array filtering is fast (<10ms for 1000 items)
- Immediate feedback feels more responsive
- No need for complex debounce logic

### Pull-to-Refresh Pattern
```javascript
const [refreshing, setRefreshing] = useState(false);

const onRefresh = async () => {
  setRefreshing(true);
  await loadChildren();       // Fetch from server
  await refreshSyncStatus();  // Update sync counts
  setRefreshing(false);
};

<FlatList
  refreshControl={
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
  }
/>
```

**Why manual refresh?**
- Auto-sync happens in background
- Some users want manual control
- Provides visual feedback during sync
- Standard mobile pattern (users expect it)

### Multi-Select with Local State
```javascript
const [selectedChildren, setSelectedChildren] = useState([]);

const handleToggle = (childId) => {
  if (selectedChildren.includes(childId)) {
    setSelectedChildren(prev => prev.filter(id => id !== childId));
  } else {
    setSelectedChildren(prev => [...prev, childId]);
  }
};

const handleAddToGroup = async () => {
  for (const childId of selectedChildren) {
    await addChildToGroup(childId, groupId);
  }
  navigation.goBack();
};
```

**Why not checkbox state per item?**
- Single array state is simpler
- Easy to count: `selectedChildren.length`
- Easy to clear: `setSelectedChildren([])`
- Natural iteration for bulk operations

## Sync Status Indicators

### Display Unsynced Count
```javascript
const unsyncedCount = children.filter(c => c.synced === false).length;

{unsyncedCount > 0 && (
  <Banner
    visible={true}
    icon="cloud-upload-outline"
    actions={[{ label: 'Sync Now', onPress: refreshSyncStatus }]}
  >
    {unsyncedCount} {unsyncedCount === 1 ? 'child' : 'children'} waiting to sync
  </Banner>
)}
```

**Why calculate on render?**
- Array filter is fast (O(n) where n is small)
- Always accurate (no stale state)
- Simpler than maintaining separate count state

### Show Icon Per Item
```javascript
<List.Item
  title={`${child.first_name} ${child.last_name}`}
  right={props =>
    !child.synced && (
      <List.Icon {...props} icon="cloud-upload-outline" />
    )
  }
/>
```

Visual indicator shows exactly which items need sync.

## Navigation Flow

```
ChildrenListScreen (tab)
  ├→ AddChild (stack)
  ├→ EditChild (stack)
  │   └→ GroupManagement (stack)
  └→ GroupManagement (stack)
      └→ AddChildToGroup (stack)
```

**Why nested stacks?**
- Each screen is a modal "task" user completes
- Back button works intuitively
- Can navigate between related screens
- Header shows breadcrumb trail

## Delete Operations: Cascade Considerations

### Deleting a Child
```javascript
const deleteChild = async (childId) => {
  await storage.deleteChild(childId);
  setChildren(children.filter(c => c.id !== childId));
};
```

**What happens to relationships?**
- `staff_children` rows: `ON DELETE CASCADE` removes them
- `children_groups` rows: `ON DELETE CASCADE` removes them
- Sessions with `children_ids`: Array still contains ID (historical record preserved)

### Deleting a Group
```javascript
const deleteGroup = async (groupId) => {
  await storage.deleteGroup(groupId);
  setGroups(groups.filter(g => g.id !== groupId));

  // Remove all memberships for this group
  const updated = childrenGroups.filter(cg => cg.group_id !== groupId);
  setChildrenGroups(updated);
};
```

**Why manual membership cleanup?**
- Database CASCADE handles server-side
- Local storage needs manual sync
- Ensures UI updates immediately
- Prevents orphaned junction rows in cache

## Validation Strategy

### Client-Side Validation (Immediate Feedback)
```javascript
const validate = () => {
  const errors = {};

  if (!firstName.trim()) {
    errors.firstName = 'First name is required';
  }

  if (age && (isNaN(age) || age < 1 || age > 20)) {
    errors.age = 'Age must be between 1 and 20';
  }

  return Object.keys(errors).length === 0;
};
```

**Why client-side first?**
- Instant feedback (no network round-trip)
- Works offline
- Better UX than server errors

### Server-Side Validation (Truth)
```sql
ALTER TABLE children ADD CONSTRAINT check_age CHECK (age > 0 AND age < 100);
```

**Why both?**
- Client can be bypassed (malicious users, bugs)
- Server is single source of truth
- Defense in depth

## Key Takeaways

1. **Cache-first loading** = instant UI + fresh data when available
2. **Optimistic updates** = UI responds immediately, sync happens async
3. **Junction tables** = enable flexible many-to-many relationships
4. **Sync order matters** = parent records before foreign keys
5. **Normalized state** = single source of truth, derive display state
6. **Controlled components** = React state drives UI (not DOM state)
7. **Pull-to-refresh** = manual sync control for users
8. **Local state for forms** = capture input, submit in one shot

These patterns repeat throughout the app and are fundamental to building offline-first React Native applications.
