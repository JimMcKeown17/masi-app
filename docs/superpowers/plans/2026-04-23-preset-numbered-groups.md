# Preset Numbered Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text group creation flow with preset numbered groups ("Group 1" … "Group N") to eliminate naming inconsistency reported by field testers, while preserving existing legacy group names unchanged.

**Architecture:** Client-side-only change. No schema, sync, or context changes. Two small pure helpers (`nextGroupNumber`, `compareGroups`) are added to `GroupPickerBottomSheet.js` and exported for use by `ClassDetailScreen.js`. The picker UI is refactored: rename removed, free-text input removed, virtual placeholder rows shown when the user has zero groups, single-tap "+ Add Group N" button for subsequent creation.

**Tech Stack:** React Native (Expo), JavaScript, Jest + `@testing-library/react-native`, React Native Paper.

**Spec:** `docs/superpowers/specs/2026-04-23-preset-numbered-groups-design.md`

---

## File Map

| Path | Action | Responsibility |
|------|--------|---------------|
| `src/components/children/GroupPickerBottomSheet.js` | Modify | Add helpers + export; remove rename and free-text create; add virtual rows and "+ Add Group N" button |
| `src/screens/children/ClassDetailScreen.js` | Modify | Use imported `compareGroups` in place of `localeCompare` (line 45) |
| `src/screens/children/EditChildScreen.js` | Modify | Use imported `compareGroups` in place of `localeCompare` (line 54) — same pattern as ClassDetailScreen; missing this file produces inconsistent color assignment between screens |
| `__tests__/groupHelpers.test.js` | Create | Unit tests for `nextGroupNumber` and `compareGroups` |
| `__tests__/GroupPickerBottomSheet.test.js` | Create | Minimal render test guarding the zero-group-virtuals and existing-groups-button branches |

No new production source files are created. Helpers co-locate with the picker (matching the existing pattern where `getGroupColor` is exported from the same file and consumed by `ClassDetailScreen.js:13` and `EditChildScreen.js:19`).

---

## Task 1: Write failing unit tests for helpers

**Files:**
- Create: `__tests__/groupHelpers.test.js`

- [ ] **Step 1.1: Create the test file with all assertions for the two pure helpers**

Create `__tests__/groupHelpers.test.js`:

```javascript
import {
  nextGroupNumber,
  compareGroups,
} from '../src/components/children/GroupPickerBottomSheet';

describe('nextGroupNumber', () => {
  test('returns 1 for empty array', () => {
    expect(nextGroupNumber([])).toBe(1);
  });

  test('returns max + 1 for numbered-only groups', () => {
    expect(
      nextGroupNumber([{ name: 'Group 1' }, { name: 'Group 2' }])
    ).toBe(3);
  });

  test('is monotonic — skips gaps from deletions', () => {
    // Groups 1 and 3 exist (2 was deleted). Next should be 4, not 2.
    expect(
      nextGroupNumber([{ name: 'Group 1' }, { name: 'Group 3' }])
    ).toBe(4);
  });

  test('ignores legacy free-text names', () => {
    expect(
      nextGroupNumber([
        { name: 'Group 1' },
        { name: 'Group 2' },
        { name: 'Lions' },
      ])
    ).toBe(3);
  });

  test('returns 1 when only legacy names exist', () => {
    expect(
      nextGroupNumber([{ name: 'Lions' }, { name: 'Tigers' }])
    ).toBe(1);
  });

  test('handles double-digit numbers correctly', () => {
    expect(
      nextGroupNumber([
        { name: 'Group 9' },
        { name: 'Group 10' },
        { name: 'Group 2' },
      ])
    ).toBe(11);
  });
});

describe('compareGroups', () => {
  const sortNames = (groups) =>
    [...groups].sort(compareGroups).map((g) => g.name);

  test('sorts numbered groups numerically (not lexicographically)', () => {
    expect(
      sortNames([
        { name: 'Group 2' },
        { name: 'Group 10' },
        { name: 'Group 1' },
      ])
    ).toEqual(['Group 1', 'Group 2', 'Group 10']);
  });

  test('places numbered groups before legacy names', () => {
    expect(
      sortNames([
        { name: 'Lions' },
        { name: 'Group 1' },
        { name: 'Tigers' },
        { name: 'Group 2' },
      ])
    ).toEqual(['Group 1', 'Group 2', 'Lions', 'Tigers']);
  });

  test('sorts legacy names alphabetically when no numbered present', () => {
    expect(
      sortNames([{ name: 'Tigers' }, { name: 'Lions' }])
    ).toEqual(['Lions', 'Tigers']);
  });
});
```

- [ ] **Step 1.2: Run the test file to confirm it fails**

Run: `npx jest __tests__/groupHelpers.test.js`

Expected: Test suite fails to even load because `nextGroupNumber` and `compareGroups` are not exported from `GroupPickerBottomSheet.js`. Error will resemble: `TypeError: (0 , _GroupPickerBottomSheet.nextGroupNumber) is not a function` or `undefined is not an object` on the import.

- [ ] **Step 1.3: Commit the failing test**

```bash
git add __tests__/groupHelpers.test.js
git commit -m "test: failing unit tests for nextGroupNumber and compareGroups helpers"
```

> **Note on CI:** this repo currently has no CI workflow (verified: no `.github/workflows/` directory, no `*.yml` at the repo root). If CI is added in the future and gates every pushed commit green, squash Tasks 1 and 2 into a single commit (`feat: add helpers with unit tests`) before pushing — TDD discipline is preserved as long as the test was written first within the branch, not as long as each commit is individually red.

---

## Task 2: Implement the helper functions

**Files:**
- Modify: `src/components/children/GroupPickerBottomSheet.js`

- [ ] **Step 2.1: Add the helpers and export them, just below the existing `getGroupColor` export**

In `src/components/children/GroupPickerBottomSheet.js`, locate the `getGroupColor` function at line 42 (just after the `GROUP_COLORS` array that ends at line 37). The existing code is:

```javascript
/**
 * Get color for a group based on its index in the sorted groups array
 */
export function getGroupColor(groupIndex) {
  return GROUP_COLORS[groupIndex % GROUP_COLORS.length];
}
```

Immediately after this function (before the `/** Bottom sheet for selecting… */` JSDoc block), add:

```javascript
/**
 * Regex matching the preset "Group N" format (where N is a positive integer).
 * Used for numeric sorting and next-number computation.
 */
const NUMBERED_GROUP = /^Group (\d+)$/;

/**
 * Compute the next group number for the "+ Add Group N" button.
 * Returns max(existing numbered) + 1, or 1 if no numbered groups exist.
 * Monotonic — does not fill gaps from deleted groups.
 * Ignores legacy free-text names.
 */
export function nextGroupNumber(groups) {
  const nums = groups
    .map((g) => g.name.match(NUMBERED_GROUP))
    .filter(Boolean)
    .map((m) => parseInt(m[1], 10));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

/**
 * Comparator for sorting groups:
 *   1. Numbered groups ("Group N") first, sorted numerically.
 *   2. Legacy free-text names after, sorted alphabetically.
 * Solves the "Group 10 before Group 2" lexicographic gotcha.
 */
export function compareGroups(a, b) {
  const ma = a.name.match(NUMBERED_GROUP);
  const mb = b.name.match(NUMBERED_GROUP);
  if (ma && mb) return parseInt(ma[1], 10) - parseInt(mb[1], 10);
  if (ma) return -1;
  if (mb) return 1;
  return a.name.localeCompare(b.name);
}
```

- [ ] **Step 2.2: Run the unit tests and confirm they pass**

Run: `npx jest __tests__/groupHelpers.test.js`

Expected: All 9 tests pass. Output ends with:
```
Tests:       9 passed, 9 total
```

- [ ] **Step 2.3: Run the full test suite to confirm nothing else broke**

Run: `npx jest`

Expected: All existing tests still pass. No new failures.

- [ ] **Step 2.4: Commit**

```bash
git add src/components/children/GroupPickerBottomSheet.js
git commit -m "feat: add nextGroupNumber and compareGroups helpers

Pure helpers for the preset numbered groups feature. Exported
so ClassDetailScreen can reuse the comparator. Monotonic
numbering ignores legacy free-text names."
```

---

## Task 3: Swap `localeCompare` sort for `compareGroups` in all three call sites

**Files:**
- Modify: `src/components/children/GroupPickerBottomSheet.js:83-85` (inside the component body)
- Modify: `src/screens/children/ClassDetailScreen.js:13` (import) and `src/screens/children/ClassDetailScreen.js:45` (usage)
- Modify: `src/screens/children/EditChildScreen.js:19` (import) and `src/screens/children/EditChildScreen.js:54` (usage)

**Why three files:** both `ClassDetailScreen` and `EditChildScreen` sort groups identically and feed the resulting index into `getGroupColor`. If only one is updated, a user would see different group colors for the same child between the class-detail card view and the edit-child form. Codex flagged this during pre-execution review — the miss was ours, not the spec's.

- [ ] **Step 3.1: Update the picker's internal sort**

In `src/components/children/GroupPickerBottomSheet.js`, find the existing line in the component body (around line 83):

```javascript
  const sortedGroups = [...groups].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
```

Replace with:

```javascript
  const sortedGroups = [...groups].sort(compareGroups);
```

(The `compareGroups` reference resolves to the function defined at module scope — no import needed inside the same file.)

- [ ] **Step 3.2: Update ClassDetailScreen — import and sort**

In `src/screens/children/ClassDetailScreen.js`, update the existing import on line 13. The current line is:

```javascript
import GroupPickerBottomSheet, { getGroupColor } from '../../components/children/GroupPickerBottomSheet';
```

Change it to:

```javascript
import GroupPickerBottomSheet, { getGroupColor, compareGroups } from '../../components/children/GroupPickerBottomSheet';
```

Then find the existing line 45 inside `getChildGroup`:

```javascript
    const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name));
```

Replace with:

```javascript
    const sortedGroups = [...groups].sort(compareGroups);
```

- [ ] **Step 3.3: Update EditChildScreen — import and sort**

In `src/screens/children/EditChildScreen.js`, verify the current import on line 19. Expected existing line:

```javascript
import GroupPickerBottomSheet, { getGroupColor } from '../../components/children/GroupPickerBottomSheet';
```

Change it to:

```javascript
import GroupPickerBottomSheet, { getGroupColor, compareGroups } from '../../components/children/GroupPickerBottomSheet';
```

Then find the existing line 54:

```javascript
    const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name));
```

Replace with:

```javascript
    const sortedGroups = [...groups].sort(compareGroups);
```

Quick sanity check:

Run: `grep -n "localeCompare" src/screens/children/*.js src/components/children/*.js`

Expected: no output. If any matches remain, re-read the file and locate them — the edit above was incomplete.

- [ ] **Step 3.4: Run full test suite**

Run: `npx jest`

Expected: All tests pass, including the new helper tests.

- [ ] **Step 3.5: Commit**

```bash
git add src/components/children/GroupPickerBottomSheet.js src/screens/children/ClassDetailScreen.js src/screens/children/EditChildScreen.js
git commit -m "feat: use compareGroups for numeric-aware sort in all group-consuming screens

Replaces localeCompare in the picker, ClassDetailScreen, and
EditChildScreen. All three sort the same list for the same
color-index purpose; leaving any one on localeCompare would
produce inconsistent colors between screens. Numbered groups
now sort numerically (Group 2 before Group 10) and appear
before legacy names."
```

---

## Task 4: Remove rename functionality from the picker

**Files:**
- Modify: `src/components/children/GroupPickerBottomSheet.js`

- [ ] **Step 4.1: Remove the rename-related state declarations**

In `src/components/children/GroupPickerBottomSheet.js`, find these two state declarations inside the component body (around lines 79-80):

```javascript
  const [renamingGroupId, setRenamingGroupId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
```

Delete both lines.

- [ ] **Step 4.2: Remove rename cleanup from `resetState`**

Find the `resetState` function (around lines 87-93). Current code:

```javascript
  const resetState = () => {
    setCreating(false);
    setNewGroupName('');
    setRenamingGroupId(null);
    setRenameValue('');
    setLoading(false);
  };
```

Replace with:

```javascript
  const resetState = () => {
    setCreating(false);
    setNewGroupName('');
    setLoading(false);
  };
```

(We'll remove `creating`/`newGroupName` too in Task 5; keep them for now to minimize churn within a single commit.)

- [ ] **Step 4.3: Remove the `handleRenameGroup` function**

Find and delete the entire function (around lines 189-209):

```javascript
  const handleRenameGroup = async (groupId) => {
    const trimmed = renameValue.trim();
    if (!trimmed) return;

    // Check for duplicate name (excluding current group)
    if (groups.some(g => g.id !== groupId && g.name.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert('Duplicate Name', 'A group with this name already exists.');
      return;
    }

    setLoading(true);
    try {
      await updateGroup(groupId, { name: trimmed });
      setRenamingGroupId(null);
      setRenameValue('');
    } catch (error) {
      console.error('Error renaming group:', error);
    } finally {
      setLoading(false);
    }
  };
```

Also remove `updateGroup` from the `useChildren()` destructure at the top of the component. Find the existing destructure (around lines 67-75):

```javascript
  const {
    groups,
    addGroup,
    updateGroup,
    deleteGroup,
    addChildToGroup,
    removeChildFromGroup,
    getChildrenInGroup,
  } = useChildren();
```

Change to:

```javascript
  const {
    groups,
    addGroup,
    deleteGroup,
    addChildToGroup,
    removeChildFromGroup,
    getChildrenInGroup,
  } = useChildren();
```

- [ ] **Step 4.4: Remove the rename UI (inline rename row) from the group list render**

Inside the `sortedGroups.map(...)` block (around lines 256-290), find the conditional rename row:

```javascript
                // Rename mode for this group
                if (renamingGroupId === group.id) {
                  return (
                    <View key={group.id} style={styles.renameRow}>
                      <TextInput
                        value={renameValue}
                        onChangeText={setRenameValue}
                        mode="outlined"
                        dense
                        autoFocus
                        style={styles.renameInput}
                        placeholder="Group name"
                      />
                      <IconButton
                        icon="check"
                        size={20}
                        onPress={() => handleRenameGroup(group.id)}
                        disabled={loading || !renameValue.trim()}
                      />
                      <IconButton
                        icon="close"
                        size={20}
                        onPress={() => {
                          setRenamingGroupId(null);
                          setRenameValue('');
                        }}
                      />
                    </View>
                  );
                }
```

Delete this entire block (from the `// Rename mode for this group` comment through the closing `}`).

- [ ] **Step 4.5: Remove the pencil `IconButton` from each group row**

Inside the same `sortedGroups.map(...)` block, find the group row's action icons (around lines 316-337):

```javascript
                    <View style={styles.groupActions}>
                      {isSelected && (
                        <Text style={[styles.checkmark, { color: colorScheme.text }]}>✓</Text>
                      )}
                      <IconButton
                        icon="pencil-outline"
                        size={18}
                        iconColor={colors.textSecondary}
                        onPress={() => {
                          setRenamingGroupId(group.id);
                          setRenameValue(group.name);
                        }}
                        style={styles.actionIcon}
                      />
                      <IconButton
                        icon="delete-outline"
                        size={18}
                        iconColor={colors.error}
                        onPress={() => handleDeleteGroup(group)}
                        style={styles.actionIcon}
                      />
                    </View>
```

Replace with:

```javascript
                    <View style={styles.groupActions}>
                      {isSelected && (
                        <Text style={[styles.checkmark, { color: colorScheme.text }]}>✓</Text>
                      )}
                      <IconButton
                        icon="delete-outline"
                        size={18}
                        iconColor={colors.error}
                        onPress={() => handleDeleteGroup(group)}
                        style={styles.actionIcon}
                      />
                    </View>
```

- [ ] **Step 4.6: Remove unused styles**

In the `StyleSheet.create({...})` block at the bottom of the file, find and delete these two style keys (around lines 484-492):

```javascript
  renameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  renameInput: {
    flex: 1,
    backgroundColor: colors.surface,
  },
```

- [ ] **Step 4.7: Run the full test suite**

Run: `npx jest`

Expected: All tests pass. (No tests currently exercise the rename UI, so removals shouldn't break anything.)

- [ ] **Step 4.8: Commit**

```bash
git add src/components/children/GroupPickerBottomSheet.js
git commit -m "feat: remove rename from group picker

The format 'Group N' can only be enforced if free-text entry is
impossible. Removes the pencil icon, inline rename input, related
state and handlers, and unused styles. Delete remains unchanged."
```

---

## Task 5: Remove the free-text "+ Create New Group" flow

**Files:**
- Modify: `src/components/children/GroupPickerBottomSheet.js`

- [ ] **Step 5.1: Remove the creating state**

Find the two state declarations (around lines 77-78 after Task 4's edits):

```javascript
  const [creating, setCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
```

Delete both lines.

- [ ] **Step 5.2: Simplify `resetState`**

Find the `resetState` function. After Task 4 edits it reads:

```javascript
  const resetState = () => {
    setCreating(false);
    setNewGroupName('');
    setLoading(false);
  };
```

Replace with:

```javascript
  const resetState = () => {
    setLoading(false);
  };
```

- [ ] **Step 5.3: Remove the `handleCreateGroup` function**

Find and delete the entire function (around lines 154-187 in the original, shifted by earlier edits):

```javascript
  const handleCreateGroup = async () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;

    // Check for duplicate name
    if (groups.some(g => g.name.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert('Duplicate Name', 'A group with this name already exists.');
      return;
    }

    setLoading(true);
    try {
      const result = await addGroup({ name: trimmed });
      if (!result.success) {
        Alert.alert('Error', 'Failed to create group.');
        return;
      }
      // Auto-assign the new group to this child
      if (currentGroupId) {
        await removeChildFromGroup(childId, currentGroupId);
      }
      const assignResult = await addChildToGroup(childId, result.group.id);
      if (!assignResult.success) {
        Alert.alert('Error', 'Group created but failed to assign child.');
        return;
      }
      onGroupChanged?.();
      handleDismiss();
    } catch (error) {
      console.error('Error creating group:', error);
    } finally {
      setLoading(false);
    }
  };
```

- [ ] **Step 5.4: Remove the "+ Create New Group" JSX block**

Inside the `ScrollView` at the bottom of the render, find the create-group block (around lines 357-394):

```javascript
              {/* Create new group */}
              {creating ? (
                <View style={styles.createInputRow}>
                  <TextInput
                    value={newGroupName}
                    onChangeText={setNewGroupName}
                    mode="outlined"
                    dense
                    autoFocus
                    placeholder="New group name"
                    style={styles.createInput}
                  />
                  <Button
                    mode="contained"
                    compact
                    onPress={handleCreateGroup}
                    disabled={loading || !newGroupName.trim()}
                    style={styles.createBtn}
                  >
                    Create
                  </Button>
                  <IconButton
                    icon="close"
                    size={20}
                    onPress={() => {
                      setCreating(false);
                      setNewGroupName('');
                    }}
                  />
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.createRow}
                  onPress={() => setCreating(true)}
                >
                  <Text style={styles.createText}>+  Create New Group</Text>
                </TouchableOpacity>
              )}
```

Delete the entire block including the `{/* Create new group */}` comment. Leave the `<Divider style={styles.divider} />` directly above it — Task 7 will replace the deleted block with the "+ Add Group N" button.

- [ ] **Step 5.5: Remove the now-unused `createInputRow`, `createInput`, `createBtn` styles**

In the `StyleSheet.create({...})` block, find and delete these three style keys (around lines 521-532):

```javascript
  createInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  createInput: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  createBtn: {
    marginLeft: spacing.sm,
  },
```

Keep `createRow` and `createText` — we'll reuse them in Task 7 for the "+ Add Group N" button.

- [ ] **Step 5.6: Remove now-unused imports**

Verify that `Button`, `TextInput`, and `Alert` are still used elsewhere in the file after these edits.

Run: `grep -nE '\b(Button|TextInput|Alert)\b' src/components/children/GroupPickerBottomSheet.js`

Expected: `Alert` is still used in `handleSelectGroup` (two calls), `handleRemoveFromGroup` (one call), and `handleDeleteGroup` (one call). `TextInput` and `Button` should no longer appear.

If `TextInput` and `Button` are gone, remove them from the imports at the top of the file. The current react-native-paper import (around lines 13-19) is:

```javascript
import {
  Text,
  TextInput,
  Button,
  IconButton,
  Divider,
} from 'react-native-paper';
```

Change to:

```javascript
import {
  Text,
  IconButton,
  Divider,
} from 'react-native-paper';
```

- [ ] **Step 5.7: Run tests to confirm nothing else broke**

Run: `npx jest`

Expected: All tests pass. At this point the picker has no creation affordance — that's intentional. Tasks 6 and 7 add virtuals and the "+ Add Group N" button.

- [ ] **Step 5.8: Commit**

```bash
git add src/components/children/GroupPickerBottomSheet.js
git commit -m "refactor: remove free-text create-group flow from picker

WIP: picker has no way to create groups at this commit. Virtual
rows (Task 6) and the '+ Add Group N' button (Task 7) replace it."
```

---

## Task 6: Add virtual preset rows for users with zero groups

**Files:**
- Modify: `src/components/children/GroupPickerBottomSheet.js`

- [ ] **Step 6.1: Add the constant for preset count**

Near the top of the file, just after the `GROUP_COLORS` array (which ends at line 37), add:

```javascript
/**
 * Number of virtual preset rows to show when the user has zero groups.
 * Each tap creates the corresponding real group and assigns the current child.
 */
const PRESET_VIRTUAL_COUNT = 4;
```

- [ ] **Step 6.2: Add the `handleSelectVirtual` handler**

Inside the component body, immediately after `handleRemoveFromGroup` (around line 152), add:

```javascript
  /**
   * Tap handler for a virtual preset row AND the "+ Add Group N" button.
   * Creates the group as a real record, then assigns the current child to it.
   * One-group-per-user rule is preserved by removing from the existing group first,
   * with a success check to prevent orphaned multi-group state if the remove fails
   * (e.g., local storage error while offline).
   */
  const handleSelectVirtual = async (n) => {
    const name = `Group ${n}`;

    // Case-insensitive + whitespace-normalised duplicate guard.
    // Matches the existing handleSelectGroup / handleCreateGroup behavior
    // and prevents near-miss collisions such as a legacy "group 1" (lowercase)
    // coexisting with a new "Group 1". Only plausible on the "+ Add Group N"
    // path when a conforming-but-case-mismatched legacy group exists; virtuals
    // only render when groups.length === 0 so no collisions are possible there.
    const normalized = name.trim().toLowerCase();
    if (groups.some((g) => g.name.trim().toLowerCase() === normalized)) {
      Alert.alert('Duplicate Name', `${name} already exists (or a case variant does).`);
      return;
    }

    setLoading(true);
    try {
      const createResult = await addGroup({ name });
      if (!createResult.success) {
        Alert.alert('Error', 'Failed to create group.');
        return;
      }
      // Mirror handleSelectGroup: if the remove fails, abort before assigning
      // to avoid putting the child in two groups simultaneously.
      if (currentGroupId) {
        const removeResult = await removeChildFromGroup(childId, currentGroupId);
        if (!removeResult.success) {
          Alert.alert('Error', 'Failed to remove from current group.');
          return;
        }
      }
      const assignResult = await addChildToGroup(childId, createResult.group.id);
      if (!assignResult.success) {
        Alert.alert('Error', 'Group created but failed to assign child.');
        return;
      }
      onGroupChanged?.();
      handleDismiss();
    } catch (error) {
      console.error('Error creating virtual group:', error);
    } finally {
      setLoading(false);
    }
  };
```

- [ ] **Step 6.3: Render virtual rows when `groups.length === 0`**

Inside the `ScrollView` in the render (around the place where `sortedGroups.map(...)` lives), add a conditional virtual-rows block **before** the `sortedGroups.map(...)` call. The existing code starts:

```javascript
            <ScrollView style={styles.scrollArea} bounces={false}>
              {/* Group list */}
              {sortedGroups.map((group, index) => {
```

Change to:

```javascript
            <ScrollView style={styles.scrollArea} bounces={false}>
              {/* Virtual preset rows — shown only when user has no groups yet */}
              {groups.length === 0 &&
                Array.from({ length: PRESET_VIRTUAL_COUNT }, (_, i) => i + 1).map((n) => {
                  const colorScheme = getGroupColor(n - 1);
                  return (
                    <TouchableOpacity
                      key={`virtual-${n}`}
                      style={styles.groupRow}
                      onPress={() => handleSelectVirtual(n)}
                      disabled={loading}
                    >
                      <View style={styles.groupInfo}>
                        <View style={[styles.groupColorDot, { backgroundColor: colorScheme.text }]} />
                        <View>
                          <Text variant="bodyLarge" style={styles.groupName}>
                            Group {n}
                          </Text>
                          <Text variant="bodySmall" style={styles.groupChildCount}>
                            0 children
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}

              {/* Group list */}
              {sortedGroups.map((group, index) => {
```

(The virtual row renders identically to a real row except it has no delete icon and no selected-state highlighting — virtuals can never be the `currentGroupId`.)

- [ ] **Step 6.4: Manually verify the zero-group case works**

Start the dev server:

```bash
npx expo start
```

(If the dev server is already running, press `r` to reload.)

- Open the app on a simulator or device.
- Sign in as a user with zero groups — or wipe local group data first via Profile → Export Database and then manually clearing groups (if you have an established dev flow).
- Navigate to My Children → any class → tap a child's group chip.
- Expected: The picker opens showing four rows labeled "Group 1", "Group 2", "Group 3", "Group 4", each with 0 children. No trash or edit icons on the virtual rows. No "+ Create New Group" button.
- Tap "Group 2". Expected: picker dismisses, child's card chip now says "Group 2", and reopening the picker shows Group 2 as a real row (no virtuals anymore — we'll add the "+ Add Group N" button in Task 7).

⚠️ **After this task alone**, a zero-group user can create virtuals and assign — but an existing user with any groups sees the group list and *no* way to create a new one. That's intentional; Task 7 fixes it.

- [ ] **Step 6.5: Commit**

```bash
git add src/components/children/GroupPickerBottomSheet.js
git commit -m "feat: render virtual 'Group 1..4' preset rows for zero-group users

Tapping a virtual row creates the group as a real record and
assigns the current child in one action. Preserves the one-group-
per-user rule by removing from any prior assignment first."
```

---

## Task 7: Add the "+ Add Group N" button for users with existing groups

**Files:**
- Modify: `src/components/children/GroupPickerBottomSheet.js`

- [ ] **Step 7.1: Add a `handleAddNextNumbered` handler**

Immediately after `handleSelectVirtual` (added in Task 6), add:

```javascript
  /**
   * Tap handler for the "+ Add Group N" button.
   * Creates the next monotonic group number and assigns the current child.
   */
  const handleAddNextNumbered = async () => {
    const n = nextGroupNumber(groups);
    // Reuses handleSelectVirtual's logic — same effect, different trigger.
    await handleSelectVirtual(n);
  };
```

- [ ] **Step 7.2: Replace the deleted "+ Create New Group" JSX with the new "+ Add Group N" button**

In the render, find the position where Task 5 removed the "+ Create New Group" block — it should be right after the `<Divider style={styles.divider} />`. Add the new button there:

```javascript
              <Divider style={styles.divider} />

              {/* "+ Add Group N" — hidden while virtual presets are showing */}
              {groups.length > 0 && (
                <TouchableOpacity
                  style={styles.createRow}
                  onPress={handleAddNextNumbered}
                  disabled={loading}
                >
                  <Text style={styles.createText}>
                    +  Add Group {nextGroupNumber(groups)}
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
```

(The styles `createRow` and `createText` were retained from Task 5.)

- [ ] **Step 7.3: Manually verify all user paths**

Start (or reload) the dev server and exercise each scenario from the spec's Verification section. Check each off as you confirm:

- [ ] **Zero-group user** opens picker → sees 4 virtual rows, no "+ Add" button → taps Group 2 → reopens → sees Group 2 as real row and "+ Add Group 3" button (virtuals gone).
- [ ] **Legacy tester** with only free-text groups ("Lions", "Tigers") → sees those two groups sorted alphabetically, no virtuals, and "+ Add Group 1" button → tap → "Group 1" appears **above** Lions/Tigers.
- [ ] **Monotonic numbering after delete** — create Group 1, 2, 3 → delete Group 2 → button reads "+ Add Group 4" (not Group 2).
- [ ] **Numeric sort** — create 10+ groups → Group 10 appears after Group 9, not between Group 1 and Group 2.
- [ ] **Rename absent** — no pencil icon on any group row.
- [ ] **Delete works** — tap trash on a group with children → confirmation appears with child count → confirm → children become unassigned.
- [ ] **Offline** — enable airplane mode → tap "+ Add Group N" → group appears locally with sync pending → reconnect → verify in Supabase dashboard that the group synced.
- [ ] **One-group-per-user** — assign child to Group 1 → open picker, tap Group 2 → verify child is in Group 2 only.

- [ ] **Step 7.4: Run the full test suite one more time**

Run: `npx jest`

Expected: All tests pass, including the 9 helper tests added in Task 1.

- [ ] **Step 7.5: Commit**

```bash
git add src/components/children/GroupPickerBottomSheet.js
git commit -m "feat: add '+ Add Group N' button for monotonic numbered creation

One-tap button computes next group number from existing groups,
creates it, and assigns the current child. Hidden while virtual
presets are showing. Completes the preset numbered groups feature."
```

---

## Task 8: Add minimal render test for the picker's two core branches

**Files:**
- Create: `__tests__/GroupPickerBottomSheet.test.js`

**Scope:** guards the `groups.length === 0` conditional that toggles between virtual preset rows and the "+ Add Group N" button. Two tests — one per branch — cover the new behavior introduced in Tasks 6 and 7. Other picker scenarios (delete confirmation, one-group-per-user rule, etc.) are inherited from pre-existing code and are exercised by the manual checklist in Task 7 Step 7.3. This is intentional minimal coverage, not exhaustive UI testing.

- [ ] **Step 8.1: Create the render test file**

Create `__tests__/GroupPickerBottomSheet.test.js`:

```javascript
import React from 'react';
import { render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import GroupPickerBottomSheet from '../src/components/children/GroupPickerBottomSheet';

// GroupPickerBottomSheet uses useSafeAreaInsets(). Provide a stable mock
// so tests don't depend on a SafeAreaProvider wrapper.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockUseChildren = jest.fn();
jest.mock('../src/context/ChildrenContext', () => ({
  useChildren: () => mockUseChildren(),
}));

const contextDefaults = {
  addGroup: jest.fn(),
  deleteGroup: jest.fn(),
  addChildToGroup: jest.fn(),
  removeChildFromGroup: jest.fn(),
  getChildrenInGroup: () => [],
};

const renderPicker = () =>
  render(
    <PaperProvider>
      <GroupPickerBottomSheet
        visible={true}
        onDismiss={() => {}}
        childId="child-1"
        childName="Test Child"
        currentGroupId={null}
      />
    </PaperProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GroupPickerBottomSheet', () => {
  test('zero-group user: renders four virtual rows and no "+ Add" button', () => {
    mockUseChildren.mockReturnValue({ ...contextDefaults, groups: [] });

    const { getByText, queryByText } = renderPicker();

    expect(getByText('Group 1')).toBeTruthy();
    expect(getByText('Group 2')).toBeTruthy();
    expect(getByText('Group 3')).toBeTruthy();
    expect(getByText('Group 4')).toBeTruthy();
    // "+ Add Group N" button must be hidden while virtuals are showing
    expect(queryByText(/Add Group/)).toBeNull();
  });

  test('user with two groups: renders groups + "+ Add Group 3", no virtuals', () => {
    mockUseChildren.mockReturnValue({
      ...contextDefaults,
      groups: [
        { id: 'g1', name: 'Group 1' },
        { id: 'g2', name: 'Group 2' },
      ],
    });

    const { getByText, queryByText } = renderPicker();

    expect(getByText('Group 1')).toBeTruthy();
    expect(getByText('Group 2')).toBeTruthy();
    // No virtual Group 3 or Group 4 rows (note the anchors — rule out partial
    // matches inside the "+ Add Group 3" button label)
    expect(queryByText(/^Group 3$/)).toBeNull();
    expect(queryByText(/^Group 4$/)).toBeNull();
    // "+ Add Group 3" button visible — allow one-or-more whitespace between + and Add
    expect(getByText(/\+\s+Add Group 3/)).toBeTruthy();
  });
});
```

- [ ] **Step 8.2: Run the new test file**

Run: `npx jest __tests__/GroupPickerBottomSheet.test.js`

Expected: Both tests pass. Output ends with `Tests: 2 passed, 2 total`.

**If either test fails with "Unable to find an element with text"**: the most likely cause is that React Native `Modal` isn't rendering children into the testing tree. Debug with `screen.debug()` inside the failing test to inspect the rendered output. If modal portaling is confirmed as the culprit, the fix is in the *test file* (e.g., mocking `Modal` to render children inline) — do **not** change the production component to accommodate the test.

- [ ] **Step 8.3: Run the full test suite**

Run: `npx jest`

Expected: 11 tests pass — the 9 helper tests from Task 1/2 plus the 2 new render tests. No regressions in the existing `CreateClassScreen`, `AddChildScreen`, `ClassesContext`, or `storage-classes` suites.

- [ ] **Step 8.4: Commit**

```bash
git add __tests__/GroupPickerBottomSheet.test.js
git commit -m "test: render test for picker zero-group vs existing-group branches

Guards the core conditional (groups.length === 0) that toggles
between virtual preset rows and the '+ Add Group N' button.
Minimal coverage by intent — other picker flows remain covered
by manual verification per the spec."
```

---

## Task 9: Update PRD progress and release notes

**Files:**
- Modify: `PRD.md` (Development Progress section — append completion checkbox)

- [ ] **Step 9.1: Locate the Development Progress section in PRD.md**

Run: `grep -n "Development Progress\|- \[ \]" PRD.md | head -20`

Find the most appropriate section to add a completed checkbox under (likely a "Recent work" or similar subsection).

- [ ] **Step 9.2: Append a completion entry**

Add a new line to the Development Progress section:

```markdown
- [x] Preset numbered groups — virtual Group 1..4 for new users, one-tap "+ Add Group N" for growth, rename removed, existing free-text groups preserved. Spec: `docs/superpowers/specs/2026-04-23-preset-numbered-groups-design.md`, Plan: `docs/superpowers/plans/2026-04-23-preset-numbered-groups.md`.
```

- [ ] **Step 9.3: Commit**

```bash
git add PRD.md
git commit -m "docs: record preset numbered groups completion in PRD progress log"
```

- [ ] **Step 9.4: Summarize what's ready**

The branch `feature/preset-numbered-groups` now contains:
1. Design spec
2. Implementation plan
3. Failing helper tests
4. Helper implementation (tests passing)
5. Sort comparator in all three call sites (picker, ClassDetailScreen, EditChildScreen)
6. Rename removed
7. Free-text create removed
8. Virtual preset rows
9. "+ Add Group N" button
10. Picker render test for the two core branches
11. PRD progress entry

Push the branch and open a pull request when ready:

```bash
git push -u origin feature/preset-numbered-groups
```

(Do not push or open the PR unless the user explicitly asks — per the system prompt's default safety rules.)

---

## Notes for the Implementing Engineer

- **Line numbers in this plan are approximate and reflect state at the time of writing.** After each edit, line numbers shift. Use `grep -n` to re-locate blocks between steps if needed.
- **Do not skip tests.** The pure helpers are the easiest place to guard against regressions — nothing else in the system tests monotonic numbering or the legacy-name fallthrough.
- **If a step's edit doesn't match exactly what's in the file**, check whether an earlier step already moved things around. Re-read the file before blind application. Never force a match with `sed` or `replace_all: true` — prefer reading the current state and picking a unique surrounding context.
- **Field testers are live on the app right now.** Do not run any SQL, migration, or sync change — this feature is entirely client-side. Any urge to "clean up" the legacy groups in the database is explicitly out of scope per the spec.
- **Commit after each task.** Small commits make bisecting easier if any step introduces a regression during manual testing.
